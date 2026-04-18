/**
 * POS integration helpers. Currently supports Toast; structured so that
 * Square/Aloha can be added by branching on `provider` in `fetchPosSales`.
 *
 * The end-of-shift / end-of-night reports call `fetchPosSales` to pull net
 * sales, comps, and voids for the report's business-day window. When no POS
 * integration is configured for the venue, callers fall back to the
 * pre-existing "POS not connected" placeholder.
 */
import { db, posIntegrations, type PosIntegration } from "@workspace/db";
import { eq } from "drizzle-orm";

export type PosProvider = "toast" | "square" | "aloha";

export type PosSales = {
  provider: PosProvider;
  netSales: number;
  comps: number;
  voids: number;
  orderCount: number;
  currency: string;
};

export type PosFetchResult =
  | { ok: true; sales: PosSales }
  | {
      ok: false;
      reason: "not_connected" | "unsupported_provider" | "unauthorized" | "fetch_failed";
      message: string;
      provider?: string;
    };

export async function getPosConnection(venueId: string): Promise<PosIntegration | null> {
  const [row] = await db
    .select()
    .from(posIntegrations)
    .where(eq(posIntegrations.venueId, venueId));
  return row ?? null;
}

export async function fetchPosSales(
  venueId: string,
  win: { startUtc: Date; endUtc: Date },
): Promise<PosFetchResult> {
  const conn = await getPosConnection(venueId);
  if (!conn || conn.status !== "connected") {
    return { ok: false, reason: "not_connected", message: "No POS integration is connected for this venue." };
  }
  if (conn.provider === "toast") {
    return fetchToastSales(conn, win);
  }
  return {
    ok: false,
    reason: "unsupported_provider",
    message: `POS provider "${conn.provider}" is not yet supported.`,
    provider: conn.provider,
  };
}

type ToastCheck = {
  deleted?: boolean;
  voided?: boolean;
  amount?: number;
  totalAmount?: number;
  selections?: Array<{
    voided?: boolean;
    preDiscountPrice?: number;
    price?: number;
  }>;
  appliedDiscounts?: Array<{
    discountAmount?: number;
  }>;
};

type ToastOrder = {
  voided?: boolean;
  deleted?: boolean;
  checks?: ToastCheck[];
};

async function fetchToastSales(
  conn: PosIntegration,
  win: { startUtc: Date; endUtc: Date },
): Promise<PosFetchResult> {
  const creds = conn.credentials as { clientId?: string; clientSecret?: string };
  const restaurantGuid = conn.externalId;
  if (!creds?.clientId || !creds?.clientSecret || !restaurantGuid) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Toast integration is missing credentials. Please reconnect Toast.",
      provider: "toast",
    };
  }

  let accessToken: string;
  try {
    const tokenRes = await fetch("https://ws-api.toasttab.com/authentication/v1/authentication/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    });
    if (!tokenRes.ok) {
      await markPosError(conn.venueId, `Toast authentication failed: HTTP ${tokenRes.status}`);
      return {
        ok: false,
        reason: "unauthorized",
        message: "Toast authentication failed. Please reconnect Toast in Integrations.",
        provider: "toast",
      };
    }
    const tokenData = (await tokenRes.json()) as { token?: { accessToken?: string } };
    accessToken = tokenData?.token?.accessToken ?? "";
    if (!accessToken) {
      return {
        ok: false,
        reason: "unauthorized",
        message: "Toast did not return an access token.",
        provider: "toast",
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `Toast authentication error: ${(err as Error).message}`.slice(0, 500),
      provider: "toast",
    };
  }

  let netSales = 0;
  let comps = 0;
  let voids = 0;
  let orderCount = 0;
  const startISO = win.startUtc.toISOString();
  const endISO = win.endUtc.toISOString();

  try {
    let page = 1;
    const pageSize = 100;
    // Cap pagination defensively; a single business day at one venue should
    // not exceed ~5000 orders.
    const maxPages = 50;
    while (page <= maxPages) {
      const url =
        `https://ws-api.toasttab.com/orders/v2/ordersBulk` +
        `?startDate=${encodeURIComponent(startISO)}` +
        `&endDate=${encodeURIComponent(endISO)}` +
        `&pageSize=${pageSize}&page=${page}`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Toast-Restaurant-External-ID": restaurantGuid,
        },
      });
      if (!r.ok) {
        await markPosError(conn.venueId, `Toast orders fetch failed: HTTP ${r.status}`);
        return {
          ok: false,
          reason: r.status === 401 || r.status === 403 ? "unauthorized" : "fetch_failed",
          message: `Toast orders fetch failed (HTTP ${r.status}).`,
          provider: "toast",
        };
      }
      const orders = (await r.json()) as ToastOrder[];
      if (!Array.isArray(orders) || orders.length === 0) break;
      for (const order of orders) {
        if (order.deleted) continue;
        orderCount += 1;
        for (const check of order.checks ?? []) {
          if (check.deleted) continue;
          if (check.voided) {
            voids += num(check.totalAmount ?? check.amount);
            continue;
          }
          // `check.amount` is the post-discount, pre-tax subtotal in Toast's
          // order schema — exactly what we want for "net sales".
          netSales += num(check.amount);
          for (const sel of check.selections ?? []) {
            if (sel.voided) {
              voids += num(sel.preDiscountPrice ?? sel.price);
            }
          }
          for (const disc of check.appliedDiscounts ?? []) {
            comps += num(disc.discountAmount);
          }
        }
      }
      if (orders.length < pageSize) break;
      page += 1;
    }
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `Toast orders fetch error: ${(err as Error).message}`.slice(0, 500),
      provider: "toast",
    };
  }

  await db
    .update(posIntegrations)
    .set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(posIntegrations.venueId, conn.venueId));

  return {
    ok: true,
    sales: {
      provider: "toast",
      netSales: round2(netSales),
      comps: round2(comps),
      voids: round2(voids),
      orderCount,
      currency: "USD",
    },
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function markPosError(venueId: string, message: string): Promise<void> {
  try {
    await db
      .update(posIntegrations)
      .set({ lastError: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(posIntegrations.venueId, venueId));
  } catch {
    // best-effort; don't shadow the underlying error
  }
}

export const PROVIDER_LABELS: Record<string, string> = {
  toast: "Toast",
  square: "Square",
  aloha: "Aloha",
};

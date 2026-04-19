/**
 * POS integration helpers. Supports Toast, Square, and Aloha (NCR Voyix).
 *
 * The end-of-shift / end-of-night reports call `fetchPosSales` to pull net
 * sales, comps, and voids for the report's business-day window. When no POS
 * integration is configured for the venue, callers fall back to the
 * pre-existing "POS not connected" placeholder.
 *
 * Credentials stored in `pos_integrations.credentials` (jsonb), per provider:
 *   - toast:  { clientId, clientSecret }              externalId = restaurantGuid
 *   - square: { accessToken }                          externalId = locationId
 *   - aloha:  { clientId, clientSecret, siteId? }     externalId = siteId / storeId
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
  if (conn.provider === "square") {
    return fetchSquareSales(conn, win);
  }
  if (conn.provider === "aloha") {
    return fetchAlohaSales(conn, win);
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

// ── Square Orders API ─────────────────────────────────────────────────────
// Docs: https://developer.squareup.com/reference/square/orders-api/search-orders
// We page through orders closed in [startUtc, endUtc) at the configured location
// and aggregate net sales (post-discount, pre-tax), comps (discounts applied),
// voids (canceled order totals + returned line totals), and order count.

type SquareMoney = { amount?: number | string; currency?: string };

type SquareOrderLineItem = {
  total_money?: SquareMoney;
  base_price_money?: SquareMoney;
  gross_sales_money?: SquareMoney;
  total_discount_money?: SquareMoney;
};

type SquareOrderReturnLineItem = {
  total_money?: SquareMoney;
};

type SquareOrderReturn = {
  return_line_items?: SquareOrderReturnLineItem[];
};

type SquareOrder = {
  id?: string;
  state?: string; // OPEN | COMPLETED | CANCELED | DRAFT
  closed_at?: string;
  net_amounts?: { total_money?: SquareMoney; discount_money?: SquareMoney };
  total_money?: SquareMoney;
  total_discount_money?: SquareMoney;
  line_items?: SquareOrderLineItem[];
  returns?: SquareOrderReturn[];
};

async function fetchSquareSales(
  conn: PosIntegration,
  win: { startUtc: Date; endUtc: Date },
): Promise<PosFetchResult> {
  const creds = conn.credentials as { accessToken?: string };
  const locationId = conn.externalId;
  if (!creds?.accessToken || !locationId) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Square integration is missing credentials. Please reconnect Square.",
      provider: "square",
    };
  }

  let netSales = 0;
  let comps = 0;
  let voids = 0;
  let orderCount = 0;
  let currency = "USD";
  const startISO = win.startUtc.toISOString();
  const endISO = win.endUtc.toISOString();

  try {
    let cursor: string | undefined = undefined;
    const maxPages = 50;
    for (let page = 0; page < maxPages; page += 1) {
      const body: Record<string, unknown> = {
        location_ids: [locationId],
        limit: 200,
        query: {
          filter: {
            date_time_filter: {
              closed_at: { start_at: startISO, end_at: endISO },
            },
            // Include CANCELED (voided) so we can attribute void totals.
            state_filter: { states: ["COMPLETED", "CANCELED"] },
          },
          sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
        },
      };
      if (cursor) body.cursor = cursor;

      const r = await fetch("https://connect.squareup.com/v2/orders/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
          "Square-Version": "2024-09-19",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        await markPosError(conn.venueId, `Square orders fetch failed: HTTP ${r.status}`);
        return {
          ok: false,
          reason: r.status === 401 || r.status === 403 ? "unauthorized" : "fetch_failed",
          message: `Square orders fetch failed (HTTP ${r.status}).`,
          provider: "square",
        };
      }
      const data = (await r.json()) as { orders?: SquareOrder[]; cursor?: string };
      const orders = data.orders ?? [];
      for (const order of orders) {
        const orderCurrency = order.total_money?.currency ?? order.net_amounts?.total_money?.currency;
        if (orderCurrency) currency = orderCurrency;
        if (order.state === "CANCELED") {
          voids += squareMoney(order.total_money);
          continue;
        }
        orderCount += 1;
        // Net sales = post-discount, pre-tax. Square exposes this as
        // net_amounts.total_money on the order.
        netSales += squareMoney(order.net_amounts?.total_money);
        comps += squareMoney(order.net_amounts?.discount_money ?? order.total_discount_money);
        for (const ret of order.returns ?? []) {
          for (const li of ret.return_line_items ?? []) {
            voids += squareMoney(li.total_money);
          }
        }
      }
      cursor = data.cursor;
      if (!cursor) break;
    }
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `Square orders fetch error: ${(err as Error).message}`.slice(0, 500),
      provider: "square",
    };
  }

  await db
    .update(posIntegrations)
    .set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(posIntegrations.venueId, conn.venueId));

  return {
    ok: true,
    sales: {
      provider: "square",
      netSales: round2(netSales),
      comps: round2(comps),
      voids: round2(voids),
      orderCount,
      currency,
    },
  };
}

/** Square money fields are in the smallest currency unit (cents). */
function squareMoney(m: SquareMoney | undefined): number {
  if (!m) return 0;
  return num(m.amount) / 100;
}

// ── Aloha (NCR Voyix) Sales API ───────────────────────────────────────────
// NCR Voyix exposes Aloha sales via a Restaurant Sales endpoint protected by
// OAuth2 client_credentials. Credentials: { clientId, clientSecret, siteId? }.
// `externalId` carries the site/store identifier used in the URL path.

type AlohaCheck = {
  status?: string; // closed | voided | comped
  voided?: boolean;
  netAmount?: number | string;
  totalAmount?: number | string;
  compAmount?: number | string;
  discountAmount?: number | string;
  voidAmount?: number | string;
  currency?: string;
};

type AlohaSalesResponse = {
  checks?: AlohaCheck[];
  summary?: {
    netSales?: number | string;
    compTotal?: number | string;
    voidTotal?: number | string;
    orderCount?: number | string;
    currency?: string;
  };
  nextPageToken?: string;
};

async function fetchAlohaSales(
  conn: PosIntegration,
  win: { startUtc: Date; endUtc: Date },
): Promise<PosFetchResult> {
  const creds = conn.credentials as {
    clientId?: string;
    clientSecret?: string;
    siteId?: string;
  };
  const siteId = conn.externalId ?? creds?.siteId;
  if (!creds?.clientId || !creds?.clientSecret || !siteId) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Aloha integration is missing credentials. Please reconnect Aloha.",
      provider: "aloha",
    };
  }

  let accessToken: string;
  try {
    const tokenRes = await fetch("https://api.ncr.com/security/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: "sales:read",
      }).toString(),
    });
    if (!tokenRes.ok) {
      await markPosError(conn.venueId, `Aloha authentication failed: HTTP ${tokenRes.status}`);
      return {
        ok: false,
        reason: "unauthorized",
        message: "Aloha authentication failed. Please reconnect Aloha in Integrations.",
        provider: "aloha",
      };
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    accessToken = tokenData.access_token ?? "";
    if (!accessToken) {
      return {
        ok: false,
        reason: "unauthorized",
        message: "Aloha did not return an access token.",
        provider: "aloha",
      };
    }
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `Aloha authentication error: ${(err as Error).message}`.slice(0, 500),
      provider: "aloha",
    };
  }

  let netSales = 0;
  let comps = 0;
  let voids = 0;
  let orderCount = 0;
  let currency = "USD";
  const startISO = win.startUtc.toISOString();
  const endISO = win.endUtc.toISOString();

  try {
    let pageToken: string | undefined;
    const maxPages = 50;
    for (let page = 0; page < maxPages; page += 1) {
      const url =
        `https://api.ncr.com/restaurant/sales/v1/sites/${encodeURIComponent(siteId)}/checks` +
        `?startDateTime=${encodeURIComponent(startISO)}` +
        `&endDateTime=${encodeURIComponent(endISO)}` +
        `&pageSize=200` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "nep-organization": siteId,
          Accept: "application/json",
        },
      });
      if (!r.ok) {
        await markPosError(conn.venueId, `Aloha sales fetch failed: HTTP ${r.status}`);
        return {
          ok: false,
          reason: r.status === 401 || r.status === 403 ? "unauthorized" : "fetch_failed",
          message: `Aloha sales fetch failed (HTTP ${r.status}).`,
          provider: "aloha",
        };
      }
      const data = (await r.json()) as AlohaSalesResponse;
      for (const check of data.checks ?? []) {
        if (check.currency) currency = check.currency;
        const status = (check.status ?? "").toLowerCase();
        if (status === "voided" || check.voided) {
          voids += num(check.voidAmount ?? check.totalAmount);
          continue;
        }
        orderCount += 1;
        netSales += num(check.netAmount ?? check.totalAmount);
        comps += num(check.compAmount ?? check.discountAmount);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: `Aloha sales fetch error: ${(err as Error).message}`.slice(0, 500),
      provider: "aloha",
    };
  }

  await db
    .update(posIntegrations)
    .set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(posIntegrations.venueId, conn.venueId));

  return {
    ok: true,
    sales: {
      provider: "aloha",
      netSales: round2(netSales),
      comps: round2(comps),
      voids: round2(voids),
      orderCount,
      currency,
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

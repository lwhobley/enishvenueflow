import { Router } from "express";
import { db } from "@workspace/db";
import { users, roles, reservations, posIntegrations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PROVIDER_LABELS } from "../lib/pos";

const router = Router();

async function upsertPosIntegration(opts: {
  venueId: string;
  provider: string;
  externalId: string | null;
  credentials: Record<string, unknown>;
}) {
  const [existing] = await db
    .select()
    .from(posIntegrations)
    .where(eq(posIntegrations.venueId, opts.venueId));
  if (existing) {
    await db
      .update(posIntegrations)
      .set({
        provider: opts.provider,
        externalId: opts.externalId,
        credentials: opts.credentials,
        status: "connected",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(posIntegrations.venueId, opts.venueId));
  } else {
    await db.insert(posIntegrations).values({
      venueId: opts.venueId,
      provider: opts.provider,
      externalId: opts.externalId,
      credentials: opts.credentials,
      status: "connected",
    });
  }
}

router.get("/integrations/pos/status", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const [row] = await db
      .select()
      .from(posIntegrations)
      .where(eq(posIntegrations.venueId, venueId));
    if (!row) {
      return res.json({ venueId, connected: false });
    }
    return res.json({
      venueId,
      connected: row.status === "connected",
      provider: row.provider,
      providerLabel: PROVIDER_LABELS[row.provider] ?? row.provider,
      externalId: row.externalId,
      status: row.status,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load POS integration status" });
  }
});

router.delete("/integrations/pos", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    await db.delete(posIntegrations).where(eq(posIntegrations.venueId, venueId));
    res.json({ venueId, connected: false });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to disconnect POS integration" });
  }
});

router.post("/integrations/toast/sync", async (req, res) => {
  try {
    const { venueId, clientId, clientSecret, restaurantGuid } = req.body;
    if (!venueId || !clientId || !clientSecret || !restaurantGuid) {
      return res.status(400).json({ message: "venueId, clientId, clientSecret, and restaurantGuid are required" });
    }

    const tokenRes = await fetch("https://ws-api.toasttab.com/authentication/v1/authentication/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(401).json({ message: "Toast authentication failed. Check your Client ID and Secret.", detail: err });
    }

    const tokenData = await tokenRes.json() as { token: { accessToken: string } };
    const accessToken = tokenData.token.accessToken;

    const empRes = await fetch(`https://ws-api.toasttab.com/labor/v1/employees`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Toast-Restaurant-External-ID": restaurantGuid,
      },
    });

    if (!empRes.ok) {
      const err = await empRes.text();
      return res.status(502).json({ message: "Failed to fetch employees from Toast.", detail: err });
    }

    const toastEmployees = await empRes.json() as Array<{
      guid: string;
      firstName: string;
      lastName: string;
      email?: string;
      phoneNumber?: string;
    }>;

    const existingUsers = await db.select().from(users).where(eq(users.venueId, venueId));
    const existingByExternalId = Object.fromEntries(existingUsers.filter(u => u.externalId).map(u => [u.externalId!, u]));

    let created = 0;
    let updated = 0;

    for (const emp of toastEmployees) {
      const fullName = `${emp.firstName} ${emp.lastName}`.trim();
      const existing = existingByExternalId[emp.guid];

      if (existing) {
        await db.update(users).set({
          fullName,
          email: emp.email ?? existing.email,
          phone: emp.phoneNumber ?? existing.phone,
          externalId: emp.guid,
        }).where(eq(users.id, existing.id));
        updated++;
      } else {
        await db.insert(users).values({
          venueId,
          fullName,
          email: emp.email ?? "",
          phone: emp.phoneNumber ?? null,
          externalId: emp.guid,
          isAdmin: false,
          positions: [],
        });
        created++;
      }
    }

    // Persist the connection so the end-of-shift / end-of-night reports can
    // pull live sales, comps, and voids without prompting for credentials.
    await upsertPosIntegration({
      venueId,
      provider: "toast",
      externalId: restaurantGuid,
      credentials: { clientId, clientSecret },
    });

    res.json({ message: "Toast sync complete", created, updated, total: toastEmployees.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Toast sync failed. Please check your credentials and try again." });
  }
});

router.post("/integrations/opentable/sync", async (req, res) => {
  try {
    const { venueId, apiKey, restaurantId } = req.body;
    if (!venueId || !apiKey || !restaurantId) {
      return res.status(400).json({ message: "venueId, apiKey, and restaurantId are required" });
    }

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);
    const from = today.toISOString().split("T")[0];
    const to = endDate.toISOString().split("T")[0];

    const otRes = await fetch(
      `https://platform.opentable.com/sync/v1/restaurant/${restaurantId}/reservations?from=${from}&to=${to}`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!otRes.ok) {
      const err = await otRes.text();
      return res.status(502).json({ message: "Failed to fetch reservations from OpenTable. Check your API key and Restaurant ID.", detail: err });
    }

    const otData = await otRes.json() as {
      reservations: Array<{
        reservationId: string;
        dateTime: string;
        partySize: number;
        guest: { firstName: string; lastName: string; email?: string; phone?: string };
        status: string;
        notes?: string;
      }>;
    };

    const allReservations = await db.select().from(reservations).where(eq(reservations.venueId, venueId));
    const existingByExternalId = Object.fromEntries(
      allReservations.filter(r => r.externalId).map(r => [r.externalId!, r])
    );

    const statusMap: Record<string, string> = {
      SEATED: "seated", ARRIVED: "seated",
      BOOKED: "confirmed", CONFIRMED: "confirmed",
      CANCELLED: "cancelled", NO_SHOW: "no-show",
    };

    let created = 0;
    let updated = 0;

    for (const r of otData.reservations) {
      const guestName = `${r.guest.firstName} ${r.guest.lastName}`.trim();
      const dt = new Date(r.dateTime);
      const date = dt.toISOString().split("T")[0];
      const time = dt.toTimeString().slice(0, 5);
      const mappedStatus = statusMap[r.status] ?? "confirmed";

      const existing = existingByExternalId[r.reservationId];

      if (existing) {
        await db.update(reservations).set({
          guestName,
          guestEmail: r.guest.email ?? existing.guestEmail,
          guestPhone: r.guest.phone ?? existing.guestPhone,
          partySize: r.partySize,
          date,
          time,
          status: mappedStatus,
          notes: r.notes ?? existing.notes,
          source: "opentable",
          externalId: r.reservationId,
        }).where(eq(reservations.id, existing.id));
        updated++;
      } else {
        await db.insert(reservations).values({
          venueId,
          guestName,
          guestEmail: r.guest.email ?? null,
          guestPhone: r.guest.phone ?? null,
          partySize: r.partySize,
          date,
          time,
          status: mappedStatus,
          notes: r.notes ?? null,
          tableId: null,
          source: "opentable",
          externalId: r.reservationId,
        });
        created++;
      }
    }

    res.json({ message: "OpenTable sync complete", created, updated, total: otData.reservations.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "OpenTable sync failed. Please check your credentials and try again." });
  }
});

export default router;

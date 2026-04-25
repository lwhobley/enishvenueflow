import { Router } from "express";
import { db } from "@workspace/db";
import { users, roles, reservations, posIntegrations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PROVIDER_LABELS } from "../lib/pos";
import { encryptCredentials } from "../lib/crypto";

const router = Router();

async function upsertPosIntegration(opts: {
  venueId: string;
  provider: string;
  externalId: string | null;
  credentials: Record<string, unknown>;
}) {
  const encrypted = encryptCredentials(opts.credentials);
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
        credentials: encrypted,
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
      credentials: encrypted,
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

export default router;

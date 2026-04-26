import { Router } from "express";
import { db } from "@workspace/db";
import { guests } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";

const router = Router();

function formatGuest(g: typeof guests.$inferSelect) {
  return {
    ...g,
    totalSpent: g.totalSpent ? parseFloat(g.totalSpent) : 0,
    tags: Array.isArray(g.tags) ? g.tags : [],
  };
}

router.get("/guests", async (req, res) => {
  try {
    const { venueId, search, vipOnly } = req.query as { venueId: string; search?: string; vipOnly?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    let query = db.select().from(guests).where(eq(guests.venueId, venueId)).$dynamic();
    if (vipOnly === "true") query = query.where(and(eq(guests.venueId, venueId)));
    const all = await query.orderBy(guests.createdAt);
    let filtered = all;
    if (search) {
      const s = search.toLowerCase();
      filtered = all.filter(g =>
        g.fullName.toLowerCase().includes(s) ||
        (g.email ?? "").toLowerCase().includes(s) ||
        (g.phone ?? "").includes(s)
      );
    }
    if (vipOnly === "true") {
      filtered = filtered.filter(g => g.vipLevel > 0);
    }
    res.json(filtered.map(formatGuest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list guests" });
  }
});

router.post("/guests", async (req, res) => {
  try {
    const { venueId, fullName, email, phone, birthday, tags = [], vipLevel = 0, notes } = req.body;
    if (!venueId || !fullName) return res.status(400).json({ message: "venueId and fullName required" });
    const [guest] = await db.insert(guests).values({
      venueId, fullName, email: email ?? null, phone: phone ?? null,
      birthday: birthday ?? null, tags, vipLevel, notes: notes ?? null,
    }).returning();
    res.status(201).json(formatGuest(guest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create guest" });
  }
});

// POST /guests/bulk — CSV-driven import. Skips duplicates by email or phone
// (case-insensitive email, digits-only phone) so re-uploading the same file
// doesn't double-insert. Returns per-row outcomes so the UI can show
// "added 18, skipped 4 duplicates, 1 invalid".
router.post("/guests/bulk", async (req, res) => {
  try {
    const { venueId, guests: rows } = req.body as {
      venueId?: string;
      guests?: Array<{
        fullName?: string;
        email?: string | null;
        phone?: string | null;
        birthday?: string | null;
        tags?: string[];
        vipLevel?: number;
        notes?: string | null;
      }>;
    };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "guests[] required" });

    const existing = await db.select().from(guests).where(eq(guests.venueId, venueId));
    const seenEmails = new Set(existing.map((g) => (g.email ?? "").toLowerCase()).filter(Boolean));
    const seenPhones = new Set(existing.map((g) => (g.phone ?? "").replace(/\D/g, "")).filter(Boolean));

    let inserted = 0;
    let skipped = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const toInsert: typeof guests.$inferInsert[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const fullName = (r.fullName ?? "").trim();
      if (!fullName) {
        errors.push({ row: i + 1, reason: "Missing name" });
        continue;
      }
      const emailNorm = (r.email ?? "").trim().toLowerCase() || null;
      const phoneNorm = (r.phone ?? "").replace(/\D/g, "") || null;

      // Dup check across the existing roster AND the rows we've already
      // queued in this same batch — handles a CSV with internal duplicates.
      if (emailNorm && seenEmails.has(emailNorm)) { skipped++; continue; }
      if (phoneNorm && seenPhones.has(phoneNorm)) { skipped++; continue; }

      if (emailNorm) seenEmails.add(emailNorm);
      if (phoneNorm) seenPhones.add(phoneNorm);

      toInsert.push({
        venueId,
        fullName,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        birthday: r.birthday?.trim() || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        vipLevel: Number.isFinite(Number(r.vipLevel)) ? Number(r.vipLevel) : 0,
        notes: r.notes?.trim() || null,
      });
      inserted++;
    }

    if (toInsert.length > 0) {
      await db.insert(guests).values(toInsert);
    }

    res.json({ inserted, skipped, errors, total: rows.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to import guests" });
  }
});

router.get("/guests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [guest] = await db.select().from(guests).where(eq(guests.id, id));
    if (!guest) return res.status(404).json({ message: "Guest not found" });
    res.json(formatGuest(guest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to get guest" });
  }
});

router.put("/guests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates: Record<string, unknown> = {};
    const fields = ["fullName", "email", "phone", "birthday", "tags", "vipLevel", "notes", "visitCount", "totalSpent"];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates[f] = f === "totalSpent" ? String(req.body[f]) : req.body[f];
      }
    }
    const [updated] = await db.update(guests).set(updates).where(eq(guests.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Guest not found" });
    res.json(formatGuest(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update guest" });
  }
});

router.delete("/guests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(guests).where(eq(guests.id, id));
    res.json({ message: "Guest deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to delete guest" });
  }
});

export default router;

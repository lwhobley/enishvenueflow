import { Router } from "express";
import { db } from "@workspace/db";
import { schedules, shifts, users, roles } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

const router = Router();

router.get("/schedules", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const all = await db.select().from(schedules).where(eq(schedules.venueId, venueId)).orderBy(schedules.createdAt);
    res.json(all);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to list schedules" });
  }
});

router.post("/schedules", async (req, res) => {
  try {
    const { venueId, weekStart, weekEnd } = req.body;
    if (!venueId || !weekStart || !weekEnd) return res.status(400).json({ message: "venueId, weekStart, weekEnd required" });
    const [schedule] = await db.insert(schedules).values({ venueId, weekStart, weekEnd }).returning();
    res.status(201).json(schedule);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to create schedule" });
  }
});

router.put("/schedules/:id/publish", async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(schedules).set({ status: "published" }).where(eq(schedules.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Schedule not found" });
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to publish schedule" });
  }
});

router.post("/schedules/ai-generate", async (req, res) => {
  try {
    const { venueId, weekStart, laborTargetPct, notes } = req.body;
    if (!venueId || !weekStart || laborTargetPct == null) {
      return res.status(400).json({ message: "venueId, weekStart, laborTargetPct required" });
    }

    // Calculate weekEnd (7 days from weekStart)
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = endDate.toISOString().split("T")[0];

    // Get staff and roles for context
    const staffList = await db.select().from(users).where(and(eq(users.venueId, venueId), eq(users.isActive, true)));
    const roleList = await db.select().from(roles).where(eq(roles.venueId, venueId));

    // Create or find schedule
    let [schedule] = await db.insert(schedules).values({ venueId, weekStart, weekEnd }).returning();

    // Build prompt
    const prompt = `You are a scheduling AI for a hospitality venue. Generate a week of shifts for the following week.

Week: ${weekStart} to ${weekEnd}
Labor Target: ${laborTargetPct}% of revenue
${notes ? `Manager notes: ${notes}` : ""}

Staff available (${staffList.length} employees):
${staffList.map(u => `- ${u.fullName} (roleId: ${u.roleId ?? "unassigned"})`).join("\n")}

Roles:
${roleList.map(r => `- ${r.name} (id: ${r.id})`).join("\n")}

Generate a realistic week of shifts. Return a JSON array of shift objects, each with:
- roleId (from the roles above)
- userId (from the staff above, or null for open shifts)
- startTime (ISO 8601 datetime)
- endTime (ISO 8601 datetime)
- notes (optional)

Distribute shifts across 7 days, covering typical lunch (11:00-15:00) and dinner (17:00-22:00) services. Aim for ${Math.round(laborTargetPct)}% labor cost. Return only valid JSON with no markdown.`;

    let generatedShifts: Array<{ roleId: string; userId?: string | null; startTime: string; endTime: string; notes?: string }> = [];

    try {
      const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
      const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

      if (apiKey) {
        // The installed @google/genai client doesn't accept baseUrl in its
        // typed constructor options, but we need to keep supporting the
        // Replit-era proxy URL when it's set. Pass it via httpOptions and
        // cast — the field is recognised at runtime.
        const ai = new GoogleGenAI(
          baseUrl
            ? ({ apiKey, httpOptions: { baseUrl } } as unknown as { apiKey: string })
            : { apiKey },
        );
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });
        const text = result.text ?? "";
        // Extract JSON from the response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          generatedShifts = JSON.parse(jsonMatch[0]);
        }
      }
    } catch (aiErr) {
      req.log.warn(aiErr, "AI generation failed, using fallback");
    }

    // Fallback: generate reasonable default shifts if AI fails
    if (!generatedShifts.length && roleList.length > 0) {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        return d.toISOString().split("T")[0];
      });
      const staffCycle = staffList.length > 0 ? staffList : [{ id: null }];
      let staffIdx = 0;
      for (const day of days) {
        for (const role of roleList.slice(0, 3)) {
          const lunchStart = `${day}T11:00:00.000Z`;
          const lunchEnd = `${day}T15:00:00.000Z`;
          const dinnerStart = `${day}T17:00:00.000Z`;
          const dinnerEnd = `${day}T22:00:00.000Z`;
          const staff = staffCycle[staffIdx % staffCycle.length];
          generatedShifts.push({ roleId: role.id, userId: (staff as { id: string | null }).id, startTime: lunchStart, endTime: lunchEnd });
          staffIdx++;
          const staff2 = staffCycle[staffIdx % staffCycle.length];
          generatedShifts.push({ roleId: role.id, userId: (staff2 as { id: string | null }).id, startTime: dinnerStart, endTime: dinnerEnd });
          staffIdx++;
        }
      }
    }

    // Insert shifts
    const insertedShifts = [];
    for (const s of generatedShifts) {
      if (!s.roleId) continue;
      const validRole = roleList.find(r => r.id === s.roleId);
      if (!validRole) continue;
      const validUser = s.userId ? staffList.find(u => u.id === s.userId) : null;
      const [shift] = await db.insert(shifts).values({
        scheduleId: schedule.id,
        roleId: s.roleId,
        userId: validUser?.id ?? null,
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime),
        status: validUser ? "scheduled" : "open",
        notes: s.notes ?? null,
        sectionId: null,
      }).returning();
      insertedShifts.push(shift);
    }

    // Build enriched shifts
    const roleMap = Object.fromEntries(roleList.map(r => [r.id, r]));
    const userMap = Object.fromEntries(staffList.map(u => [u.id, u]));
    const enriched = insertedShifts.map(s => ({
      ...s,
      roleName: s.roleId ? (roleMap[s.roleId]?.name ?? null) : null,
      roleColor: s.roleId ? (roleMap[s.roleId]?.color ?? null) : null,
      userName: s.userId ? (userMap[s.userId]?.fullName ?? null) : null,
    }));

    res.json({
      scheduleId: schedule.id,
      shifts: enriched,
      summary: `Generated ${enriched.length} shifts for the week of ${weekStart}. Labor target: ${laborTargetPct}%.`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to generate AI schedule" });
  }
});

export default router;

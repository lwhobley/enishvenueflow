import { Router } from "express";
import { db } from "@workspace/db";
import { reportSends, reportSettings, venues } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { buildReport, type ReportKind } from "../lib/report-builder";
import { buildSubject, renderHtml, renderText } from "../lib/report-email";
import { sendOutlookMail } from "../lib/outlook";

const router = Router();

const DEFAULT_RECIPIENTS = ["faith@enishusa.com", "liffort@enishusa.com"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dedupeEmails(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const cleaned = input
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  for (const c of cleaned) {
    if (!EMAIL_RE.test(c)) return null;
  }
  return [...new Set(cleaned.map((s) => s.toLowerCase()))];
}

async function getRecipients(venueId: string): Promise<string[]> {
  const [row] = await db.select().from(reportSettings).where(eq(reportSettings.venueId, venueId));
  if (!row || row.recipients.length === 0) return DEFAULT_RECIPIENTS.slice();
  return row.recipients;
}

router.get("/reports/recipients", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const recipients = await getRecipients(venueId);
    res.json({ venueId, recipients });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load recipients" });
  }
});

router.put("/reports/recipients", async (req, res) => {
  try {
    const { venueId, recipients } = req.body as { venueId?: string; recipients?: unknown };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const cleaned = dedupeEmails(recipients);
    if (cleaned === null) return res.status(400).json({ message: "recipients must be an array of valid email addresses" });
    if (cleaned.length === 0) return res.status(400).json({ message: "At least one recipient is required" });

    const [existing] = await db.select().from(reportSettings).where(eq(reportSettings.venueId, venueId));
    if (existing) {
      await db
        .update(reportSettings)
        .set({ recipients: cleaned, updatedAt: new Date() })
        .where(eq(reportSettings.venueId, venueId));
    } else {
      await db.insert(reportSettings).values({ venueId, recipients: cleaned });
    }
    res.json({ venueId, recipients: cleaned });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to update recipients" });
  }
});

router.get("/reports/last-sent", async (req, res) => {
  try {
    const { venueId } = req.query as { venueId: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const rows = await db
      .select()
      .from(reportSends)
      .where(eq(reportSends.venueId, venueId))
      .orderBy(desc(reportSends.createdAt))
      .limit(40);
    const pickFor = (kind: ReportKind) => {
      const row = rows.find((r) => r.reportKind === kind && r.status === "sent");
      if (!row) return undefined;
      return {
        id: row.id,
        sentAt: row.createdAt.toISOString(),
        recipients: row.recipients,
      };
    };
    const out: Record<string, unknown> = {};
    const eos = pickFor("end_of_shift");
    if (eos) out.end_of_shift = eos;
    const eon = pickFor("end_of_night");
    if (eon) out.end_of_night = eon;
    res.json(out);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to load report history" });
  }
});

async function venueExists(venueId: string): Promise<boolean> {
  const [row] = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, venueId));
  return !!row;
}

async function handleSend(kind: ReportKind, venueId: string, override: string[] | null) {
  const recipients = override ?? (await getRecipients(venueId));
  const report = await buildReport({ venueId, kind });
  const subject = buildSubject(report);
  const html = renderHtml(report);
  const text = renderText(report);
  const sendResult = await sendOutlookMail({ to: recipients, subject, htmlBody: html, textBody: text });

  if (sendResult.ok) {
    // We do not record `triggeredByUserId` from the request body to avoid
    // spoofed attribution. When a real session middleware is added we'll
    // populate this from req.user server-side.
    const [row] = await db
      .insert(reportSends)
      .values({ venueId, reportKind: kind, recipients, triggeredByUserId: null, status: "sent" })
      .returning();
    return { ok: true as const, sendId: row.id, recipients, sentAt: row.createdAt.toISOString(), report };
  }

  await db
    .insert(reportSends)
    .values({
      venueId,
      reportKind: kind,
      recipients,
      triggeredByUserId: null,
      status: sendResult.reason === "unauthorized" ? "unauthorized" : "failed",
      errorMessage: sendResult.message,
    });
  return { ok: false as const, ...sendResult };
}

function logSendFailure(
  req: import("express").Request,
  kind: ReportKind,
  reason: string,
  message: string,
) {
  req.log.warn({ reportKind: kind, reason, message }, "report send failed");
}

function makeSendHandler(kind: ReportKind) {
  return async (req: import("express").Request, res: import("express").Response) => {
    try {
      const { venueId, recipients } = req.body as { venueId?: string; recipients?: unknown };
      if (!venueId) return res.status(400).json({ message: "venueId required" });
      if (!(await venueExists(venueId))) {
        return res.status(404).json({ message: "Unknown venueId" });
      }
      let override: string[] | null = null;
      if (recipients !== undefined) {
        override = dedupeEmails(recipients);
        if (override === null) {
          return res.status(400).json({ message: "recipients must be an array of valid email addresses" });
        }
        if (override.length === 0) override = null;
      }
      const result = await handleSend(kind, venueId, override);
      if (result.ok) {
        return res.status(200).json({
          ok: true,
          sendId: result.sendId,
          recipients: result.recipients,
          sentAt: result.sentAt,
        });
      }
      const status = result.reason === "unauthorized" ? 412 : 502;
      logSendFailure(req, kind, result.reason, result.message);
      return res.status(status).json({ ok: false, reason: result.reason, message: result.message });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ message: "Failed to send report" });
    }
  };
}

router.post("/reports/end-of-shift/send", makeSendHandler("end_of_shift"));
router.post("/reports/end-of-night/send", makeSendHandler("end_of_night"));

router.get("/reports/preview", async (req, res) => {
  try {
    const { venueId, kind } = req.query as { venueId?: string; kind?: string };
    if (!venueId) return res.status(400).json({ message: "venueId required" });
    const k: ReportKind = kind === "end_of_night" ? "end_of_night" : "end_of_shift";
    const report = await buildReport({ venueId, kind: k });
    res.json(report);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Failed to build report preview" });
  }
});

export default router;

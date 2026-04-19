import { db } from "@workspace/db";
import { reportSends } from "@workspace/db";
import { buildReport, type ReportKind } from "./report-builder";
import { buildSubject, renderHtml, renderText } from "./report-email";
import { sendOutlookMail } from "./outlook";

export type SendReportInput = {
  kind: ReportKind;
  venueId: string;
  recipientsOverride: string[] | null;
  triggeredByUserId: string | null;
  /** Free-form tag to record where the send originated (e.g. "manual",
   *  "scheduled:17:00 CT"). Currently logged but not persisted. */
  source?: string;
};

export type SendReportResult =
  | {
      ok: true;
      sendId: string;
      recipients: string[];
      sentAt: string;
      report: Awaited<ReturnType<typeof buildReport>>;
    }
  | { ok: false; reason: "unauthorized" | "send_failed"; message: string };

import { reportSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_RECIPIENTS = ["faith@enishusa.com", "liffort@enishusa.com"];

async function getRecipients(venueId: string): Promise<string[]> {
  const [row] = await db.select().from(reportSettings).where(eq(reportSettings.venueId, venueId));
  if (!row || row.recipients.length === 0) return DEFAULT_RECIPIENTS.slice();
  return row.recipients;
}

/**
 * Send a report (manual button press OR scheduled tick), persist the
 * outcome to `report_sends`, and return the send result.
 */
export async function sendReport(input: SendReportInput): Promise<SendReportResult> {
  const { kind, venueId, recipientsOverride, triggeredByUserId } = input;
  const recipients = recipientsOverride ?? (await getRecipients(venueId));
  const report = await buildReport({ venueId, kind });
  const subject = buildSubject(report);
  const html = renderHtml(report);
  const text = renderText(report);
  const sendResult = await sendOutlookMail({ to: recipients, subject, htmlBody: html, textBody: text });

  if (sendResult.ok) {
    const [row] = await db
      .insert(reportSends)
      .values({ venueId, reportKind: kind, recipients, triggeredByUserId, status: "sent" })
      .returning();
    return { ok: true, sendId: row.id, recipients, sentAt: row.createdAt.toISOString(), report };
  }

  await db.insert(reportSends).values({
    venueId,
    reportKind: kind,
    recipients,
    triggeredByUserId,
    status: sendResult.reason === "unauthorized" ? "unauthorized" : "failed",
    errorMessage: sendResult.message,
  });
  return {
    ok: false,
    reason: sendResult.reason === "unauthorized" ? "unauthorized" : "send_failed",
    message: sendResult.message,
  };
}

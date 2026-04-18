import type { ReportPayload } from "./report-builder";

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const KIND_LABEL: Record<ReportPayload["reportKind"], string> = {
  end_of_shift: "End-of-Shift Report",
  end_of_night: "End-of-Night Report",
};

export function buildSubject(p: ReportPayload): string {
  return `[VenueFlow] ${KIND_LABEL[p.reportKind]} — ${p.venueName} — ${fmtDate(p.businessDate)}`;
}

const wrap = (inner: string) => `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="max-width:680px;margin:0 auto;padding:24px;">
${inner}
</div></body></html>`;

const card = (title: string, body: string) => `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:16px;">
  <h2 style="margin:0 0 12px 0;font-size:16px;color:#111827;">${title}</h2>
  ${body}
</div>`;

const kvTable = (rows: [string, string][]) => `
<table style="width:100%;border-collapse:collapse;font-size:14px;">
  ${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#6b7280;">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${v}</td></tr>`,
    )
    .join("")}
</table>`;

export function renderHtml(p: ReportPayload): string {
  const reservations = kvTable([
    ["Total bookings", String(p.reservations.totalBookings)],
    ["Covers", String(p.reservations.covers)],
    ["Seated / completed", String(p.reservations.seated)],
    ["No-shows", String(p.reservations.noShows)],
    ["Cancellations", String(p.reservations.cancellations)],
    ["Walk-ins", String(p.reservations.walkIns)],
    ["Waitlist (now)", String(p.reservations.waitlistAtClose)],
  ]);

  const byHour = p.reservations.byHour.length
    ? `
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
  <thead><tr>
    <th align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Hour</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Bookings</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Covers</th>
  </tr></thead>
  <tbody>
    ${p.reservations.byHour
      .map(
        (h) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${h.hour}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${h.bookings}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${h.covers}</td></tr>`,
      )
      .join("")}
  </tbody>
</table>`
    : `<p style="color:#6b7280;font-size:13px;margin:8px 0 0 0;">No live bookings recorded for this period.</p>`;

  const labor = kvTable([
    ["Total hours", p.labor.totalHours.toFixed(2)],
    ["Regular hours", p.labor.regularHours.toFixed(2)],
    ["Overtime hours", p.labor.overtimeHours.toFixed(2)],
    ["Estimated labor cost", fmtMoney(p.labor.totalCost)],
    ["Staff still clocked in", String(p.labor.staffStillClockedIn)],
  ]);

  const byRole = p.labor.byRole.length
    ? `
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
  <thead><tr>
    <th align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Role</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Hours</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Cost</th>
  </tr></thead>
  <tbody>
    ${p.labor.byRole
      .map(
        (r) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(r.role)}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${r.hours.toFixed(2)}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${fmtMoney(r.cost)}</td></tr>`,
      )
      .join("")}
  </tbody>
</table>`
    : `<p style="color:#6b7280;font-size:13px;margin:8px 0 0 0;">No completed shifts recorded for this period.</p>`;

  const tipsSummary = kvTable([
    ["Total tips collected", fmtMoney(p.tips.totalTips)],
    ["Tip pools created", String(p.tips.pools.length)],
    ["Pools awaiting distribution", String(p.tips.undistributedPools)],
  ]);

  const tipsTable = p.tips.pools.length
    ? `
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
  <thead><tr>
    <th align="left" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Pool</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Total</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Recipients</th>
    <th align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600;">Status</th>
  </tr></thead>
  <tbody>
    ${p.tips.pools
      .map(
        (pool) =>
          `<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:11px;color:#6b7280;">${pool.poolId.slice(0, 8)}…</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${fmtMoney(pool.totalTips)}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${pool.entries}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(pool.status)}</td></tr>`,
      )
      .join("")}
  </tbody>
</table>`
    : "";

  const pos = `<p style="margin:0;color:#6b7280;font-size:13px;">${escapeHtml(p.pendingPosNote)}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
  <tr><td style="padding:4px 0;color:#6b7280;">Net sales</td><td style="padding:4px 0;text-align:right;">—</td></tr>
  <tr><td style="padding:4px 0;color:#6b7280;">Comps</td><td style="padding:4px 0;text-align:right;">—</td></tr>
  <tr><td style="padding:4px 0;color:#6b7280;">Voids</td><td style="padding:4px 0;text-align:right;">—</td></tr>
</table>`;

  const header = `
<div style="margin-bottom:16px;">
  <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(p.venueName)}</div>
  <h1 style="margin:4px 0 4px 0;font-size:22px;color:#111827;">${KIND_LABEL[p.reportKind]}</h1>
  <div style="color:#6b7280;font-size:13px;">${fmtDate(p.businessDate)} · Central Time</div>
</div>`;

  const footer = `
<p style="color:#9ca3af;font-size:12px;margin:24px 0 0 0;">
  Generated ${p.generatedAt.toLocaleString("en-US", { timeZone: p.timeZone, dateStyle: "medium", timeStyle: "short" })} (${p.timeZone}).
</p>`;

  return wrap(`
${header}
${card("Reservations", reservations + byHour)}
${card("Labor", labor + byRole)}
${card("Tips", tipsSummary + tipsTable)}
${card("Sales · Comps · Voids", pos)}
${footer}
`);
}

export function renderText(p: ReportPayload): string {
  const lines: string[] = [];
  lines.push(`${KIND_LABEL[p.reportKind]} — ${p.venueName} — ${fmtDate(p.businessDate)} (Central Time)`);
  lines.push("");
  lines.push("RESERVATIONS");
  lines.push(`  Total bookings: ${p.reservations.totalBookings}`);
  lines.push(`  Covers: ${p.reservations.covers}`);
  lines.push(`  Seated/completed: ${p.reservations.seated}`);
  lines.push(`  No-shows: ${p.reservations.noShows}`);
  lines.push(`  Cancellations: ${p.reservations.cancellations}`);
  lines.push(`  Walk-ins: ${p.reservations.walkIns}`);
  lines.push(`  Waitlist (now): ${p.reservations.waitlistAtClose}`);
  lines.push("");
  lines.push("LABOR");
  lines.push(`  Total hours: ${p.labor.totalHours.toFixed(2)}  (regular ${p.labor.regularHours.toFixed(2)}, overtime ${p.labor.overtimeHours.toFixed(2)})`);
  lines.push(`  Estimated labor cost: ${fmtMoney(p.labor.totalCost)}`);
  lines.push(`  Staff still clocked in: ${p.labor.staffStillClockedIn}`);
  for (const r of p.labor.byRole) {
    lines.push(`    - ${r.role}: ${r.hours.toFixed(2)} h, ${fmtMoney(r.cost)}`);
  }
  lines.push("");
  lines.push("TIPS");
  lines.push(`  Total tips collected: ${fmtMoney(p.tips.totalTips)}`);
  lines.push(`  Pools created: ${p.tips.pools.length}`);
  lines.push(`  Pools awaiting distribution: ${p.tips.undistributedPools}`);
  lines.push("");
  lines.push("SALES / COMPS / VOIDS");
  lines.push(`  ${p.pendingPosNote}`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

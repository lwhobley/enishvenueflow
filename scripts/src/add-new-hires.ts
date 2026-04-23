/**
 * Manual loader — only needed if you don't want to redeploy. The api-server
 * also runs `loadHires()` on startup, so the normal flow is just to deploy
 * with the latest NEW_HIRES_ROSTER.
 *
 * Usage (from repo root):
 *   DATABASE_URL="postgres://..." pnpm --filter @workspace/scripts run add-new-hires
 *
 * Optional env: VENUE_ID — defaults to the first active venue.
 */
import { loadHires, pool } from "@workspace/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL env var is required");
  }
  const venueId = process.env.VENUE_ID || undefined;
  const results = await loadHires({ venueId });
  if (results.length === 0) {
    console.log("No active venue found — set VENUE_ID.");
    return;
  }
  console.log(`Loaded against venueId=${venueId ?? "(first active)"}`);
  for (const r of results) {
    const tag = r.action.replace("_", " ").toUpperCase();
    console.log(
      `  • ${r.hire.fullName.padEnd(22)} pos=${r.hire.positions.join("+").padEnd(14)} PIN=${r.pin}  →  ${tag}${r.detail ? ` — ${r.detail}` : ""}`,
    );
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Failed:", err);
    await pool.end().catch(() => { /* noop */ });
    process.exit(1);
  });

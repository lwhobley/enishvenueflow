import app from "./app";
import { loadHires } from "@workspace/db";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { startReportScheduler } from "./lib/report-scheduler";
import { encryptLegacyPosCredentials } from "./lib/pos-credential-migration";
import { applyStartupMigrations } from "./lib/startup-migrations";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureHires() {
  try {
    const venueId = process.env["HIRES_VENUE_ID"] || undefined;
    const results = await loadHires({ venueId });
    const inserted = results.filter((r) => r.action === "inserted").length;
    const updated = results.filter((r) => r.action === "updated").length;
    const collisions = results.filter((r) => r.action === "skipped_pin_collision");
    if (inserted > 0 || updated > 0) {
      logger.info({ inserted, updated, total: results.length }, "Hires roster synced");
    }
    for (const c of collisions) {
      logger.warn({ hire: c.hire.fullName, detail: c.detail }, "Hire skipped — PIN collision");
    }
  } catch (err) {
    logger.error({ err }, "Hires loader failed; continuing boot");
  }
}

// Apply additive schema migrations before anything else touches the DB —
// seedIfEmpty etc. assume the new columns / tables already exist. The hires
// loader runs after seedIfEmpty so the venue and roles exist; it's
// idempotent (matches by venueId+email) so running on every boot is safe.
applyStartupMigrations()
  .then(() => seedIfEmpty())
  .then(async () => {
    await encryptLegacyPosCredentials();
    await ensureHires();
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startReportScheduler();
    });
  });

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
    // app.listen's callback only fires on *success*; listen errors come
    // out of the server's "error" event. The previous `(err) => …`
    // handler was dead code that never received an EADDRINUSE.
    const server = app.listen(port, () => {
      logger.info({ port }, "Server listening");
      startReportScheduler();
    });
    server.on("error", (err) => {
      logger.error({ err }, "HTTP server error");
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Boot failed");
    process.exit(1);
  });

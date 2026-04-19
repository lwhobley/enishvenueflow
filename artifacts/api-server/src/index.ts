import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { startReportScheduler } from "./lib/report-scheduler";
import { encryptLegacyPosCredentials } from "./lib/pos-credential-migration";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedIfEmpty().then(async () => {
  await encryptLegacyPosCredentials();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startReportScheduler();
  });
});

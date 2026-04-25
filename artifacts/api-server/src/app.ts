import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS — locked to a configurable allow-list. In production the API is
// served from the same origin as the static frontend (Railway), so CORS
// isn't actually needed for first-party use; this only matters when
// developing the frontend locally against a deployed API. Set
// CORS_ALLOWED_ORIGINS to a comma-separated list of origins (no glob).
// Default in non-production: allow all (for ergonomics). Default in
// production: don't add cors() at all so cross-origin browsers are
// blocked from talking to the API.
const corsAllowList = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (corsAllowList.length > 0) {
  app.use(cors({ origin: corsAllowList, credentials: true }));
} else if (process.env.NODE_ENV !== "production") {
  app.use(cors());
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Explicit 404 for any unmatched /api/* route so JSON callers don't receive
// the SPA's index.html from the static fallback below.
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Serve the built frontend (Railway single-service deployment).
// STATIC_DIR can override; otherwise fall back to the monorepo build output.
const staticDir =
  process.env.STATIC_DIR ??
  path.resolve(moduleDir, "../../venueflow/dist/public");

if (existsSync(staticDir) && statSync(staticDir).isDirectory()) {
  const indexHtml = path.join(staticDir, "index.html");
  app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res, next) => {
    if (!existsSync(indexHtml)) return next();
    res.sendFile(indexHtml);
  });
} else {
  logger.warn({ staticDir }, "Static frontend not found; API-only mode");
}

export default app;

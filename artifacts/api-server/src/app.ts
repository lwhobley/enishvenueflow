import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
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

// gzip every JSON / text response. The dashboards and shift / reservation
// list endpoints can return tens of KB of JSON; on a phone over 4G that's
// the difference between snappy and laggy. The default threshold is 1KB,
// so small responses (200 OK, single records) skip compression overhead.
app.use(compression());

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
  // Hashed asset files (assets/index-XYZ.js, etc.) can sit in the cache
  // for a year — their filenames change on every build. But the
  // "entry-point" files (index.html, sw.js, registerSW.js, the web
  // manifest) MUST revalidate on every request, otherwise the browser
  // can serve a 1-hour-stale service worker and the user keeps running
  // an old build long after deploy. Without no-cache on sw.js, the new
  // SW that calls skipWaiting()/clientsClaim() never even reaches the
  // browser to swap in.
  const NO_CACHE_FILES = new Set(["index.html", "sw.js", "sw.mjs", "registerSW.js", "manifest.webmanifest"]);
  app.use(express.static(staticDir, {
    index: false,
    setHeaders: (res, filePath) => {
      const base = path.basename(filePath);
      if (NO_CACHE_FILES.has(base)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  }));
  app.get(/^\/(?!api\/).*/, (_req, res, next) => {
    if (!existsSync(indexHtml)) return next();
    // The SPA fallback also needs no-cache so a deploy with a new asset
    // hash gets picked up on the next navigation, not after the
    // previous index.html ages out of cache.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(indexHtml);
  });
} else {
  logger.warn({ staticDir }, "Static frontend not found; API-only mode");
}

export default app;

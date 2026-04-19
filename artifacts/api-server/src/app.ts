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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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

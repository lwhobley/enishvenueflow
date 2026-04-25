import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function currentBuildHash(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    "dev"
  ).slice(0, 7);
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Public endpoint the frontend hits on boot to detect a stale bundle.
// The frontend's __BUILD_HASH__ is baked into the JS at build time;
// when the server's commit SHA differs, it means the user has cached
// JS from a previous deploy and needs to be force-refreshed.
router.get("/version", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({ buildHash: currentBuildHash() });
});

export default router;

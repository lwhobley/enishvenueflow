import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Tiny in-memory fixed-window rate limiter. Used to throttle PIN brute-
 * force attempts on /auth/pin and /auth/change-pin. Per-IP only — good
 * enough for a single Railway instance; if we scale horizontally later
 * we'll need shared state (Redis), but at the current scale a single-
 * process limit is the meaningful defense.
 *
 * Keys can be customised by passing keyFn (e.g. include the request path
 * so different endpoints get separate quotas).
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
}) {
  const buckets = new Map<string, Bucket>();
  const message = opts.message ?? "Too many attempts — please wait and try again.";

  // Periodic GC so a stale flood of unique keys doesn't grow the map
  // forever. Runs at the window cadence; keys whose window has expired
  // are dropped.
  const gc = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key);
  }, opts.windowMs);
  // Don't keep the event loop alive for tests / shutdown.
  if (typeof gc.unref === "function") gc.unref();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = opts.keyFn ? opts.keyFn(req) : (req.ip ?? "anonymous");
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ message });
      return;
    }
    next();
  };
}

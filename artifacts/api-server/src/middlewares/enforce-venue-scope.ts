import type { Request, Response, NextFunction } from "express";

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * If the caller provides a venueId anywhere in body / query / params,
 * require it to match the venueId on req.auth (set by requireAuth).
 *
 * This catches any handler that filters or mutates by a caller-supplied
 * venueId — which is most of the API — without each handler having to
 * remember to add the check itself. Public routes (/auth/pin, healthz,
 * /enroll/:venueId/:token, /push/vapid-public-key) skip this guard
 * because they have no req.auth.
 *
 * Note on /enroll: the public enroll endpoints carry a venueId in the
 * URL by design, but they live behind requireAuth's allow-list so
 * req.auth is undefined and we let them through.
 */
export function enforceVenueScope(req: Request, res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) {
    next();
    return;
  }

  const sources: Array<string | undefined> = [
    pickString((req.body as Record<string, unknown> | undefined)?.venueId),
    pickString(req.query?.venueId),
    pickString(req.params?.venueId),
  ];

  for (const provided of sources) {
    if (!provided) continue;
    if (provided !== auth.venueId) {
      res.status(403).json({ message: "Access denied for this venue" });
      return;
    }
  }

  next();
}

import type { Request, Response, NextFunction } from "express";

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type VenueExtraction =
  | { ok: true; venueId: string | undefined }
  | { ok: false; reason: "conflict" };

// Collect every venueId-shaped value the caller supplied (body, query, params)
// and require them all to agree. Any disagreement is treated as an
// authorization conflict so a caller can't authorize against one venue while
// the handler reads data for another (e.g. body=B in a GET that reads
// venueId from query=A).
function extractRequestedVenueId(req: Request): VenueExtraction {
  const sources: Array<string | undefined> = [
    pickString((req.body as Record<string, unknown> | undefined)?.venueId),
    pickString(req.query?.venueId),
    pickString(req.params?.venueId),
  ];
  const present = sources.filter((s): s is string => s !== undefined);
  if (present.length === 0) return { ok: true, venueId: undefined };
  const [first, ...rest] = present;
  if (rest.some((v) => v !== first)) return { ok: false, reason: "conflict" };
  return { ok: true, venueId: first };
}

/**
 * Manager-only gate. Identity comes from req.auth (populated by
 * requireAuth) — never from caller-supplied headers, which were
 * spoofable. requireAuth must run before this on every protected
 * route, which it does because the global app-level pipeline mounts
 * it once for the whole /api router.
 */
export function requireManagerForVenue(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const extracted = extractRequestedVenueId(req);
  if (!extracted.ok) {
    res.status(400).json({ message: "Conflicting venueId in request" });
    return;
  }
  const venueId = extracted.venueId;
  if (!venueId) {
    res.status(400).json({ message: "venueId required" });
    return;
  }

  if (!auth.isAdmin || auth.venueId !== venueId) {
    res.status(403).json({ message: "Manager access required for this venue" });
    return;
  }
  next();
}

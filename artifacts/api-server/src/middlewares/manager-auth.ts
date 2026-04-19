import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export async function requireManagerForVenue(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.header("x-user-id");
  if (!userId) {
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

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user || !user.isActive) {
      res.status(401).json({ message: "Invalid or inactive user" });
      return;
    }
    if (!user.isAdmin || user.venueId !== venueId) {
      res.status(403).json({ message: "Manager access required for this venue" });
      return;
    }
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Authorization check failed" });
  }
}

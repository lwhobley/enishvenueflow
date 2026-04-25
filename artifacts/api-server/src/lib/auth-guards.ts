import type { Request, Response } from "express";

/**
 * Refuse the request if a non-admin caller is acting on behalf of a
 * different user. Admins (managers) keep the ability to act on staff —
 * that's how they create shifts, approve time-off, etc.
 *
 * Returns true when the caller is allowed to proceed; otherwise sends a
 * 403 / 401 response and returns false. Handlers should
 *   if (!assertSelfOrAdmin(req, res, body.userId)) return;
 */
export function assertSelfOrAdmin(
  req: Request,
  res: Response,
  targetUserId: string | null | undefined,
): boolean {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }
  if (!targetUserId) return true; // nothing to check
  if (auth.isAdmin) return true;
  if (auth.userId === targetUserId) return true;
  res.status(403).json({ message: "Cannot act on another user's account" });
  return false;
}

/**
 * Refuse the request unless the caller is acting on their own user
 * record. Use for endpoints where even admins should not be able to
 * impersonate another user (e.g. clocking *in* on someone else's
 * behalf, where the legal record needs to belong to the actor).
 */
export function assertSelf(
  req: Request,
  res: Response,
  targetUserId: string | null | undefined,
): boolean {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }
  if (!targetUserId) {
    res.status(400).json({ message: "userId required" });
    return false;
  }
  if (auth.userId !== targetUserId) {
    res.status(403).json({ message: "Cannot act on another user's account" });
    return false;
  }
  return true;
}

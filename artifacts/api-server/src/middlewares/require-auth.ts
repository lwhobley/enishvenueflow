import type { Request, Response, NextFunction } from "express";
import { verifySessionToken, type SessionPrincipal } from "../lib/sessions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Populated by requireAuth so downstream handlers can derive identity
    // without trusting any caller-supplied header / body field.
    interface Request {
      auth?: SessionPrincipal;
    }
  }
}

// Endpoints that intentionally don't require authentication: the login
// itself, healthcheck, the VAPID public key the SW needs at startup, and
// the public enrollment surface.
const PUBLIC_PATH_REGEXES: RegExp[] = [
  /^\/healthz$/,
  /^\/version$/,
  /^\/auth\/pin$/,
  /^\/push\/vapid-public-key$/,
  /^\/enroll\/[^/]+\/[^/]+$/,
];

function isPublic(path: string): boolean {
  return PUBLIC_PATH_REGEXES.some((rx) => rx.test(path));
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (isPublic(req.path)) {
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  try {
    const principal = await verifySessionToken(token);
    if (!principal) {
      res.status(401).json({ message: "Invalid or expired session" });
      return;
    }
    req.auth = principal;
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ message: "Auth check failed" });
  }
}

import { randomBytes, createHash } from "node:crypto";
import { db, userSessions, users } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionPrincipal = {
  sessionId: string;
  userId: string;
  venueId: string;
  isAdmin: boolean;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session for the given user and return the plaintext token. */
export async function createSession(userId: string, venueId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db.insert(userSessions).values({ userId, venueId, tokenHash, expiresAt });
  return { token, expiresAt };
}

/**
 * Look up the session for a bearer token and return the principal. Returns
 * null when the token is missing, expired, or belongs to an inactive user.
 * The session's last_used_at is bumped so we can prune idle sessions later.
 */
export async function verifySessionToken(token: string): Promise<SessionPrincipal | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: userSessions.id,
      userId: userSessions.userId,
      venueId: userSessions.venueId,
      isAdmin: users.isAdmin,
      isActive: users.isActive,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.tokenHash, tokenHash), gte(userSessions.expiresAt, now)));
  if (!row || !row.isActive) return null;
  // Best-effort touch — failure here doesn't affect the auth decision.
  void db
    .update(userSessions)
    .set({ lastUsedAt: now })
    .where(eq(userSessions.id, row.sessionId))
    .catch(() => { /* noop */ });
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    venueId: row.venueId,
    isAdmin: !!row.isAdmin,
  };
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.delete(userSessions).where(eq(userSessions.userId, userId));
}

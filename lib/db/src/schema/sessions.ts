import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row per active sign-in. The token itself is never stored — we keep the
 * SHA-256 hash so a leaked DB dump can't be replayed against the API. On
 * login we generate 32 bytes of CSPRNG, return them to the client as the
 * bearer token, and store the hash here. requireAuth() looks up by hash on
 * every request.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    venueId: text("venue_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index("user_sessions_token_hash_idx").on(t.tokenHash),
    userIdIdx: index("user_sessions_user_id_idx").on(t.userId),
  }),
);

export type UserSession = typeof userSessions.$inferSelect;

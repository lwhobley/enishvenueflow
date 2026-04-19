import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const posIntegrations = pgTable("pos_integrations", {
  venueId: text("venue_id").primaryKey(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("connected"),
  externalId: text("external_id"),
  // Encrypted at rest as an AES-256-GCM envelope:
  //   { __enc: "v1", iv, ct, tag }
  // See artifacts/api-server/src/lib/crypto.ts. Never write plaintext here.
  credentials: jsonb("credentials").$type<Record<string, unknown>>().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PosIntegration = typeof posIntegrations.$inferSelect;
export type InsertPosIntegration = typeof posIntegrations.$inferInsert;

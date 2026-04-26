/**
 * Idempotent schema migrations applied on api-server startup.
 *
 * We don't use `drizzle-kit push` here because the deploy environment doesn't
 * always have an interactive TTY for confirming destructive changes. Each
 * statement is wrapped in `IF NOT EXISTS` (or equivalent) so re-running on
 * every boot is a cheap no-op once a column / table is in place.
 *
 * Whenever a new column is added to lib/db, append the matching `ALTER TABLE …
 * ADD COLUMN IF NOT EXISTS` here so the next deploy picks it up without a
 * manual push.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

const STATEMENTS: { name: string; sql: string }[] = [
  // ── Floor plan: rotation on tables + chairs ─────────────────────────────
  {
    name: "tables.rotation",
    sql: `ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "rotation" integer NOT NULL DEFAULT 0`,
  },
  {
    name: "chairs.rotation",
    sql: `ALTER TABLE "chairs" ADD COLUMN IF NOT EXISTS "rotation" integer NOT NULL DEFAULT 0`,
  },

  // ── Tables: per-table sales tracking ────────────────────────────────────
  {
    name: "tables.price",
    sql: `ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "price" numeric(12, 2)`,
  },
  {
    name: "tables.purchaser_name",
    sql: `ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "purchaser_name" text`,
  },

  // ── Floor plan scope discriminator (restaurant / nightlife) ─────────────
  {
    name: "tables.scope",
    sql: `ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'restaurant'`,
  },
  {
    name: "chairs.scope",
    sql: `ALTER TABLE "chairs" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'restaurant'`,
  },
  {
    name: "floor_sections.scope",
    sql: `ALTER TABLE "floor_sections" ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'restaurant'`,
  },

  // ── Venue: enrollment token + GPS pin + clock-in radius ─────────────────
  {
    name: "venues.enrollment_token",
    sql: `ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "enrollment_token" text`,
  },
  {
    name: "venues.latitude",
    sql: `ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 7)`,
  },
  {
    name: "venues.longitude",
    sql: `ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "longitude" numeric(10, 7)`,
  },
  {
    name: "venues.clock_in_radius_feet",
    sql: `ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "clock_in_radius_feet" integer`,
  },
  // One-shot: switch any venue still on the prior default (1000 ft, or
  // never explicitly set) to the new policy of 800 ft. Idempotent —
  // re-running is a no-op once values are already 800. Manager-set
  // values other than the prior default are preserved.
  {
    name: "venues.clock_in_radius_feet default 800",
    sql: `UPDATE "venues" SET "clock_in_radius_feet" = 800 WHERE "clock_in_radius_feet" IS NULL OR "clock_in_radius_feet" = 1000`,
  },

  // ── Literature library ──────────────────────────────────────────────────
  {
    name: "literature table",
    sql: `
      CREATE TABLE IF NOT EXISTS "literature" (
        "id" text PRIMARY KEY,
        "venue_id" text NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "category" text NOT NULL DEFAULT 'other',
        "file_name" text NOT NULL,
        "mime_type" text NOT NULL,
        "size_bytes" integer NOT NULL,
        "file_data" bytea NOT NULL,
        "uploaded_by_user_id" text,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `,
  },

  // ── Sessions table for bearer-token auth ───────────────────────────────
  {
    name: "user_sessions table",
    sql: `
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "id" text PRIMARY KEY,
        "user_id" text NOT NULL,
        "venue_id" text NOT NULL,
        "token_hash" text NOT NULL UNIQUE,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "last_used_at" timestamp NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: "user_sessions token_hash index",
    sql: `CREATE INDEX IF NOT EXISTS "user_sessions_token_hash_idx" ON "user_sessions" ("token_hash")`,
  },
  {
    name: "user_sessions user_id index",
    sql: `CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" ("user_id")`,
  },

  // ── Hot-path indexes (added for ~30 concurrent users) ───────────────────
  // Every list endpoint that filters by these columns previously did a
  // sequential scan. With a few hundred shifts and a few thousand
  // time-clock entries that's tolerable; at 30 users polling, the scans
  // pile up in the connection pool and slow everything else down.
  {
    name: "reservations(venue_id, date) index",
    sql: `CREATE INDEX IF NOT EXISTS "reservations_venue_date_idx" ON "reservations" ("venue_id", "date")`,
  },
  {
    name: "reservations(table_id) index",
    sql: `CREATE INDEX IF NOT EXISTS "reservations_table_id_idx" ON "reservations" ("table_id")`,
  },
  {
    name: "shifts(schedule_id) index",
    sql: `CREATE INDEX IF NOT EXISTS "shifts_schedule_id_idx" ON "shifts" ("schedule_id")`,
  },
  {
    name: "shifts(user_id) index",
    sql: `CREATE INDEX IF NOT EXISTS "shifts_user_id_idx" ON "shifts" ("user_id")`,
  },
  {
    name: "shifts(start_time) index",
    sql: `CREATE INDEX IF NOT EXISTS "shifts_start_time_idx" ON "shifts" ("start_time")`,
  },
  {
    name: "time_clock_entries(venue_id, status) index",
    sql: `CREATE INDEX IF NOT EXISTS "time_clock_entries_venue_status_idx" ON "time_clock_entries" ("venue_id", "status")`,
  },
  {
    name: "time_clock_entries(user_id, status) index",
    sql: `CREATE INDEX IF NOT EXISTS "time_clock_entries_user_status_idx" ON "time_clock_entries" ("user_id", "status")`,
  },
  {
    name: "tables(venue_id, scope) index",
    sql: `CREATE INDEX IF NOT EXISTS "tables_venue_scope_idx" ON "tables" ("venue_id", "scope")`,
  },
  {
    name: "chairs(venue_id, scope) index",
    sql: `CREATE INDEX IF NOT EXISTS "chairs_venue_scope_idx" ON "chairs" ("venue_id", "scope")`,
  },
  {
    name: "floor_sections(venue_id, scope) index",
    sql: `CREATE INDEX IF NOT EXISTS "floor_sections_venue_scope_idx" ON "floor_sections" ("venue_id", "scope")`,
  },
  {
    name: "users(venue_id) index",
    sql: `CREATE INDEX IF NOT EXISTS "users_venue_id_idx" ON "users" ("venue_id")`,
  },
  {
    name: "messages(venue_id, created_at) index",
    sql: `CREATE INDEX IF NOT EXISTS "messages_venue_created_idx" ON "messages" ("venue_id", "created_at")`,
  },
  {
    name: "availability(venue_id, user_id) index",
    sql: `CREATE INDEX IF NOT EXISTS "availability_venue_user_idx" ON "availability" ("venue_id", "user_id")`,
  },
];

export async function applyStartupMigrations(): Promise<void> {
  for (const { name, sql } of STATEMENTS) {
    try {
      await pool.query(sql);
      logger.info({ migration: name }, "Migration applied (or already in place)");
    } catch (err) {
      // Don't take the boot down because a migration tripped — log loudly so
      // it shows up in Railway logs but let the server come up.
      logger.error({ err, migration: name }, "Migration failed; continuing boot");
    }
  }
}

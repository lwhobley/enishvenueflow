import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// pg defaults to max=10 with no idle/connection timeouts, which lets a
// burst of slow queries hold every connection until the DB itself
// kills them. Cap pool size and reclaim idle connections aggressively
// so a stuck request can't starve the whole api-server. Overridable
// via env for staging vs prod.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECT_MS ?? 5_000),
});
// Don't take the process down if a query errors out on a checked-out
// connection — pg surfaces those as 'error' on the pool itself.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db pool] unexpected client error", err);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./hires-roster";
export * from "./hires-loader";
export * from "./pin-hash";

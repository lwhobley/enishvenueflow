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
// kills them. Cap pool size and reclaim idle connections so a stuck
// request can't starve the whole api-server. Overridable via env.
//
// Sized for ~30 concurrent users across the full app: chat polls every
// 5s, the floor plan polls 5s while interacting and 30s otherwise,
// reservations every 30s, the rest sit at the global 30s default.
// Sustained RPS at 30 users is in the tens; max=40 leaves a comfortable
// 4× headroom for bursts (admin opening a heavy dashboard while three
// other admins do mutations). idleTimeoutMillis bumped to 60s so a
// momentary network blip doesn't kick a connection mid-query.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 40),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 60_000),
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

/**
 * One-shot: inserts the five 4/23/2026 new hires into the active venue.
 *
 * Usage (from repo root, pointed at your Railway Postgres):
 *
 *   DATABASE_URL="postgres://..." pnpm --filter @workspace/scripts run add-new-hires
 *
 * Optional env:
 *   VENUE_ID    — target venue id. Defaults to the first active venue.
 *   DRY_RUN=1   — print the plan without writing.
 *
 * Each hire's PIN is the last four digits of their phone number. The script
 * refuses to insert if a PIN already exists anywhere in `users` (PIN lookup
 * is global in auth.ts, so duplicates would make sign-in ambiguous).
 */

import { createHash } from "node:crypto";
import { db, users, venues, roles, pool } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const PIN_SALT = "enosh2024";
const hashPin = (pin: string) => createHash("sha256").update(pin + PIN_SALT).digest("hex");

type Hire = {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;     // ISO (YYYY-MM-DD)
  address: string;
  positions: string[];     // first one becomes the role match
  hireDate: string;        // ISO
  hourlyRate?: number | null;
};

const HIRES: Hire[] = [
  {
    fullName: "Adriel L. Thomas",
    email: "theadrielthomas@gmail.com",
    phone: "904-415-1565",
    dateOfBirth: "2000-07-06",
    address: "3323 McCue Rd Apt 1242, Houston, TX 77056",
    positions: ["bartender"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  {
    fullName: "Delcasia M. Lee",
    email: "princessdelcasia@yahoo.com",
    phone: "832-552-3211",
    dateOfBirth: "1994-02-16",
    address: "301 Wilcrest Dr Apt 3102, Houston, TX 77042",
    positions: ["bartender"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
  {
    fullName: "Boma R. Briggs",
    email: "bomabriggs9393@gmail.com",
    phone: "832-785-4607",
    dateOfBirth: "1993-04-10",
    address: "3206 Rose Mary Park Ln, Houston, TX 77082",
    positions: ["host", "server"],
    hireDate: "2026-04-23",
    hourlyRate: 18,
  },
  {
    fullName: "Joshua H. Simmons",
    email: "joshua.simmons@mediatech.edu",
    phone: "832-403-9120",
    dateOfBirth: "1993-12-18",
    address: "1617 Enid St Apt 487, Houston, TX 77009",
    positions: ["host", "server"],
    hireDate: "2026-04-23",
    hourlyRate: 18,
  },
  {
    fullName: "Toi L. Gladney",
    email: "toisresume6@yahoo.com",
    phone: "713-388-6686",
    dateOfBirth: "1977-05-14",
    address: "P.O. Box 88188, Houston, TX 77288",
    positions: ["host"],
    hireDate: "2026-04-23",
    hourlyRate: null,
  },
];

function lastFourDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) throw new Error(`Phone "${phone}" has fewer than 4 digits`);
  return digits.slice(-4);
}

async function pickVenueId(): Promise<string> {
  const override = process.env.VENUE_ID;
  if (override) {
    const [v] = await db.select().from(venues).where(eq(venues.id, override));
    if (!v) throw new Error(`VENUE_ID=${override} not found`);
    return v.id;
  }
  const rows = await db.select().from(venues).where(eq(venues.isActive, true));
  if (rows.length === 0) throw new Error("No active venue found — set VENUE_ID");
  if (rows.length > 1) {
    console.log("Multiple active venues present:");
    for (const v of rows) console.log(`  ${v.id}  ${v.name}`);
    console.log("Set VENUE_ID to choose one.");
  }
  return rows[0].id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL env var is required");
  }
  const dryRun = process.env.DRY_RUN === "1";
  const venueId = await pickVenueId();
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
  console.log(`Target venue: ${venue.name} (${venueId})`);

  const venueRoles = await db.select().from(roles).where(eq(roles.venueId, venueId));
  const roleByName: Record<string, { id: string; name: string }> = {};
  for (const r of venueRoles) roleByName[r.name.toLowerCase()] = r;

  const results: Array<{ hire: Hire; action: string; id?: string; pin: string }> = [];

  for (const hire of HIRES) {
    const pin = lastFourDigits(hire.phone);
    const pinHash = hashPin(pin);

    // Collision: a different user already uses this PIN.
    const [pinUser] = await db.select().from(users).where(eq(users.pinHash, pinHash));

    // Upsert-ish: match by (venueId, email) so re-running is safe.
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.venueId, venueId), eq(users.email, hire.email)));

    if (pinUser && (!existing || pinUser.id !== existing.id)) {
      results.push({
        hire, pin,
        action: `SKIPPED — PIN ${pin} already in use by user ${pinUser.id} (${pinUser.fullName})`,
      });
      continue;
    }

    const roleId = roleByName[hire.positions[0]]?.id ?? null;

    if (existing) {
      results.push({ hire, pin, action: `UPDATE existing user`, id: existing.id });
      if (dryRun) continue;
      await db.update(users).set({
        fullName: hire.fullName,
        phone: hire.phone,
        dateOfBirth: hire.dateOfBirth,
        address: hire.address,
        roleId: roleId ?? existing.roleId,
        positions: hire.positions,
        hireDate: hire.hireDate,
        hourlyRate: hire.hourlyRate != null ? String(hire.hourlyRate) : existing.hourlyRate,
        pinHash,
        isActive: true,
      }).where(eq(users.id, existing.id));
    } else {
      results.push({ hire, pin, action: "INSERT new user" });
      if (dryRun) continue;
      const [created] = await db.insert(users).values({
        venueId,
        fullName: hire.fullName,
        email: hire.email,
        phone: hire.phone,
        dateOfBirth: hire.dateOfBirth,
        address: hire.address,
        roleId,
        positions: hire.positions,
        isAdmin: false,
        isActive: true,
        hireDate: hire.hireDate,
        hourlyRate: hire.hourlyRate != null ? String(hire.hourlyRate) : null,
        pinHash,
      }).returning({ id: users.id });
      results[results.length - 1].id = created.id;
    }
  }

  console.log(`\n${dryRun ? "(dry run) " : ""}Summary:`);
  for (const r of results) {
    console.log(
      `  • ${r.hire.fullName.padEnd(22)} pos=${r.hire.positions.join("+").padEnd(14)} PIN=${r.pin}  →  ${r.action}`,
    );
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Failed:", err);
    await pool.end().catch(() => { /* noop */ });
    process.exit(1);
  });

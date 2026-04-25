import { eq, and, or } from "drizzle-orm";
import { db } from "./index";
import { users, venues, roles } from "./schema";
import { NEW_HIRES_ROSTER, lastFourDigits, type Hire } from "./hires-roster";
import { hashPin, lookupHashes, verifyPin } from "./pin-hash";

export type LoadHiresResult = {
  hire: Hire;
  pin: string;
  action: "inserted" | "updated" | "skipped_pin_collision" | "skipped_no_change";
  userId?: string;
  detail?: string;
};

/**
 * Idempotently ensure the entire NEW_HIRES_ROSTER exists in the given venue.
 * - Matches existing rows by (venueId, email).
 * - Refuses to write a hire whose PIN hash already belongs to a different
 *   user (PIN auth is global; collisions would be ambiguous).
 * - When `venueId` is omitted, picks the first active venue.
 *
 * Safe to call on every api-server boot.
 */
export async function loadHires(opts: { venueId?: string } = {}): Promise<LoadHiresResult[]> {
  let venueId = opts.venueId ?? null;

  if (!venueId) {
    const active = await db.select().from(venues).where(eq(venues.isActive, true));
    if (active.length === 0) return [];
    venueId = active[0].id;
  }

  const venueRoles = await db.select().from(roles).where(eq(roles.venueId, venueId));
  const roleByName: Record<string, { id: string }> = {};
  for (const r of venueRoles) roleByName[r.name.toLowerCase()] = r;

  const results: LoadHiresResult[] = [];

  for (const hire of NEW_HIRES_ROSTER) {
    const pin = lastFourDigits(hire.phone);
    const pinHash = hashPin(pin);
    const { newHash, legacyHash } = lookupHashes(pin);

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.venueId, venueId), eq(users.email, hire.email)));

    // PIN auth matches users whose stored hash is either the new
    // scrypt-prefixed format or the legacy SHA-256 hash. A collision in
    // either format would make sign-in ambiguous, so refuse here too.
    const [pinUser] = await db
      .select()
      .from(users)
      .where(or(eq(users.pinHash, newHash), eq(users.pinHash, legacyHash)));
    if (pinUser && (!existing || pinUser.id !== existing.id)) {
      results.push({
        hire, pin, action: "skipped_pin_collision",
        detail: `PIN ${pin} already belongs to user ${pinUser.id}`,
      });
      continue;
    }

    const roleId = roleByName[hire.positions[0]]?.id ?? null;

    if (existing) {
      // Only update when something actually differs — keeps logs quiet.
      // For the PIN, treat the row as up-to-date if either the stored
      // hash matches the new format OR the legacy SHA-256 still verifies
      // the same plaintext PIN. Avoids a noisy update on every boot.
      const pinAlreadyMatches = existing.pinHash === pinHash || verifyPin(pin, existing.pinHash);
      const changed =
        existing.fullName !== hire.fullName ||
        existing.phone !== hire.phone ||
        existing.dateOfBirth !== hire.dateOfBirth ||
        existing.address !== hire.address ||
        JSON.stringify(existing.positions ?? []) !== JSON.stringify(hire.positions) ||
        existing.hireDate !== hire.hireDate ||
        !pinAlreadyMatches ||
        (existing.roleId == null && roleId != null);

      if (!changed) {
        results.push({ hire, pin, action: "skipped_no_change", userId: existing.id });
        continue;
      }

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
      results.push({ hire, pin, action: "updated", userId: existing.id });
    } else {
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
      results.push({ hire, pin, action: "inserted", userId: created.id });
    }
  }

  return results;
}

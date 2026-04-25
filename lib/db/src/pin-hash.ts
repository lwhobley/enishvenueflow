import { createHash, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * PIN hashing.
 *
 * The threat model: 4-digit PINs only have 10,000 possible values. The
 * legacy code used SHA-256 with a static salt, which means a single
 * precomputed rainbow table cracks every user. We can't add a per-user
 * salt without breaking the global "look up the user by PIN" sign-in
 * flow, so the defenses we layer here are:
 *
 *   1. PIN_PEPPER env var. Combined with the salt, an attacker also
 *      needs the running server's secrets — a leaked DB dump alone
 *      doesn't tell them what to put in the rainbow table.
 *   2. scrypt KDF. Slow on purpose — every guess costs ~tens of ms,
 *      so even with the pepper, brute-forcing 10k PINs against the
 *      DB takes serious compute.
 *   3. Rate-limiting on /auth/pin (handled in routes/auth.ts) so
 *      online brute force is impractical.
 *
 * Hashes are stored as either:
 *   - "scrypt:<64-hex>"   (current format)
 *   - "<64-hex>"          (legacy SHA-256 from before this commit)
 *
 * verifyPin handles both. lookupHashes returns both forms so the
 * sign-in query can match users whose hash hasn't been migrated yet.
 * Successful logins on a legacy hash trigger a silent re-hash to the
 * new format (see auth.ts).
 */

const NEW_PREFIX = "scrypt:";
const LEGACY_SALT = "enosh2024";

const SCRYPT_KEYLEN = 32;
// N=2^14 ≈ ~30ms on a typical server. Tunable via env if we want it
// faster on tiny hosts; ship a sensible default.
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let _peppered = false;
function getPepper(): string {
  const fromEnv = process.env.PIN_PEPPER;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (!_peppered) {
    _peppered = true;
    // No logger dep at this layer — use console so the warning surfaces
    // even in tooling/scripts that import this module.
    // eslint-disable-next-line no-console
    console.warn(
      "[pin-hash] PIN_PEPPER is unset or too short (need ≥16 chars). " +
      "Falling back to a development pepper — set PIN_PEPPER in Railway " +
      "before this ships to production users.",
    );
  }
  return "enish-dev-pepper-set-PIN_PEPPER-in-production";
}

function pepperedSalt(): Buffer {
  // Deterministic salt derived from the pepper. Same plaintext PIN
  // always produces the same hash so we can still look up by PIN —
  // but an attacker without the pepper can't compute the salt.
  return createHash("sha256").update(getPepper()).digest();
}

function hashScrypt(pin: string): string {
  const derived = scryptSync(pin, pepperedSalt(), SCRYPT_KEYLEN, SCRYPT_OPTS);
  return NEW_PREFIX + derived.toString("hex");
}

function hashLegacy(pin: string): string {
  return createHash("sha256").update(pin + LEGACY_SALT).digest("hex");
}

/** Always returns the new format. Use for any new write. */
export function hashPin(pin: string): string {
  return hashScrypt(pin);
}

/** Did this stored value originate from the legacy SHA-256+static-salt path? */
export function isLegacyHash(stored: string | null | undefined): boolean {
  return !!stored && !stored.startsWith(NEW_PREFIX);
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Verify a plaintext PIN against a stored hash in either format. */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (stored.startsWith(NEW_PREFIX)) return timingSafeEq(hashScrypt(pin), stored);
  return timingSafeEq(hashLegacy(pin), stored);
}

/**
 * Returns both the new and legacy hashes for a PIN. The sign-in flow
 * uses these to find the user whose stored hash matches *either*
 * format, so users haven't all had to log in once before this
 * deployment can roll out.
 */
export function lookupHashes(pin: string): { newHash: string; legacyHash: string } {
  return { newHash: hashScrypt(pin), legacyHash: hashLegacy(pin) };
}

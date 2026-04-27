import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { db, customers, customerSessions } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type CustomerPrincipal = {
  sessionId: string;
  customerId: string;
  venueId: string;
};

export function generateCustomerToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// scrypt password hash for customers. Format: "scrypt:<salt-hex>:<hash-hex>".
// Salt is per-row (unlike the staff PIN, which has a single global salt
// because PINs need a global lookup). Customer email+venue is the lookup
// key, so we can afford a per-row salt — it makes rainbow-table attacks
// against a leaked DB pointless.
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function createCustomerSession(customerId: string, venueId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateCustomerToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await db.insert(customerSessions).values({ customerId, venueId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function verifyCustomerToken(token: string): Promise<CustomerPrincipal | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: customerSessions.id,
      customerId: customerSessions.customerId,
      venueId: customerSessions.venueId,
    })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(and(eq(customerSessions.tokenHash, tokenHash), gte(customerSessions.expiresAt, now)));
  return row ?? null;
}

export async function deleteCustomerSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(customerSessions).where(eq(customerSessions.tokenHash, tokenHash));
}

// Short, human-friendly confirmation code shown to the guest. Avoids
// look-alike chars (0/O, 1/I/L) so it's easy to read from a phone.
export function generateConfirmationCode(prefix = "ENISH"): string {
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${prefix}-${code}`;
}

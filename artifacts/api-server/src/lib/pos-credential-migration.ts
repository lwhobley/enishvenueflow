import { db, posIntegrations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptCredentials, isEncryptedEnvelope } from "./crypto";
import { logger } from "./logger";

/**
 * One-shot migration: walks `pos_integrations` and re-encrypts any rows whose
 * `credentials` jsonb is still stored in plaintext, wrapping them in an
 * AES-256-GCM envelope keyed by POS_CREDENTIAL_KEY. Already-encrypted rows
 * are left untouched.
 *
 * If a row cannot be encrypted (corrupt blob, etc.) it is invalidated:
 * status flipped to "disconnected", credentials replaced with an empty
 * encrypted envelope, and `lastError` set so the venue is prompted to
 * reconnect. The function then asserts that no plaintext rows remain — if
 * any do, it throws so the server fails to start rather than serving an
 * environment that violates the encrypt-at-rest guarantee.
 *
 * Logs only counts and venueIds — never credential material.
 */
export async function encryptLegacyPosCredentials(): Promise<void> {
  if (!process.env.POS_CREDENTIAL_KEY) {
    throw new Error(
      "POS_CREDENTIAL_KEY is not set. The API server refuses to start without an encryption key for POS credentials.",
    );
  }
  let scanned = 0;
  let migrated = 0;
  let invalidated = 0;

  const rows = await db.select().from(posIntegrations);
  for (const row of rows) {
    scanned += 1;
    if (isEncryptedEnvelope(row.credentials)) continue;
    const plain = (row.credentials ?? {}) as Record<string, unknown>;
    try {
      const envelope = encryptCredentials(plain);
      await db
        .update(posIntegrations)
        .set({ credentials: envelope, updatedAt: new Date() })
        .where(eq(posIntegrations.venueId, row.venueId));
      migrated += 1;
    } catch (err) {
      logger.error(
        { venueId: row.venueId, err: (err as Error).message },
        "Failed to encrypt legacy POS credentials; invalidating connection",
      );
      const empty = encryptCredentials({});
      await db
        .update(posIntegrations)
        .set({
          credentials: empty,
          status: "disconnected",
          lastError: "POS credentials could not be migrated to encrypted storage. Please reconnect.",
          updatedAt: new Date(),
        })
        .where(eq(posIntegrations.venueId, row.venueId));
      invalidated += 1;
    }
  }

  // Verify no plaintext rows remain. If any do, refuse to boot.
  const after = await db.select().from(posIntegrations);
  const stragglers = after.filter((r) => !isEncryptedEnvelope(r.credentials));
  if (stragglers.length > 0) {
    throw new Error(
      `Refusing to start: ${stragglers.length} pos_integrations row(s) still have plaintext credentials.`,
    );
  }

  if (migrated > 0 || invalidated > 0) {
    logger.info(
      { scanned, migrated, invalidated },
      "POS credential at-rest encryption migration complete",
    );
  }
}

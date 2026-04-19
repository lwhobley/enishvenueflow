import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const ENVELOPE_VERSION = "v1";

export type EncryptedEnvelope = {
  __enc: typeof ENVELOPE_VERSION;
  iv: string;
  ct: string;
  tag: string;
};

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.POS_CREDENTIAL_KEY;
  if (!raw) {
    throw new Error(
      "POS_CREDENTIAL_KEY is not set. Refusing to read or write POS credentials without an encryption key.",
    );
  }
  let buf: Buffer;
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) {
      buf = b64;
    } else {
      const hex = Buffer.from(raw, "hex");
      buf = hex.length === 32 ? hex : createHash("sha256").update(raw, "utf8").digest();
    }
  } catch {
    buf = createHash("sha256").update(raw, "utf8").digest();
  }
  cachedKey = buf;
  return buf;
}

export function isEncryptedEnvelope(v: unknown): v is EncryptedEnvelope {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.__enc === ENVELOPE_VERSION &&
    typeof o.iv === "string" &&
    typeof o.ct === "string" &&
    typeof o.tag === "string"
  );
}

export function encryptCredentials(plain: Record<string, unknown>): EncryptedEnvelope {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = Buffer.from(JSON.stringify(plain), "utf8");
  const ct = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    __enc: ENVELOPE_VERSION,
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptCredentials(env: EncryptedEnvelope): Record<string, unknown> {
  const key = getKey();
  const iv = Buffer.from(env.iv, "base64");
  const ct = Buffer.from(env.ct, "base64");
  const tag = Buffer.from(env.tag, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Invalid encrypted credential envelope");
  }
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as Record<string, unknown>;
}

/**
 * Read credentials from a stored jsonb value. Always requires an
 * AES-256-GCM envelope — plaintext blobs are rejected so the at-rest
 * encryption guarantee cannot be bypassed at request time. Legacy rows
 * are encrypted (or invalidated) on startup by `encryptLegacyPosCredentials`.
 */
export function readStoredCredentials(stored: unknown): Record<string, unknown> {
  if (!isEncryptedEnvelope(stored)) {
    throw new Error("POS credentials are not encrypted at rest");
  }
  return decryptCredentials(stored);
}

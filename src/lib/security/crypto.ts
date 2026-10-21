import crypto from "crypto";

// Dev-only fallback keys — NEVER used in production
const DEV_ONLY_KEY_HEX = "f47ac10b58cc4372a5670e02b2e3d4791a8e9d8f3c7e6b5a4d3c2b1a0f9e8d7c";
const DEV_ONLY_HMAC_HEX = "c8e7d6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7";

function getEncryptionKey(): Buffer {
  const isProd = process.env.NODE_ENV === "production";
  const rawKey = process.env.ENCRYPTION_KEY;

  if (!rawKey) {
    if (isProd) {
      throw new Error("[SECURITY] ENCRYPTION_KEY environment variable is required in production.");
    }
    // Dev fallback — clearly labelled, not usable in prod
    console.warn("[SECURITY WARNING] Using dev-only ENCRYPTION_KEY fallback. Set ENCRYPTION_KEY in .env for production.");
    return Buffer.from(DEV_ONLY_KEY_HEX, "hex");
  }

  if (rawKey.length === 64) {
    return Buffer.from(rawKey, "hex");
  }
  return crypto.createHash("sha256").update(rawKey).digest();
}

function getHmacSecret(): Buffer {
  const isProd = process.env.NODE_ENV === "production";
  const rawSecret = process.env.HMAC_SECRET || process.env.ENCRYPTION_KEY;

  if (!rawSecret) {
    if (isProd) {
      throw new Error("[SECURITY] HMAC_SECRET environment variable is required in production.");
    }
    console.warn("[SECURITY WARNING] Using dev-only HMAC_SECRET fallback. Set HMAC_SECRET in .env for production.");
    return Buffer.from(DEV_ONLY_HMAC_HEX, "hex");
  }

  if (rawSecret.length === 64) {
    return Buffer.from(rawSecret, "hex");
  }
  return crypto.createHash("sha256").update(rawSecret).digest();
}


/**
 * Encrypt sensitive Egyptian National ID with AES-256-GCM authenticated encryption.
 * Output format: <iv_hex>:<authTag_hex>:<cipher_hex>
 */
export function encryptNationalId(nationalId: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(nationalId, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt National ID string using AES-256-GCM.
 * Validates authentication tag to guarantee integrity.
 */
export function decryptNationalId(encryptedPayload: string): string {
  const [ivHex, authTagHex, cipherHex] = encryptedPayload.split(":");
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error("Invalid encrypted payload structure");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Keyed HMAC-SHA256 hash for secure zero-knowledge National ID lookups and uniqueness constraints.
 */
export function computeNationalIdHash(nationalId: string): string {
  const secret = getHmacSecret();
  return crypto.createHmac("sha256", secret).update(nationalId.trim()).digest("hex");
}

/**
 * Masks a 14-digit Egyptian National ID for safe display (e.g. 2990101******4)
 */
export function maskNationalId(nationalId: string): string {
  const clean = nationalId.trim();
  if (clean.length !== 14) return "**************";
  return `${clean.slice(0, 4)}******${clean.slice(10)}`;
}

/**
 * Generate cryptographically secure random token (e.g. for Telegram account linking)
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Hash single-use token with SHA-256 before database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

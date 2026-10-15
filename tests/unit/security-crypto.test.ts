import { describe, it, expect } from "vitest";
import {
  encryptNationalId,
  decryptNationalId,
  computeNationalIdHash,
  maskNationalId,
  generateSecureToken,
  hashToken,
} from "../../src/lib/security/crypto";

describe("Security & Cryptography Utilities", () => {
  const sampleNationalId = "30301010200123";

  it("should encrypt and decrypt Egyptian National ID with AES-256-GCM authenticated encryption", () => {
    const encrypted = encryptNationalId(sampleNationalId);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(sampleNationalId);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decryptNationalId(encrypted);
    expect(decrypted).toBe(sampleNationalId);
  });

  it("should fail decryption if ciphertext or auth tag is tampered", () => {
    const encrypted = encryptNationalId(sampleNationalId);
    const [iv, authTag, cipher] = encrypted.split(":");
    // Tamper the ciphertext
    const tampered = `${iv}:${authTag}:${cipher.slice(0, -2)}aa`;

    expect(() => decryptNationalId(tampered)).toThrow();
  });

  it("should compute deterministic keyed HMAC-SHA256 for National ID search without plaintext storage", () => {
    const hash1 = computeNationalIdHash(sampleNationalId);
    const hash2 = computeNationalIdHash(sampleNationalId);
    const hash3 = computeNationalIdHash("30301010200124");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64); // 256 bits = 64 hex characters
  });

  it("should securely mask 14-digit National ID preserving only first 4 and last 4 characters", () => {
    const masked = maskNationalId(sampleNationalId);
    expect(masked).toBe("3030******0123");
    expect(masked).not.toContain("10102");
  });

  it("should generate cryptographically secure random tokens and deterministic SHA-256 hashes", () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64);

    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashToken(token));
  });
});

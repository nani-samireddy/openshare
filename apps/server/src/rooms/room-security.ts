import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function createHostToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 32);
  return `${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export function verifySecret(secret: string, encoded: string | null): boolean {
  if (!encoded) {
    return false;
  }

  const [saltValue, hashValue] = encoded.split(".");
  if (!saltValue || !hashValue) {
    return false;
  }

  const expected = Buffer.from(hashValue, "base64url");
  const actual = scryptSync(secret, Buffer.from(saltValue, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

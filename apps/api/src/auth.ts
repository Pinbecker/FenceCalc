import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): { hash: string; salt: string } {
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const calculated = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHash, "hex");
  if (calculated.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(calculated, expected);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

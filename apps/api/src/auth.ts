import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

function derivePasswordKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
): { hash: string; salt: string } {
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString("hex");
  return { hash, salt };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const calculated = await derivePasswordKey(password, salt);
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

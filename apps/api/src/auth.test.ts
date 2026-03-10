import { describe, expect, it } from "vitest";

import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./auth.js";

describe("auth helpers", () => {
  it("hashes and verifies passwords", () => {
    const hashed = hashPassword("supersecure123");

    expect(verifyPassword("supersecure123", hashed.salt, hashed.hash)).toBe(true);
    expect(verifyPassword("wrongpassword", hashed.salt, hashed.hash)).toBe(false);
  });

  it("creates stable token hashes", () => {
    const token = createSessionToken();

    expect(token).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });
});

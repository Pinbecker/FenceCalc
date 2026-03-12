import { describe, expect, it } from "vitest";

import { ApiClientError } from "./apiClient";
import { extractApiErrorMessage, extractCurrentVersionNumber } from "./apiErrors";

describe("apiErrors", () => {
  it("extracts messages from API client errors", () => {
    const error = new ApiClientError("Conflict", 409, { currentVersionNumber: 4 });

    expect(extractApiErrorMessage(error)).toBe("Conflict");
    expect(extractCurrentVersionNumber(error)).toBe(4);
  });

  it("falls back safely for non-API errors", () => {
    expect(extractApiErrorMessage(new Error("Boom"))).toBe("Boom");
    expect(extractApiErrorMessage("nope")).toBe("Unexpected request failure");
    expect(extractCurrentVersionNumber(new Error("Boom"))).toBeNull();
  });
});

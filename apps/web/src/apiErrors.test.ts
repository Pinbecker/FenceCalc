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

  it("includes flattened validation details from API errors", () => {
    const error = new ApiClientError("Invalid customer payload", 400, {
      formErrors: ["At least one customer field must be provided"],
      fieldErrors: {
        primaryEmail: ["Invalid email address"],
        name: ["String must contain at least 1 character(s)"],
      },
    });

    expect(extractApiErrorMessage(error)).toBe(
      "Invalid customer payload: At least one customer field must be provided; primaryEmail: Invalid email address; name: String must contain at least 1 character(s)",
    );
  });
});

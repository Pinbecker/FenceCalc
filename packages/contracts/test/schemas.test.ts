import { describe, expect, it } from "vitest";

import {
  bootstrapOwnerRequestSchema,
  drawingArchiveRequestSchema,
  drawingCreateRequestSchema,
  drawingUpdateRequestSchema,
  estimateSnapshotRequestSchema,
  fenceSpecSchema,
  layoutModelSchema,
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  userCreateRequestSchema
} from "../src/schemas.js";

describe("contracts schemas", () => {
  it("rejects roll-form fence heights that are not supported by the system", () => {
    const result = fenceSpecSchema.safeParse({
      system: "ROLL_FORM",
      height: "4m"
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues[0]?.message).toContain("Unsupported roll form height");
  });

  it("accepts a valid layout payload", () => {
    const result = layoutModelSchema.safeParse({
      segments: [
        {
          id: "one",
          start: { x: 0, y: 0 },
          end: { x: 10000, y: 0 },
          spec: {
            system: "TWIN_BAR",
            height: "2m",
            twinBarVariant: "STANDARD"
          }
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("requires snapshot requests to be wrapped in a layout object", () => {
    const result = estimateSnapshotRequestSchema.safeParse({
      segments: []
    });

    expect(result.success).toBe(false);
  });

  it("normalizes emails for auth payloads", () => {
    const result = loginRequestSchema.parse({
      email: "Jane@Example.com",
      password: "supersecure123"
    });

    expect(result.email).toBe("jane@example.com");
  });

  it("requires company registration details", () => {
    const result = bootstrapOwnerRequestSchema.safeParse({
      companyName: "A",
      displayName: "JD",
      email: "bad",
      password: "short"
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty drawing updates", () => {
    const result = drawingUpdateRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("defaults missing gate lists on drawing payloads", () => {
    const result = drawingCreateRequestSchema.parse({
      name: "Main yard",
      layout: {
        segments: []
      }
    });

    expect(result.layout.gates).toEqual([]);
  });

  it("rejects owner role creation through the admin user schema", () => {
    const result = userCreateRequestSchema.safeParse({
      displayName: "Jane Doe",
      email: "jane@example.com",
      password: "supersecure123",
      role: "OWNER"
    });

    expect(result.success).toBe(false);
  });

  it("accepts drawing archive payloads", () => {
    const result = drawingArchiveRequestSchema.safeParse({ archived: true });

    expect(result.success).toBe(true);
  });

  it("requires reset token and password for password resets", () => {
    expect(
      passwordResetRequestSchema.safeParse({
        email: "jane@example.com"
      }).success,
    ).toBe(true);
    expect(
      passwordResetConfirmSchema.safeParse({
        token: "too-short",
        password: "supersecure123"
      }).success,
    ).toBe(false);
  });
});

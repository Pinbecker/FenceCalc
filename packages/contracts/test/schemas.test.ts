import { describe, expect, it } from "vitest";

import { estimateSnapshotRequestSchema, fenceSpecSchema, layoutModelSchema } from "../src/schemas.js";

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
});

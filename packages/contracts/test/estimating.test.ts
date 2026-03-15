import { describe, expect, it } from "vitest";

import { buildDefaultPricingConfig } from "../src/estimating.js";

describe("buildDefaultPricingConfig", () => {
  it("builds the live Twin Bar pricing baseline for a company", () => {
    const pricingConfig = buildDefaultPricingConfig("company-1", "user-1");
    const itemCodes = pricingConfig.items.map((item) => item.itemCode);

    expect(pricingConfig.companyId).toBe("company-1");
    expect(pricingConfig.updatedByUserId).toBe("user-1");
    expect(pricingConfig.updatedAtIso).toBe(new Date(0).toISOString());

    expect(itemCodes).toEqual(
      expect.arrayContaining([
        "TWIN_BAR_PANEL_2M",
        "TWIN_BAR_POST_INTERMEDIATE",
        "TWIN_BAR_POST_END",
        "TWIN_BAR_GATE_SINGLE_LEAF_LEAF",
        "TWIN_BAR_FENCE_CONCRETE",
        "TWIN_BAR_FLOODLIGHT_COLUMN",
        "TWIN_BAR_BASKETBALL_POST",
        "TWIN_BAR_GENERAL_PLANT"
      ])
    );

    expect(itemCodes).not.toEqual(
      expect.arrayContaining([
        "ROLL_FORM_PANEL_2M",
        "ROLL_FORM_PANEL_3M",
        "ROLL_FORM_POST",
        "TWIN_BAR_FIXING_NUT",
        "TWIN_BAR_FIXING_BOLT",
        "TWIN_BAR_FIXING_WASHER"
      ])
    );
    expect(pricingConfig.items.every((item) => item.fenceSystem === "TWIN_BAR")).toBe(true);
  });
});

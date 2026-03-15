import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, PricingConfigRecord, PricingItem } from "@fence-estimator/contracts";

import { PricingPage, formatPricingSavedLabel, groupItems } from "./PricingPage.js";

const session: AuthSessionEnvelope = {
  company: {
    id: "company-1",
    name: "Acme Fencing",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  user: {
    id: "user-1",
    companyId: "company-1",
    email: "jane@example.com",
    displayName: "Jane Owner",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  session: {
    id: "session-1",
    companyId: "company-1",
    userId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    expiresAtIso: "2026-04-10T10:00:00.000Z"
  }
};

describe("PricingPage", () => {
  it("renders the pricing shell and loading state", () => {
    const html = renderToStaticMarkup(<PricingPage session={session} />);

    expect(html).toContain("Pricing and labour rates");
    expect(html).toContain("This deployment currently prices Twin Bar layouts only.");
    expect(html).toContain("Acme Fencing");
    expect(html).toContain("Loading pricing configuration...");
    expect(html).toContain("Default configuration");
  });

  it("groups pricing items by system and category in sort order", () => {
    const items: PricingItem[] = [
      {
        itemCode: "POST-B",
        displayName: "Post B",
        category: "POSTS",
        fenceSystem: "TWIN_BAR",
        unit: "post",
        materialCost: 1,
        labourCost: 1,
        isActive: true,
        sortOrder: 20
      },
      {
        itemCode: "PANEL-A",
        displayName: "Panel A",
        category: "PANELS",
        fenceSystem: "TWIN_BAR",
        unit: "panel",
        materialCost: 1,
        labourCost: 1,
        isActive: true,
        sortOrder: 10
      },
      {
        itemCode: "ROLL-A",
        displayName: "Roll A",
        category: "PANELS",
        fenceSystem: "ROLL_FORM",
        unit: "roll",
        materialCost: 1,
        labourCost: 1,
        isActive: true,
        sortOrder: 5
      }
    ];

    const grouped = groupItems(items);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.[0]).toBe("ROLL_FORM");
    expect(grouped[1]?.[0]).toBe("TWIN_BAR");
    expect(grouped[1]?.[1].get("PANELS")?.[0]?.itemCode).toBe("PANEL-A");
    expect(grouped[1]?.[1].get("POSTS")?.[0]?.itemCode).toBe("POST-B");
  });

  it("formats default versus saved pricing labels", () => {
    const defaultConfig: PricingConfigRecord = {
      companyId: "company-1",
      items: [],
      updatedAtIso: "1970-01-01T00:00:00.000Z",
      updatedByUserId: null
    };
    const savedConfig: PricingConfigRecord = {
      companyId: "company-1",
      items: [],
      updatedAtIso: "2026-03-12T14:20:00.000Z",
      updatedByUserId: "user-1"
    };

    expect(formatPricingSavedLabel(defaultConfig)).toBe("Default configuration");
    expect(formatPricingSavedLabel(savedConfig)).not.toBe("Default configuration");
  });
});

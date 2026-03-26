import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, PricingConfigRecord } from "@fence-estimator/contracts";
import { buildDefaultPricingWorkbookConfig, groupWorkbookSectionsBySheet } from "@fence-estimator/contracts";

import { PricingPage, formatPricingSavedLabel, getPricingWorkbookOrDefault } from "./PricingPage.js";

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
  it("renders the workbook shell and loading state", () => {
    const html = renderToStaticMarkup(<PricingPage session={session} />);

    expect(html).toContain("Materials and labour schedule");
    expect(html).toContain("Pricing workbook");
    expect(html).toContain("Acme Fencing");
    expect(html).toContain("Loading pricing workbook...");
    expect(html).toContain("Default configuration");
  });

  it("groups workbook sections by sheet", () => {
    const workbook = buildDefaultPricingWorkbookConfig();

    const grouped = groupWorkbookSectionsBySheet(workbook);

    expect(grouped.MATERIALS.length).toBeGreaterThan(0);
    expect(grouped.LABOUR.length).toBeGreaterThan(0);
  });

  it("formats default versus saved pricing labels", () => {
    const defaultConfig: PricingConfigRecord = {
      companyId: "company-1",
      items: [],
      workbook: buildDefaultPricingWorkbookConfig(),
      updatedAtIso: "1970-01-01T00:00:00.000Z",
      updatedByUserId: null
    };
    const savedConfig: PricingConfigRecord = {
      companyId: "company-1",
      items: [],
      workbook: buildDefaultPricingWorkbookConfig(),
      updatedAtIso: "2026-03-12T14:20:00.000Z",
      updatedByUserId: "user-1"
    };

    expect(formatPricingSavedLabel(defaultConfig)).toBe("Default configuration");
    expect(formatPricingSavedLabel(savedConfig)).not.toBe("Default configuration");
  });

  it("falls back to the default workbook for legacy pricing configs", () => {
    const workbook = getPricingWorkbookOrDefault({
      companyId: "company-1",
      items: [],
      updatedAtIso: "2026-03-12T14:20:00.000Z",
      updatedByUserId: "user-1"
    });

    expect(workbook.sections.length).toBeGreaterThan(0);
    expect(workbook.settings.labourOverheadPercent).toBe(75);
  });
});

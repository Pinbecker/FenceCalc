import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AncillaryEstimateItem, AuthSessionEnvelope, PricedEstimateResult } from "@fence-estimator/contracts";

import { EstimatePage, formatQuoteSummaryLabel } from "./EstimatePage.js";
import { COMMERCIAL_MARKUP_UNITS_CODE, mergeEstimateWorkbook } from "./estimatingWorkbook.js";

const ownerSession: AuthSessionEnvelope = {
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

const memberSession: AuthSessionEnvelope = {
  ...ownerSession,
  user: {
    ...ownerSession.user,
    id: "user-2",
    displayName: "Casey Member",
    email: "casey@example.com",
    role: "MEMBER"
  },
  session: {
    ...ownerSession.session,
    id: "session-2",
    userId: "user-2"
  }
};

const baseWorkbookEstimate: PricedEstimateResult = {
  drawing: {
    drawingId: "drawing-1",
    drawingName: "Yard",
    customerId: "customer-1",
    customerName: "Cleveland Land Services"
  },
  groups: [],
  ancillaryItems: [],
  manualEntries: [],
  workbook: {
    settings: {
      labourOverheadPercent: 75,
      travelLodgePerDay: 90,
      markupRate: 250,
      distributionCharge: 215,
      concretePricePerCube: 150,
      hardDigDefault: false,
      clearSpoilsDefault: false,
      colourOption: "Black or Green"
    },
    sections: [
      {
        key: "materials-panels",
        sheet: "MATERIALS",
        title: "Panels",
        subtotal: 100,
        rows: [
          {
            code: "PANEL",
            label: "Panel",
            unit: "panel",
            quantity: 2,
            rate: 50,
            rateMode: "MONEY",
            total: 100,
            isEditable: false
          }
        ]
      },
      {
        key: "labour-panels",
        sheet: "LABOUR",
        title: "Panel labour",
        subtotal: 40,
        rows: [
          {
            code: "LABOUR",
            label: "Panel labour",
            unit: "panel",
            quantity: 2,
            rate: 20,
            rateMode: "MONEY",
            total: 40,
            isEditable: false
          }
        ]
      }
    ],
    manualEntries: [],
    commercialInputs: {
      travelDays: 0,
      markupUnits: 0
    },
    totals: {
      materialsSubtotal: 100,
      labourSubtotal: 40,
      labourOverheadPercent: 75,
      labourOverheadAmount: 30,
      distributionCharge: 215,
      travelDays: 0,
      travelRatePerDay: 90,
      travelTotal: 0,
      markupUnits: 0,
      markupRate: 250,
      markupTotal: 0,
      grandTotal: 385
    }
  },
  totals: {
    materialCost: 315,
    labourCost: 70,
    totalCost: 385
  },
  warnings: [],
  pricingSnapshot: {
    updatedAtIso: "2026-03-12T14:20:00.000Z",
    updatedByUserId: "user-1",
    source: "COMPANY_CONFIG"
  }
};

describe("EstimatePage", () => {
  it("renders the empty state and pricing navigation for owners", () => {
    const html = renderToStaticMarkup(
      <EstimatePage session={ownerSession} drawingId={null} onNavigate={vi.fn()} />
    );

    expect(html).toContain("No drawing selected");
    expect(html).toContain(">Pricing workbook<");
    expect(html).toContain("Customer directory");
  });

  it("hides pricing navigation for members", () => {
    const html = renderToStaticMarkup(
      <EstimatePage session={memberSession} drawingId={null} onNavigate={vi.fn()} />
    );

    expect(html).toContain("No drawing selected");
    expect(html).not.toContain(">Pricing workbook<");
  });

  it("merges ancillary items and commercial entries into workbook totals", () => {
    const ancillaryItems: AncillaryEstimateItem[] = [
      {
        id: "ancillary-1",
        description: "Lift hire",
        quantity: 2,
        materialCost: 15,
        labourCost: 3
      }
    ];

    const merged = mergeEstimateWorkbook(baseWorkbookEstimate, ancillaryItems, [
      { code: COMMERCIAL_MARKUP_UNITS_CODE, quantity: 2 }
    ]);

    expect(merged.totals.materialCost).toBe(345);
    expect(merged.totals.labourCost).toBe(576);
    expect(merged.totals.totalCost).toBe(921);
  });

  it("formats immutable quote labels with version and total", () => {
    const label = formatQuoteSummaryLabel({
      id: "quote-1",
      companyId: "company-1",
      drawingId: "drawing-1",
      drawingVersionNumber: 3,
      pricedEstimate: baseWorkbookEstimate,
      drawingSnapshot: {
        drawingId: "drawing-1",
        drawingName: "Yard",
        customerId: "customer-1",
        customerName: "Cleveland Land Services",
        layout: { segments: [], gates: [], basketballPosts: [], floodlightColumns: [] },
        estimate: {
          posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
          corners: { total: 0, internal: 0, external: 0, unclassified: 0, byHeightMm: {} },
          materials: {
            twinBarPanels: 0,
            twinBarPanelsSuperRebound: 0,
            twinBarPanelsByStockHeightMm: {},
            twinBarPanelsByFenceHeight: {},
            roll2100: 0,
            roll900: 0,
            totalRolls: 0,
            rollsByFenceHeight: {}
          },
          optimization: {
            strategy: "CHAINED_CUT_PLANNER",
            twinBar: {
              reuseAllowanceMm: 200,
              stockPanelWidthMm: 2525,
              fixedFullPanels: 0,
              baselinePanels: 0,
              optimizedPanels: 0,
              panelsSaved: 0,
              totalCutDemands: 0,
              stockPanelsOpened: 0,
              reusedCuts: 0,
              totalConsumedMm: 0,
              totalLeftoverMm: 0,
              reusableLeftoverMm: 0,
              utilizationRate: 0,
              buckets: []
            }
          },
          segments: []
        },
        schemaVersion: 1,
        rulesVersion: "2026-03-11",
        versionNumber: 3
      },
      createdByUserId: "user-1",
      createdAtIso: "2026-03-12T12:00:00.000Z"
    });

    expect(label).toContain("v3");
    expect(label).toContain("£");
    expect(label).toContain("|");
  });
});

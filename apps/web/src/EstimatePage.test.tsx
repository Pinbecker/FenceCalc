import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AncillaryEstimateItem, AuthSessionEnvelope, PricedEstimateResult } from "@fence-estimator/contracts";

import { EstimatePage, formatQuoteSummaryLabel, mergeEstimateWithAncillaryItems } from "./EstimatePage.js";

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

describe("EstimatePage", () => {
  it("renders the empty state and pricing navigation for owners", () => {
    const html = renderToStaticMarkup(
      <EstimatePage session={ownerSession} drawingId={null} onNavigate={vi.fn()} />
    );

    expect(html).toContain("No drawing selected");
    expect(html).toContain(">Pricing<");
    expect(html).toContain("Drawing Library");
  });

  it("hides pricing navigation for members", () => {
    const html = renderToStaticMarkup(
      <EstimatePage session={memberSession} drawingId={null} onNavigate={vi.fn()} />
    );

    expect(html).toContain("No drawing selected");
    expect(html).not.toContain(">Pricing<");
  });

  it("merges ancillary items into estimate totals", () => {
    const baseEstimate: PricedEstimateResult = {
      drawing: {
        drawingId: "drawing-1",
        drawingName: "Yard",
        customerName: "Cleveland Land Services"
      },
      groups: [
        {
          key: "panels",
          title: "Panels",
          rows: [
            {
              key: "panel-1",
              itemCode: "PANEL",
              itemName: "Panel",
              category: "PANELS",
              quantity: 2,
              unit: "panel",
              unitMaterialCost: 20,
              unitLabourCost: 5,
              totalMaterialCost: 40,
              totalLabourCost: 10,
              totalCost: 50
            }
          ],
          subtotalMaterialCost: 40,
          subtotalLabourCost: 10,
          subtotalCost: 50
        }
      ],
      ancillaryItems: [],
      totals: {
        materialCost: 40,
        labourCost: 10,
        totalCost: 50
      },
      warnings: [],
      pricingSnapshot: {
        updatedAtIso: "2026-03-12T14:20:00.000Z",
        updatedByUserId: "user-1",
        source: "COMPANY_CONFIG"
      }
    };
    const ancillaryItems: AncillaryEstimateItem[] = [
      {
        id: "ancillary-1",
        description: "Lift hire",
        quantity: 2,
        materialCost: 15,
        labourCost: 3
      }
    ];

    const merged = mergeEstimateWithAncillaryItems(baseEstimate, ancillaryItems);

    expect(merged.groups).toHaveLength(2);
    expect(merged.groups[1]?.key).toBe("ancillary-items");
    expect(merged.totals.materialCost).toBe(70);
    expect(merged.totals.labourCost).toBe(16);
    expect(merged.totals.totalCost).toBe(86);
  });

  it("formats immutable quote labels with version and total", () => {
    const label = formatQuoteSummaryLabel({
      id: "quote-1",
      companyId: "company-1",
      drawingId: "drawing-1",
      drawingVersionNumber: 3,
      pricedEstimate: {
        drawing: {
          drawingId: "drawing-1",
          drawingName: "Yard",
          customerName: "Cleveland Land Services"
        },
        groups: [],
        ancillaryItems: [],
        totals: {
          materialCost: 100,
          labourCost: 25,
          totalCost: 125
        },
        warnings: [],
        pricingSnapshot: {
          updatedAtIso: "1970-01-01T00:00:00.000Z",
          updatedByUserId: null,
          source: "DEFAULT"
        }
      },
      drawingSnapshot: {
        drawingId: "drawing-1",
        drawingName: "Yard",
        customerName: "Cleveland Land Services",
        layout: { segments: [], gates: [], basketballPosts: [], floodlightColumns: [] },
        estimate: {
          posts: { terminal: 0, intermediate: 0, total: 0, cornerPosts: 0, byHeightAndType: {}, byHeightMm: {} },
          corners: { total: 0, internal: 0, external: 0, unclassified: 0 },
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

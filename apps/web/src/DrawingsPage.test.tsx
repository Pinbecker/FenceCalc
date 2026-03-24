import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { DrawingsPage } from "./DrawingsPage.js";

const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front perimeter",
    customerId: "customer-1",
    customerName: "Cleveland Land Services",
    previewLayout: { segments: [], gates: [] },
    segmentCount: 8,
    gateCount: 1,
    schemaVersion: TEST_SCHEMA_VERSION,
    rulesVersion: TEST_RULES_VERSION,
    versionNumber: 3,
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    createdByUserId: "user-1",
    createdByDisplayName: "Jane Doe",
    updatedByUserId: "user-1",
    updatedByDisplayName: "Jane Doe",
    contributorUserIds: ["user-1"],
    contributorDisplayNames: ["Jane Doe"],
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z"
  }
];

const customers: CustomerSummary[] = [
  {
    id: "customer-1",
    companyId: "company-1",
    name: "Cleveland Land Services",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    additionalContacts: [],
    siteAddress: "",
    notes: "",
    isArchived: false,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z",
    activeDrawingCount: 1,
    archivedDrawingCount: 0,
    lastActivityAtIso: "2026-03-10T12:00:00.000Z"
  }
];

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
    displayName: "Jane Doe",
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

const versions: DrawingVersionRecord[] = [
  {
    id: "version-1",
    drawingId: "drawing-1",
    companyId: "company-1",
    schemaVersion: TEST_SCHEMA_VERSION,
    rulesVersion: TEST_RULES_VERSION,
    versionNumber: 2,
    source: "UPDATE",
    name: "Front perimeter",
    customerId: "customer-1",
    customerName: "Cleveland Land Services",
    layout: { segments: [], gates: [] },
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
    createdByUserId: "user-1",
    createdAtIso: "2026-03-10T11:00:00.000Z"
  }
];

describe("DrawingsPage", () => {
  it("renders the denser grouped drawing worklist", () => {
    const html = renderToStaticMarkup(
      <DrawingsPage
        customers={customers}
        session={session}
        drawings={drawings}
        isLoading={false}
        onRefresh={() => Promise.resolve()}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleArchive={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
      />,
    );

    expect(html).toContain("Saved drawings");
    expect(html).toContain("Drawing library summary");
    expect(html).toContain("Company includes every drawing in this workspace.");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Mine");
    expect(html).toContain("Version history");
    expect(html).toContain("Archive");
    expect(html).toContain("Open editor");
    expect(html).toContain("Estimate");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { DrawingsPage } from "./DrawingsPage.js";

const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front perimeter",
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
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z"
  }
];

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
  it("renders drawing management controls", () => {
    const html = renderToStaticMarkup(
      <DrawingsPage
        drawings={drawings}
        isLoading={false}
        onRefresh={() => Promise.resolve()}
        onOpenDrawing={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleArchive={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
      />,
    );

    expect(html).toContain("Saved drawings");
    expect(html).toContain("Version History");
    expect(html).toContain("Archive");
    expect(html).toContain("Open In Editor");
  });
});

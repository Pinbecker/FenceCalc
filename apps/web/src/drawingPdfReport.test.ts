import { afterEach, describe, expect, it, vi } from "vitest";

import type { EstimateResult, LayoutModel } from "@fence-estimator/contracts";

import {
  buildDrawingPdfFileName,
  buildDrawingPdfReportHtml,
  buildOptimizationIsometricSvg,
  exportDrawingPdfReport
} from "./drawingPdfReport.js";

const layout: LayoutModel = {
  segments: [
    {
      id: "seg-1",
      start: { x: 0, y: 0 },
      end: { x: 2525, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
    },
    {
      id: "seg-2",
      start: { x: 2525, y: 0 },
      end: { x: 2525, y: 1600 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "SUPER_REBOUND" }
    }
  ],
  gates: [
    {
      id: "gate-1",
      segmentId: "seg-1",
      startOffsetMm: 800,
      endOffsetMm: 1800,
      gateType: "SINGLE_LEAF"
    }
  ],
  basketballPosts: [],
  floodlightColumns: []
};

const estimate: EstimateResult = {
  posts: {
    terminal: 2,
    intermediate: 1,
    total: 3,
    cornerPosts: 1,
    byHeightAndType: {},
    byHeightMm: {}
  },
  corners: {
    total: 1,
    internal: 0,
    external: 1,
    unclassified: 0
  },
  materials: {
    twinBarPanels: 3,
    twinBarPanelsSuperRebound: 1,
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
      fixedFullPanels: 2,
      baselinePanels: 5,
      optimizedPanels: 4,
      panelsSaved: 1,
      totalCutDemands: 2,
      stockPanelsOpened: 1,
      reusedCuts: 1,
      totalConsumedMm: 2200,
      totalLeftoverMm: 325,
      reusableLeftoverMm: 325,
      utilizationRate: 0.87,
      buckets: []
    }
  },
  segments: [
    {
      segmentId: "seg-1",
      lengthMm: 2525,
      bays: 1,
      intermediatePosts: 0,
      panels: 1,
      roll2100: 0,
      roll900: 0
    },
    {
      segmentId: "seg-2",
      lengthMm: 1600,
      bays: 1,
      intermediatePosts: 1,
      panels: 1,
      roll2100: 0,
      roll900: 0
    }
  ]
};

const reportInput = {
  companyName: "Acme Fencing",
  preparedBy: "Jane Owner",
  drawingTitle: "Perimeter A",
  drawingId: "drawing-1",
  customerName: "Cleveland Land Services",
  generatedAtIso: "2026-03-15T13:30:00.000Z",
  isDirty: false,
  layout,
  canvasImageDataUrl: "data:image/png;base64,abc123",
  estimate,
  estimateSegments: layout.segments,
  segmentOrdinalById: new Map([
    ["seg-1", 1],
    ["seg-2", 2]
  ]),
  resolvedGatePlacements: [],
  resolvedBasketballPostPlacements: [],
  resolvedFloodlightColumnPlacements: []
};

describe("drawingPdfReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds an isometric svg with the 3d drawing geometry", () => {
    const svg = buildOptimizationIsometricSvg(
      {
        estimateSegments: reportInput.estimateSegments,
        segmentOrdinalById: reportInput.segmentOrdinalById,
        resolvedGatePlacements: reportInput.resolvedGatePlacements,
        resolvedBasketballPostPlacements: reportInput.resolvedBasketballPostPlacements,
        resolvedFloodlightColumnPlacements: reportInput.resolvedFloodlightColumnPlacements
      },
      {
        yaw: -0.82,
        pitch: 0.62,
        zoom: 1.22,
        panX: 0,
        panY: 0
      },
      "Perimeter A isometric"
    );

    expect(svg).toContain("<svg");
    expect(svg).toContain("Perimeter A isometric");
    expect(svg).toContain("rgba(96, 150, 103, 0.82)");
    expect(svg).toContain("rgba(113, 129, 145, 0.74)");
  });

  it("builds a professional printable HTML report", () => {
    const html = buildDrawingPdfReportHtml(reportInput);

    expect(html).toContain("Drawing PDF Report");
    expect(html).toContain("Live Canvas Plan");
    expect(html).toContain("Primary Isometric View");
    expect(html).toContain("Reverse Isometric View");
    expect(html).toContain("Acme Fencing");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("data:image/png;base64,abc123");
    expect(html).toContain("Panels saved");
    expect(html).toContain("Segment Schedule");
    expect(html).toContain("Print / Save PDF");
  });

  it("creates a stable pdf file name", () => {
    expect(buildDrawingPdfFileName(" Perimeter A / Yard ")).toBe("perimeter-a-yard-report.pdf");
  });

  it("opens the report from a blob url", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report-url");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const open = vi.fn().mockReturnValue({});
    vi.stubGlobal("window", { open });

    const result = exportDrawingPdfReport(reportInput);

    expect(result).toBe(true);
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith("blob:report-url", "_blank");
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("cleans up the blob url when the popup is blocked", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report-url");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const open = vi.fn().mockReturnValue(null);
    vi.stubGlobal("window", { open });

    const result = exportDrawingPdfReport(reportInput);

    expect(result).toBe(false);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:report-url");
  });
});

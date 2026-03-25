import { afterEach, describe, expect, it, vi } from "vitest";

import type { DrawingRecord, LayoutModel } from "@fence-estimator/contracts";

const baseLayout: LayoutModel = {
  segments: [
    {
      id: "segment-1",
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m" }
    }
  ],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: []
};

const sampleDrawing = {
  id: "drawing-1",
  companyId: "company-1",
  name: "Rear boundary",
  customerId: "customer-1",
  customerName: "Cleveland Land Services",
  layout: baseLayout,
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
      strategy: "CHAINED_CUT_PLANNER" as const,
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
  savedViewport: { x: 120, y: 80, scale: 0.5 },
  schemaVersion: 1,
  rulesVersion: "2026-03-11",
  versionNumber: 3,
  isArchived: false,
  archivedAtIso: null,
  archivedByUserId: null,
  status: "DRAFT",
  statusChangedAtIso: null,
  statusChangedByUserId: null,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAtIso: "2026-03-10T10:00:00.000Z",
  updatedAtIso: "2026-03-10T11:00:00.000Z"
} satisfies DrawingRecord;

interface MockWorkspacePersistenceOptions {
  onLoadDrawing: (drawing: DrawingRecord) => void;
}

describe("useEditorWorkspaceBridge", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
  });

  it("loads the requested drawing and rehydrates layout plus viewport when a workspace drawing is opened", async () => {
    const onResetLayout = vi.fn();
    const onResetEditorState = vi.fn();
    const onRestoreViewport = vi.fn();
    const loadDrawing = vi.fn();
    let capturedPersistenceOptions: {
      onLoadDrawing: (drawing: DrawingRecord) => void;
    } | null = null;

    vi.doMock("react", () => ({
      useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
      useEffect: (effect: () => void) => effect(),
      useRef: <T,>(value: T) => ({ current: value })
    }));
    vi.doMock("../initialDrawingLoad", () => ({
      shouldLoadInitialDrawing: vi.fn(() => true)
    }));
    vi.doMock("../useWorkspacePersistence", () => ({
      useWorkspacePersistence: vi.fn((options: MockWorkspacePersistenceOptions) => {
        capturedPersistenceOptions = options;
        return {
          currentDrawingId: null,
          session: { user: { id: "user-1" } },
          isRestoringSession: false,
          loadDrawing
        };
      })
    }));

    const { useEditorWorkspaceBridge } = await import("./useEditorWorkspaceBridge.js");

    const workspace = useEditorWorkspaceBridge({
      getSavedViewport: () => null,
      layout: baseLayout,
      initialDrawingId: "drawing-1",
      onResetLayout,
      onResetEditorState,
      onRestoreViewport
    });

    expect(loadDrawing).toHaveBeenCalledWith("drawing-1");
    expect(workspace.loadDrawing).toBe(loadDrawing);
    expect(capturedPersistenceOptions).not.toBeNull();

    capturedPersistenceOptions!.onLoadDrawing(sampleDrawing);

    expect(onResetLayout).toHaveBeenCalledWith(baseLayout);
    expect(onResetEditorState).toHaveBeenCalled();
    expect(onRestoreViewport).toHaveBeenCalledWith(sampleDrawing.savedViewport);
  });

  it("does not reload the current drawing when the guard says the initial request has already been handled", async () => {
    const loadDrawing = vi.fn();
    const shouldLoadInitialDrawing = vi.fn(() => false);

    vi.doMock("react", () => ({
      useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
      useEffect: (effect: () => void) => effect(),
      useRef: <T,>(value: T) => ({ current: value })
    }));
    vi.doMock("../initialDrawingLoad", () => ({
      shouldLoadInitialDrawing
    }));
    vi.doMock("../useWorkspacePersistence", () => ({
      useWorkspacePersistence: vi.fn(() => ({
        currentDrawingId: "drawing-1",
        session: { user: { id: "user-1" } },
        isRestoringSession: false,
        loadDrawing
      }))
    }));

    const { useEditorWorkspaceBridge } = await import("./useEditorWorkspaceBridge.js");

    useEditorWorkspaceBridge({
      getSavedViewport: () => null,
      layout: baseLayout,
      initialDrawingId: "drawing-1",
      onResetLayout: vi.fn(),
      onResetEditorState: vi.fn(),
      onRestoreViewport: vi.fn()
    });

    expect(shouldLoadInitialDrawing).toHaveBeenCalledWith({
      requestedDrawingId: "drawing-1",
      currentDrawingId: "drawing-1",
      lastRequestedDrawingId: null,
      hasSession: true,
      isRestoringSession: false
    });
    expect(loadDrawing).not.toHaveBeenCalled();
  });
});

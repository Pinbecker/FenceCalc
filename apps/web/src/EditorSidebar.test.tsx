import type { WorkspacePersistenceState } from "./useWorkspacePersistence.js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AuthSessionEnvelope, DrawingSummary, FenceHeightKey, FenceSpec } from "@fence-estimator/contracts";

import { EditorSidebar } from "./EditorSidebar.js";
import { formatHeightLabelFromMm, formatLengthMm, formatMetersInputFromMm } from "./formatters.js";
import { defaultFenceSpec, getSegmentColor } from "./editor/constants.js";

function buildSession(): AuthSessionEnvelope {
  return {
    company: {
      id: "company-1",
      name: "Fence Co",
      createdAtIso: "2026-03-11T09:00:00.000Z"
    },
    user: {
      id: "user-1",
      companyId: "company-1",
      email: "user@example.com",
      displayName: "Estimator",
      role: "ADMIN",
      createdAtIso: "2026-03-11T09:00:00.000Z"
    },
    session: {
      id: "session-1",
      companyId: "company-1",
      userId: "user-1",
      createdAtIso: "2026-03-11T09:00:00.000Z",
      expiresAtIso: "2026-03-12T09:00:00.000Z"
    }
  };
}

const resolvedPromise = Promise.resolve();

function buildWorkspace(session: AuthSessionEnvelope | null): WorkspacePersistenceState {
  return {
    session,
    drawings: [] as DrawingSummary[],
    currentDrawingId: null,
    currentDrawingName: "North boundary",
    isDirty: true,
    isRestoringSession: false,
    isAuthenticating: false,
    isLoadingDrawings: false,
    isSavingDrawing: false,
    errorMessage: session ? "Needs review" : null,
    noticeMessage: session ? "All changes saved locally" : null,
    setCurrentDrawingName: vi.fn(),
    register: vi.fn(() => resolvedPromise),
    login: vi.fn(() => resolvedPromise),
    logout: vi.fn(),
    refreshDrawings: vi.fn(() => resolvedPromise),
    loadDrawing: vi.fn(() => resolvedPromise),
    saveDrawing: vi.fn(() => resolvedPromise),
    saveDrawingAsNew: vi.fn(() => resolvedPromise),
    startNewDraft: vi.fn()
  };
}

function buildSidebarProps(session: AuthSessionEnvelope | null) {
  const activeHeightOptions: FenceHeightKey[] = ["2m", "2.4m"];
  const twinBarHeightOptions: FenceHeightKey[] = ["2m", "2.4m"];
  const rollFormHeightOptions: FenceHeightKey[] = ["2m", "3m"];

  return {
    workspace: buildWorkspace(session),
    onOpenDrawings: vi.fn(),
    onStartNewDraft: vi.fn(),
    onNavigate: vi.fn(),
    interactionMode: "GATE" as const,
    recessWidthInputM: "1.50",
    recessDepthInputM: "1.00",
    recessSide: "LEFT" as const,
    gateType: "DOUBLE_LEAF" as const,
    customGateWidthInputM: "3.00",
    recessWidthOptionsMm: [500, 1000, 1500],
    recessDepthOptionsMm: [500, 1000],
    gateWidthOptionsMm: [1200, 1800, 3000],
    recessPreview: {
      startOffsetMm: 1200,
      endOffsetMm: 2700,
      segmentLengthMm: 5000
    },
    gatePreview: {
      widthMm: 3000,
      startOffsetMm: 1000,
      endOffsetMm: 4000,
      segmentLengthMm: 5000
    },
    activeSpec: defaultFenceSpec(),
    activeHeightOptions,
    twinBarHeightOptions,
    rollFormHeightOptions,
    postRowsByType: {
      end: [{ heightMm: 2000, count: 2 }],
      intermediate: [{ heightMm: 2000, count: 4 }],
      corner: [{ heightMm: 2000, count: 1 }],
      junction: [],
      inlineJoin: []
    },
    gateCounts: {
      total: 2,
      single: 0,
      double: 1,
      custom: 1
    },
    gateCountsByHeight: [{ height: "2m", count: 2 }],
    twinBarFenceRows: [{ height: "2m", standard: 3, superRebound: 1 }],
    postTypeCounts: {
      END: 2,
      INTERMEDIATE: 4,
      CORNER: 1,
      JUNCTION: 0,
      INLINE_JOIN: 0,
      GATE: 2
    },
    isTutorialOpen: false,
    controlsStyle: {},
    itemCountsStyle: {},
    postKeyStyle: {},
    tutorialStyle: {},
    canUndo: true,
    canRedo: false,
    canDeleteSelection: true,
    formatLengthMm,
    formatMetersInputFromMm,
    formatHeightLabelFromMm,
    getSegmentColor,
    onSetInteractionMode: vi.fn(),
    onRecessWidthInputChange: vi.fn(),
    onRecessDepthInputChange: vi.fn(),
    onNormalizeRecessInputs: vi.fn(),
    onSetRecessSide: vi.fn(),
    onSetGateType: vi.fn(),
    onCustomGateWidthInputChange: vi.fn(),
    onNormalizeGateInputs: vi.fn(),
    onSetActiveSpec: vi.fn((updater: (previous: FenceSpec) => FenceSpec) => updater(defaultFenceSpec())),
    onOpenTutorial: vi.fn(),
    onCloseTutorial: vi.fn(),
    onStartItemCountsDrag: vi.fn(),
    onStartPostKeyDrag: vi.fn(),
    onStartTutorialDrag: vi.fn(),
    onStartControlsDrag: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDeleteSelection: vi.fn(),
    onClearLayout: vi.fn()
  };
}

describe("EditorSidebar", () => {
  it("renders the authenticated editor workspace controls and overlays", () => {
    const html = renderToStaticMarkup(<EditorSidebar {...buildSidebarProps(buildSession())} />);

    expect(html).toContain("Drawing");
    expect(html).toContain("Fence Co");
    expect(html).toContain("Estimator");
    expect(html).toContain("Drawing Name");
    expect(html).toContain("North boundary");
    expect(html).toContain("Save New");
    expect(html).toContain("New Draft");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Unsaved changes");
    expect(html).toContain("Gate");
    expect(html).toContain("Item Counts");
    expect(html).toContain("Post Key");
    expect(html).toContain("Undo");
  });

  it("renders the unauthenticated document state and login call to action", () => {
    const html = renderToStaticMarkup(<EditorSidebar {...buildSidebarProps(null)} />);

    expect(html).toContain("Sign in to save, reopen, and manage drawings.");
    expect(html).toContain("Go To Login");
    expect(html).toContain("Library");
  });
});

import { useCallback, useMemo, useState, type RefObject } from "react";
import type Konva from "konva";
import type { DrawingStatus, EstimateResult, LayoutModel, LayoutSegment } from "@fence-estimator/contracts";

import { setDrawingStatus } from "../apiClient";
import { extractApiErrorMessage } from "../apiErrors";
import { exportDrawingPdfReport } from "../drawingPdfReport";
import type { ResolvedBasketballPostPlacement, ResolvedFloodlightColumnPlacement, ResolvedGatePlacement } from "./types";

interface EditorPageActionsWorkspace {
  currentDrawingId: string | null;
  currentDrawingName: string;
  currentCustomerId: string | null;
  currentCustomerName: string | null;
  isDirty: boolean;
  refreshDrawings: () => Promise<unknown>;
  startNewDraft: () => void;
  drawings: Array<{ id: string; status: DrawingStatus; versionNumber: number }>;
}

interface EditorPageActionsSession {
  company: { name: string };
  user: { displayName: string; role: "OWNER" | "ADMIN" | "MEMBER" };
}

interface UseEditorPageActionsOptions {
  stageRef: RefObject<Konva.Stage | null>;
  workspace: EditorPageActionsWorkspace;
  session: EditorPageActionsSession | null;
  currentLayout: LayoutModel;
  interactionMode:
    | "DRAW"
    | "SELECT"
    | "RECTANGLE"
    | "RECESS"
    | "GOAL_UNIT"
    | "GATE"
    | "BASKETBALL_POST"
    | "FLOODLIGHT_COLUMN"
    | "KICKBOARD"
    | "PITCH_DIVIDER"
    | "SIDE_NETTING";
  estimate: EstimateResult;
  estimateSegments: LayoutSegment[];
  segmentOrdinalById: Map<string, number>;
  resolvedGatePlacements: ResolvedGatePlacement[];
  resolvedBasketballPostPlacements: ResolvedBasketballPostPlacement[];
  resolvedFloodlightColumnPlacements: ResolvedFloodlightColumnPlacement[];
  confirmDiscardChanges: (message: string) => boolean;
  resetWorkspaceCanvas: () => void;
  resetView: () => void;
  onNavigate: (
    route: "dashboard" | "drawings" | "customers" | "customer" | "editor" | "estimate" | "pricing" | "admin" | "login",
    query?: Record<string, string>
  ) => void;
}

function getInteractionLabel(mode: UseEditorPageActionsOptions["interactionMode"]): string {
  switch (mode) {
    case "DRAW":
      return "Draw";
    case "SELECT":
      return "Select";
    case "RECTANGLE":
      return "Rectangle";
    case "RECESS":
      return "Recess";
    case "GOAL_UNIT":
      return "Goal Unit";
    case "GATE":
      return "Gate";
    case "BASKETBALL_POST":
      return "Basketball Post";
    case "FLOODLIGHT_COLUMN":
      return "Floodlight Column";
    case "KICKBOARD":
      return "Kickboard";
    case "PITCH_DIVIDER":
      return "Pitch Divider";
    case "SIDE_NETTING":
      return "Side Netting";
  }
}

export function useEditorPageActions({
  stageRef,
  workspace,
  session,
  currentLayout,
  interactionMode,
  estimate,
  estimateSegments,
  segmentOrdinalById,
  resolvedGatePlacements,
  resolvedBasketballPostPlacements,
  resolvedFloodlightColumnPlacements,
  confirmDiscardChanges,
  resetWorkspaceCanvas,
  resetView,
  onNavigate
}: UseEditorPageActionsOptions) {
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const currentDrawingSummary = useMemo(
    () => (workspace.currentDrawingId ? workspace.drawings.find((drawing) => drawing.id === workspace.currentDrawingId) ?? null : null),
    [workspace.currentDrawingId, workspace.drawings]
  );
  const drawingTitle = workspace.currentDrawingName.trim() || (workspace.currentDrawingId ? "Untitled drawing" : "New drawing draft");
  const canManageAdmin = session?.user.role === "OWNER" || session?.user.role === "ADMIN";
  const canManagePricing = canManageAdmin;
  const interactionLabel = getInteractionLabel(interactionMode);

  const handleChangeDrawingStatus = useCallback(
    async (nextStatus: DrawingStatus) => {
      if (!workspace.currentDrawingId || !currentDrawingSummary) {
        return;
      }
      setIsChangingStatus(true);
      try {
        await setDrawingStatus(workspace.currentDrawingId, nextStatus, currentDrawingSummary.versionNumber);
        await workspace.refreshDrawings();
      } catch (error) {
        window.alert(extractApiErrorMessage(error));
      } finally {
        setIsChangingStatus(false);
      }
    },
    [currentDrawingSummary, workspace],
  );

  const handleStartNewDraft = useCallback(() => {
    if (!confirmDiscardChanges("Discard unsaved changes and start a new draft?")) {
      return;
    }

    resetWorkspaceCanvas();
    resetView();
    workspace.startNewDraft();
  }, [confirmDiscardChanges, resetView, resetWorkspaceCanvas, workspace]);

  const handleOpenCustomers = useCallback(() => {
    if (!confirmDiscardChanges("Discard unsaved changes and leave the editor?")) {
      return;
    }

    if (workspace.currentCustomerId) {
      onNavigate("customer", { customerId: workspace.currentCustomerId });
      return;
    }

    onNavigate("customers");
  }, [confirmDiscardChanges, onNavigate, workspace.currentCustomerId]);

  const handleExportPdf = useCallback(() => {
    let canvasImageDataUrl: string | null = null;
    try {
      canvasImageDataUrl = stageRef.current?.toDataURL({
        pixelRatio: 2,
        mimeType: "image/png"
      }) ?? null;
    } catch {
      canvasImageDataUrl = null;
    }

    const opened = exportDrawingPdfReport({
      companyName: session?.company.name ?? null,
      preparedBy: session?.user.displayName ?? null,
      drawingTitle,
      drawingId: workspace.currentDrawingId,
      customerName: workspace.currentCustomerName ?? "",
      generatedAtIso: new Date().toISOString(),
      isDirty: workspace.isDirty,
      layout: currentLayout,
      canvasImageDataUrl,
      estimate,
      estimateSegments,
      segmentOrdinalById,
      resolvedGatePlacements,
      resolvedBasketballPostPlacements,
      resolvedFloodlightColumnPlacements
    });

    if (!opened) {
      window.alert("The PDF export could not open a new tab. Allow pop-ups for this site and try again.");
    }
  }, [
    currentLayout,
    drawingTitle,
    estimate,
    estimateSegments,
    resolvedBasketballPostPlacements,
    resolvedFloodlightColumnPlacements,
    resolvedGatePlacements,
    segmentOrdinalById,
    session,
    stageRef,
    workspace.currentCustomerName,
    workspace.currentDrawingId,
    workspace.isDirty
  ]);

  return {
    canManageAdmin,
    canManagePricing,
    currentDrawingSummary,
    drawingTitle,
    handleChangeDrawingStatus,
    handleExportPdf,
    handleOpenCustomers,
    handleStartNewDraft,
    interactionLabel,
    isChangingStatus
  };
}

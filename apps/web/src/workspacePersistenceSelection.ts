import type { DrawingRecord, DrawingStatus } from "@fence-estimator/contracts";

export interface WorkspaceSelectionState {
  currentDrawingId: string | null;
  currentDrawingVersion: number | null;
  currentDrawingName: string;
  currentDrawingStatus: DrawingStatus | null;
  currentWorkspaceId: string | null;
  currentCustomerId: string | null;
  currentCustomerName: string;
}

export const EMPTY_WORKSPACE_SELECTION_STATE: WorkspaceSelectionState = {
  currentDrawingId: null,
  currentDrawingVersion: null,
  currentDrawingName: "",
  currentDrawingStatus: null,
  currentWorkspaceId: null,
  currentCustomerId: null,
  currentCustomerName: "",
};

export function buildWorkspaceSelectionState(drawing: DrawingRecord): WorkspaceSelectionState {
  return {
    currentDrawingId: drawing.id,
    currentDrawingVersion: drawing.versionNumber,
    currentDrawingName: drawing.name,
    currentDrawingStatus: drawing.status,
    currentWorkspaceId: drawing.workspaceId ?? null,
    currentCustomerId: drawing.customerId,
    currentCustomerName: drawing.customerName,
  };
}

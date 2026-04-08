import type {
  DrawingSummary,
  DrawingTaskRecord,
  DrawingWorkspaceSummary,
} from "@fence-estimator/contracts";

export interface BuildDrawingWorkspaceQueryOptions {
  workspaceId: string | null;
  drawingId?: string | null;
  estimateDrawingId?: string | null;
  focusTaskId?: string | null;
}

export interface ResolveDrawingWorkspaceLoadTargetOptions {
  targetId: string;
  requestedDrawingId: string | null;
  query?: Record<string, string> | undefined;
  resolvedDrawingWorkspaceId?: string | null | undefined;
}

export interface CustomerWorkspaceCardModel {
  workspace: DrawingWorkspaceSummary;
  drawings: DrawingSummary[];
  rootDrawing: DrawingSummary | null;
  latestRevision: DrawingSummary | null;
  revisionCount: number;
  lastActivityAtIso: string;
}

export function buildDrawingWorkspaceQuery({
  workspaceId,
  drawingId,
  estimateDrawingId,
  focusTaskId,
}: BuildDrawingWorkspaceQueryOptions): Record<string, string> {
  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(drawingId ? { drawingId } : {}),
    ...(estimateDrawingId ? { estimateDrawingId } : {}),
    ...(focusTaskId ? { focusTaskId } : {}),
  };
}

export function resolveDrawingWorkspaceLoadTarget({
  targetId,
  requestedDrawingId,
  query,
  resolvedDrawingWorkspaceId,
}: ResolveDrawingWorkspaceLoadTargetOptions): {
  workspaceLookupId: string | null;
} {
  return {
    workspaceLookupId:
      query?.workspaceId ?? resolvedDrawingWorkspaceId ?? (requestedDrawingId ? null : targetId),
  };
}

export function getDrawingWorkspaceId(
  drawing:
    | Pick<DrawingSummary, "workspaceId">
    | Pick<DrawingTaskRecord, "workspaceId">
    | null
    | undefined,
): string | null {
  if (!drawing) {
    return null;
  }
  return typeof drawing.workspaceId === "string" ? drawing.workspaceId : null;
}

export function getRootDrawingId(
  drawing: Pick<DrawingSummary, "id" | "parentDrawingId"> | null | undefined,
): string | null {
  if (!drawing) {
    return null;
  }
  return drawing.parentDrawingId ?? drawing.id;
}

export function getRevisionLabel(drawing: Pick<DrawingSummary, "revisionNumber">): string {
  return drawing.revisionNumber === 0 ? "Original" : `REV ${drawing.revisionNumber}`;
}

export function countDrawingRevisions(
  drawings: Array<Pick<DrawingSummary, "revisionNumber">>,
): number {
  return drawings.filter((drawing) => drawing.revisionNumber > 0).length;
}

export function getRevisionCountFromDrawingCount(drawingCount: number): number {
  return Math.max(drawingCount - 1, 0);
}

export function formatRevisionCount(revisionCount: number): string {
  return `${revisionCount} revision${revisionCount === 1 ? "" : "s"}`;
}

export function formatRevisionCountFromDrawingCount(drawingCount: number): string {
  return formatRevisionCount(getRevisionCountFromDrawingCount(drawingCount));
}

function compareWorkspaceDrawings(left: DrawingSummary, right: DrawingSummary): number {
  if (left.revisionNumber !== right.revisionNumber) {
    return left.revisionNumber - right.revisionNumber;
  }
  return left.createdAtIso.localeCompare(right.createdAtIso);
}

export function getWorkspaceDrawings(
  workspaceId: string,
  drawings: DrawingSummary[],
): DrawingSummary[] {
  return drawings
    .filter((drawing) => getDrawingWorkspaceId(drawing) === workspaceId)
    .slice()
    .sort(compareWorkspaceDrawings);
}

export function getWorkspaceRootDrawing(
  workspace: DrawingWorkspaceSummary,
  drawings: DrawingSummary[],
): DrawingSummary | null {
  const workspaceDrawings = getWorkspaceDrawings(workspace.id, drawings);
  return (
    workspaceDrawings.find((drawing) => drawing.id === workspace.primaryDrawingId) ??
    workspaceDrawings.find((drawing) => !drawing.parentDrawingId) ??
    workspaceDrawings[0] ??
    null
  );
}

export function getWorkspaceLatestRevision(
  workspace: DrawingWorkspaceSummary,
  drawings: DrawingSummary[],
): DrawingSummary | null {
  const workspaceDrawings = getWorkspaceDrawings(workspace.id, drawings);
  return (
    workspaceDrawings
      .slice()
      .sort((left, right) => {
        if (left.revisionNumber !== right.revisionNumber) {
          return right.revisionNumber - left.revisionNumber;
        }
        return right.updatedAtIso.localeCompare(left.updatedAtIso);
      })[0] ?? null
  );
}

export function resolveWorkspaceDrawingId(
  workspace: DrawingWorkspaceSummary,
  drawings: DrawingSummary[],
  preferredDrawingId?: string | null,
): string | null {
  const workspaceDrawings = getWorkspaceDrawings(workspace.id, drawings);
  if (preferredDrawingId && workspaceDrawings.some((drawing) => drawing.id === preferredDrawingId)) {
    return preferredDrawingId;
  }
  return (
    getWorkspaceLatestRevision(workspace, drawings)?.id ??
    getWorkspaceRootDrawing(workspace, drawings)?.id ??
    null
  );
}

export function buildWorkspaceNavigationQuery(
  workspace: DrawingWorkspaceSummary,
  drawings: DrawingSummary[],
  options: {
    drawingId?: string | null;
    estimateDrawingId?: string | null;
    focusTaskId?: string | null;
  } = {},
): Record<string, string> {
  const estimateDrawingId = options.estimateDrawingId ?? null;
  const focusTaskId = options.focusTaskId ?? null;
  return buildDrawingWorkspaceQuery({
    workspaceId: workspace.id,
    drawingId: resolveWorkspaceDrawingId(workspace, drawings, options.drawingId),
    estimateDrawingId,
    focusTaskId,
  });
}

export function buildTaskWorkspaceNavigationQuery(
  task: DrawingTaskRecord,
  workspaces: DrawingWorkspaceSummary[],
  drawings: DrawingSummary[],
): Record<string, string> {
  const workspace = workspaces.find((entry) => entry.id === task.workspaceId) ?? null;
  const drawingId =
    task.revisionDrawingId ??
    task.rootDrawingId ??
    (workspace ? resolveWorkspaceDrawingId(workspace, drawings) : null);

  return buildDrawingWorkspaceQuery({
    workspaceId: task.workspaceId,
    drawingId,
    focusTaskId: task.id,
  });
}

export function buildCustomerWorkspaceCards(
  customerId: string,
  workspaces: DrawingWorkspaceSummary[],
  drawings: DrawingSummary[],
): CustomerWorkspaceCardModel[] {
  return workspaces
    .filter((workspace) => workspace.customerId === customerId)
    .map((workspace) => {
      const workspaceDrawings = getWorkspaceDrawings(workspace.id, drawings);
      const rootDrawing = getWorkspaceRootDrawing(workspace, drawings);
      const latestRevision = getWorkspaceLatestRevision(workspace, drawings);
      return {
        workspace,
        drawings: workspaceDrawings,
        rootDrawing,
        latestRevision,
        revisionCount: countDrawingRevisions(workspaceDrawings),
        lastActivityAtIso:
          latestRevision?.updatedAtIso ?? workspace.lastActivityAtIso ?? workspace.updatedAtIso,
      };
    })
    .sort((left, right) => right.lastActivityAtIso.localeCompare(left.lastActivityAtIso));
}

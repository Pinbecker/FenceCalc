import type {
  DrawingSummary,
  DrawingTaskRecord,
  QuoteRecord,
} from "@fence-estimator/contracts";

import { getRootDrawingId } from "../drawingWorkspace";

export function resolveActiveDrawing(
  drawings: DrawingSummary[],
  routedDrawingId: string | null,
  primaryDrawingId: string | null | undefined,
): DrawingSummary | null {
  return (
    drawings.find((entry) => entry.id === routedDrawingId) ??
    drawings.find((entry) => entry.id === primaryDrawingId) ??
    drawings[0] ??
    null
  );
}

export function resolveActiveDrawingContext(
  drawings: DrawingSummary[],
  activeDrawing: DrawingSummary | null,
  primaryDrawingId: string | null | undefined,
): {
  activeRootDrawing: DrawingSummary | null;
  activeDrawingChain: DrawingSummary[];
  activeLatestDrawing: DrawingSummary | null;
} {
  const allRootDrawings = drawings
    .filter((drawing) => !drawing.parentDrawingId)
    .slice()
    .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));

  const selectedRootDrawingId = getRootDrawingId(activeDrawing);
  const primaryDrawing = primaryDrawingId
    ? (drawings.find((drawing) => drawing.id === primaryDrawingId) ?? null)
    : null;
  const primaryRootDrawingId = getRootDrawingId(primaryDrawing);
  const activeRootDrawingId =
    selectedRootDrawingId ?? primaryRootDrawingId ?? allRootDrawings[0]?.id ?? null;
  const activeRootDrawing = activeRootDrawingId
    ? drawings.find((drawing) => drawing.id === activeRootDrawingId) ?? null
    : null;

  const activeDrawingChain = activeRootDrawing
    ? [
        activeRootDrawing,
        ...drawings
          .filter((drawing) => drawing.parentDrawingId === activeRootDrawing.id)
          .slice()
          .sort((left, right) => {
            if (left.revisionNumber !== right.revisionNumber) {
              return left.revisionNumber - right.revisionNumber;
            }
            return left.createdAtIso.localeCompare(right.createdAtIso);
          }),
      ]
    : [];

  return {
    activeRootDrawing,
    activeDrawingChain,
    activeLatestDrawing:
      activeDrawingChain[activeDrawingChain.length - 1] ?? activeRootDrawing ?? null,
  };
}

export function buildLatestQuoteByDrawingId(quotes: QuoteRecord[]): Map<string, QuoteRecord> {
  const latestByDrawingId = new Map<string, QuoteRecord>();
  for (const quote of quotes) {
    if (!latestByDrawingId.has(quote.drawingId)) {
      latestByDrawingId.set(quote.drawingId, quote);
    }
  }
  return latestByDrawingId;
}

export function sortVisibleTasks(
  tasks: DrawingTaskRecord[],
  activeDrawingChain: DrawingSummary[],
): DrawingTaskRecord[] {
  const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  const activeDrawingIds = new Set(activeDrawingChain.map((drawing) => drawing.id));

  return [...tasks]
    .filter((task) => {
      const taskDrawingId = task.revisionDrawingId ?? task.rootDrawingId;
      return !taskDrawingId || activeDrawingIds.has(taskDrawingId);
    })
    .sort((left, right) => {
      if (left.isCompleted !== right.isCompleted) {
        return left.isCompleted ? 1 : -1;
      }
      if (!left.isCompleted) {
        const leftPriority = priorityOrder[left.priority] ?? 2;
        const rightPriority = priorityOrder[right.priority] ?? 2;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        if (left.dueAtIso && right.dueAtIso) {
          return left.dueAtIso.localeCompare(right.dueAtIso);
        }
        if (left.dueAtIso) {
          return -1;
        }
        if (right.dueAtIso) {
          return 1;
        }
      }
      return right.createdAtIso.localeCompare(left.createdAtIso);
    });
}

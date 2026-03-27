import { buildDefaultJobCommercialInputs, type DrawingSummary, type JobSummary } from "@fence-estimator/contracts";

export type JobWorkspaceTarget =
  | { route: "job"; query: { jobId: string } }
  | { route: "editor"; query: { drawingId: string } };

function compareIsoDescending(left: string | null | undefined, right: string | null | undefined): number {
  return (right ?? "").localeCompare(left ?? "");
}

function choosePrimaryDrawing(drawings: DrawingSummary[]): DrawingSummary {
  return (
    drawings.find((drawing) => drawing.jobRole === "PRIMARY") ??
    [...drawings].sort((left, right) => compareIsoDescending(left.updatedAtIso, right.updatedAtIso))[0]!
  );
}

function chooseLatestDrawing(drawings: DrawingSummary[]): DrawingSummary {
  return [...drawings].sort((left, right) => compareIsoDescending(left.updatedAtIso, right.updatedAtIso))[0]!;
}

function chooseEarliestDrawing(drawings: DrawingSummary[]): DrawingSummary {
  return [...drawings].sort((left, right) => (left.createdAtIso ?? "").localeCompare(right.createdAtIso ?? ""))[0]!;
}

export function hasLegacyJoblessDrawings(drawings: DrawingSummary[], customerId?: string | null): boolean {
  return drawings.some((drawing) => {
    if (customerId && drawing.customerId !== customerId) {
      return false;
    }
    return !drawing.jobId?.trim();
  });
}

export function buildFallbackJobSummaries(drawings: DrawingSummary[], customerId?: string | null): JobSummary[] {
  const groupedDrawings = new Map<string, DrawingSummary[]>();

  for (const drawing of drawings) {
    if (customerId && drawing.customerId !== customerId) {
      continue;
    }
    const groupKey = drawing.jobId?.trim() ? drawing.jobId.trim() : `legacy:${drawing.id}`;
    const group = groupedDrawings.get(groupKey) ?? [];
    group.push(drawing);
    groupedDrawings.set(groupKey, group);
  }

  return [...groupedDrawings.values()]
    .map((group) => {
      const primaryDrawing = choosePrimaryDrawing(group);
      const latestDrawing = chooseLatestDrawing(group);
      const earliestDrawing = chooseEarliestDrawing(group);
      const isArchived = group.every((drawing) => drawing.isArchived);

      return {
        id: primaryDrawing.jobId ?? primaryDrawing.id,
        companyId: primaryDrawing.companyId,
        customerId: primaryDrawing.customerId ?? "",
        customerName: primaryDrawing.customerName,
        name: primaryDrawing.name,
        stage: primaryDrawing.status,
        primaryDrawingId: primaryDrawing.id,
        commercialInputs: buildDefaultJobCommercialInputs(),
        notes: "",
        ownerUserId: latestDrawing.updatedByUserId,
        ownerDisplayName: latestDrawing.updatedByDisplayName,
        isArchived,
        archivedAtIso: isArchived ? primaryDrawing.archivedAtIso : null,
        archivedByUserId: isArchived ? primaryDrawing.archivedByUserId : null,
        stageChangedAtIso: primaryDrawing.statusChangedAtIso,
        stageChangedByUserId: primaryDrawing.statusChangedByUserId,
        createdByUserId: earliestDrawing.createdByUserId,
        updatedByUserId: latestDrawing.updatedByUserId,
        updatedByDisplayName: latestDrawing.updatedByDisplayName,
        createdAtIso: earliestDrawing.createdAtIso,
        updatedAtIso: latestDrawing.updatedAtIso,
        drawingCount: group.length,
        openTaskCount: 0,
        completedTaskCount: 0,
        lastActivityAtIso: latestDrawing.updatedAtIso,
        latestQuoteTotal: null,
        latestQuoteCreatedAtIso: null,
        latestEstimateTotal: null,
        primaryDrawingName: primaryDrawing.name,
        primaryDrawingUpdatedAtIso: primaryDrawing.updatedAtIso,
        primaryPreviewLayout: primaryDrawing.previewLayout
      } satisfies JobSummary;
    })
    .sort((left, right) => compareIsoDescending(left.lastActivityAtIso ?? left.updatedAtIso, right.lastActivityAtIso ?? right.updatedAtIso));
}

export function resolveJobWorkspaceTarget(job: JobSummary, drawings: DrawingSummary[]): JobWorkspaceTarget {
  const primaryDrawing = job.primaryDrawingId ? drawings.find((drawing) => drawing.id === job.primaryDrawingId) ?? null : null;
  const resolvedJobId = primaryDrawing?.jobId ?? (job.primaryDrawingId && job.primaryDrawingId === job.id ? null : job.id);

  if (resolvedJobId) {
    return { route: "job", query: { jobId: resolvedJobId } };
  }

  if (primaryDrawing) {
    return { route: "editor", query: { drawingId: primaryDrawing.id } };
  }

  return { route: "job", query: { jobId: job.id } };
}

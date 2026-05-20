import { randomUUID } from "node:crypto";

import type {
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingRevisionSummary,
  DrawingSummary,
  LayoutModel,
} from "@fence-estimator/contracts";
import { DRAWING_SCHEMA_VERSION } from "@fence-estimator/contracts";
import { estimateDrawingLayout, RULES_ENGINE_VERSION } from "@fence-estimator/rules-engine";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AuthenticatedRequestContext } from "../authorization.js";
import { buildEstimate, normalizeLayout } from "../estimateSupport.js";
import type { AppRepository } from "../repository.js";

function emptyLayout(): LayoutModel {
  return {
    segments: [],
    gates: [],
    basketballFeatures: [],
    basketballPosts: [],
    floodlightColumns: [],
    goalUnits: [],
    kickboards: [],
    pitchDividers: [],
    sideNettings: [],
  };
}

interface CreateDrawingInputData {
  projectId: string;
  name: string;
  initialLayout?: LayoutModel;
  initialViewport?: DrawingCanvasViewport | null;
}

export async function listDrawingsForProjectForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  projectId: string,
): Promise<DrawingSummary[]> {
  const project = await repository.getProjectById(projectId, context.company.id);
  if (!project) {
    return [];
  }
  return repository.listDrawingsForProject(projectId, context.company.id);
}

export async function getDrawingForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  drawingId: string,
): Promise<DrawingRecord | null> {
  return repository.getDrawingById(drawingId, context.company.id);
}

export async function createDrawingForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  input: CreateDrawingInputData,
): Promise<{ drawing: DrawingRecord; revision: DrawingRevisionRecord } | null> {
  const project = await repository.getProjectById(input.projectId, context.company.id);
  if (!project) {
    return null;
  }

  const sourceLayout = input.initialLayout ?? emptyLayout();
  const built = buildEstimate(sourceLayout);
  const now = new Date().toISOString();
  const drawingId = randomUUID();
  const revisionId = randomUUID();

  const drawing = await repository.createDrawing({
    drawingId,
    companyId: context.company.id,
    projectId: project.id,
    name: input.name.trim(),
    initialRevisionId: revisionId,
    initialLayout: built.layout,
    initialViewport: input.initialViewport ?? null,
    initialEstimate: built.estimate,
    schemaVersion: built.schemaVersion,
    rulesVersion: built.rulesVersion,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });

  const revision = (await repository.getRevisionById(revisionId, context.company.id))!;

  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "DRAWING",
    entityId: drawing.id,
    action: "DRAWING_CREATED",
    summary: `${context.user.displayName} created drawing ${drawing.name} in project ${project.name}`,
    createdAtIso: now,
  });

  return { drawing, revision };
}

export async function renameDrawingForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  drawingId: string,
  name: string,
): Promise<DrawingRecord | null> {
  const now = new Date().toISOString();
  const drawing = await repository.renameDrawing({
    drawingId,
    companyId: context.company.id,
    name: name.trim(),
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (drawing) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "DRAWING",
      entityId: drawing.id,
      action: "DRAWING_RENAMED",
      summary: `${context.user.displayName} renamed drawing to ${drawing.name}`,
      createdAtIso: now,
    });
  }
  return drawing;
}

export async function setDrawingArchivedForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  drawingId: string,
  archived: boolean,
): Promise<DrawingRecord | null> {
  const now = new Date().toISOString();
  const drawing = await repository.setDrawingArchivedState({
    drawingId,
    companyId: context.company.id,
    archived,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (drawing) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "DRAWING",
      entityId: drawing.id,
      action: archived ? "DRAWING_ARCHIVED" : "DRAWING_UNARCHIVED",
      summary: `${context.user.displayName} ${archived ? "archived" : "restored"} drawing ${drawing.name}`,
      createdAtIso: now,
    });
  }
  return drawing;
}

export async function deleteDrawingForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  drawingId: string,
): Promise<boolean> {
  const existing = await repository.getDrawingById(drawingId, context.company.id);
  if (!existing) {
    return false;
  }
  const ok = await repository.deleteDrawing({ drawingId, companyId: context.company.id });
  if (ok) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "DRAWING",
      entityId: drawingId,
      action: "DRAWING_DELETED",
      summary: `${context.user.displayName} deleted drawing ${existing.name}`,
      createdAtIso: new Date().toISOString(),
    });
  }
  return ok;
}

// -----------------------------------------------------------------------------
// Revisions
// -----------------------------------------------------------------------------

export async function listRevisionsForDrawingForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  drawingId: string,
): Promise<DrawingRevisionSummary[]> {
  return repository.listRevisionsForDrawing(drawingId, context.company.id);
}

export async function getRevisionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  revisionId: string,
): Promise<DrawingRevisionRecord | null> {
  return repository.getRevisionById(revisionId, context.company.id);
}

export async function startRevisionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  drawingId: string,
  notes: string | null,
): Promise<DrawingRevisionRecord | null> {
  const drawing = await repository.getDrawingById(drawingId, context.company.id);
  if (!drawing) {
    return null;
  }
  const parent = await repository.getRevisionById(drawing.currentRevisionId, context.company.id);
  if (!parent) {
    return null;
  }

  const now = new Date().toISOString();
  const newRevisionId = randomUUID();
  const newRevisionNumber = drawing.latestRevisionNumber + 1;

  const created = await repository.createRevision({
    revisionId: newRevisionId,
    drawingId: drawing.id,
    companyId: context.company.id,
    revisionNumber: newRevisionNumber,
    parentRevisionId: parent.id,
    notes,
    layout: parent.layout,
    savedViewport: parent.savedViewport,
    estimate: parent.estimate,
    schemaVersion: parent.schemaVersion,
    rulesVersion: parent.rulesVersion,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });

  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "REVISION",
    entityId: created.id,
    action: "REVISION_CREATED",
    summary: `${context.user.displayName} started revision ${newRevisionNumber} of ${drawing.name}`,
    createdAtIso: now,
    metadata: { revisionNumber: newRevisionNumber },
  });

  return created;
}

interface UpdateRevisionInputData {
  expectedVersionNumber: number;
  layout: LayoutModel;
  savedViewport: DrawingCanvasViewport | null;
}

export async function saveRevisionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  revisionId: string,
  input: UpdateRevisionInputData,
): Promise<
  | { kind: "ok"; revision: DrawingRevisionRecord }
  | { kind: "not_found" }
  | { kind: "conflict" }
> {
  const normalized = normalizeLayout(input.layout);
  const estimate = estimateDrawingLayout(normalized);
  const now = new Date().toISOString();

  try {
    const updated = await repository.updateRevisionLayout({
      revisionId,
      companyId: context.company.id,
      expectedVersionNumber: input.expectedVersionNumber,
      layout: normalized,
      savedViewport: input.savedViewport,
      estimate,
      schemaVersion: DRAWING_SCHEMA_VERSION,
      rulesVersion: RULES_ENGINE_VERSION,
      updatedByUserId: context.user.id,
      updatedAtIso: now,
    });
    if (!updated) {
      return { kind: "not_found" };
    }
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "REVISION",
      entityId: updated.id,
      action: "REVISION_UPDATED",
      summary: `${context.user.displayName} saved revision ${updated.revisionNumber}`,
      createdAtIso: now,
    });
    return { kind: "ok", revision: updated };
  } catch (error) {
    if ((error as Error & { code?: string }).code === "VERSION_CONFLICT") {
      return { kind: "conflict" };
    }
    throw error;
  }
}

export async function updateRevisionNotesForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  revisionId: string,
  notes: string | null,
): Promise<DrawingRevisionRecord | null> {
  const now = new Date().toISOString();
  return repository.updateRevisionNotes({
    revisionId,
    companyId: context.company.id,
    notes,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
}

export async function deleteRevisionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  revisionId: string,
): Promise<boolean> {
  const existing = await repository.getRevisionById(revisionId, context.company.id);
  if (!existing) {
    return false;
  }
  const ok = await repository.deleteRevision({ revisionId, companyId: context.company.id });
  if (ok) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "REVISION",
      entityId: revisionId,
      action: "REVISION_DELETED",
      summary: `${context.user.displayName} deleted revision ${existing.revisionNumber}`,
      createdAtIso: new Date().toISOString(),
    });
  }
  return ok;
}

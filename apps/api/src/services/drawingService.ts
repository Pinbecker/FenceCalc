import { randomUUID } from "node:crypto";
import type { DrawingCanvasViewport, DrawingRecord, LayoutModel } from "@fence-estimator/contracts";

import type { AuthenticatedRequestContext } from "../authorization.js";
import { writeAuditLog } from "../auditLogSupport.js";
import { buildEstimate } from "../estimateSupport.js";
import type { AppRepository } from "../repository.js";

interface DrawingMutationSuccess {
  kind: "success";
  drawing: DrawingRecord;
}

interface DrawingConflict {
  kind: "conflict";
  currentVersionNumber: number;
}

interface DrawingNotFound {
  kind: "drawing_not_found";
}

interface DrawingVersionNotFound {
  kind: "version_not_found";
}

interface DrawingInvalidLayout {
  kind: "invalid_layout";
  message: string;
}

export type DrawingMutationResult =
  | DrawingMutationSuccess
  | DrawingConflict
  | DrawingNotFound
  | DrawingVersionNotFound
  | DrawingInvalidLayout;

interface DrawingCreateInput {
  name: string;
  customerName: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null | undefined;
}

interface DrawingUpdateInput {
  expectedVersionNumber: number;
  name?: string | undefined;
  customerName?: string | undefined;
  layout?: LayoutModel | undefined;
  savedViewport?: DrawingCanvasViewport | null | undefined;
}

interface DrawingArchiveInput {
  archived: boolean;
  expectedVersionNumber: number;
}

export async function createDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  input: DrawingCreateInput,
): Promise<DrawingMutationResult> {
  try {
    const result = buildEstimate(input.layout);
    const nowIso = new Date().toISOString();
    const drawing = await repository.createDrawing({
      id: randomUUID(),
      companyId: authenticated.company.id,
      name: input.name,
      customerName: input.customerName,
      layout: result.layout,
      savedViewport: input.savedViewport ?? null,
      estimate: result.estimate,
      schemaVersion: result.schemaVersion,
      rulesVersion: result.rulesVersion,
      createdByUserId: authenticated.user.id,
      updatedByUserId: authenticated.user.id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    });
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "DRAWING",
      entityId: drawing.id,
      action: "DRAWING_CREATED",
      summary: `${authenticated.user.displayName} created ${drawing.name}`,
      createdAtIso: nowIso,
      metadata: { versionNumber: drawing.versionNumber }
    });

    return { kind: "success", drawing };
  } catch (error) {
    return {
      kind: "invalid_layout",
      message: (error as Error).message
    };
  }
}

export async function updateDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  drawingId: string,
  input: DrawingUpdateInput,
): Promise<DrawingMutationResult> {
  const existing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!existing) {
    return { kind: "drawing_not_found" };
  }
  if (input.expectedVersionNumber !== existing.versionNumber) {
    return { kind: "conflict", currentVersionNumber: existing.versionNumber };
  }

  try {
    const nextLayout = input.layout
      ? buildEstimate(input.layout)
      : {
          layout: existing.layout,
          estimate: existing.estimate,
          schemaVersion: existing.schemaVersion,
          rulesVersion: existing.rulesVersion
        };
    const drawing = await repository.updateDrawing({
      drawingId: existing.id,
      companyId: authenticated.company.id,
      name: input.name ?? existing.name,
      customerName: input.customerName ?? existing.customerName,
      layout: nextLayout.layout,
      savedViewport: input.savedViewport ?? existing.savedViewport ?? null,
      estimate: nextLayout.estimate,
      schemaVersion: nextLayout.schemaVersion,
      rulesVersion: nextLayout.rulesVersion,
      updatedByUserId: authenticated.user.id,
      updatedAtIso: new Date().toISOString()
    });
    if (!drawing) {
      return { kind: "drawing_not_found" };
    }
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "DRAWING",
      entityId: drawing.id,
      action: "DRAWING_UPDATED",
      summary: `${authenticated.user.displayName} updated ${drawing.name}`,
      createdAtIso: drawing.updatedAtIso,
      metadata: { versionNumber: drawing.versionNumber }
    });

    return { kind: "success", drawing };
  } catch (error) {
    return {
      kind: "invalid_layout",
      message: (error as Error).message
    };
  }
}

export async function setDrawingArchivedStateForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  drawingId: string,
  input: DrawingArchiveInput,
): Promise<DrawingMutationResult> {
  const existing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!existing) {
    return { kind: "drawing_not_found" };
  }
  if (input.expectedVersionNumber !== existing.versionNumber) {
    return { kind: "conflict", currentVersionNumber: existing.versionNumber };
  }

  const updatedAtIso = new Date().toISOString();
  const drawing = await repository.setDrawingArchivedState({
    drawingId,
    companyId: authenticated.company.id,
    archived: input.archived,
    archivedAtIso: input.archived ? updatedAtIso : null,
    archivedByUserId: input.archived ? authenticated.user.id : null,
    updatedAtIso,
    updatedByUserId: authenticated.user.id
  });
  if (!drawing) {
    return { kind: "drawing_not_found" };
  }
  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawing.id,
    action: input.archived ? "DRAWING_ARCHIVED" : "DRAWING_UNARCHIVED",
    summary: `${authenticated.user.displayName} ${input.archived ? "archived" : "restored"} ${drawing.name}`,
    createdAtIso: updatedAtIso
  });

  return { kind: "success", drawing };
}

export async function restoreDrawingVersionForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  drawingId: string,
  versionNumber: number,
  expectedVersionNumber: number,
): Promise<DrawingMutationResult> {
  const existing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!existing) {
    return { kind: "drawing_not_found" };
  }
  if (expectedVersionNumber !== existing.versionNumber) {
    return { kind: "conflict", currentVersionNumber: existing.versionNumber };
  }

  const drawing = await repository.restoreDrawingVersion({
    drawingId,
    companyId: authenticated.company.id,
    versionNumber,
    restoredByUserId: authenticated.user.id,
    restoredAtIso: new Date().toISOString()
  });
  if (!drawing) {
    return { kind: "version_not_found" };
  }
  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawing.id,
    action: "DRAWING_VERSION_RESTORED",
    summary: `${authenticated.user.displayName} restored version ${versionNumber} of ${drawing.name}`,
    createdAtIso: drawing.updatedAtIso,
    metadata: { restoredFromVersion: versionNumber, versionNumber: drawing.versionNumber }
  });

  return { kind: "success", drawing };
}

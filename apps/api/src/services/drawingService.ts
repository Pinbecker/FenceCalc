import { randomUUID } from "node:crypto";
import {
  type DrawingCanvasViewport,
  type DrawingRecord,
  type DrawingStatus,
  type LayoutModel,
} from "@fence-estimator/contracts";

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

interface DrawingInvalidCustomer {
  kind: "invalid_customer";
  message: string;
}

interface DrawingQuotedLocked {
  kind: "quoted_locked";
  message: string;
}

export type DrawingMutationResult =
  | DrawingMutationSuccess
  | DrawingConflict
  | DrawingNotFound
  | DrawingVersionNotFound
  | DrawingInvalidLayout
  | DrawingInvalidCustomer
  | DrawingQuotedLocked;

interface DrawingCreateInput {
  name: string;
  customerId: string;
  workspaceId?: string | undefined;
  parentDrawingId?: string | null | undefined;
  revisionNumber?: number | undefined;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null | undefined;
}

interface DrawingUpdateInput {
  expectedVersionNumber: number;
  name?: string | undefined;
  customerId?: string | undefined;
  workspaceId?: string | null | undefined;
  layout?: LayoutModel | undefined;
  savedViewport?: DrawingCanvasViewport | null | undefined;
}

interface DrawingArchiveInput {
  archived: boolean;
  expectedVersionNumber: number;
}

interface DrawingStatusInput {
  status: DrawingStatus;
  expectedVersionNumber: number;
}

async function resolveCustomerForWrite(repository: AppRepository, companyId: string, customerId: string) {
  const customer = await repository.getCustomerById(customerId, companyId);
  if (!customer) {
    return { kind: "invalid_customer" as const, message: "Customer not found" };
  }
  if (customer.isArchived) {
    return { kind: "invalid_customer" as const, message: "Archived customers cannot be used for new drawing saves" };
  }
  return { kind: "success" as const, customer };
}

async function resolveWorkspaceForWrite(
  repository: AppRepository,
  companyId: string,
  workspaceId: string,
) {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, companyId);
  if (!workspace) {
    return { kind: "invalid_customer" as const, message: "Drawing workspace not found" };
  }
  if (workspace.isArchived) {
    return {
      kind: "invalid_customer" as const,
      message: "Archived drawing workspaces cannot receive new revisions",
    };
  }
  return { kind: "success" as const, workspace };
}

function getDrawingWorkspaceId(drawing: Pick<DrawingRecord, "workspaceId">): string | null {
  return drawing.workspaceId ?? null;
}

export async function createDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  input: DrawingCreateInput,
): Promise<DrawingMutationResult> {
  try {
    const customerResult = await resolveCustomerForWrite(repository, authenticated.company.id, input.customerId);
    if (customerResult.kind !== "success") {
      return customerResult;
    }
    const result = buildEstimate(input.layout);
    const nowIso = new Date().toISOString();
    let createdDrawingId: string | null = null;

    await repository.runInTransaction(async () => {
      const targetWorkspaceId = input.workspaceId ?? null;
      if (!targetWorkspaceId) {
        throw new Error("Root drawings must be created through the drawing workspace endpoint.");
      }

      const workspaceResult = await resolveWorkspaceForWrite(
        repository,
        authenticated.company.id,
        targetWorkspaceId,
      );
      if (workspaceResult.kind !== "success") {
        throw new Error(workspaceResult.message);
      }
      if (workspaceResult.workspace.customerId !== customerResult.customer.id) {
        throw new Error("Selected workspace belongs to a different customer");
      }
      const workspaceHasRootDrawing = workspaceResult.workspace.primaryDrawingId !== null;
      if (workspaceHasRootDrawing && !input.parentDrawingId) {
        throw new Error("Workspaces can only contain one root drawing. Create a revision from an existing drawing instead.");
      }

      const createdDrawing = await repository.createDrawing({
        id: randomUUID(),
        companyId: authenticated.company.id,
        workspaceId: targetWorkspaceId,
        jobId: targetWorkspaceId,
        jobRole: workspaceHasRootDrawing ? "SECONDARY" : "PRIMARY",
        parentDrawingId: input.parentDrawingId ?? null,
        revisionNumber: input.revisionNumber ?? 0,
        name: input.name,
        customerId: customerResult.customer.id,
        customerName: customerResult.customer.name,
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
      if (!workspaceHasRootDrawing && targetWorkspaceId) {
        await repository.setDrawingWorkspacePrimaryDrawing({
          workspaceId: targetWorkspaceId,
          companyId: authenticated.company.id,
          drawingId: createdDrawing.id,
          updatedByUserId: authenticated.user.id,
          updatedAtIso: nowIso
        });
      }
      createdDrawingId = createdDrawing.id;
    });

    if (!createdDrawingId) {
      return {
        kind: "invalid_layout",
        message: "Drawing could not be created"
      };
    }
    const drawing = await repository.getDrawingById(createdDrawingId, authenticated.company.id);
    if (!drawing) {
      return {
        kind: "drawing_not_found"
      };
    }
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
    if (getDrawingWorkspaceId(drawing)) {
      await writeAuditLog(repository, {
        companyId: authenticated.company.id,
        actorUserId: authenticated.user.id,
        entityType: "WORKSPACE",
        entityId: getDrawingWorkspaceId(drawing),
        action: "WORKSPACE_DRAWING_ADDED",
        summary: `${authenticated.user.displayName} added revision ${drawing.name} to a workspace`,
        createdAtIso: nowIso,
        metadata: {
          drawingId: drawing.id,
          workspaceId: getDrawingWorkspaceId(drawing),
        }
      });
    }

    return { kind: "success", drawing };
  } catch (error) {
    const message = (error as Error).message;
    if (
      message === "Drawing workspace not found" ||
      message === "Archived drawing workspaces cannot receive new revisions" ||
      message === "Selected workspace belongs to a different customer"
    ) {
      return {
        kind: "invalid_customer",
        message
      };
    }
    return {
      kind: "invalid_layout",
      message
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
  const isNameOnlyUpdate =
    input.name !== undefined &&
    input.customerId === undefined &&
    input.layout === undefined &&
    input.savedViewport === undefined;
  if (existing.status === "QUOTED" && !isNameOnlyUpdate) {
    return {
      kind: "quoted_locked",
      message: "Quoted drawings are locked. Create a new revision before making changes."
    };
  }

  try {
    const nextCustomer =
      input.customerId !== undefined
        ? await resolveCustomerForWrite(repository, authenticated.company.id, input.customerId)
        : null;
    if (nextCustomer && nextCustomer.kind !== "success") {
      return nextCustomer;
    }
    const nextLayout = input.layout
      ? buildEstimate(input.layout)
      : {
          layout: existing.layout,
          estimate: existing.estimate,
          schemaVersion: existing.schemaVersion,
          rulesVersion: existing.rulesVersion
        };
    const updatedAtIso = new Date().toISOString();
    const workspaceId = getDrawingWorkspaceId(existing);
    const nextName = input.name ?? existing.name;
    const nameChanged = input.name !== undefined && nextName !== existing.name;
    if (workspaceId && nameChanged) {
      return {
        kind: "invalid_layout",
        message: "Rename the drawing workspace instead of renaming an individual drawing.",
      };
    }
    const nextCustomerId = nextCustomer?.customer.id ?? existing.customerId;
    const nextCustomerName = nextCustomer?.customer.name ?? existing.customerName;
    const drawing = await repository.updateDrawing({
      drawingId: existing.id,
      companyId: authenticated.company.id,
      expectedVersionNumber: input.expectedVersionNumber,
      ...(workspaceId !== null ? { workspaceId, jobId: workspaceId } : {}),
      ...(existing.jobRole !== undefined ? { jobRole: existing.jobRole } : {}),
      name: nextName,
      customerId: nextCustomerId,
      customerName: nextCustomerName,
      layout: nextLayout.layout,
      savedViewport: input.savedViewport ?? existing.savedViewport ?? null,
      estimate: nextLayout.estimate,
      schemaVersion: nextLayout.schemaVersion,
      rulesVersion: nextLayout.rulesVersion,
      updatedByUserId: authenticated.user.id,
      updatedAtIso
    });
    const persistedDrawing = drawing;
    if (!persistedDrawing) {
      const current = await repository.getDrawingById(drawingId, authenticated.company.id);
      if (!current) {
        return { kind: "drawing_not_found" };
      }
      return { kind: "conflict", currentVersionNumber: current.versionNumber };
    }
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "DRAWING",
      entityId: persistedDrawing.id,
      action: "DRAWING_UPDATED",
      summary: `${authenticated.user.displayName} updated ${persistedDrawing.name}`,
      createdAtIso: persistedDrawing.updatedAtIso,
      metadata: { versionNumber: persistedDrawing.versionNumber }
    });

    return { kind: "success", drawing: persistedDrawing };
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

  const updatedAtIso = new Date().toISOString();
  const drawing = await repository.setDrawingArchivedState({
    drawingId,
    companyId: authenticated.company.id,
    expectedVersionNumber: input.expectedVersionNumber,
    archived: input.archived,
    archivedAtIso: input.archived ? updatedAtIso : null,
    archivedByUserId: input.archived ? authenticated.user.id : null,
    updatedAtIso,
    updatedByUserId: authenticated.user.id
  });
  if (!drawing) {
    const current = await repository.getDrawingById(drawingId, authenticated.company.id);
    if (!current) {
      return { kind: "drawing_not_found" };
    }
    return { kind: "conflict", currentVersionNumber: current.versionNumber };
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

  const versions = await repository.listDrawingVersions(drawingId, authenticated.company.id);
  const version = versions.find((entry) => entry.versionNumber === versionNumber);
  if (!version) {
    return { kind: "version_not_found" };
  }

  const restoredCustomer =
    version.customerId !== null ? await repository.getCustomerById(version.customerId, authenticated.company.id) : null;
  const drawing = await repository.restoreDrawingVersion({
    drawingId,
    companyId: authenticated.company.id,
    expectedVersionNumber,
    versionNumber,
    customerId: restoredCustomer?.id ?? version.customerId,
    customerName: restoredCustomer?.name ?? version.customerName,
    restoredByUserId: authenticated.user.id,
    restoredAtIso: new Date().toISOString()
  });
  if (!drawing) {
    const current = await repository.getDrawingById(drawingId, authenticated.company.id);
    if (!current) {
      return { kind: "drawing_not_found" };
    }
    return { kind: "conflict", currentVersionNumber: current.versionNumber };
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

export async function setDrawingStatusForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  drawingId: string,
  input: DrawingStatusInput,
): Promise<DrawingMutationResult> {
  const existing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!existing) {
    return { kind: "drawing_not_found" };
  }

  const updatedAtIso = new Date().toISOString();
  const drawing = await repository.setDrawingStatus({
    drawingId,
    companyId: authenticated.company.id,
    expectedVersionNumber: input.expectedVersionNumber,
    status: input.status,
    statusChangedAtIso: updatedAtIso,
    statusChangedByUserId: authenticated.user.id,
    updatedAtIso,
    updatedByUserId: authenticated.user.id
  });
  if (!drawing) {
    const current = await repository.getDrawingById(drawingId, authenticated.company.id);
    if (!current) {
      return { kind: "drawing_not_found" };
    }
    return { kind: "conflict", currentVersionNumber: current.versionNumber };
  }

  const previousStatus = existing.status;
  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawing.id,
    action: "DRAWING_STATUS_CHANGED",
    summary: `${authenticated.user.displayName} changed ${drawing.name} from ${previousStatus} to ${input.status}`,
    createdAtIso: updatedAtIso,
    metadata: { previousStatus, newStatus: input.status }
  });

  return { kind: "success", drawing };
}

export type DrawingDeleteResult =
  | { kind: "success" }
  | { kind: "drawing_not_found" }
  | { kind: "not_archived" }
  | { kind: "not_a_revision" }
  | { kind: "not_last_revision" };

export async function deleteDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  drawingId: string,
): Promise<DrawingDeleteResult> {
  const existing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!existing) {
    return { kind: "drawing_not_found" };
  }
  if (!existing.isArchived) {
    return { kind: "not_archived" };
  }

  await repository.deleteDrawing({
    drawingId,
    companyId: authenticated.company.id,
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawingId,
    action: "DRAWING_DELETED",
    summary: `${authenticated.user.displayName} permanently deleted drawing ${existing.name}`,
    createdAtIso: new Date().toISOString(),
  });

  return { kind: "success" };
}

export async function deleteRevisionForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  drawingId: string,
): Promise<DrawingDeleteResult> {
  const existing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!existing) {
    return { kind: "drawing_not_found" };
  }
  if (!existing.parentDrawingId) {
    return { kind: "not_a_revision" };
  }

  // Check this is the last (most recent) revision of its parent
  const workspaceId = getDrawingWorkspaceId(existing);
  if (!workspaceId) {
    return { kind: "drawing_not_found" };
  }
  const siblings = await repository.listDrawingsForWorkspace(workspaceId, authenticated.company.id);
  const sameParentRevisions = siblings
    .filter((d) => d.parentDrawingId === existing.parentDrawingId)
    .sort((a, b) => {
      if (a.revisionNumber !== b.revisionNumber) {
        return a.revisionNumber - b.revisionNumber;
      }
      return a.createdAtIso.localeCompare(b.createdAtIso);
    });
  const lastRevision = sameParentRevisions[sameParentRevisions.length - 1];
  if (!lastRevision || lastRevision.id !== drawingId) {
    return { kind: "not_last_revision" };
  }

  await repository.deleteDrawing({ drawingId, companyId: authenticated.company.id });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawingId,
    action: "DRAWING_DELETED",
    summary: `${authenticated.user.displayName} deleted revision ${existing.name}`,
    createdAtIso: new Date().toISOString(),
  });

  return { kind: "success" };
}

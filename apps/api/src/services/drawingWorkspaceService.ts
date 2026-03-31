import { randomUUID } from "node:crypto";
import {
  buildDefaultDrawingWorkspaceCommercialInputs,
  type DrawingRecord,
  type DrawingTaskRecord,
  type DrawingWorkspaceCommercialInputs,
  type DrawingWorkspaceRecord,
  type LayoutModel,
} from "@fence-estimator/contracts";

import type { AuthenticatedRequestContext } from "../authorization.js";
import { writeAuditLog } from "../auditLogSupport.js";
import { buildEstimate } from "../estimateSupport.js";
import type { AppRepository } from "../repository.js";
import { createDrawingForCompany, type DrawingMutationResult } from "./drawingService.js";

const EMPTY_LAYOUT: LayoutModel = {
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: [],
};

type WorkspaceNotFound = { kind: "workspace_not_found" };
type DrawingNotFound = { kind: "drawing_not_found" };
type InvalidCustomer = { kind: "invalid_customer"; message: string };
type InvalidUser = { kind: "invalid_user"; message: string };
type TaskNotFound = { kind: "task_not_found" };

export type DrawingWorkspaceMutationResult =
  | { kind: "success"; workspace: DrawingWorkspaceRecord }
  | WorkspaceNotFound
  | InvalidCustomer
  | InvalidUser
  | DrawingNotFound;

export type DrawingTaskMutationResult =
  | { kind: "success"; task: DrawingTaskRecord }
  | WorkspaceNotFound
  | InvalidUser
  | TaskNotFound
  | DrawingNotFound;

export type DrawingWorkspaceDeleteResult =
  | { kind: "success" }
  | WorkspaceNotFound
  | { kind: "not_archived" };

function getDrawingWorkspaceId(drawing: Pick<DrawingRecord, "workspaceId" | "jobId">): string | null {
  return drawing.workspaceId ?? drawing.jobId ?? null;
}

async function resolveTaskDrawingTarget(
  repository: AppRepository,
  companyId: string,
  workspace: DrawingWorkspaceRecord,
  requestedDrawingId: string | null | undefined,
  currentRootDrawingId?: string | null,
  currentRevisionDrawingId?: string | null,
) {
  const normalizedRequestedDrawingId = requestedDrawingId?.trim() ?? null;
  if (normalizedRequestedDrawingId) {
    const drawing = await repository.getDrawingById(normalizedRequestedDrawingId, companyId);
    if (!drawing || getDrawingWorkspaceId(drawing) !== workspace.id) {
      return { kind: "drawing_not_found" as const };
    }
    return {
      kind: "success" as const,
      rootDrawingId: drawing.parentDrawingId ?? drawing.id,
      revisionDrawingId: drawing.parentDrawingId ? drawing.id : null,
    };
  }

  if (normalizedRequestedDrawingId === null && requestedDrawingId !== undefined) {
    return { kind: "success" as const, rootDrawingId: null, revisionDrawingId: null };
  }

  if (currentRootDrawingId) {
    return {
      kind: "success" as const,
      rootDrawingId: currentRootDrawingId,
      revisionDrawingId: currentRevisionDrawingId ?? null,
    };
  }

  if (workspace.primaryDrawingId) {
    const primaryDrawing = await repository.getDrawingById(workspace.primaryDrawingId, companyId);
    if (primaryDrawing && getDrawingWorkspaceId(primaryDrawing) === workspace.id) {
      return {
        kind: "success" as const,
        rootDrawingId: primaryDrawing.parentDrawingId ?? primaryDrawing.id,
        revisionDrawingId: primaryDrawing.parentDrawingId ? primaryDrawing.id : null,
      };
    }
  }

  const drawings = await repository.listDrawingsForWorkspace(workspace.id, companyId);
  const rootDrawing = drawings
    .filter((drawing) => !drawing.parentDrawingId)
    .sort((left, right) => {
      if (left.jobRole === "PRIMARY" && right.jobRole !== "PRIMARY") {
        return -1;
      }
      if (right.jobRole === "PRIMARY" && left.jobRole !== "PRIMARY") {
        return 1;
      }
      return left.createdAtIso.localeCompare(right.createdAtIso);
    })[0];
  return {
    kind: "success" as const,
    rootDrawingId: rootDrawing?.id ?? null,
    revisionDrawingId: null,
  };
}

async function resolveCustomerForWorkspace(
  repository: AppRepository,
  companyId: string,
  customerId: string,
) {
  const customer = await repository.getCustomerById(customerId, companyId);
  if (!customer) {
    return { kind: "invalid_customer" as const, message: "Customer not found" };
  }
  if (customer.isArchived) {
    return {
      kind: "invalid_customer" as const,
      message: "Archived customers cannot receive drawing workspaces",
    };
  }
  return { kind: "success" as const, customer };
}

async function resolveOwner(
  repository: AppRepository,
  companyId: string,
  ownerUserId: string | null,
) {
  if (!ownerUserId) {
    return { kind: "success" as const, ownerUserId: null };
  }
  const user = await repository.getUserById(ownerUserId, companyId);
  if (!user) {
    return { kind: "invalid_user" as const, message: "Assigned owner not found" };
  }
  return { kind: "success" as const, ownerUserId: user.id };
}

export async function createDrawingWorkspaceForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  input: { customerId: string; name: string; notes: string },
): Promise<DrawingWorkspaceMutationResult> {
  const customerResult = await resolveCustomerForWorkspace(
    repository,
    authenticated.company.id,
    input.customerId,
  );
  if (customerResult.kind !== "success") {
    return customerResult;
  }

  const estimateSeed = buildEstimate(EMPTY_LAYOUT);
  const nowIso = new Date().toISOString();
  const workspaceId = randomUUID();
  const drawingId = randomUUID();

  await repository.runInTransaction(async () => {
    await repository.createDrawingWorkspace({
      id: workspaceId,
      companyId: authenticated.company.id,
      customerId: customerResult.customer.id,
      customerName: customerResult.customer.name,
      name: input.name,
      stage: "DRAFT",
      primaryDrawingId: null,
      commercialInputs: buildDefaultDrawingWorkspaceCommercialInputs(),
      notes: input.notes,
      ownerUserId: authenticated.user.id,
      createdByUserId: authenticated.user.id,
      updatedByUserId: authenticated.user.id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    await repository.createDrawing({
      id: drawingId,
      companyId: authenticated.company.id,
      workspaceId,
      jobId: workspaceId,
      jobRole: "PRIMARY",
      name: input.name,
      customerId: customerResult.customer.id,
      customerName: customerResult.customer.name,
      layout: estimateSeed.layout,
      savedViewport: null,
      estimate: estimateSeed.estimate,
      schemaVersion: estimateSeed.schemaVersion,
      rulesVersion: estimateSeed.rulesVersion,
      createdByUserId: authenticated.user.id,
      updatedByUserId: authenticated.user.id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    await repository.setDrawingWorkspacePrimaryDrawing({
      workspaceId,
      companyId: authenticated.company.id,
      drawingId,
      updatedByUserId: authenticated.user.id,
      updatedAtIso: nowIso,
    });
  });

  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: workspace.id,
    action: "JOB_CREATED",
    summary: `${authenticated.user.displayName} created workspace ${workspace.name}`,
    createdAtIso: nowIso,
    metadata: { customerId: workspace.customerId, primaryDrawingId: drawingId, workspaceId },
  });
  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawingId,
    action: "DRAWING_CREATED",
    summary: `${authenticated.user.displayName} created ${input.name}`,
    createdAtIso: nowIso,
    metadata: { versionNumber: 1, workspaceId },
  });

  return { kind: "success", workspace };
}

export async function updateDrawingWorkspaceForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
  input: {
    name?: string | undefined;
    stage?: DrawingWorkspaceRecord["stage"] | undefined;
    commercialInputs?: DrawingWorkspaceCommercialInputs | undefined;
    notes?: string | undefined;
    ownerUserId?: string | null | undefined;
    archived?: boolean | undefined;
  },
): Promise<DrawingWorkspaceMutationResult> {
  const existing = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!existing) {
    return { kind: "workspace_not_found" };
  }

  const ownerResult =
    input.ownerUserId !== undefined
      ? await resolveOwner(repository, authenticated.company.id, input.ownerUserId)
      : null;
  if (ownerResult && ownerResult.kind !== "success") {
    return ownerResult;
  }

  const updatedAtIso = new Date().toISOString();
  const nextStage = input.stage ?? existing.stage;
  const stageChanged = input.stage !== undefined && input.stage !== existing.stage;
  const archived = input.archived ?? existing.isArchived;
  const archiveChanged = input.archived !== undefined && input.archived !== existing.isArchived;
  const workspace = await repository.updateDrawingWorkspace({
    workspaceId: existing.id,
    companyId: authenticated.company.id,
    name: input.name ?? existing.name,
    stage: nextStage,
    commercialInputs: input.commercialInputs ?? existing.commercialInputs,
    notes: input.notes ?? existing.notes,
    ownerUserId: ownerResult?.ownerUserId ?? existing.ownerUserId,
    archived,
    archivedAtIso: archived ? (archiveChanged ? updatedAtIso : existing.archivedAtIso) : null,
    archivedByUserId: archived
      ? archiveChanged
        ? authenticated.user.id
        : existing.archivedByUserId
      : null,
    stageChangedAtIso: stageChanged ? updatedAtIso : existing.stageChangedAtIso,
    stageChangedByUserId: stageChanged ? authenticated.user.id : existing.stageChangedByUserId,
    updatedByUserId: authenticated.user.id,
    updatedAtIso,
  });
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }

  if (
    input.name !== undefined ||
    input.notes !== undefined ||
    input.ownerUserId !== undefined ||
    input.commercialInputs !== undefined
  ) {
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "JOB",
      entityId: workspace.id,
      action: "JOB_UPDATED",
      summary: `${authenticated.user.displayName} updated workspace ${workspace.name}`,
      createdAtIso: updatedAtIso,
      metadata: { workspaceId: workspace.id },
    });
  }

  if (stageChanged) {
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "JOB",
      entityId: workspace.id,
      action: "JOB_STAGE_CHANGED",
      summary: `${authenticated.user.displayName} changed ${workspace.name} from ${existing.stage} to ${nextStage}`,
      createdAtIso: updatedAtIso,
      metadata: { previousStage: existing.stage, newStage: nextStage, workspaceId: workspace.id },
    });
  }

  if (archiveChanged) {
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "JOB",
      entityId: workspace.id,
      action: archived ? "JOB_ARCHIVED" : "JOB_UNARCHIVED",
      summary: `${authenticated.user.displayName} ${archived ? "archived" : "restored"} workspace ${workspace.name}`,
      createdAtIso: updatedAtIso,
      metadata: { workspaceId: workspace.id },
    });
  }

  return { kind: "success", workspace };
}

export async function deleteDrawingWorkspaceForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
): Promise<DrawingWorkspaceDeleteResult> {
  const existing = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!existing) {
    return { kind: "workspace_not_found" };
  }
  if (!existing.isArchived) {
    return { kind: "not_archived" };
  }

  await repository.deleteDrawingWorkspace({
    workspaceId,
    companyId: authenticated.company.id,
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: workspaceId,
    action: "JOB_DELETED",
    summary: `${authenticated.user.displayName} permanently deleted workspace ${existing.name}`,
    createdAtIso: new Date().toISOString(),
    metadata: { workspaceId },
  });

  return { kind: "success" };
}

export async function createDrawingWorkspaceDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
  input: { name?: string | undefined; sourceDrawingId?: string | undefined },
): Promise<DrawingMutationResult | WorkspaceNotFound> {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }

  if (!input.sourceDrawingId?.trim()) {
    return {
      kind: "invalid_layout",
      message: "A source drawing is required when creating a revision.",
    };
  }

  const sourceDrawing = await repository.getDrawingById(
    input.sourceDrawingId,
    authenticated.company.id,
  );
  if (!sourceDrawing || getDrawingWorkspaceId(sourceDrawing) !== workspace.id) {
    return { kind: "drawing_not_found" };
  }

  const existingDrawings = await repository.listDrawingsForWorkspace(
    workspace.id,
    authenticated.company.id,
  );
  const parentDrawingId = sourceDrawing.parentDrawingId ?? sourceDrawing.id;
  const existingRevisions = existingDrawings.filter((drawing) => drawing.parentDrawingId === parentDrawingId);
  const revisionNumber = existingRevisions.length + 1;
  const rootDrawing = existingDrawings.find((drawing) => drawing.id === parentDrawingId) ?? sourceDrawing;

  return createDrawingForCompany(repository, authenticated, {
    name: input.name?.trim() || rootDrawing.name,
    customerId: workspace.customerId,
    workspaceId: workspace.id,
    parentDrawingId,
    revisionNumber,
    layout: sourceDrawing.layout ?? EMPTY_LAYOUT,
    savedViewport: sourceDrawing.savedViewport ?? null,
  });
}

export async function setDrawingWorkspacePrimaryDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
  drawingId: string,
): Promise<DrawingWorkspaceMutationResult> {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }
  const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!drawing || getDrawingWorkspaceId(drawing) !== workspace.id) {
    return { kind: "drawing_not_found" };
  }

  const updatedAtIso = new Date().toISOString();
  const updatedWorkspace = await repository.setDrawingWorkspacePrimaryDrawing({
    workspaceId,
    companyId: authenticated.company.id,
    drawingId,
    updatedByUserId: authenticated.user.id,
    updatedAtIso,
  });
  if (!updatedWorkspace) {
    return { kind: "workspace_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: updatedWorkspace.id,
    action: "JOB_PRIMARY_DRAWING_CHANGED",
    summary: `${authenticated.user.displayName} changed the primary drawing for workspace ${updatedWorkspace.name}`,
    createdAtIso: updatedAtIso,
    metadata: { drawingId, workspaceId: updatedWorkspace.id },
  });

  return { kind: "success", workspace: updatedWorkspace };
}

interface DrawingWorkspaceTaskWriteInput {
  title?: string | undefined;
  description?: string | undefined;
  priority?: string | undefined;
  assignedUserId?: string | null | undefined;
  rootDrawingId?: string | null | undefined;
  revisionDrawingId?: string | null | undefined;
  dueAtIso?: string | null | undefined;
  isCompleted?: boolean | undefined;
}

interface CreateDrawingWorkspaceTaskInput extends DrawingWorkspaceTaskWriteInput {
  title: string;
}

export async function createDrawingWorkspaceTaskForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
  input: CreateDrawingWorkspaceTaskInput,
): Promise<DrawingTaskMutationResult> {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }
  const ownerResult =
    input.assignedUserId !== undefined
      ? await resolveOwner(repository, authenticated.company.id, input.assignedUserId)
      : null;
  if (ownerResult && ownerResult.kind !== "success") {
    return ownerResult;
  }
  const drawingResult = await resolveTaskDrawingTarget(
    repository,
    authenticated.company.id,
    workspace,
    input.revisionDrawingId ?? input.rootDrawingId,
  );
  if (drawingResult.kind !== "success") {
    return drawingResult;
  }

  const nowIso = new Date().toISOString();
  const task = await repository.createDrawingTask({
    id: randomUUID(),
    companyId: authenticated.company.id,
    workspaceId,
    rootDrawingId: drawingResult.rootDrawingId,
    revisionDrawingId: drawingResult.revisionDrawingId,
    title: input.title,
    description: input.description ?? "",
    priority: input.priority ?? "NORMAL",
    assignedUserId: ownerResult?.ownerUserId ?? null,
    dueAtIso: input.dueAtIso ?? null,
    createdByUserId: authenticated.user.id,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: workspaceId,
    action: "JOB_TASK_CREATED",
    summary: `${authenticated.user.displayName} added a task to workspace ${workspace.name}`,
    createdAtIso: nowIso,
    metadata: { taskId: task.id, title: task.title, workspaceId },
  });

  return { kind: "success", task };
}

export async function updateDrawingWorkspaceTaskForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
  taskId: string,
  input: DrawingWorkspaceTaskWriteInput,
): Promise<DrawingTaskMutationResult> {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }
  const tasks = await repository.listDrawingWorkspaceTasks(workspaceId, authenticated.company.id);
  const existing = tasks.find((task) => task.id === taskId);
  if (!existing) {
    return { kind: "task_not_found" };
  }
  const ownerResult =
    input.assignedUserId !== undefined
      ? await resolveOwner(repository, authenticated.company.id, input.assignedUserId)
      : null;
  if (ownerResult && ownerResult.kind !== "success") {
    return ownerResult;
  }
  const drawingResult = await resolveTaskDrawingTarget(
    repository,
    authenticated.company.id,
    workspace,
    input.revisionDrawingId ?? input.rootDrawingId,
    existing.rootDrawingId,
    existing.revisionDrawingId,
  );
  if (drawingResult.kind !== "success") {
    return drawingResult;
  }

  const updatedAtIso = new Date().toISOString();
  const isCompleted = input.isCompleted ?? existing.isCompleted;
  const task = await repository.updateDrawingTask({
    taskId,
    companyId: authenticated.company.id,
    workspaceId,
    rootDrawingId: drawingResult.rootDrawingId,
    revisionDrawingId: drawingResult.revisionDrawingId,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    priority: input.priority ?? existing.priority,
    assignedUserId: ownerResult?.ownerUserId ?? existing.assignedUserId,
    dueAtIso: input.dueAtIso ?? existing.dueAtIso,
    isCompleted,
    completedAtIso: isCompleted ? (existing.completedAtIso ?? updatedAtIso) : null,
    completedByUserId: isCompleted ? (existing.completedByUserId ?? authenticated.user.id) : null,
    updatedAtIso,
  });
  if (!task) {
    return { kind: "task_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: workspaceId,
    action: "JOB_TASK_UPDATED",
    summary: `${authenticated.user.displayName} updated a task on workspace ${workspace.name}`,
    createdAtIso: updatedAtIso,
    metadata: { taskId: task.id, isCompleted: task.isCompleted, workspaceId },
  });

  return { kind: "success", task };
}

export async function deleteDrawingWorkspaceTaskForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  workspaceId: string,
  taskId: string,
): Promise<{ kind: "success" } | WorkspaceNotFound | TaskNotFound> {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }
  const deleted = await repository.deleteDrawingTask(taskId, workspaceId, authenticated.company.id);
  if (!deleted) {
    return { kind: "task_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: workspaceId,
    action: "JOB_TASK_DELETED",
    summary: `${authenticated.user.displayName} deleted a task from workspace ${workspace.name}`,
    createdAtIso: new Date().toISOString(),
    metadata: { taskId, workspaceId },
  });

  return { kind: "success" };
}

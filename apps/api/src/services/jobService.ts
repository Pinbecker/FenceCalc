import { randomUUID } from "node:crypto";
import { buildDefaultJobCommercialInputs, type DrawingRecord, type JobRecord, type JobTaskRecord, type LayoutModel } from "@fence-estimator/contracts";

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
  sideNettings: []
};

interface JobMutationSuccess {
  kind: "success";
  job: JobRecord;
}

interface JobTaskMutationSuccess {
  kind: "success";
  task: JobTaskRecord;
}

type JobNotFound = { kind: "job_not_found" };
type DrawingNotFound = { kind: "drawing_not_found" };
type InvalidCustomer = { kind: "invalid_customer"; message: string };
type InvalidUser = { kind: "invalid_user"; message: string };
type TaskNotFound = { kind: "task_not_found" };

export type JobMutationResult = JobMutationSuccess | JobNotFound | InvalidCustomer | InvalidUser | DrawingNotFound;
export type JobTaskMutationResult = JobTaskMutationSuccess | JobNotFound | InvalidUser | TaskNotFound;
export type JobDeleteResult = { kind: "success" } | JobNotFound;

async function resolveCustomerForJob(repository: AppRepository, companyId: string, customerId: string) {
  const customer = await repository.getCustomerById(customerId, companyId);
  if (!customer) {
    return { kind: "invalid_customer" as const, message: "Customer not found" };
  }
  if (customer.isArchived) {
    return { kind: "invalid_customer" as const, message: "Archived customers cannot receive jobs" };
  }
  return { kind: "success" as const, customer };
}

async function resolveOwner(repository: AppRepository, companyId: string, ownerUserId: string | null) {
  if (!ownerUserId) {
    return { kind: "success" as const, ownerUserId: null };
  }
  const user = await repository.getUserById(ownerUserId, companyId);
  if (!user) {
    return { kind: "invalid_user" as const, message: "Assigned owner not found" };
  }
  return { kind: "success" as const, ownerUserId: user.id };
}

function buildNextJobDrawingName(job: JobRecord, drawingCount: number): string {
  return `${job.name} Drawing ${drawingCount + 1}`;
}

export async function createJobForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  input: { customerId: string; name: string; notes: string }
): Promise<JobMutationResult> {
  const customerResult = await resolveCustomerForJob(repository, authenticated.company.id, input.customerId);
  if (customerResult.kind !== "success") {
    return customerResult;
  }

  const estimateSeed = buildEstimate(EMPTY_LAYOUT);
  const nowIso = new Date().toISOString();
  const jobId = randomUUID();
  const drawingId = randomUUID();

  await repository.runInTransaction(async () => {
    await repository.createJob({
      id: jobId,
      companyId: authenticated.company.id,
      customerId: customerResult.customer.id,
      customerName: customerResult.customer.name,
      name: input.name,
      stage: "DRAFT",
      primaryDrawingId: null,
      commercialInputs: buildDefaultJobCommercialInputs(),
      notes: input.notes,
      ownerUserId: authenticated.user.id,
      createdByUserId: authenticated.user.id,
      updatedByUserId: authenticated.user.id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso
    });
    await repository.createDrawing({
      id: drawingId,
      companyId: authenticated.company.id,
      jobId,
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
      updatedAtIso: nowIso
    });
    await repository.setJobPrimaryDrawing({
      jobId,
      companyId: authenticated.company.id,
      drawingId,
      updatedByUserId: authenticated.user.id,
      updatedAtIso: nowIso
    });
  });

  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: job.id,
    action: "JOB_CREATED",
    summary: `${authenticated.user.displayName} created job ${job.name}`,
    createdAtIso: nowIso,
    metadata: { customerId: job.customerId, primaryDrawingId: drawingId }
  });
  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawingId,
    action: "DRAWING_CREATED",
    summary: `${authenticated.user.displayName} created ${input.name}`,
    createdAtIso: nowIso,
    metadata: { versionNumber: 1, jobId: job.id }
  });

  return { kind: "success", job };
}

export async function updateJobForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string,
  input: {
    name?: string | undefined;
    stage?: JobRecord["stage"] | undefined;
    commercialInputs?: JobRecord["commercialInputs"] | undefined;
    notes?: string | undefined;
    ownerUserId?: string | null | undefined;
    archived?: boolean | undefined;
  }
): Promise<JobMutationResult> {
  const existing = await repository.getJobById(jobId, authenticated.company.id);
  if (!existing) {
    return { kind: "job_not_found" };
  }

  const ownerResult =
    input.ownerUserId !== undefined ? await resolveOwner(repository, authenticated.company.id, input.ownerUserId) : null;
  if (ownerResult && ownerResult.kind !== "success") {
    return ownerResult;
  }

  const updatedAtIso = new Date().toISOString();
  const nextStage = input.stage ?? existing.stage;
  const stageChanged = input.stage !== undefined && input.stage !== existing.stage;
  const archived = input.archived ?? existing.isArchived;
  const archiveChanged = input.archived !== undefined && input.archived !== existing.isArchived;
  const job = await repository.updateJob({
    jobId: existing.id,
    companyId: authenticated.company.id,
    name: input.name ?? existing.name,
    stage: nextStage,
    commercialInputs: input.commercialInputs ?? existing.commercialInputs,
    notes: input.notes ?? existing.notes,
    ownerUserId: ownerResult?.ownerUserId ?? existing.ownerUserId,
    archived,
    archivedAtIso: archived ? (archiveChanged ? updatedAtIso : existing.archivedAtIso) : null,
    archivedByUserId: archived ? (archiveChanged ? authenticated.user.id : existing.archivedByUserId) : null,
    stageChangedAtIso: stageChanged ? updatedAtIso : existing.stageChangedAtIso,
    stageChangedByUserId: stageChanged ? authenticated.user.id : existing.stageChangedByUserId,
    updatedByUserId: authenticated.user.id,
    updatedAtIso
  });
  if (!job) {
    return { kind: "job_not_found" };
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
      entityId: job.id,
      action: "JOB_UPDATED",
      summary: `${authenticated.user.displayName} updated job ${job.name}`,
      createdAtIso: updatedAtIso
    });
  }

  if (stageChanged) {
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "JOB",
      entityId: job.id,
      action: "JOB_STAGE_CHANGED",
      summary: `${authenticated.user.displayName} changed ${job.name} from ${existing.stage} to ${nextStage}`,
      createdAtIso: updatedAtIso,
      metadata: { previousStage: existing.stage, newStage: nextStage }
    });
  }

  if (archiveChanged) {
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "JOB",
      entityId: job.id,
      action: archived ? "JOB_ARCHIVED" : "JOB_UNARCHIVED",
      summary: `${authenticated.user.displayName} ${archived ? "archived" : "restored"} job ${job.name}`,
      createdAtIso: updatedAtIso
    });
  }

  return { kind: "success", job };
}

export async function deleteJobForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string
): Promise<JobDeleteResult> {
  const existing = await repository.getJobById(jobId, authenticated.company.id);
  if (!existing) {
    return { kind: "job_not_found" };
  }

  await repository.deleteJob({
    jobId,
    companyId: authenticated.company.id
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: jobId,
    action: "JOB_DELETED",
    summary: `${authenticated.user.displayName} permanently deleted job ${existing.name}`,
    createdAtIso: new Date().toISOString()
  });

  return { kind: "success" };
}

export async function createJobDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string,
  input: { name?: string | undefined; sourceDrawingId?: string | undefined }
): Promise<DrawingMutationResult> {
  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "drawing_not_found" };
  }

  let sourceDrawing: DrawingRecord | null = null;
  if (input.sourceDrawingId) {
    sourceDrawing = await repository.getDrawingById(input.sourceDrawingId, authenticated.company.id);
    if (!sourceDrawing || sourceDrawing.jobId !== job.id) {
      return { kind: "drawing_not_found" };
    }
  }

  const existingDrawings = await repository.listDrawingsForJob(job.id, authenticated.company.id);
  return createDrawingForCompany(repository, authenticated, {
    name: input.name?.trim() || (sourceDrawing ? `${job.name} REV ${existingDrawings.length}` : buildNextJobDrawingName(job, existingDrawings.length)),
    customerId: job.customerId,
    jobId: job.id,
    layout: sourceDrawing?.layout ?? EMPTY_LAYOUT,
    savedViewport: sourceDrawing?.savedViewport ?? null
  });
}

export async function setJobPrimaryDrawingForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string,
  drawingId: string
): Promise<JobMutationResult> {
  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }
  const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!drawing || drawing.jobId !== job.id) {
    return { kind: "drawing_not_found" };
  }

  const updatedAtIso = new Date().toISOString();
  const updatedJob = await repository.setJobPrimaryDrawing({
    jobId,
    companyId: authenticated.company.id,
    drawingId,
    updatedByUserId: authenticated.user.id,
    updatedAtIso
  });
  if (!updatedJob) {
    return { kind: "job_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: updatedJob.id,
    action: "JOB_PRIMARY_DRAWING_CHANGED",
    summary: `${authenticated.user.displayName} changed the primary drawing for ${updatedJob.name}`,
    createdAtIso: updatedAtIso,
    metadata: { drawingId }
  });

  return { kind: "success", job: updatedJob };
}

export async function createJobTaskForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string,
  input: { title: string; description?: string | undefined; priority?: string | undefined; assignedUserId?: string | null | undefined; dueAtIso?: string | null | undefined }
): Promise<JobTaskMutationResult> {
  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }
  const ownerResult =
    input.assignedUserId !== undefined ? await resolveOwner(repository, authenticated.company.id, input.assignedUserId) : null;
  if (ownerResult && ownerResult.kind !== "success") {
    return ownerResult;
  }

  const nowIso = new Date().toISOString();
  const task = await repository.createJobTask({
    id: randomUUID(),
    companyId: authenticated.company.id,
    jobId,
    title: input.title,
    description: input.description ?? "",
    priority: input.priority ?? "NORMAL",
    assignedUserId: ownerResult?.ownerUserId ?? null,
    dueAtIso: input.dueAtIso ?? null,
    createdByUserId: authenticated.user.id,
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: jobId,
    action: "JOB_TASK_CREATED",
    summary: `${authenticated.user.displayName} added a task to ${job.name}`,
    createdAtIso: nowIso,
    metadata: { taskId: task.id, title: task.title }
  });

  return { kind: "success", task };
}

export async function updateJobTaskForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string,
  taskId: string,
  input: { title?: string | undefined; description?: string | undefined; priority?: string | undefined; assignedUserId?: string | null | undefined; dueAtIso?: string | null | undefined; isCompleted?: boolean | undefined }
): Promise<JobTaskMutationResult> {
  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }
  const tasks = await repository.listJobTasks(jobId, authenticated.company.id);
  const existing = tasks.find((task) => task.id === taskId);
  if (!existing) {
    return { kind: "task_not_found" };
  }
  const ownerResult =
    input.assignedUserId !== undefined ? await resolveOwner(repository, authenticated.company.id, input.assignedUserId) : null;
  if (ownerResult && ownerResult.kind !== "success") {
    return ownerResult;
  }

  const updatedAtIso = new Date().toISOString();
  const isCompleted = input.isCompleted ?? existing.isCompleted;
  const task = await repository.updateJobTask({
    taskId,
    companyId: authenticated.company.id,
    jobId,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    priority: input.priority ?? existing.priority,
    assignedUserId: ownerResult?.ownerUserId ?? existing.assignedUserId,
    dueAtIso: input.dueAtIso ?? existing.dueAtIso,
    isCompleted,
    completedAtIso: isCompleted ? existing.completedAtIso ?? updatedAtIso : null,
    completedByUserId: isCompleted ? existing.completedByUserId ?? authenticated.user.id : null,
    updatedAtIso
  });
  if (!task) {
    return { kind: "task_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: jobId,
    action: "JOB_TASK_UPDATED",
    summary: `${authenticated.user.displayName} updated a task on ${job.name}`,
    createdAtIso: updatedAtIso,
    metadata: { taskId: task.id, isCompleted: task.isCompleted }
  });

  return { kind: "success", task };
}

export async function deleteJobTaskForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  jobId: string,
  taskId: string
): Promise<{ kind: "success" } | { kind: "job_not_found" } | { kind: "task_not_found" }> {
  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }
  const deleted = await repository.deleteJobTask(taskId, jobId, authenticated.company.id);
  if (!deleted) {
    return { kind: "task_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "JOB",
    entityId: jobId,
    action: "JOB_TASK_DELETED",
    summary: `${authenticated.user.displayName} deleted a task from ${job.name}`,
    createdAtIso: new Date().toISOString(),
    metadata: { taskId }
  });

  return { kind: "success" };
}

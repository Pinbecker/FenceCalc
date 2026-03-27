import { randomUUID } from "node:crypto";
import { buildDefaultJobCommercialInputs, type DrawingCanvasViewport, type DrawingRecord, type DrawingStatus, type LayoutModel } from "@fence-estimator/contracts";

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

export type DrawingMutationResult =
  | DrawingMutationSuccess
  | DrawingConflict
  | DrawingNotFound
  | DrawingVersionNotFound
  | DrawingInvalidLayout
  | DrawingInvalidCustomer;

interface DrawingCreateInput {
  name: string;
  customerId: string;
  jobId?: string | undefined;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null | undefined;
}

interface DrawingUpdateInput {
  expectedVersionNumber: number;
  name?: string | undefined;
  customerId?: string | undefined;
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

async function resolveJobForWrite(repository: AppRepository, companyId: string, jobId: string) {
  const job = await repository.getJobById(jobId, companyId);
  if (!job) {
    return { kind: "invalid_customer" as const, message: "Job not found" };
  }
  if (job.isArchived) {
    return { kind: "invalid_customer" as const, message: "Archived jobs cannot receive new drawings" };
  }
  return { kind: "success" as const, job };
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
    let createdJobId: string | null = null;

    await repository.runInTransaction(async () => {
      let targetJobId = input.jobId ?? null;
      let jobHadPrimaryDrawing = false;

      if (targetJobId) {
        const jobResult = await resolveJobForWrite(repository, authenticated.company.id, targetJobId);
        if (jobResult.kind !== "success") {
          throw new Error(jobResult.message);
        }
        if (jobResult.job.customerId !== customerResult.customer.id) {
          throw new Error("Selected job belongs to a different customer");
        }
        jobHadPrimaryDrawing = jobResult.job.primaryDrawingId !== null;
      } else {
        const createdJob = await repository.createJob({
          id: randomUUID(),
          companyId: authenticated.company.id,
          customerId: customerResult.customer.id,
          customerName: customerResult.customer.name,
          name: input.name,
          stage: "DRAFT",
          primaryDrawingId: null,
          commercialInputs: buildDefaultJobCommercialInputs(),
          notes: "",
          ownerUserId: authenticated.user.id,
          createdByUserId: authenticated.user.id,
          updatedByUserId: authenticated.user.id,
          createdAtIso: nowIso,
          updatedAtIso: nowIso
        });
        targetJobId = createdJob.id;
        createdJobId = createdJob.id;
      }

      const createdDrawing = await repository.createDrawing({
        id: randomUUID(),
        companyId: authenticated.company.id,
        jobId: targetJobId,
        jobRole: jobHadPrimaryDrawing ? "SECONDARY" : "PRIMARY",
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
      if (!jobHadPrimaryDrawing && targetJobId) {
        await repository.setJobPrimaryDrawing({
          jobId: targetJobId,
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
    if (createdJobId) {
      await writeAuditLog(repository, {
        companyId: authenticated.company.id,
        actorUserId: authenticated.user.id,
        entityType: "JOB",
        entityId: createdJobId,
        action: "JOB_CREATED",
        summary: `${authenticated.user.displayName} created job ${input.name}`,
        createdAtIso: nowIso,
        metadata: {
          customerId: customerResult.customer.id,
          primaryDrawingId: drawing.id
        }
      });
    } else if (drawing.jobId) {
      await writeAuditLog(repository, {
        companyId: authenticated.company.id,
        actorUserId: authenticated.user.id,
        entityType: "JOB",
        entityId: drawing.jobId,
        action: "JOB_DRAWING_ADDED",
        summary: `${authenticated.user.displayName} added drawing ${drawing.name} to a job`,
        createdAtIso: nowIso,
        metadata: {
          drawingId: drawing.id
        }
      });
    }

    return { kind: "success", drawing };
  } catch (error) {
    const message = (error as Error).message;
    if (
      message === "Job not found" ||
      message === "Archived jobs cannot receive new drawings" ||
      message === "Selected job belongs to a different customer"
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
    const drawing = await repository.updateDrawing({
      drawingId: existing.id,
      companyId: authenticated.company.id,
      expectedVersionNumber: input.expectedVersionNumber,
      ...(existing.jobId !== undefined ? { jobId: existing.jobId } : {}),
      ...(existing.jobRole !== undefined ? { jobRole: existing.jobRole } : {}),
      name: input.name ?? existing.name,
      customerId: nextCustomer?.customer.id ?? existing.customerId,
      customerName: nextCustomer?.customer.name ?? existing.customerName,
      layout: nextLayout.layout,
      savedViewport: input.savedViewport ?? existing.savedViewport ?? null,
      estimate: nextLayout.estimate,
      schemaVersion: nextLayout.schemaVersion,
      rulesVersion: nextLayout.rulesVersion,
      updatedByUserId: authenticated.user.id,
      updatedAtIso: new Date().toISOString()
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
  if (drawing.jobId) {
    const job = await repository.getJobById(drawing.jobId, authenticated.company.id);
    if (job && job.stage !== input.status) {
      await repository.updateJob({
        jobId: job.id,
        companyId: authenticated.company.id,
        name: job.name,
        stage: input.status,
        commercialInputs: job.commercialInputs,
        notes: job.notes,
        ownerUserId: job.ownerUserId,
        archived: job.isArchived,
        archivedAtIso: job.archivedAtIso,
        archivedByUserId: job.archivedByUserId,
        stageChangedAtIso: updatedAtIso,
        stageChangedByUserId: authenticated.user.id,
        updatedByUserId: authenticated.user.id,
        updatedAtIso
      });
      await writeAuditLog(repository, {
        companyId: authenticated.company.id,
        actorUserId: authenticated.user.id,
        entityType: "JOB",
        entityId: job.id,
        action: "JOB_STAGE_CHANGED",
        summary: `${authenticated.user.displayName} changed ${job.name} from ${job.stage} to ${input.status}`,
        createdAtIso: updatedAtIso,
        metadata: { previousStage: job.stage, newStage: input.status }
      });
    }
  }
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
  | { kind: "not_archived" };

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

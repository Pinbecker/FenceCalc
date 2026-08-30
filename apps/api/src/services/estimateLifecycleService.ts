import { randomUUID } from "node:crypto";
import type {
  EstimateCommercialDraft,
  EstimateRecord,
  EstimateSummary,
  EstimateVersionRecord,
  EstimateVersionStatus,
} from "@fence-estimator/contracts";
import { buildDefaultPricingConfig } from "@fence-estimator/contracts";
import { buildCommercialEstimateCalculation } from "@fence-estimator/rules-engine";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AuthenticatedRequestContext } from "../authorization.js";
import type { AppRepository } from "../repository.js";
import { getCompanyConfigurationWorkspace } from "./companyConfigurationService.js";

export type LifecycleResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 404 | 409; message: string };

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

async function validateDesignRevisions(
  repository: AppRepository,
  companyId: string,
  projectId: string,
  revisionIds: string[],
  requireCurrentReadyDesigns: boolean,
): Promise<LifecycleResult<string[]>> {
  const normalized = uniqueIds(revisionIds);
  if (normalized.length === 0) {
    return { ok: false, status: 409, message: "Select at least one design revision" };
  }
  for (const revisionId of normalized) {
    const revision = await repository.getRevisionById(revisionId, companyId);
    if (!revision) {
      return { ok: false, status: 409, message: "A selected design revision no longer exists" };
    }
    const design = await repository.getDrawingById(revision.drawingId, companyId);
    if (!design || design.projectId !== projectId || design.isArchived) {
      return { ok: false, status: 409, message: "Every selected design must belong to this project" };
    }
    if (
      requireCurrentReadyDesigns &&
      (design.currentRevisionId !== revision.id || design.status !== "READY")
    ) {
      return {
        ok: false,
        status: 409,
        message: `“${design.name}” must be marked ready and use its latest revision before review`,
      };
    }
  }
  return { ok: true, value: normalized };
}

export async function listEstimatesForProjectForCompany(
  repository: AppRepository,
  companyId: string,
  projectId: string,
): Promise<EstimateSummary[]> {
  return repository.listEstimatesForProject(projectId, companyId);
}

export async function getEstimateForCompany(
  repository: AppRepository,
  companyId: string,
  estimateId: string,
): Promise<EstimateRecord | null> {
  return repository.getEstimateById(estimateId, companyId);
}

export async function listEstimateVersionsForCompany(
  repository: AppRepository,
  companyId: string,
  estimateId: string,
): Promise<EstimateVersionRecord[]> {
  return repository.listEstimateVersions(estimateId, companyId);
}

export async function getEstimateVersionForCompany(
  repository: AppRepository,
  companyId: string,
  versionId: string,
): Promise<EstimateVersionRecord | null> {
  return repository.getEstimateVersionById(versionId, companyId);
}

export async function createEstimateForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  input: { projectId: string; name: string; notes: string | null; designRevisionIds: string[] },
): Promise<LifecycleResult<{ estimate: EstimateRecord; version: EstimateVersionRecord }>> {
  const project = await repository.getProjectById(input.projectId, context.company.id);
  if (!project || project.isArchived) {
    return { ok: false, status: 404, message: "Active project not found" };
  }
  if (!project.siteId) {
    return { ok: false, status: 409, message: "Assign a site before creating an estimate" };
  }
  const revisions = await validateDesignRevisions(
    repository,
    context.company.id,
    project.id,
    input.designRevisionIds,
    false,
  );
  if (!revisions.ok) return revisions;

  const now = new Date().toISOString();
  const sequence = await repository.nextCompanySequence(
    context.company.id,
    `ESTIMATE:${now.slice(0, 4)}`,
  );
  const reference = `E-${now.slice(0, 4)}-${String(sequence).padStart(4, "0")}`;
  const estimateId = randomUUID();
  const versionId = randomUUID();
  const estimate = await repository.createEstimate({
    estimateId,
    versionId,
    companyId: context.company.id,
    projectId: project.id,
    reference,
    name: input.name.trim(),
    notes: nullableText(input.notes),
    designRevisionIds: revisions.value,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  if (project.status === "ENQUIRY" || project.status === "SURVEY") {
    await repository.setProjectStatus({
      projectId: project.id,
      companyId: context.company.id,
      status: "ESTIMATING",
      statusChangedAtIso: now,
      statusChangedByUserId: context.user.id,
      updatedByUserId: context.user.id,
      updatedAtIso: now,
    });
  }
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "ESTIMATE",
    entityId: estimate.id,
    action: "ESTIMATE_CREATED",
    summary: `${context.user.displayName} created estimate ${estimate.reference}`,
    createdAtIso: now,
    metadata: { projectId: project.id, version: 1 },
  });
  const version = (await repository.getEstimateVersionById(versionId, context.company.id))!;
  return { ok: true, value: { estimate, version } };
}

export async function updateEstimateVersionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  versionId: string,
  patch: { notes?: string | null; designRevisionIds?: string[] },
): Promise<LifecycleResult<EstimateVersionRecord>> {
  const version = await repository.getEstimateVersionById(versionId, context.company.id);
  if (!version) return { ok: false, status: 404, message: "Estimate version not found" };
  const estimate = await repository.getEstimateById(version.estimateId, context.company.id);
  if (!estimate) return { ok: false, status: 404, message: "Estimate not found" };
  if (estimate.currentVersionId !== version.id || version.status !== "DRAFT") {
    return { ok: false, status: 409, message: "Only the current draft estimate can be edited" };
  }
  let revisionIds: string[] | undefined;
  if (patch.designRevisionIds) {
    const validated = await validateDesignRevisions(
      repository,
      context.company.id,
      estimate.projectId,
      patch.designRevisionIds,
      false,
    );
    if (!validated.ok) return validated;
    revisionIds = validated.value;
  }
  const now = new Date().toISOString();
  const updated = await repository.updateEstimateVersion({
    estimateVersionId: version.id,
    companyId: context.company.id,
    ...(patch.notes !== undefined ? { notes: nullableText(patch.notes) } : {}),
    ...(revisionIds ? { designRevisionIds: revisionIds } : {}),
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!updated) return { ok: false, status: 409, message: "Estimate version is no longer editable" };
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "ESTIMATE",
    entityId: estimate.id,
    action: "ESTIMATE_UPDATED",
    summary: `${context.user.displayName} updated ${estimate.reference} version ${version.versionNumber}`,
    createdAtIso: now,
  });
  return { ok: true, value: updated };
}

export async function calculateEstimateVersionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  versionId: string,
  commercialDraft: EstimateCommercialDraft,
): Promise<LifecycleResult<EstimateVersionRecord>> {
  const version = await repository.getEstimateVersionById(versionId, context.company.id);
  if (!version) return { ok: false, status: 404, message: "Estimate version not found" };
  const estimate = await repository.getEstimateById(version.estimateId, context.company.id);
  if (!estimate) return { ok: false, status: 404, message: "Estimate not found" };
  if (estimate.currentVersionId !== version.id || version.status !== "DRAFT") {
    return { ok: false, status: 409, message: "Only the current draft estimate can be recalculated" };
  }

  const designs = [];
  for (const selection of version.designRevisionSelections) {
    const revision = await repository.getRevisionById(selection.drawingRevisionId, context.company.id);
    const drawing = await repository.getDrawingById(selection.drawingId, context.company.id);
    if (!revision || !drawing || drawing.projectId !== estimate.projectId) {
      return { ok: false, status: 409, message: "A selected design revision is no longer available" };
    }
    designs.push({
      id: drawing.id,
      name: drawing.name,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      layout: revision.layout,
      estimate: revision.estimate,
    });
  }

  const pricingConfig =
    (await repository.getPricingConfig(context.company.id)) ??
    buildDefaultPricingConfig(context.company.id, null);
  const configurationWorkspace = await getCompanyConfigurationWorkspace(
    repository,
    context.company.id,
    context.user.id,
  );
  const publishedConfiguration = configurationWorkspace.published;
  const calculated = buildCommercialEstimateCalculation(
    designs,
    pricingConfig,
    commercialDraft.ancillaryItems,
    commercialDraft.manualEntries,
    { externalCornersEnabled: commercialDraft.externalCornersEnabled },
  );
  const calculation = {
    ...calculated,
    configurationVersionId: publishedConfiguration?.id ?? null,
    configurationVersionNumber: publishedConfiguration?.versionNumber ?? null,
  };
  const now = new Date().toISOString();
  const updated = await repository.setEstimateVersionCalculation({
    estimateVersionId: version.id,
    companyId: context.company.id,
    commercialDraft,
    calculation,
    calculatedAtIso: now,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!updated) return { ok: false, status: 409, message: "Estimate version is no longer editable" };
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "ESTIMATE",
    entityId: estimate.id,
    action: "ESTIMATE_CALCULATED",
    summary: `${context.user.displayName} calculated ${estimate.reference} version ${version.versionNumber}`,
    createdAtIso: now,
    metadata: { total: calculation.totals.totalCost, designs: designs.length },
  });
  return { ok: true, value: updated };
}

const ESTIMATE_TRANSITIONS: Record<EstimateVersionStatus, EstimateVersionStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: [],
  SUPERSEDED: [],
};

export async function setEstimateVersionStatusForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  versionId: string,
  status: EstimateVersionStatus,
): Promise<LifecycleResult<EstimateVersionRecord>> {
  const version = await repository.getEstimateVersionById(versionId, context.company.id);
  if (!version) return { ok: false, status: 404, message: "Estimate version not found" };
  const estimate = await repository.getEstimateById(version.estimateId, context.company.id);
  if (!estimate) return { ok: false, status: 404, message: "Estimate not found" };
  if (estimate.currentVersionId !== version.id) {
    return { ok: false, status: 409, message: "Historical estimate versions are immutable" };
  }
  if (!ESTIMATE_TRANSITIONS[version.status].includes(status)) {
    return { ok: false, status: 409, message: `Cannot move an estimate from ${version.status} to ${status}` };
  }
  if (status === "IN_REVIEW") {
    if (!version.calculation) {
      return { ok: false, status: 409, message: "Calculate the estimate before submitting it for review" };
    }
    if (version.calculation.totals.totalCost <= 0) {
      return { ok: false, status: 409, message: "The calculated estimate total must be greater than zero" };
    }
    const validated = await validateDesignRevisions(
      repository,
      context.company.id,
      estimate.projectId,
      version.designRevisionSelections.map((selection) => selection.drawingRevisionId),
      true,
    );
    if (!validated.ok) return validated;
  }
  const now = new Date().toISOString();
  const updated = await repository.setEstimateVersionStatus({
    estimateVersionId: version.id,
    companyId: context.company.id,
    status,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!updated) return { ok: false, status: 409, message: "Estimate status was not changed" };
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "ESTIMATE",
    entityId: estimate.id,
    action: "ESTIMATE_STATUS_CHANGED",
    summary: `${context.user.displayName} changed ${estimate.reference} version ${version.versionNumber} to ${status}`,
    createdAtIso: now,
    metadata: { status, version: version.versionNumber },
  });
  return { ok: true, value: updated };
}

export async function createEstimateVersionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  estimateId: string,
  input: { notes: string | null; designRevisionIds?: string[] },
): Promise<LifecycleResult<EstimateVersionRecord>> {
  const estimate = await repository.getEstimateById(estimateId, context.company.id);
  if (!estimate) return { ok: false, status: 404, message: "Estimate not found" };
  const parent = await repository.getEstimateVersionById(estimate.currentVersionId, context.company.id);
  if (!parent || parent.status !== "APPROVED") {
    return { ok: false, status: 409, message: "Approve the current estimate before starting a new version" };
  }
  const requested = input.designRevisionIds ?? parent.designRevisionSelections.map((item) => item.drawingRevisionId);
  const validated = await validateDesignRevisions(
    repository,
    context.company.id,
    estimate.projectId,
    requested,
    false,
  );
  if (!validated.ok) return validated;
  const now = new Date().toISOString();
  const version = await repository.createEstimateVersion({
    estimateId: estimate.id,
    versionId: randomUUID(),
    companyId: context.company.id,
    versionNumber: estimate.latestVersionNumber + 1,
    parentVersionId: parent.id,
    notes: nullableText(input.notes),
    designRevisionIds: validated.value,
    commercialDraft: parent.commercialDraft,
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "ESTIMATE",
    entityId: estimate.id,
    action: "ESTIMATE_VERSION_CREATED",
    summary: `${context.user.displayName} started ${estimate.reference} version ${version.versionNumber}`,
    createdAtIso: now,
    metadata: { version: version.versionNumber },
  });
  return { ok: true, value: version };
}

export async function setEstimateArchivedForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  estimateId: string,
  archived: boolean,
): Promise<LifecycleResult<EstimateRecord>> {
  const now = new Date().toISOString();
  const estimate = await repository.setEstimateArchivedState({
    estimateId,
    companyId: context.company.id,
    archived,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!estimate) return { ok: false, status: 404, message: "Estimate not found" };
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "ESTIMATE",
    entityId: estimate.id,
    action: archived ? "ESTIMATE_ARCHIVED" : "ESTIMATE_UNARCHIVED",
    summary: `${context.user.displayName} ${archived ? "archived" : "restored"} ${estimate.reference}`,
    createdAtIso: now,
  });
  return { ok: true, value: estimate };
}

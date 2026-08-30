import { randomUUID } from "node:crypto";

import type { ProjectRecord, ProjectStatus, ProjectSummary } from "@fence-estimator/contracts";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AuthenticatedRequestContext } from "../authorization.js";
import type { AppRepository, ScopeFilter } from "../repository.js";

interface ProjectCreateInput {
  customerId: string;
  siteId: string;
  name: string;
  scope: string | null;
  targetDateIso: string | null;
  notes: string | null;
}

interface ProjectPatch {
  name?: string;
  siteId?: string;
  scope?: string | null;
  targetDateIso?: string | null;
  notes?: string | null;
}

function nullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function listProjectsForCompany(
  repository: AppRepository,
  companyId: string,
  options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
): Promise<ProjectSummary[]> {
  return repository.listProjects(companyId, options);
}

export async function getProjectForCompany(
  repository: AppRepository,
  companyId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  return repository.getProjectById(projectId, companyId);
}

export async function createProjectForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  input: ProjectCreateInput,
): Promise<ProjectRecord | null> {
  const customer = await repository.getCustomerById(input.customerId, context.company.id);
  if (!customer || customer.isArchived) {
    return null;
  }
  const site = await repository.getSiteById(input.siteId, context.company.id);
  if (!site || site.customerId !== customer.id || site.isArchived) {
    return null;
  }
  const now = new Date().toISOString();
  const sequence = await repository.nextCompanySequence(
    context.company.id,
    `PROJECT:${now.slice(0, 4)}`,
  );
  const reference = `P-${now.slice(0, 4)}-${String(sequence).padStart(4, "0")}`;
  const project = await repository.createProject({
    id: randomUUID(),
    companyId: context.company.id,
    customerId: customer.id,
    siteId: site.id,
    reference,
    name: input.name.trim(),
    status: "ENQUIRY",
    scope: nullableText(input.scope),
    targetDateIso: input.targetDateIso,
    notes: nullableText(input.notes),
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "PROJECT",
    entityId: project.id,
    action: "PROJECT_CREATED",
    summary: `${context.user.displayName} created project “${project.name}” for ${customer.name}`,
    createdAtIso: now,
  });
  return project;
}

export async function updateProjectForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  projectId: string,
  patch: ProjectPatch,
): Promise<ProjectRecord | null> {
  const now = new Date().toISOString();
  if (patch.siteId !== undefined) {
    const [project, site] = await Promise.all([
      repository.getProjectById(projectId, context.company.id),
      repository.getSiteById(patch.siteId, context.company.id),
    ]);
    if (!project || !site || site.customerId !== project.customerId || site.isArchived) {
      return null;
    }
  }
  const updated = await repository.updateProject({
    projectId,
    companyId: context.company.id,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.siteId !== undefined ? { siteId: patch.siteId } : {}),
    ...(patch.scope !== undefined ? { scope: nullableText(patch.scope) } : {}),
    ...(patch.targetDateIso !== undefined ? { targetDateIso: patch.targetDateIso } : {}),
    ...(patch.notes !== undefined ? { notes: nullableText(patch.notes) } : {}),
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (updated) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "PROJECT",
      entityId: updated.id,
      action: "PROJECT_UPDATED",
      summary: `${context.user.displayName} updated project “${updated.name}”`,
      createdAtIso: now,
    });
  }
  return updated;
}

export async function setProjectStatusForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  projectId: string,
  status: ProjectStatus,
): Promise<ProjectRecord | null> {
  const now = new Date().toISOString();
  const result = await repository.setProjectStatus({
    projectId,
    companyId: context.company.id,
    status,
    statusChangedAtIso: now,
    statusChangedByUserId: context.user.id,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (result) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "PROJECT",
      entityId: result.id,
      action: "PROJECT_STATUS_CHANGED",
      summary: `${context.user.displayName} set status of “${result.name}” to ${status}`,
      createdAtIso: now,
      metadata: { status },
    });
  }
  return result;
}

export async function setProjectArchivedForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  projectId: string,
  archived: boolean,
): Promise<ProjectRecord | null> {
  const now = new Date().toISOString();
  const result = await repository.setProjectArchivedState({
    projectId,
    companyId: context.company.id,
    archived,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (result) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "PROJECT",
      entityId: result.id,
      action: archived ? "PROJECT_ARCHIVED" : "PROJECT_UNARCHIVED",
      summary: `${context.user.displayName} ${archived ? "archived" : "restored"} project “${result.name}”`,
      createdAtIso: now,
    });
  }
  return result;
}

export async function deleteProjectForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  projectId: string,
): Promise<boolean> {
  const existing = await repository.getProjectById(projectId, context.company.id);
  if (!existing) {
    return false;
  }
  const ok = await repository.deleteProject({ projectId, companyId: context.company.id });
  if (ok) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "PROJECT",
      entityId: projectId,
      action: "PROJECT_DELETED",
      summary: `${context.user.displayName} deleted project “${existing.name}”`,
      createdAtIso: new Date().toISOString(),
    });
  }
  return ok;
}

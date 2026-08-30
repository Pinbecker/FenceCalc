import { randomUUID } from "node:crypto";

import type {
  CompanyConfigurationDefinition,
  CompanyConfigurationPreviewFact,
  CompanyConfigurationPreviewResult,
  CompanyConfigurationWorkspace,
  CompanyConfigurationVersionRecord,
} from "@fence-estimator/contracts";
import {
  buildDefaultPricingConfig,
  buildDefaultPricingWorkbookConfig,
  pricingWorkbookConfigSchema,
} from "@fence-estimator/contracts";
import {
  buildCompanyConfigurationFromWorkbook,
  buildCompanyConfigurationTemplate,
  compileCompanyConfiguration,
  COMPANY_CONFIGURATION_TEMPLATES,
  previewCompanyConfiguration,
} from "@fence-estimator/rules-engine";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AppRepository } from "../repository.js";

async function createInitialWorkspace(
  repository: AppRepository,
  companyId: string,
  userId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const pricing =
    (await repository.getPricingConfig(companyId)) ?? buildDefaultPricingConfig(companyId, userId);
  const workbook = pricing.workbook ?? buildDefaultPricingWorkbookConfig();
  const definition = buildCompanyConfigurationFromWorkbook(workbook);

  await repository.runInTransaction(async () => {
    await repository.createCompanyConfigurationVersion({
      id: randomUUID(),
      companyId,
      versionNumber: 1,
      status: "PUBLISHED",
      definition,
      compiledWorkbook: workbook,
      changeNote: "Existing company pricing baseline",
      createdByUserId: userId,
      updatedByUserId: userId,
      publishedByUserId: userId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      publishedAtIso: nowIso,
    });
    await repository.createCompanyConfigurationVersion({
      id: randomUUID(),
      companyId,
      versionNumber: 2,
      status: "DRAFT",
      definition: structuredClone(definition),
      compiledWorkbook: structuredClone(workbook),
      changeNote: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      publishedByUserId: null,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      publishedAtIso: null,
    });
    if (!pricing.workbook) {
      await repository.upsertPricingConfig({
        companyId,
        items: pricing.items,
        workbook,
        updatedAtIso: nowIso,
        updatedByUserId: userId,
      });
    }
  });
}

export async function getCompanyConfigurationWorkspace(
  repository: AppRepository,
  companyId: string,
  userId: string,
): Promise<CompanyConfigurationWorkspace> {
  let draft = await repository.getCompanyConfigurationVersionByStatus(companyId, "DRAFT");
  if (!draft) {
    await createInitialWorkspace(repository, companyId, userId);
    draft = await repository.getCompanyConfigurationVersionByStatus(companyId, "DRAFT");
  }
  if (!draft) throw new Error("Company configuration draft could not be initialized");
  const [published, history] = await Promise.all([
    repository.getCompanyConfigurationVersionByStatus(companyId, "PUBLISHED"),
    repository.listCompanyConfigurationVersions(companyId),
  ]);
  return { draft, published, history, templates: COMPANY_CONFIGURATION_TEMPLATES };
}

function compileAndValidate(definition: CompanyConfigurationDefinition) {
  return pricingWorkbookConfigSchema.parse(compileCompanyConfiguration(definition));
}

export async function updateCompanyConfigurationDraft(
  repository: AppRepository,
  companyId: string,
  userId: string,
  definition: CompanyConfigurationDefinition,
  changeNote: string | null,
): Promise<CompanyConfigurationWorkspace> {
  const workspace = await getCompanyConfigurationWorkspace(repository, companyId, userId);
  const nowIso = new Date().toISOString();
  const compiledWorkbook = compileAndValidate(definition);
  const updated = await repository.updateCompanyConfigurationDraft({
    id: workspace.draft.id,
    companyId,
    definition,
    compiledWorkbook,
    changeNote,
    updatedByUserId: userId,
    updatedAtIso: nowIso,
  });
  if (!updated) throw new Error("Only the active draft configuration can be edited");
  await writeAuditLog(repository, {
    companyId,
    actorUserId: userId,
    entityType: "CONFIGURATION",
    entityId: updated.id,
    action: "CONFIGURATION_DRAFT_UPDATED",
    summary: `Updated company configuration draft version ${updated.versionNumber}`,
    createdAtIso: nowIso,
  });
  return getCompanyConfigurationWorkspace(repository, companyId, userId);
}

export async function cloneCompanyConfigurationTemplate(
  repository: AppRepository,
  companyId: string,
  userId: string,
  templateId: string,
): Promise<CompanyConfigurationWorkspace | null> {
  const template = buildCompanyConfigurationTemplate(templateId);
  if (!template) return null;
  const workspace = await updateCompanyConfigurationDraft(
    repository,
    companyId,
    userId,
    template,
    `Cloned ${template.name}`,
  );
  await writeAuditLog(repository, {
    companyId,
    actorUserId: userId,
    entityType: "CONFIGURATION",
    entityId: workspace.draft.id,
    action: "CONFIGURATION_TEMPLATE_CLONED",
    summary: `Cloned configuration template ${template.name}`,
    createdAtIso: new Date().toISOString(),
    metadata: { templateId },
  });
  return workspace;
}

export function previewConfiguration(
  definition: CompanyConfigurationDefinition,
  facts: CompanyConfigurationPreviewFact[],
): CompanyConfigurationPreviewResult {
  return previewCompanyConfiguration(definition, facts);
}

export async function publishCompanyConfiguration(
  repository: AppRepository,
  companyId: string,
  userId: string,
  changeNote: string,
  facts: CompanyConfigurationPreviewFact[],
): Promise<CompanyConfigurationWorkspace> {
  const workspace = await getCompanyConfigurationWorkspace(repository, companyId, userId);
  const drawingQuantityKeys = new Set(
    workspace.draft.definition.assemblies.flatMap((assembly) =>
      assembly.enabled && assembly.quantitySource.kind === "DRAWING_QUANTITY"
        ? [assembly.quantitySource.quantityKey]
        : [],
    ),
  );
  if (
    drawingQuantityKeys.size > 0 &&
    !facts.some((fact) => drawingQuantityKeys.has(fact.quantityKey) && fact.quantity > 0)
  ) {
    throw new Error(
      "Test the saved draft with at least one positive drawing quantity before publishing",
    );
  }
  const preview = previewCompanyConfiguration(workspace.draft.definition, facts);
  if (!preview.canPublish || preview.errors.length > 0) {
    throw new Error(preview.errors.join("; ") || "Configuration cannot be published");
  }
  const compiledWorkbook = compileAndValidate(workspace.draft.definition);
  const nowIso = new Date().toISOString();
  let published: CompanyConfigurationVersionRecord | null = null;

  await repository.runInTransaction(async () => {
    if (workspace.published) {
      await repository.setCompanyConfigurationVersionStatus({
        id: workspace.published.id,
        companyId,
        status: "SUPERSEDED",
        changeNote: workspace.published.changeNote,
        updatedByUserId: userId,
        updatedAtIso: nowIso,
        publishedByUserId: workspace.published.publishedByUserId,
        publishedAtIso: workspace.published.publishedAtIso,
      });
    }
    published = await repository.setCompanyConfigurationVersionStatus({
      id: workspace.draft.id,
      companyId,
      status: "PUBLISHED",
      changeNote,
      updatedByUserId: userId,
      updatedAtIso: nowIso,
      publishedByUserId: userId,
      publishedAtIso: nowIso,
    });
    if (!published) throw new Error("Configuration draft changed before it could be published");
    const currentPricing =
      (await repository.getPricingConfig(companyId)) ??
      buildDefaultPricingConfig(companyId, userId);
    await repository.upsertPricingConfig({
      companyId,
      items: currentPricing.items,
      workbook: compiledWorkbook,
      updatedAtIso: nowIso,
      updatedByUserId: userId,
    });
    await repository.createCompanyConfigurationVersion({
      id: randomUUID(),
      companyId,
      versionNumber: workspace.draft.versionNumber + 1,
      status: "DRAFT",
      definition: structuredClone(workspace.draft.definition),
      compiledWorkbook: structuredClone(compiledWorkbook),
      changeNote: null,
      createdByUserId: userId,
      updatedByUserId: userId,
      publishedByUserId: null,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      publishedAtIso: null,
    });
  });

  await writeAuditLog(repository, {
    companyId,
    actorUserId: userId,
    entityType: "CONFIGURATION",
    entityId: published!.id,
    action: "CONFIGURATION_PUBLISHED",
    summary: `Published company configuration version ${published!.versionNumber}`,
    createdAtIso: nowIso,
    metadata: {
      catalogueItems: workspace.draft.definition.catalogueItems.length,
      assemblies: workspace.draft.definition.assemblies.length,
    },
  });
  return getCompanyConfigurationWorkspace(repository, companyId, userId);
}

import { randomUUID } from "node:crypto";
import type {
  CommercialEstimateCalculation,
  QuoteDocumentContext,
  QuoteDisplayMode,
  QuotePresentationSnapshot,
  QuoteRecord,
  QuoteSummary,
  QuoteVersionRecord,
  QuoteVersionStatus,
} from "@fence-estimator/contracts";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AuthenticatedRequestContext } from "../authorization.js";
import type { AppRepository } from "../repository.js";
import type { LifecycleResult } from "./estimateLifecycleService.js";

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getApprovedEstimateVersion(
  repository: AppRepository,
  companyId: string,
  versionId: string,
) {
  const version = await repository.getEstimateVersionById(versionId, companyId);
  if (!version || version.status !== "APPROVED" || !version.calculation) return null;
  const estimate = await repository.getEstimateById(version.estimateId, companyId);
  if (!estimate || estimate.isArchived || estimate.currentVersionId !== version.id) return null;
  return { estimate, version };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildQuotePresentation(
  calculation: CommercialEstimateCalculation,
  displayMode?: QuoteDisplayMode,
  vatRate?: number,
  document?: QuoteDocumentContext,
): QuotePresentationSnapshot {
  const mode = displayMode ?? calculation.workbook.settings.quoteDisplayMode ?? "SUMMARY";
  const rate = vatRate ?? calculation.workbook.settings.vatRate ?? 20;
  const netTotal = roundMoney(calculation.totals.totalCost);
  const vatAmount = roundMoney(netTotal * (rate / 100));
  return {
    displayMode: mode,
    currencyCode: "GBP",
    sections:
      mode === "TOTAL_ONLY"
        ? []
        : calculation.groups.map((group) => ({
            key: group.key,
            title:
              group.key === "commercial"
                ? "Project delivery"
                : group.key === "ancillary-items"
                  ? "Additional works"
                  : group.title,
            amount: group.subtotalCost,
            rows:
              mode === "DETAILED"
                ? group.key === "commercial"
                  ? [
                      {
                        description: "Project delivery and attendance",
                        quantity: 1,
                        unit: "item",
                        amount: group.subtotalCost,
                      },
                    ]
                  : group.rows.map((row) => ({
                      description: row.itemName,
                      quantity: row.quantity,
                      unit: row.unit,
                      amount: row.totalCost,
                    }))
                : [],
          })),
    netTotal,
    vatRate: rate,
    vatAmount,
    grossTotal: roundMoney(netTotal + vatAmount),
    ...(document ? { document } : {}),
  };
}

export async function buildQuoteDocumentContext(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  projectId: string,
): Promise<QuoteDocumentContext | null> {
  const project = await repository.getProjectById(projectId, context.company.id);
  if (!project) return null;
  const [customer, site] = await Promise.all([
    repository.getCustomerById(project.customerId, context.company.id),
    project.siteId
      ? repository.getSiteById(project.siteId, context.company.id)
      : Promise.resolve(null),
  ]);
  if (!customer) return null;
  return {
    sellerName: context.company.name,
    preparedByName: context.user.displayName,
    customerName: customer.name,
    customerContactName: customer.contactName,
    customerEmail: customer.contactEmail,
    customerPhone: customer.contactPhone,
    projectReference: project.reference,
    projectName: project.name,
    projectScope: project.scope,
    siteName: site?.name ?? null,
    siteAddressLines: site
      ? [
          site.addressLine1,
          site.addressLine2,
          site.city,
          site.county,
          site.postcode,
          site.countryCode,
        ].filter((line): line is string => Boolean(line?.trim()))
      : customer.siteAddress
        ? [customer.siteAddress]
        : [],
  };
}

export async function listQuotesForProjectForCompany(
  repository: AppRepository,
  companyId: string,
  projectId: string,
): Promise<QuoteSummary[]> {
  return repository.listQuotesForProject(projectId, companyId);
}

export async function getQuoteForCompany(
  repository: AppRepository,
  companyId: string,
  quoteId: string,
): Promise<QuoteRecord | null> {
  return repository.getQuoteById(quoteId, companyId);
}

export async function listQuoteVersionsForCompany(
  repository: AppRepository,
  companyId: string,
  quoteId: string,
): Promise<QuoteVersionRecord[]> {
  return repository.listQuoteVersions(quoteId, companyId);
}

export async function getQuoteVersionForCompany(
  repository: AppRepository,
  companyId: string,
  versionId: string,
): Promise<QuoteVersionRecord | null> {
  return repository.getQuoteVersionById(versionId, companyId);
}

export async function createQuoteForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  input: {
    estimateVersionId: string;
    name: string;
    title: string;
    customerMessage: string | null;
    validUntilIso: string | null;
    displayMode?: QuoteDisplayMode;
    vatRate?: number;
  },
): Promise<LifecycleResult<{ quote: QuoteRecord; version: QuoteVersionRecord }>> {
  const approved = await getApprovedEstimateVersion(
    repository,
    context.company.id,
    input.estimateVersionId,
  );
  if (!approved) {
    return {
      ok: false,
      status: 409,
      message: "Create a quote from the current approved estimate version",
    };
  }
  const project = await repository.getProjectById(approved.estimate.projectId, context.company.id);
  if (!project || project.isArchived) {
    return { ok: false, status: 404, message: "Active project not found" };
  }
  const now = new Date().toISOString();
  const sequence = await repository.nextCompanySequence(
    context.company.id,
    `QUOTE:${now.slice(0, 4)}`,
  );
  const reference = `Q-${now.slice(0, 4)}-${String(sequence).padStart(4, "0")}`;
  const quoteId = randomUUID();
  const versionId = randomUUID();
  const document = await buildQuoteDocumentContext(repository, context, project.id);
  const quote = await repository.createQuote({
    quoteId,
    versionId,
    companyId: context.company.id,
    projectId: project.id,
    estimateId: approved.estimate.id,
    estimateVersionId: approved.version.id,
    reference,
    name: input.name.trim(),
    title: input.title.trim(),
    customerMessage: nullableText(input.customerMessage),
    validUntilIso: input.validUntilIso,
    presentation: buildQuotePresentation(
      approved.version.calculation!,
      input.displayMode,
      input.vatRate,
      document ?? undefined,
    ),
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: "QUOTE_CREATED",
    summary: `${context.user.displayName} created quote ${quote.reference}`,
    createdAtIso: now,
    metadata: { estimateId: approved.estimate.id, estimateVersion: approved.version.versionNumber },
  });
  const version = (await repository.getQuoteVersionById(versionId, context.company.id))!;
  return { ok: true, value: { quote, version } };
}

export async function updateQuoteVersionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  versionId: string,
  patch: {
    estimateVersionId?: string;
    title?: string;
    customerMessage?: string | null;
    validUntilIso?: string | null;
    displayMode?: QuoteDisplayMode;
    vatRate?: number;
  },
): Promise<LifecycleResult<QuoteVersionRecord>> {
  const version = await repository.getQuoteVersionById(versionId, context.company.id);
  if (!version) return { ok: false, status: 404, message: "Quote version not found" };
  const quote = await repository.getQuoteById(version.quoteId, context.company.id);
  if (!quote) return { ok: false, status: 404, message: "Quote not found" };
  if (quote.currentVersionId !== version.id || version.status !== "DRAFT") {
    return { ok: false, status: 409, message: "Only the current draft quote can be edited" };
  }
  if (patch.estimateVersionId) {
    const approved = await getApprovedEstimateVersion(
      repository,
      context.company.id,
      patch.estimateVersionId,
    );
    if (!approved || approved.estimate.id !== quote.estimateId) {
      return {
        ok: false,
        status: 409,
        message: "Quote versions must use an approved version of the same estimate",
      };
    }
  }
  const now = new Date().toISOString();
  const targetEstimateVersionId = patch.estimateVersionId ?? version.estimateVersionId;
  const targetEstimateVersion = await repository.getEstimateVersionById(
    targetEstimateVersionId,
    context.company.id,
  );
  if (!targetEstimateVersion?.calculation) {
    return { ok: false, status: 409, message: "The linked estimate has no approved calculation" };
  }
  const document = await buildQuoteDocumentContext(repository, context, quote.projectId);
  const updated = await repository.updateQuoteVersion({
    quoteVersionId: version.id,
    companyId: context.company.id,
    ...(patch.estimateVersionId !== undefined
      ? { estimateVersionId: patch.estimateVersionId }
      : {}),
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.customerMessage !== undefined
      ? { customerMessage: nullableText(patch.customerMessage) }
      : {}),
    ...(patch.validUntilIso !== undefined ? { validUntilIso: patch.validUntilIso } : {}),
    ...(patch.displayMode !== undefined ||
    patch.vatRate !== undefined ||
    patch.estimateVersionId !== undefined
      ? {
          presentation: buildQuotePresentation(
            targetEstimateVersion.calculation,
            patch.displayMode ?? version.presentation.displayMode,
            patch.vatRate ?? version.presentation.vatRate,
            document ?? version.presentation.document,
          ),
        }
      : {}),
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!updated) return { ok: false, status: 409, message: "Quote is no longer editable" };
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: "QUOTE_UPDATED",
    summary: `${context.user.displayName} updated ${quote.reference} version ${version.versionNumber}`,
    createdAtIso: now,
  });
  return { ok: true, value: updated };
}

const QUOTE_TRANSITIONS: Record<QuoteVersionStatus, QuoteVersionStatus[]> = {
  DRAFT: ["ISSUED"],
  ISSUED: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  SUPERSEDED: [],
};

export async function setQuoteVersionStatusForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  versionId: string,
  status: QuoteVersionStatus,
): Promise<LifecycleResult<QuoteVersionRecord>> {
  const version = await repository.getQuoteVersionById(versionId, context.company.id);
  if (!version) return { ok: false, status: 404, message: "Quote version not found" };
  const quote = await repository.getQuoteById(version.quoteId, context.company.id);
  if (!quote) return { ok: false, status: 404, message: "Quote not found" };
  if (quote.currentVersionId !== version.id) {
    return { ok: false, status: 409, message: "Historical quote versions are immutable" };
  }
  if (!QUOTE_TRANSITIONS[version.status].includes(status)) {
    return {
      ok: false,
      status: 409,
      message: `Cannot move a quote from ${version.status} to ${status}`,
    };
  }
  if (status === "ISSUED") {
    const approved = await getApprovedEstimateVersion(
      repository,
      context.company.id,
      version.estimateVersionId,
    );
    if (!approved || approved.estimate.id !== quote.estimateId) {
      return {
        ok: false,
        status: 409,
        message: "The linked estimate must still be approved before issue",
      };
    }
    if (version.validUntilIso && version.validUntilIso < new Date().toISOString().slice(0, 10)) {
      return { ok: false, status: 409, message: "The quote validity date is already in the past" };
    }
    const document = await buildQuoteDocumentContext(repository, context, quote.projectId);
    if (!document) {
      return {
        ok: false,
        status: 409,
        message: "Customer and project details are required before issue",
      };
    }
    const refreshed = await repository.updateQuoteVersion({
      quoteVersionId: version.id,
      companyId: context.company.id,
      presentation: { ...version.presentation, document },
      updatedByUserId: context.user.id,
      updatedAtIso: new Date().toISOString(),
    });
    if (!refreshed) {
      return { ok: false, status: 409, message: "Quote is no longer editable" };
    }
  }
  const now = new Date().toISOString();
  const updated = await repository.setQuoteVersionStatus({
    quoteVersionId: version.id,
    companyId: context.company.id,
    status,
    issuedAtIso: status === "ISSUED" ? now : version.issuedAtIso,
    decidedAtIso: ["ACCEPTED", "REJECTED", "EXPIRED"].includes(status) ? now : null,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!updated) return { ok: false, status: 409, message: "Quote status was not changed" };
  const project = await repository.getProjectById(quote.projectId, context.company.id);
  if (project && (status === "ISSUED" || status === "ACCEPTED")) {
    const projectStatus = status === "ACCEPTED" ? "WON" : "QUOTED";
    await repository.setProjectStatus({
      projectId: project.id,
      companyId: context.company.id,
      status: projectStatus,
      statusChangedAtIso: now,
      statusChangedByUserId: context.user.id,
      updatedByUserId: context.user.id,
      updatedAtIso: now,
    });
  }
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: "QUOTE_STATUS_CHANGED",
    summary: `${context.user.displayName} changed ${quote.reference} version ${version.versionNumber} to ${status}`,
    createdAtIso: now,
    metadata: { status, version: version.versionNumber },
  });
  return { ok: true, value: updated };
}

export async function createQuoteVersionForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  quoteId: string,
  input: {
    estimateVersionId: string;
    title: string;
    customerMessage: string | null;
    validUntilIso: string | null;
    displayMode?: QuoteDisplayMode;
    vatRate?: number;
  },
): Promise<LifecycleResult<QuoteVersionRecord>> {
  const quote = await repository.getQuoteById(quoteId, context.company.id);
  if (!quote) return { ok: false, status: 404, message: "Quote not found" };
  const parent = await repository.getQuoteVersionById(quote.currentVersionId, context.company.id);
  if (!parent || parent.status === "DRAFT" || parent.status === "ACCEPTED") {
    return {
      ok: false,
      status: 409,
      message:
        parent?.status === "ACCEPTED"
          ? "An accepted quote cannot be superseded"
          : "Finish or edit the current draft instead of starting another version",
    };
  }
  const approved = await getApprovedEstimateVersion(
    repository,
    context.company.id,
    input.estimateVersionId,
  );
  if (!approved || approved.estimate.id !== quote.estimateId) {
    return {
      ok: false,
      status: 409,
      message: "Select an approved version of the quote's estimate",
    };
  }
  const now = new Date().toISOString();
  const document = await buildQuoteDocumentContext(repository, context, quote.projectId);
  const version = await repository.createQuoteVersion({
    quoteId: quote.id,
    versionId: randomUUID(),
    companyId: context.company.id,
    versionNumber: quote.latestVersionNumber + 1,
    parentVersionId: parent.id,
    estimateVersionId: approved.version.id,
    title: input.title.trim(),
    customerMessage: nullableText(input.customerMessage),
    validUntilIso: input.validUntilIso,
    presentation: buildQuotePresentation(
      approved.version.calculation!,
      input.displayMode,
      input.vatRate,
      document ?? parent.presentation.document,
    ),
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: "QUOTE_VERSION_CREATED",
    summary: `${context.user.displayName} started ${quote.reference} version ${version.versionNumber}`,
    createdAtIso: now,
    metadata: { version: version.versionNumber },
  });
  return { ok: true, value: version };
}

export async function setQuoteArchivedForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  quoteId: string,
  archived: boolean,
): Promise<LifecycleResult<QuoteRecord>> {
  const now = new Date().toISOString();
  const quote = await repository.setQuoteArchivedState({
    quoteId,
    companyId: context.company.id,
    archived,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (!quote) return { ok: false, status: 404, message: "Quote not found" };
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: archived ? "QUOTE_ARCHIVED" : "QUOTE_UNARCHIVED",
    summary: `${context.user.displayName} ${archived ? "archived" : "restored"} ${quote.reference}`,
    createdAtIso: now,
  });
  return { ok: true, value: quote };
}

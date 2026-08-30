import { randomUUID } from "node:crypto";
import type { SiteRecord, SiteSummary } from "@fence-estimator/contracts";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AuthenticatedRequestContext } from "../authorization.js";
import type { AppRepository, ScopeFilter } from "../repository.js";

interface SiteData {
  customerId: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  countryCode: string;
  notes: string | null;
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listSitesForCompany(
  repository: AppRepository,
  companyId: string,
  options: { scope?: ScopeFilter; customerId?: string; search?: string },
): Promise<SiteSummary[]> {
  return repository.listSites(companyId, options);
}

export async function getSiteForCompany(
  repository: AppRepository,
  companyId: string,
  siteId: string,
): Promise<SiteRecord | null> {
  return repository.getSiteById(siteId, companyId);
}

export async function createSiteForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  input: SiteData,
): Promise<SiteRecord | null> {
  const customer = await repository.getCustomerById(input.customerId, context.company.id);
  if (!customer || customer.isArchived) return null;
  const duplicate = (await repository.listSites(context.company.id, {
    customerId: customer.id,
    scope: "ACTIVE",
  })).some((site) => site.name.localeCompare(input.name.trim(), undefined, { sensitivity: "base" }) === 0);
  if (duplicate) return null;
  const now = new Date().toISOString();
  const site = await repository.createSite({
    id: randomUUID(),
    companyId: context.company.id,
    customerId: customer.id,
    name: input.name.trim(),
    addressLine1: nullableText(input.addressLine1),
    addressLine2: nullableText(input.addressLine2),
    city: nullableText(input.city),
    county: nullableText(input.county),
    postcode: nullableText(input.postcode)?.toUpperCase() ?? null,
    countryCode: input.countryCode.toUpperCase(),
    notes: nullableText(input.notes),
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "SITE",
    entityId: site.id,
    action: "SITE_CREATED",
    summary: `${context.user.displayName} added site “${site.name}” for ${customer.name}`,
    createdAtIso: now,
  });
  return site;
}

export async function updateSiteForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  siteId: string,
  patch: Partial<Omit<SiteData, "customerId">>,
): Promise<SiteRecord | null> {
  const existing = await repository.getSiteById(siteId, context.company.id);
  if (!existing) return null;
  if (patch.name !== undefined) {
    const duplicate = (await repository.listSites(context.company.id, {
      customerId: existing.customerId,
      scope: "ACTIVE",
    })).some(
      (site) =>
        site.id !== siteId &&
        site.name.localeCompare(patch.name!.trim(), undefined, { sensitivity: "base" }) === 0,
    );
    if (duplicate) return null;
  }
  const now = new Date().toISOString();
  const site = await repository.updateSite({
    siteId,
    companyId: context.company.id,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.addressLine1 !== undefined ? { addressLine1: nullableText(patch.addressLine1) } : {}),
    ...(patch.addressLine2 !== undefined ? { addressLine2: nullableText(patch.addressLine2) } : {}),
    ...(patch.city !== undefined ? { city: nullableText(patch.city) } : {}),
    ...(patch.county !== undefined ? { county: nullableText(patch.county) } : {}),
    ...(patch.postcode !== undefined
      ? { postcode: nullableText(patch.postcode)?.toUpperCase() ?? null }
      : {}),
    ...(patch.countryCode !== undefined ? { countryCode: patch.countryCode.toUpperCase() } : {}),
    ...(patch.notes !== undefined ? { notes: nullableText(patch.notes) } : {}),
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (site) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "SITE",
      entityId: site.id,
      action: "SITE_UPDATED",
      summary: `${context.user.displayName} updated site “${site.name}”`,
      createdAtIso: now,
    });
  }
  return site;
}

export async function setSiteArchivedForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  siteId: string,
  archived: boolean,
): Promise<SiteRecord | null> {
  const now = new Date().toISOString();
  const site = await repository.setSiteArchivedState({
    siteId,
    companyId: context.company.id,
    archived,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (site) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "SITE",
      entityId: site.id,
      action: archived ? "SITE_ARCHIVED" : "SITE_UNARCHIVED",
      summary: `${context.user.displayName} ${archived ? "archived" : "restored"} site “${site.name}”`,
      createdAtIso: now,
    });
  }
  return site;
}

export async function deleteSiteForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  siteId: string,
): Promise<boolean> {
  const existing = await repository.getSiteById(siteId, context.company.id);
  if (!existing) return false;
  const deleted = await repository.deleteSite({ siteId, companyId: context.company.id });
  if (deleted) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "SITE",
      entityId: siteId,
      action: "SITE_DELETED",
      summary: `${context.user.displayName} deleted site “${existing.name}”`,
      createdAtIso: new Date().toISOString(),
    });
  }
  return deleted;
}

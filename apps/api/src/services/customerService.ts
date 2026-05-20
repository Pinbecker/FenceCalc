import { randomUUID } from "node:crypto";

import type {
  CustomerRecord,
  CustomerSummary,
} from "@fence-estimator/contracts";

import { writeAuditLog } from "../auditLogSupport.js";
import type { AuthenticatedRequestContext } from "../authorization.js";
import type { AppRepository, ScopeFilter } from "../repository.js";

interface CustomerInputData {
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  siteAddress: string | null;
  notes: string | null;
}

function nullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function listCustomersForCompany(
  repository: AppRepository,
  companyId: string,
  scope: ScopeFilter,
  search: string,
): Promise<CustomerSummary[]> {
  return repository.listCustomers(companyId, scope, search);
}

export async function getCustomerForCompany(
  repository: AppRepository,
  companyId: string,
  customerId: string,
): Promise<CustomerRecord | null> {
  return repository.getCustomerById(customerId, companyId);
}

export async function createCustomerForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  input: CustomerInputData,
): Promise<CustomerRecord> {
  const now = new Date().toISOString();
  const customer = await repository.createCustomer({
    id: randomUUID(),
    companyId: context.company.id,
    name: input.name.trim(),
    contactName: nullableText(input.contactName),
    contactEmail: nullableText(input.contactEmail),
    contactPhone: nullableText(input.contactPhone),
    siteAddress: nullableText(input.siteAddress),
    notes: nullableText(input.notes),
    createdByUserId: context.user.id,
    updatedByUserId: context.user.id,
    createdAtIso: now,
    updatedAtIso: now,
  });
  await writeAuditLog(repository, {
    companyId: context.company.id,
    actorUserId: context.user.id,
    entityType: "CUSTOMER",
    entityId: customer.id,
    action: "CUSTOMER_CREATED",
    summary: `${context.user.displayName} added customer ${customer.name}`,
    createdAtIso: now,
  });
  return customer;
}

export async function updateCustomerForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  customerId: string,
  patch: Partial<CustomerInputData>,
): Promise<CustomerRecord | null> {
  const now = new Date().toISOString();
  const updated = await repository.updateCustomer({
    customerId,
    companyId: context.company.id,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.contactName !== undefined ? { contactName: nullableText(patch.contactName) } : {}),
    ...(patch.contactEmail !== undefined ? { contactEmail: nullableText(patch.contactEmail) } : {}),
    ...(patch.contactPhone !== undefined ? { contactPhone: nullableText(patch.contactPhone) } : {}),
    ...(patch.siteAddress !== undefined ? { siteAddress: nullableText(patch.siteAddress) } : {}),
    ...(patch.notes !== undefined ? { notes: nullableText(patch.notes) } : {}),
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (updated) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "CUSTOMER",
      entityId: updated.id,
      action: "CUSTOMER_UPDATED",
      summary: `${context.user.displayName} updated customer ${updated.name}`,
      createdAtIso: now,
    });
  }
  return updated;
}

export async function setCustomerArchivedForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  customerId: string,
  archived: boolean,
): Promise<CustomerRecord | null> {
  const now = new Date().toISOString();
  const result = await repository.setCustomerArchivedState({
    customerId,
    companyId: context.company.id,
    archived,
    updatedByUserId: context.user.id,
    updatedAtIso: now,
  });
  if (result) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "CUSTOMER",
      entityId: result.id,
      action: archived ? "CUSTOMER_ARCHIVED" : "CUSTOMER_UNARCHIVED",
      summary: `${context.user.displayName} ${archived ? "archived" : "restored"} customer ${result.name}`,
      createdAtIso: now,
    });
  }
  return result;
}

export async function deleteCustomerForCompany(
  repository: AppRepository,
  context: AuthenticatedRequestContext,
  customerId: string,
): Promise<boolean> {
  const existing = await repository.getCustomerById(customerId, context.company.id);
  if (!existing) {
    return false;
  }
  const ok = await repository.deleteCustomer({ customerId, companyId: context.company.id });
  if (ok) {
    await writeAuditLog(repository, {
      companyId: context.company.id,
      actorUserId: context.user.id,
      entityType: "CUSTOMER",
      entityId: customerId,
      action: "CUSTOMER_DELETED",
      summary: `${context.user.displayName} deleted customer ${existing.name}`,
      createdAtIso: new Date().toISOString(),
    });
  }
  return ok;
}

import { randomUUID } from "node:crypto";
import type { CustomerContact, CustomerRecord } from "@fence-estimator/contracts";

import type { AuthenticatedRequestContext } from "../authorization.js";
import { writeAuditLog } from "../auditLogSupport.js";
import type { AppRepository } from "../repository.js";

interface CustomerMutationSuccess {
  kind: "success";
  customer: CustomerRecord;
}

interface CustomerNotFound {
  kind: "customer_not_found";
}

interface CustomerConflict {
  kind: "conflict";
  message: string;
}

export type CustomerMutationResult = CustomerMutationSuccess | CustomerNotFound | CustomerConflict;

interface CustomerCreateInput {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  additionalContacts: CustomerContact[];
  siteAddress: string;
  notes: string;
}

interface CustomerUpdateInput {
  name?: string | undefined;
  primaryContactName?: string | undefined;
  primaryEmail?: string | undefined;
  primaryPhone?: string | undefined;
  additionalContacts?: CustomerContact[] | undefined;
  siteAddress?: string | undefined;
  notes?: string | undefined;
}

function toConflict(error: unknown): CustomerConflict {
  const message = (error as Error).message;
  if (message === "Customer name already exists") {
    return { kind: "conflict", message };
  }
  throw error;
}

export async function createCustomerForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  input: CustomerCreateInput,
): Promise<CustomerMutationResult> {
  try {
    const nowIso = new Date().toISOString();
    const customer = await repository.createCustomer({
      id: randomUUID(),
      companyId: authenticated.company.id,
      name: input.name,
      primaryContactName: input.primaryContactName,
      primaryEmail: input.primaryEmail,
      primaryPhone: input.primaryPhone,
      additionalContacts: input.additionalContacts,
      siteAddress: input.siteAddress,
      notes: input.notes,
      createdByUserId: authenticated.user.id,
      updatedByUserId: authenticated.user.id,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "CUSTOMER",
      entityId: customer.id,
      action: "CUSTOMER_CREATED",
      summary: `${authenticated.user.displayName} created customer ${customer.name}`,
      createdAtIso: nowIso,
    });
    return { kind: "success", customer };
  } catch (error) {
    return toConflict(error);
  }
}

export async function updateCustomerForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  customerId: string,
  input: CustomerUpdateInput,
): Promise<CustomerMutationResult> {
  const existing = await repository.getCustomerById(customerId, authenticated.company.id);
  if (!existing) {
    return { kind: "customer_not_found" };
  }

  try {
    const updatedAtIso = new Date().toISOString();
    const customer = await repository.updateCustomer({
      customerId,
      companyId: authenticated.company.id,
      name: input.name ?? existing.name,
      primaryContactName: input.primaryContactName ?? existing.primaryContactName,
      primaryEmail: input.primaryEmail ?? existing.primaryEmail,
      primaryPhone: input.primaryPhone ?? existing.primaryPhone,
      additionalContacts: input.additionalContacts ?? existing.additionalContacts,
      siteAddress: input.siteAddress ?? existing.siteAddress,
      notes: input.notes ?? existing.notes,
      updatedByUserId: authenticated.user.id,
      updatedAtIso,
    });
    if (!customer) {
      return { kind: "customer_not_found" };
    }
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "CUSTOMER",
      entityId: customer.id,
      action: "CUSTOMER_UPDATED",
      summary: `${authenticated.user.displayName} updated customer ${customer.name}`,
      createdAtIso: updatedAtIso,
    });
    return { kind: "success", customer };
  } catch (error) {
    return toConflict(error);
  }
}

export async function setCustomerArchivedStateForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  customerId: string,
  archived: boolean,
): Promise<CustomerMutationResult> {
  const updatedAtIso = new Date().toISOString();
  const customer = await repository.setCustomerArchivedState({
    customerId,
    companyId: authenticated.company.id,
    archived,
    updatedByUserId: authenticated.user.id,
    updatedAtIso,
  });
  if (!customer) {
    return { kind: "customer_not_found" };
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "CUSTOMER",
    entityId: customer.id,
    action: archived ? "CUSTOMER_ARCHIVED" : "CUSTOMER_UNARCHIVED",
    summary: `${authenticated.user.displayName} ${archived ? "archived" : "restored"} customer ${customer.name}`,
    createdAtIso: updatedAtIso,
  });

  return { kind: "success", customer };
}

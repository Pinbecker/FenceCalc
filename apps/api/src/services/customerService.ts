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
  cascadeDrawings = false,
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

  if (archived && cascadeDrawings) {
    const drawings = await repository.listDrawingsForCustomer(customerId, authenticated.company.id);
    await repository.runInTransaction(async () => {
      for (const drawing of drawings) {
        if (!drawing.isArchived) {
          await repository.setDrawingArchivedState({
            drawingId: drawing.id,
            companyId: authenticated.company.id,
            expectedVersionNumber: drawing.versionNumber,
            archived: true,
            archivedAtIso: updatedAtIso,
            archivedByUserId: authenticated.user.id,
            updatedAtIso,
            updatedByUserId: authenticated.user.id,
          });
        }
      }
    });
    // Audit logs written outside the transaction to avoid blocking DB writes
    for (const drawing of drawings) {
      if (!drawing.isArchived) {
        await writeAuditLog(repository, {
          companyId: authenticated.company.id,
          actorUserId: authenticated.user.id,
          entityType: "DRAWING",
          entityId: drawing.id,
          action: "DRAWING_ARCHIVED",
          summary: `${authenticated.user.displayName} archived ${drawing.name} (cascade from customer ${customer.name})`,
          createdAtIso: updatedAtIso,
        });
      }
    }
  }

  return { kind: "success", customer };
}

export type CustomerDeleteResult =
  | { kind: "success" }
  | { kind: "customer_not_found" }
  | { kind: "not_archived" }
  | { kind: "has_active_drawings" };

export async function deleteCustomerForCompany(
  repository: AppRepository,
  authenticated: AuthenticatedRequestContext,
  customerId: string,
): Promise<CustomerDeleteResult> {
  const existing = await repository.getCustomerById(customerId, authenticated.company.id);
  if (!existing) {
    return { kind: "customer_not_found" };
  }
  if (!existing.isArchived) {
    return { kind: "not_archived" };
  }

  const drawings = await repository.listDrawingsForCustomer(customerId, authenticated.company.id);
  const activeDrawings = drawings.filter((d) => !d.isArchived);
  if (activeDrawings.length > 0) {
    return { kind: "has_active_drawings" };
  }

  // Delete all archived drawings for this customer first, then the customer, atomically
  await repository.runInTransaction(async () => {
    for (const drawing of drawings) {
      await repository.deleteDrawing({
        drawingId: drawing.id,
        companyId: authenticated.company.id,
      });
    }

    await repository.deleteCustomer({
      customerId,
      companyId: authenticated.company.id,
    });
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "CUSTOMER",
    entityId: customerId,
    action: "CUSTOMER_DELETED",
    summary: `${authenticated.user.displayName} permanently deleted customer ${existing.name} (${drawings.length} drawings removed)`,
    createdAtIso: new Date().toISOString(),
  });

  return { kind: "success" };
}

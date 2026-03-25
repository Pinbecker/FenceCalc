import type { CustomerRecord, CustomerSummary, DrawingRecord } from "@fence-estimator/contracts";

import type {
  CreateCustomerInput,
  CustomerScope,
  DeleteCustomerInput,
  SetCustomerArchivedStateInput,
  UpdateCustomerInput,
} from "./types.js";

interface InMemoryCustomerState {
  customers: Map<string, CustomerRecord>;
  drawings: Map<string, DrawingRecord>;
}

function normalizeCustomerName(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSearch(customer: CustomerRecord, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    customer.name,
    customer.primaryContactName,
    customer.primaryEmail,
    customer.primaryPhone,
    customer.siteAddress,
  ].some((value) => value.toLowerCase().includes(normalized));
}

export class InMemoryCustomerStore {
  public constructor(private readonly state: InMemoryCustomerState) {}

  private assertUniqueName(companyId: string, name: string, currentCustomerId?: string): void {
    const normalizedName = normalizeCustomerName(name);
    const existing = [...this.state.customers.values()].find(
      (customer) =>
        customer.companyId === companyId &&
        normalizeCustomerName(customer.name) === normalizedName &&
        customer.id !== currentCustomerId,
    );
    if (existing) {
      throw new Error("Customer name already exists");
    }
  }

  private toSummary(customer: CustomerRecord): CustomerSummary {
    const linkedDrawings = [...this.state.drawings.values()].filter((drawing) => drawing.customerId === customer.id);
    const activeDrawingCount = linkedDrawings.filter((drawing) => !drawing.isArchived).length;
    const archivedDrawingCount = linkedDrawings.length - activeDrawingCount;
    const lastActivityAtIso = linkedDrawings
      .map((drawing) => drawing.updatedAtIso)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return {
      ...customer,
      activeDrawingCount,
      archivedDrawingCount,
      lastActivityAtIso,
    };
  }

  public createCustomer(input: CreateCustomerInput): CustomerRecord {
    this.assertUniqueName(input.companyId, input.name);
    const customer: CustomerRecord = {
      id: input.id,
      companyId: input.companyId,
      name: input.name,
      primaryContactName: input.primaryContactName,
      primaryEmail: input.primaryEmail,
      primaryPhone: input.primaryPhone,
      additionalContacts: input.additionalContacts,
      siteAddress: input.siteAddress,
      notes: input.notes,
      isArchived: false,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
    this.state.customers.set(customer.id, customer);
    return customer;
  }

  public listCustomers(companyId: string, scope: CustomerScope = "ACTIVE", search = ""): CustomerSummary[] {
    return [...this.state.customers.values()]
      .filter((customer) => customer.companyId === companyId)
      .filter((customer) => {
        if (scope === "ACTIVE") {
          return !customer.isArchived;
        }
        if (scope === "ARCHIVED") {
          return customer.isArchived;
        }
        return true;
      })
      .filter((customer) => matchesSearch(customer, search))
      .map((customer) => this.toSummary(customer))
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  public getCustomerById(customerId: string, companyId: string): CustomerRecord | null {
    const customer = this.state.customers.get(customerId);
    if (!customer || customer.companyId !== companyId) {
      return null;
    }
    return customer;
  }

  public updateCustomer(input: UpdateCustomerInput): CustomerRecord | null {
    const existing = this.state.customers.get(input.customerId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    this.assertUniqueName(input.companyId, input.name, input.customerId);
    const updated: CustomerRecord = {
      ...existing,
      name: input.name,
      primaryContactName: input.primaryContactName,
      primaryEmail: input.primaryEmail,
      primaryPhone: input.primaryPhone,
      additionalContacts: input.additionalContacts,
      siteAddress: input.siteAddress,
      notes: input.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    this.state.customers.set(updated.id, updated);
    return updated;
  }

  public setCustomerArchivedState(input: SetCustomerArchivedStateInput): CustomerRecord | null {
    const existing = this.state.customers.get(input.customerId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    const updated: CustomerRecord = {
      ...existing,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    this.state.customers.set(updated.id, updated);
    return updated;
  }

  public deleteCustomer(input: DeleteCustomerInput): boolean {
    const existing = this.state.customers.get(input.customerId);
    if (!existing || existing.companyId !== input.companyId) {
      return false;
    }
    this.state.customers.delete(input.customerId);
    return true;
  }
}

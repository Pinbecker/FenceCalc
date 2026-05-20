import type Database from "better-sqlite3";
import type { CustomerRecord, CustomerSummary } from "@fence-estimator/contracts";

import type { CustomerRow, CustomerSummaryRow } from "./shared.js";
import { toCustomer, toCustomerSummary } from "./shared.js";
import type {
  CreateCustomerInput,
  DeleteCustomerInput,
  ScopeFilter,
  SetCustomerArchivedStateInput,
  UpdateCustomerInput,
} from "./types.js";

const SUMMARY_SELECT = `
  SELECT
    c.*,
    (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count,
    (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id AND p.is_archived = 0) AS active_project_count,
    (
      SELECT MAX(p.updated_at_iso) FROM projects p WHERE p.customer_id = c.id
    ) AS last_activity_at_iso
  FROM customers c
`;

export class SqliteCustomerStore {
  public constructor(private readonly database: Database.Database) {}

  public createCustomer(input: CreateCustomerInput): CustomerRecord {
    this.database
      .prepare(
        `INSERT INTO customers (
          id, company_id, name, contact_name, contact_email, contact_phone, site_address, notes,
          is_archived, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.companyId,
        input.name,
        input.contactName,
        input.contactEmail,
        input.contactPhone,
        input.siteAddress,
        input.notes,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      );
    return {
      id: input.id,
      companyId: input.companyId,
      name: input.name,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      siteAddress: input.siteAddress,
      notes: input.notes,
      isArchived: false,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public listCustomers(
    companyId: string,
    scope: ScopeFilter = "ACTIVE",
    search = "",
  ): CustomerSummary[] {
    const whereClauses = ["c.company_id = ?"];
    const values: Array<string | number> = [companyId];
    if (scope === "ACTIVE") {
      whereClauses.push("c.is_archived = 0");
    } else if (scope === "ARCHIVED") {
      whereClauses.push("c.is_archived = 1");
    }
    const trimmed = search.trim();
    if (trimmed) {
      whereClauses.push("LOWER(c.name) LIKE ?");
      values.push(`%${trimmed.toLowerCase()}%`);
    }
    const rows = this.database
      .prepare(
        `${SUMMARY_SELECT} WHERE ${whereClauses.join(" AND ")} ORDER BY c.name COLLATE NOCASE ASC`,
      )
      .all(...values) as CustomerSummaryRow[];
    return rows.map((row) => toCustomerSummary(row));
  }

  public getCustomerById(customerId: string, companyId: string): CustomerRecord | null {
    const row = this.database
      .prepare("SELECT * FROM customers WHERE id = ? AND company_id = ?")
      .get(customerId, companyId) as CustomerRow | undefined;
    return row ? toCustomer(row) : null;
  }

  public updateCustomer(input: UpdateCustomerInput): CustomerRecord | null {
    const existing = this.getCustomerById(input.customerId, input.companyId);
    if (!existing) {
      return null;
    }
    const next: CustomerRecord = {
      ...existing,
      name: input.name ?? existing.name,
      contactName: input.contactName !== undefined ? input.contactName : existing.contactName,
      contactEmail: input.contactEmail !== undefined ? input.contactEmail : existing.contactEmail,
      contactPhone: input.contactPhone !== undefined ? input.contactPhone : existing.contactPhone,
      siteAddress: input.siteAddress !== undefined ? input.siteAddress : existing.siteAddress,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    this.database
      .prepare(
        `UPDATE customers
         SET name = ?, contact_name = ?, contact_email = ?, contact_phone = ?, site_address = ?, notes = ?,
             updated_by_user_id = ?, updated_at_iso = ?
         WHERE id = ? AND company_id = ?`,
      )
      .run(
        next.name,
        next.contactName,
        next.contactEmail,
        next.contactPhone,
        next.siteAddress,
        next.notes,
        next.updatedByUserId,
        next.updatedAtIso,
        input.customerId,
        input.companyId,
      );
    return next;
  }

  public setCustomerArchivedState(input: SetCustomerArchivedStateInput): CustomerRecord | null {
    const existing = this.getCustomerById(input.customerId, input.companyId);
    if (!existing) {
      return null;
    }
    this.database
      .prepare(
        "UPDATE customers SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ? WHERE id = ? AND company_id = ?",
      )
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.customerId,
        input.companyId,
      );
    return {
      ...existing,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public deleteCustomer(input: DeleteCustomerInput): boolean {
    const result = this.database
      .prepare("DELETE FROM customers WHERE id = ? AND company_id = ? AND is_archived = 1")
      .run(input.customerId, input.companyId);
    return result.changes > 0;
  }
}

import Database from "better-sqlite3";
import type { CustomerRecord, CustomerSummary } from "@fence-estimator/contracts";

import { type CustomerRow, type CustomerSummaryRow, toCustomer, toCustomerSummary } from "./shared.js";
import type {
  CreateCustomerInput,
  CustomerScope,
  DeleteCustomerInput,
  SetCustomerArchivedStateInput,
  UpdateCustomerInput,
} from "./types.js";

function normalizeSearch(value: string): string {
  return `%${value.trim().toLowerCase()}%`;
}

function translateConstraintError(error: unknown): never {
  const message = (error as Error).message ?? "";
  if (message.includes("UNIQUE constraint failed: customers.company_id, customers.name_normalized")) {
    throw new Error("Customer name already exists");
  }
  throw error;
}

export class SqliteCustomerStore {
  public constructor(private readonly database: Database.Database) {}

  public createCustomer(input: CreateCustomerInput): CustomerRecord {
    try {
      this.database
        .prepare(
          `
            INSERT INTO customers (
              id,
              company_id,
              name,
              name_normalized,
              primary_contact_name,
              primary_email,
              primary_phone,
              additional_contacts_json,
              site_address,
              notes,
              is_archived,
              created_by_user_id,
              updated_by_user_id,
              created_at_iso,
              updated_at_iso
            ) VALUES (?, ?, ?, lower(trim(?)), ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
          `,
        )
        .run(
          input.id,
          input.companyId,
          input.name,
          input.name,
          input.primaryContactName,
          input.primaryEmail,
          input.primaryPhone,
          JSON.stringify(input.additionalContacts),
          input.siteAddress,
          input.notes,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
    } catch (error) {
      translateConstraintError(error);
    }

    const row = this.database
      .prepare("SELECT * FROM customers WHERE id = ? AND company_id = ?")
      .get(input.id, input.companyId) as CustomerRow | undefined;
    if (!row) {
      throw new Error("Failed to create customer");
    }
    return toCustomer(row);
  }

  public listCustomers(companyId: string, scope: CustomerScope = "ACTIVE", search = ""): CustomerSummary[] {
    const scopeClause = scope === "ACTIVE" ? "AND c.is_archived = 0" : scope === "ARCHIVED" ? "AND c.is_archived = 1" : "";
    const searchClause = search.trim()
      ? `
          AND (
            lower(c.name) LIKE ?
            OR lower(c.primary_contact_name) LIKE ?
            OR lower(c.primary_email) LIKE ?
            OR lower(c.primary_phone) LIKE ?
            OR lower(c.site_address) LIKE ?
          )
        `
      : "";
    const params = search.trim()
      ? [companyId, normalizeSearch(search), normalizeSearch(search), normalizeSearch(search), normalizeSearch(search), normalizeSearch(search)]
      : [companyId];

    const rows = this.database
      .prepare(
        `
          SELECT
            c.*,
            SUM(CASE WHEN d.is_archived = 0 THEN 1 ELSE 0 END) AS active_drawing_count,
            SUM(CASE WHEN d.is_archived = 1 THEN 1 ELSE 0 END) AS archived_drawing_count,
            MAX(d.updated_at_iso) AS last_activity_at_iso
          FROM customers c
          LEFT JOIN drawings d
            ON d.company_id = c.company_id
            AND d.customer_id = c.id
          WHERE c.company_id = ?
          ${scopeClause}
          ${searchClause}
          GROUP BY c.id
          ORDER BY c.updated_at_iso DESC
        `,
      )
      .all(...params) as CustomerSummaryRow[];

    return rows.map((row) =>
      toCustomerSummary({
        ...row,
        active_drawing_count: Number(row.active_drawing_count ?? 0),
        archived_drawing_count: Number(row.archived_drawing_count ?? 0),
      }),
    );
  }

  public getCustomerById(customerId: string, companyId: string): CustomerRecord | null {
    const row = this.database
      .prepare("SELECT * FROM customers WHERE id = ? AND company_id = ?")
      .get(customerId, companyId) as CustomerRow | undefined;
    return row ? toCustomer(row) : null;
  }

  public updateCustomer(input: UpdateCustomerInput): CustomerRecord | null {
    try {
      const result = this.database
        .prepare(
          `
            UPDATE customers
            SET
              name = ?,
              name_normalized = lower(trim(?)),
              primary_contact_name = ?,
              primary_email = ?,
              primary_phone = ?,
              additional_contacts_json = ?,
              site_address = ?,
              notes = ?,
              updated_by_user_id = ?,
              updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          input.name,
          input.name,
          input.primaryContactName,
          input.primaryEmail,
          input.primaryPhone,
          JSON.stringify(input.additionalContacts),
          input.siteAddress,
          input.notes,
          input.updatedByUserId,
          input.updatedAtIso,
          input.customerId,
          input.companyId,
        );
      if (result.changes === 0) {
        return null;
      }
    } catch (error) {
      translateConstraintError(error);
    }

    return this.getCustomerById(input.customerId, input.companyId);
  }

  public setCustomerArchivedState(input: SetCustomerArchivedStateInput): CustomerRecord | null {
    const result = this.database
      .prepare(
        `
          UPDATE customers
          SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `,
      )
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.customerId,
        input.companyId,
      );
    if (result.changes === 0) {
      return null;
    }
    return this.getCustomerById(input.customerId, input.companyId);
  }

  public deleteCustomer(input: DeleteCustomerInput): boolean {
    const existing = this.database
      .prepare("SELECT id FROM customers WHERE id = ? AND company_id = ?")
      .get(input.customerId, input.companyId) as { id: string } | undefined;
    if (!existing) {
      return false;
    }
    this.database
      .prepare("DELETE FROM customers WHERE id = ? AND company_id = ?")
      .run(input.customerId, input.companyId);
    return true;
  }
}

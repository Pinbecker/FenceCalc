import Database from "better-sqlite3";
import type { CompanyConfigurationVersionRecord, PricingConfigRecord } from "@fence-estimator/contracts";
import { companyConfigurationDefinitionSchema, pricingWorkbookConfigSchema } from "@fence-estimator/contracts";

import { type PricingConfigRow, toPricingConfig } from "./shared.js";
import type {
  CreateCompanyConfigurationVersionInput,
  SetCompanyConfigurationVersionStatusInput,
  UpdateCompanyConfigurationDraftInput,
  UpsertPricingConfigInput,
} from "./types.js";

interface CompanyConfigurationVersionRow {
  id: string;
  company_id: string;
  version_number: number;
  status: CompanyConfigurationVersionRecord["status"];
  definition_json: string;
  compiled_workbook_json: string;
  change_note: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  published_by_user_id: string | null;
  created_at_iso: string;
  updated_at_iso: string;
  published_at_iso: string | null;
}

function toCompanyConfigurationVersion(row: CompanyConfigurationVersionRow): CompanyConfigurationVersionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    versionNumber: row.version_number,
    status: row.status,
    definition: companyConfigurationDefinitionSchema.parse(JSON.parse(row.definition_json)),
    compiledWorkbook: pricingWorkbookConfigSchema.parse(JSON.parse(row.compiled_workbook_json)),
    changeNote: row.change_note,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    publishedByUserId: row.published_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
    publishedAtIso: row.published_at_iso,
  };
}

export class SqlitePricingStore {
  public constructor(private readonly database: Database.Database) {}

  public getPricingConfig(companyId: string): PricingConfigRecord | null {
    const row = this.database
      .prepare("SELECT * FROM pricing_config WHERE company_id = ?")
      .get(companyId) as PricingConfigRow | undefined;
    return row ? toPricingConfig(row) : null;
  }

  public upsertPricingConfig(input: UpsertPricingConfigInput): PricingConfigRecord {
    const record: PricingConfigRecord = {
      companyId: input.companyId,
      items: input.items,
      ...(input.workbook ? { workbook: input.workbook } : {}),
      updatedAtIso: input.updatedAtIso,
      updatedByUserId: input.updatedByUserId
    };

    this.database
      .prepare(
        `
          INSERT INTO pricing_config (
            company_id,
            items_json,
            workbook_json,
            updated_at_iso,
            updated_by_user_id
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(company_id) DO UPDATE SET
            items_json = excluded.items_json,
            workbook_json = excluded.workbook_json,
            updated_at_iso = excluded.updated_at_iso,
            updated_by_user_id = excluded.updated_by_user_id
        `
      )
      .run(
        input.companyId,
        JSON.stringify(record.items),
        record.workbook ? JSON.stringify(record.workbook) : null,
        input.updatedAtIso,
        input.updatedByUserId
      );

    return record;
  }

  public listCompanyConfigurationVersions(companyId: string): CompanyConfigurationVersionRecord[] {
    const rows = this.database.prepare(
      "SELECT * FROM company_configuration_versions WHERE company_id = ? ORDER BY version_number DESC",
    ).all(companyId) as CompanyConfigurationVersionRow[];
    return rows.map(toCompanyConfigurationVersion);
  }

  public getCompanyConfigurationVersionByStatus(
    companyId: string,
    status: "DRAFT" | "PUBLISHED",
  ): CompanyConfigurationVersionRecord | null {
    const row = this.database.prepare(
      "SELECT * FROM company_configuration_versions WHERE company_id = ? AND status = ? LIMIT 1",
    ).get(companyId, status) as CompanyConfigurationVersionRow | undefined;
    return row ? toCompanyConfigurationVersion(row) : null;
  }

  public createCompanyConfigurationVersion(
    input: CreateCompanyConfigurationVersionInput,
  ): CompanyConfigurationVersionRecord {
    this.database.prepare(`
      INSERT INTO company_configuration_versions (
        id, company_id, version_number, status, definition_json, compiled_workbook_json,
        change_note, created_by_user_id, updated_by_user_id, published_by_user_id,
        created_at_iso, updated_at_iso, published_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id, input.companyId, input.versionNumber, input.status,
      JSON.stringify(input.definition), JSON.stringify(input.compiledWorkbook), input.changeNote,
      input.createdByUserId, input.updatedByUserId, input.publishedByUserId,
      input.createdAtIso, input.updatedAtIso, input.publishedAtIso,
    );
    const row = this.database.prepare(
      "SELECT * FROM company_configuration_versions WHERE id = ? AND company_id = ?",
    ).get(input.id, input.companyId) as CompanyConfigurationVersionRow;
    return toCompanyConfigurationVersion(row);
  }

  public updateCompanyConfigurationDraft(
    input: UpdateCompanyConfigurationDraftInput,
  ): CompanyConfigurationVersionRecord | null {
    const result = this.database.prepare(`
      UPDATE company_configuration_versions SET
        definition_json = ?, compiled_workbook_json = ?, change_note = ?,
        updated_by_user_id = ?, updated_at_iso = ?
      WHERE id = ? AND company_id = ? AND status = 'DRAFT'
    `).run(
      JSON.stringify(input.definition), JSON.stringify(input.compiledWorkbook), input.changeNote,
      input.updatedByUserId, input.updatedAtIso, input.id, input.companyId,
    );
    return result.changes > 0
      ? this.getCompanyConfigurationVersionByStatus(input.companyId, "DRAFT")
      : null;
  }

  public setCompanyConfigurationVersionStatus(
    input: SetCompanyConfigurationVersionStatusInput,
  ): CompanyConfigurationVersionRecord | null {
    const result = this.database.prepare(`
      UPDATE company_configuration_versions SET
        status = ?, change_note = ?, updated_by_user_id = ?, updated_at_iso = ?,
        published_by_user_id = ?, published_at_iso = ?
      WHERE id = ? AND company_id = ?
    `).run(
      input.status, input.changeNote, input.updatedByUserId, input.updatedAtIso,
      input.publishedByUserId, input.publishedAtIso, input.id, input.companyId,
    );
    if (result.changes === 0) return null;
    const row = this.database.prepare(
      "SELECT * FROM company_configuration_versions WHERE id = ? AND company_id = ?",
    ).get(input.id, input.companyId) as CompanyConfigurationVersionRow;
    return toCompanyConfigurationVersion(row);
  }
}

import type Database from "better-sqlite3";
import type {
  EstimateRecord,
  EstimateSummary,
  EstimateVersionRecord,
  QuoteRecord,
  QuoteSummary,
  QuoteVersionRecord,
} from "@fence-estimator/contracts";

import type {
  EstimateRow,
  EstimateSelectionRow,
  EstimateSummaryRow,
  EstimateVersionRow,
  QuoteRow,
  QuoteSummaryRow,
  QuoteVersionRow,
} from "./shared.js";
import {
  toEstimate,
  toEstimateSelection,
  toEstimateSummary,
  toEstimateVersion,
  toQuote,
  toQuoteSummary,
  toQuoteVersion,
} from "./shared.js";
import type {
  CreateEstimateInput,
  CreateEstimateVersionInput,
  CreateQuoteInput,
  CreateQuoteVersionInput,
  SetEstimateArchivedStateInput,
  SetEstimateVersionCalculationInput,
  SetEstimateVersionStatusInput,
  SetQuoteArchivedStateInput,
  SetQuoteVersionStatusInput,
  UpdateEstimateVersionInput,
  UpdateQuoteVersionInput,
} from "./types.js";

export class SqliteLifecycleStore {
  public constructor(private readonly database: Database.Database) {}

  public nextCompanySequence(companyId: string, sequenceKey: string): number {
    const row = this.database
      .prepare(`
        INSERT INTO company_sequences (company_id, sequence_key, current_value)
        VALUES (?, ?, 1)
        ON CONFLICT(company_id, sequence_key) DO UPDATE
          SET current_value = current_value + 1
        RETURNING current_value
      `)
      .get(companyId, sequenceKey) as { current_value: number };
    return row.current_value;
  }

  private replaceEstimateSelections(estimateVersionId: string, revisionIds: string[]): void {
    this.database
      .prepare("DELETE FROM estimate_version_design_revisions WHERE estimate_version_id = ?")
      .run(estimateVersionId);
    const insert = this.database.prepare(`
      INSERT INTO estimate_version_design_revisions (
        estimate_version_id, drawing_revision_id, position
      ) VALUES (?, ?, ?)
    `);
    revisionIds.forEach((revisionId, position) => insert.run(estimateVersionId, revisionId, position));
  }

  private getEstimateSelections(estimateVersionId: string) {
    const rows = this.database
      .prepare(`
        SELECT
          d.id AS drawing_id,
          d.name AS drawing_name,
          r.id AS drawing_revision_id,
          r.revision_number AS revision_number,
          link.position AS position
        FROM estimate_version_design_revisions link
        INNER JOIN drawing_revisions r ON r.id = link.drawing_revision_id
        INNER JOIN drawings d ON d.id = r.drawing_id
        WHERE link.estimate_version_id = ?
        ORDER BY link.position ASC
      `)
      .all(estimateVersionId) as EstimateSelectionRow[];
    return rows.map(toEstimateSelection);
  }

  public createEstimate(input: CreateEstimateInput): EstimateRecord {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(`
          INSERT INTO estimates (
            id, company_id, project_id, reference, name, current_version_id,
            latest_version_number, is_archived, created_by_user_id, updated_by_user_id,
            created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
        `)
        .run(
          input.estimateId,
          input.companyId,
          input.projectId,
          input.reference,
          input.name,
          input.versionId,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.database
        .prepare(`
          INSERT INTO estimate_versions (
            id, estimate_id, company_id, version_number, parent_version_id, status, notes,
            created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, 1, NULL, 'DRAFT', ?, ?, ?, ?, ?)
        `)
        .run(
          input.versionId,
          input.estimateId,
          input.companyId,
          input.notes,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.replaceEstimateSelections(input.versionId, input.designRevisionIds);
    });
    transaction();
    return this.getEstimateById(input.estimateId, input.companyId)!;
  }

  public listEstimatesForProject(projectId: string, companyId: string): EstimateSummary[] {
    const rows = this.database
      .prepare(`
        SELECT
          e.*,
          v.status AS current_status,
          (SELECT COUNT(*) FROM estimate_version_design_revisions l
            WHERE l.estimate_version_id = e.current_version_id) AS selected_design_count
        FROM estimates e
        INNER JOIN estimate_versions v ON v.id = e.current_version_id
        WHERE e.project_id = ? AND e.company_id = ?
        ORDER BY e.updated_at_iso DESC
      `)
      .all(projectId, companyId) as EstimateSummaryRow[];
    return rows.map(toEstimateSummary);
  }

  public getEstimateById(estimateId: string, companyId: string): EstimateRecord | null {
    const row = this.database
      .prepare("SELECT * FROM estimates WHERE id = ? AND company_id = ?")
      .get(estimateId, companyId) as EstimateRow | undefined;
    return row ? toEstimate(row) : null;
  }

  public listEstimateVersions(estimateId: string, companyId: string): EstimateVersionRecord[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM estimate_versions
        WHERE estimate_id = ? AND company_id = ?
        ORDER BY version_number DESC
      `)
      .all(estimateId, companyId) as EstimateVersionRow[];
    return rows.map((row) => toEstimateVersion(row, this.getEstimateSelections(row.id)));
  }

  public getEstimateVersionById(versionId: string, companyId: string): EstimateVersionRecord | null {
    const row = this.database
      .prepare("SELECT * FROM estimate_versions WHERE id = ? AND company_id = ?")
      .get(versionId, companyId) as EstimateVersionRow | undefined;
    return row ? toEstimateVersion(row, this.getEstimateSelections(row.id)) : null;
  }

  public updateEstimateVersion(input: UpdateEstimateVersionInput): EstimateVersionRecord | null {
    const existing = this.getEstimateVersionById(input.estimateVersionId, input.companyId);
    if (!existing || existing.status !== "DRAFT") return null;
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(`
          UPDATE estimate_versions SET notes = ?, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `)
        .run(
          input.notes !== undefined ? input.notes : existing.notes,
          input.updatedByUserId,
          input.updatedAtIso,
          input.estimateVersionId,
          input.companyId,
        );
      if (input.designRevisionIds) {
        this.replaceEstimateSelections(input.estimateVersionId, input.designRevisionIds);
        this.database
          .prepare("UPDATE estimate_versions SET calculation_json = NULL, calculated_at_iso = NULL WHERE id = ?")
          .run(input.estimateVersionId);
      }
      this.database
        .prepare(`
          UPDATE estimates SET updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ? AND current_version_id = ?
        `)
        .run(
          input.updatedByUserId,
          input.updatedAtIso,
          existing.estimateId,
          input.companyId,
          input.estimateVersionId,
        );
    });
    transaction();
    return this.getEstimateVersionById(input.estimateVersionId, input.companyId);
  }

  public setEstimateVersionCalculation(
    input: SetEstimateVersionCalculationInput,
  ): EstimateVersionRecord | null {
    const result = this.database
      .prepare(`
        UPDATE estimate_versions
        SET commercial_draft_json = ?, calculation_json = ?, calculated_at_iso = ?,
          updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ? AND status = 'DRAFT'
      `)
      .run(
        JSON.stringify(input.commercialDraft),
        JSON.stringify(input.calculation),
        input.calculatedAtIso,
        input.updatedByUserId,
        input.updatedAtIso,
        input.estimateVersionId,
        input.companyId,
      );
    return result.changes > 0
      ? this.getEstimateVersionById(input.estimateVersionId, input.companyId)
      : null;
  }

  public setEstimateVersionStatus(input: SetEstimateVersionStatusInput): EstimateVersionRecord | null {
    const result = this.database
      .prepare(`
        UPDATE estimate_versions SET status = ?, updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(
        input.status,
        input.updatedByUserId,
        input.updatedAtIso,
        input.estimateVersionId,
        input.companyId,
      );
    return result.changes > 0
      ? this.getEstimateVersionById(input.estimateVersionId, input.companyId)
      : null;
  }

  public createEstimateVersion(input: CreateEstimateVersionInput): EstimateVersionRecord {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(`
          UPDATE estimate_versions SET status = 'SUPERSEDED', updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `)
        .run(input.updatedByUserId, input.updatedAtIso, input.parentVersionId, input.companyId);
      this.database
        .prepare(`
          INSERT INTO estimate_versions (
            id, estimate_id, company_id, version_number, parent_version_id, status, notes,
            commercial_draft_json, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.versionId,
          input.estimateId,
          input.companyId,
          input.versionNumber,
          input.parentVersionId,
          input.notes,
          JSON.stringify(input.commercialDraft),
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.replaceEstimateSelections(input.versionId, input.designRevisionIds);
      this.database
        .prepare(`
          UPDATE estimates SET current_version_id = ?, latest_version_number = ?,
            updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `)
        .run(
          input.versionId,
          input.versionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.estimateId,
          input.companyId,
        );
    });
    transaction();
    return this.getEstimateVersionById(input.versionId, input.companyId)!;
  }

  public setEstimateArchivedState(input: SetEstimateArchivedStateInput): EstimateRecord | null {
    const result = this.database
      .prepare(`
        UPDATE estimates SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.estimateId,
        input.companyId,
      );
    return result.changes > 0 ? this.getEstimateById(input.estimateId, input.companyId) : null;
  }

  public createQuote(input: CreateQuoteInput): QuoteRecord {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(`
          INSERT INTO quotes (
            id, company_id, project_id, estimate_id, reference, name, current_version_id,
            latest_version_number, is_archived, created_by_user_id, updated_by_user_id,
            created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
        `)
        .run(
          input.quoteId,
          input.companyId,
          input.projectId,
          input.estimateId,
          input.reference,
          input.name,
          input.versionId,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.database
        .prepare(`
          INSERT INTO quote_versions (
            id, quote_id, company_id, version_number, parent_version_id, estimate_version_id,
            status, title, customer_message, valid_until_iso, issued_at_iso, decided_at_iso,
            presentation_json, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, 1, NULL, ?, 'DRAFT', ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
        `)
        .run(
          input.versionId,
          input.quoteId,
          input.companyId,
          input.estimateVersionId,
          input.title,
          input.customerMessage,
          input.validUntilIso,
          JSON.stringify(input.presentation),
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
    });
    transaction();
    return this.getQuoteById(input.quoteId, input.companyId)!;
  }

  public listQuotesForProject(projectId: string, companyId: string): QuoteSummary[] {
    const rows = this.database
      .prepare(`
        SELECT
          q.*,
          qv.status AS current_status,
          e.reference AS estimate_reference,
          ev.version_number AS estimate_version_number,
          qv.valid_until_iso AS valid_until_iso
        FROM quotes q
        INNER JOIN quote_versions qv ON qv.id = q.current_version_id
        INNER JOIN estimates e ON e.id = q.estimate_id
        INNER JOIN estimate_versions ev ON ev.id = qv.estimate_version_id
        WHERE q.project_id = ? AND q.company_id = ?
        ORDER BY q.updated_at_iso DESC
      `)
      .all(projectId, companyId) as QuoteSummaryRow[];
    return rows.map(toQuoteSummary);
  }

  public getQuoteById(quoteId: string, companyId: string): QuoteRecord | null {
    const row = this.database
      .prepare("SELECT * FROM quotes WHERE id = ? AND company_id = ?")
      .get(quoteId, companyId) as QuoteRow | undefined;
    return row ? toQuote(row) : null;
  }

  public listQuoteVersions(quoteId: string, companyId: string): QuoteVersionRecord[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM quote_versions
        WHERE quote_id = ? AND company_id = ?
        ORDER BY version_number DESC
      `)
      .all(quoteId, companyId) as QuoteVersionRow[];
    return rows.map(toQuoteVersion);
  }

  public getQuoteVersionById(versionId: string, companyId: string): QuoteVersionRecord | null {
    const row = this.database
      .prepare("SELECT * FROM quote_versions WHERE id = ? AND company_id = ?")
      .get(versionId, companyId) as QuoteVersionRow | undefined;
    return row ? toQuoteVersion(row) : null;
  }

  public updateQuoteVersion(input: UpdateQuoteVersionInput): QuoteVersionRecord | null {
    const existing = this.getQuoteVersionById(input.quoteVersionId, input.companyId);
    if (!existing || existing.status !== "DRAFT") return null;
    this.database
      .prepare(`
        UPDATE quote_versions SET estimate_version_id = ?, title = ?, customer_message = ?,
          valid_until_iso = ?, presentation_json = ?, updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ? AND status = 'DRAFT'
      `)
      .run(
        input.estimateVersionId ?? existing.estimateVersionId,
        input.title ?? existing.title,
        input.customerMessage !== undefined ? input.customerMessage : existing.customerMessage,
        input.validUntilIso !== undefined ? input.validUntilIso : existing.validUntilIso,
        JSON.stringify(input.presentation ?? existing.presentation),
        input.updatedByUserId,
        input.updatedAtIso,
        input.quoteVersionId,
        input.companyId,
      );
    return this.getQuoteVersionById(input.quoteVersionId, input.companyId);
  }

  public setQuoteVersionStatus(input: SetQuoteVersionStatusInput): QuoteVersionRecord | null {
    const result = this.database
      .prepare(`
        UPDATE quote_versions SET status = ?, issued_at_iso = ?, decided_at_iso = ?,
          updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(
        input.status,
        input.issuedAtIso,
        input.decidedAtIso,
        input.updatedByUserId,
        input.updatedAtIso,
        input.quoteVersionId,
        input.companyId,
      );
    return result.changes > 0
      ? this.getQuoteVersionById(input.quoteVersionId, input.companyId)
      : null;
  }

  public createQuoteVersion(input: CreateQuoteVersionInput): QuoteVersionRecord {
    const transaction = this.database.transaction(() => {
      this.database
        .prepare(`
          UPDATE quote_versions SET status = 'SUPERSEDED', updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `)
        .run(input.updatedByUserId, input.updatedAtIso, input.parentVersionId, input.companyId);
      this.database
        .prepare(`
          INSERT INTO quote_versions (
            id, quote_id, company_id, version_number, parent_version_id, estimate_version_id,
            status, title, customer_message, valid_until_iso, issued_at_iso, decided_at_iso,
            presentation_json, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)
        `)
        .run(
          input.versionId,
          input.quoteId,
          input.companyId,
          input.versionNumber,
          input.parentVersionId,
          input.estimateVersionId,
          input.title,
          input.customerMessage,
          input.validUntilIso,
          JSON.stringify(input.presentation),
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.database
        .prepare(`
          UPDATE quotes SET current_version_id = ?, latest_version_number = ?,
            updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `)
        .run(
          input.versionId,
          input.versionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.quoteId,
          input.companyId,
        );
    });
    transaction();
    return this.getQuoteVersionById(input.versionId, input.companyId)!;
  }

  public setQuoteArchivedState(input: SetQuoteArchivedStateInput): QuoteRecord | null {
    const result = this.database
      .prepare(`
        UPDATE quotes SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.quoteId,
        input.companyId,
      );
    return result.changes > 0 ? this.getQuoteById(input.quoteId, input.companyId) : null;
  }
}

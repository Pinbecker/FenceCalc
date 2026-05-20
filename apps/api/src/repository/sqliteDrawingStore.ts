import type Database from "better-sqlite3";
import type {
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingRevisionSummary,
  DrawingSummary,
} from "@fence-estimator/contracts";

import type {
  DrawingRevisionRow,
  DrawingRevisionSummaryRow,
  DrawingRow,
  DrawingSummaryRow,
} from "./shared.js";
import {
  serializeEstimate,
  serializeLayout,
  serializeViewport,
  toDrawing,
  toDrawingRevision,
  toDrawingRevisionSummary,
  toDrawingSummary,
} from "./shared.js";
import type {
  CreateDrawingInput,
  CreateRevisionInput,
  DeleteDrawingInput,
  DeleteRevisionInput,
  RenameDrawingInput,
  SetDrawingArchivedStateInput,
  UpdateRevisionLayoutInput,
  UpdateRevisionNotesInput,
} from "./types.js";

export class SqliteDrawingStore {
  public constructor(private readonly database: Database.Database) {}

  public createDrawing(input: CreateDrawingInput): DrawingRecord {
    const tx = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO drawings (
            id, company_id, project_id, name, current_revision_id, latest_revision_number,
            is_archived, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)`,
        )
        .run(
          input.drawingId,
          input.companyId,
          input.projectId,
          input.name,
          input.initialRevisionId,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );

      this.database
        .prepare(
          `INSERT INTO drawing_revisions (
            id, drawing_id, company_id, revision_number, parent_revision_id, notes,
            layout_json, saved_viewport_json, estimate_json,
            schema_version, rules_version, version_number,
            created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, 1, NULL, NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        )
        .run(
          input.initialRevisionId,
          input.drawingId,
          input.companyId,
          serializeLayout(input.initialLayout),
          serializeViewport(input.initialViewport),
          serializeEstimate(input.initialEstimate),
          input.schemaVersion,
          input.rulesVersion,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
    });
    tx();
    return {
      id: input.drawingId,
      companyId: input.companyId,
      projectId: input.projectId,
      name: input.name,
      currentRevisionId: input.initialRevisionId,
      latestRevisionNumber: 1,
      isArchived: false,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public listDrawingsForProject(projectId: string, companyId: string): DrawingSummary[] {
    const rows = this.database
      .prepare(
        `SELECT
           d.*,
           r.layout_json AS layout_json,
           u_created.display_name AS created_by_display_name,
           u_updated.display_name AS updated_by_display_name
         FROM drawings d
         LEFT JOIN drawing_revisions r ON r.id = d.current_revision_id
         LEFT JOIN users u_created ON u_created.id = d.created_by_user_id
         LEFT JOIN users u_updated ON u_updated.id = d.updated_by_user_id
         WHERE d.project_id = ? AND d.company_id = ?
         ORDER BY d.updated_at_iso DESC`,
      )
      .all(projectId, companyId) as DrawingSummaryRow[];
    return rows.map((row) => toDrawingSummary(row));
  }

  public getDrawingById(drawingId: string, companyId: string): DrawingRecord | null {
    const row = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(drawingId, companyId) as DrawingRow | undefined;
    return row ? toDrawing(row) : null;
  }

  public renameDrawing(input: RenameDrawingInput): DrawingRecord | null {
    const existing = this.getDrawingById(input.drawingId, input.companyId);
    if (!existing) {
      return null;
    }
    this.database
      .prepare(
        "UPDATE drawings SET name = ?, updated_by_user_id = ?, updated_at_iso = ? WHERE id = ? AND company_id = ?",
      )
      .run(input.name, input.updatedByUserId, input.updatedAtIso, input.drawingId, input.companyId);
    return {
      ...existing,
      name: input.name,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): DrawingRecord | null {
    const existing = this.getDrawingById(input.drawingId, input.companyId);
    if (!existing) {
      return null;
    }
    this.database
      .prepare(
        "UPDATE drawings SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ? WHERE id = ? AND company_id = ?",
      )
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.drawingId,
        input.companyId,
      );
    return {
      ...existing,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public deleteDrawing(input: DeleteDrawingInput): boolean {
    const result = this.database
      .prepare("DELETE FROM drawings WHERE id = ? AND company_id = ? AND is_archived = 1")
      .run(input.drawingId, input.companyId);
    return result.changes > 0;
  }

  public createRevision(input: CreateRevisionInput): DrawingRevisionRecord {
    const tx = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO drawing_revisions (
            id, drawing_id, company_id, revision_number, parent_revision_id, notes,
            layout_json, saved_viewport_json, estimate_json,
            schema_version, rules_version, version_number,
            created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        )
        .run(
          input.revisionId,
          input.drawingId,
          input.companyId,
          input.revisionNumber,
          input.parentRevisionId,
          input.notes,
          serializeLayout(input.layout),
          serializeViewport(input.savedViewport),
          serializeEstimate(input.estimate),
          input.schemaVersion,
          input.rulesVersion,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.database
        .prepare(
          `UPDATE drawings
           SET current_revision_id = ?, latest_revision_number = ?,
               updated_by_user_id = ?, updated_at_iso = ?
           WHERE id = ? AND company_id = ?`,
        )
        .run(
          input.revisionId,
          input.revisionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.drawingId,
          input.companyId,
        );
    });
    tx();
    return {
      id: input.revisionId,
      drawingId: input.drawingId,
      companyId: input.companyId,
      revisionNumber: input.revisionNumber,
      parentRevisionId: input.parentRevisionId,
      notes: input.notes,
      layout: input.layout,
      savedViewport: input.savedViewport,
      estimate: input.estimate,
      schemaVersion: input.schemaVersion,
      rulesVersion: input.rulesVersion,
      versionNumber: 0,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public listRevisionsForDrawing(
    drawingId: string,
    companyId: string,
  ): DrawingRevisionSummary[] {
    const rows = this.database
      .prepare(
        `SELECT
           r.*,
           u_created.display_name AS created_by_display_name,
           u_updated.display_name AS updated_by_display_name
         FROM drawing_revisions r
         LEFT JOIN users u_created ON u_created.id = r.created_by_user_id
         LEFT JOIN users u_updated ON u_updated.id = r.updated_by_user_id
         WHERE r.drawing_id = ? AND r.company_id = ?
         ORDER BY r.revision_number DESC`,
      )
      .all(drawingId, companyId) as DrawingRevisionSummaryRow[];
    return rows.map((row) => toDrawingRevisionSummary(row));
  }

  public getRevisionById(
    revisionId: string,
    companyId: string,
  ): DrawingRevisionRecord | null {
    const row = this.database
      .prepare("SELECT * FROM drawing_revisions WHERE id = ? AND company_id = ?")
      .get(revisionId, companyId) as DrawingRevisionRow | undefined;
    return row ? toDrawingRevision(row) : null;
  }

  public updateRevisionLayout(
    input: UpdateRevisionLayoutInput,
  ): DrawingRevisionRecord | null {
    const existing = this.getRevisionById(input.revisionId, input.companyId);
    if (!existing) {
      return null;
    }
    if (existing.versionNumber !== input.expectedVersionNumber) {
      const err = new Error("Drawing revision has been modified by another user");
      (err as Error & { code?: string }).code = "VERSION_CONFLICT";
      throw err;
    }
    const nextVersion = existing.versionNumber + 1;
    this.database
      .prepare(
        `UPDATE drawing_revisions
         SET layout_json = ?, saved_viewport_json = ?, estimate_json = ?,
             schema_version = ?, rules_version = ?,
             version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
         WHERE id = ? AND company_id = ?`,
      )
      .run(
        serializeLayout(input.layout),
        serializeViewport(input.savedViewport),
        serializeEstimate(input.estimate),
        input.schemaVersion,
        input.rulesVersion,
        nextVersion,
        input.updatedByUserId,
        input.updatedAtIso,
        input.revisionId,
        input.companyId,
      );
    this.database
      .prepare(
        "UPDATE drawings SET updated_by_user_id = ?, updated_at_iso = ? WHERE id = ? AND company_id = ?",
      )
      .run(input.updatedByUserId, input.updatedAtIso, existing.drawingId, input.companyId);
    return {
      ...existing,
      layout: input.layout,
      savedViewport: input.savedViewport,
      estimate: input.estimate,
      schemaVersion: input.schemaVersion,
      rulesVersion: input.rulesVersion,
      versionNumber: nextVersion,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public updateRevisionNotes(
    input: UpdateRevisionNotesInput,
  ): DrawingRevisionRecord | null {
    const existing = this.getRevisionById(input.revisionId, input.companyId);
    if (!existing) {
      return null;
    }
    this.database
      .prepare(
        "UPDATE drawing_revisions SET notes = ?, updated_by_user_id = ?, updated_at_iso = ? WHERE id = ? AND company_id = ?",
      )
      .run(
        input.notes,
        input.updatedByUserId,
        input.updatedAtIso,
        input.revisionId,
        input.companyId,
      );
    return {
      ...existing,
      notes: input.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public deleteRevision(input: DeleteRevisionInput): boolean {
    const existing = this.getRevisionById(input.revisionId, input.companyId);
    if (!existing) {
      return false;
    }
    if (existing.revisionNumber === 1) {
      // Cannot delete root revision; that requires deleting the whole drawing.
      return false;
    }
    const drawing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(existing.drawingId, input.companyId) as DrawingRow | undefined;
    if (!drawing) {
      return false;
    }
    if (existing.id !== drawing.current_revision_id) {
      // Only allow deleting the latest (current) revision.
      return false;
    }

    const tx = this.database.transaction(() => {
      const fallback = this.database
        .prepare(
          `SELECT id, revision_number FROM drawing_revisions
           WHERE drawing_id = ? AND company_id = ? AND id != ?
           ORDER BY revision_number DESC LIMIT 1`,
        )
        .get(existing.drawingId, input.companyId, existing.id) as
        | { id: string; revision_number: number }
        | undefined;
      if (!fallback) {
        return false;
      }
      this.database
        .prepare("DELETE FROM drawing_revisions WHERE id = ? AND company_id = ?")
        .run(existing.id, input.companyId);
      this.database
        .prepare(
          `UPDATE drawings
           SET current_revision_id = ?, latest_revision_number = ?, updated_at_iso = ?
           WHERE id = ? AND company_id = ?`,
        )
        .run(
          fallback.id,
          fallback.revision_number,
          new Date().toISOString(),
          existing.drawingId,
          input.companyId,
        );
      return true;
    });
    const result = tx();
    return result === true;
  }
}

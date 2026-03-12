import Database from "better-sqlite3";
import type { DrawingRecord, DrawingVersionRecord } from "@fence-estimator/contracts";

import { type DrawingRow, type DrawingVersionRow, toDrawing, toDrawingSummary, toDrawingVersion } from "./shared.js";
import type {
  CreateDrawingInput,
  RestoreDrawingVersionInput,
  SetDrawingArchivedStateInput,
  UpdateDrawingInput
} from "./types.js";

export class SqliteDrawingStore {
  public constructor(private readonly database: Database.Database) {}

  public createDrawing(input: CreateDrawingInput): DrawingRecord {
    const insert = this.database.transaction(() => {
      this.database
        .prepare(
          `
            INSERT INTO drawings (
              id, company_id, name, layout_json, estimate_json, schema_version, rules_version, version_number, is_archived, archived_at_iso, archived_by_user_id,
              created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          input.id,
          input.companyId,
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          input.schemaVersion,
          input.rulesVersion,
          1,
          0,
          null,
          null,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, layout_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          `${input.id}:1`,
          input.id,
          input.companyId,
          input.schemaVersion,
          input.rulesVersion,
          1,
          "CREATE",
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          input.createdByUserId,
          input.createdAtIso,
        );
    });
    insert();
    return {
      ...input,
      versionNumber: 1,
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null
    };
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    const whereClause = scope === "ACTIVE" ? "AND is_archived = 0" : scope === "ARCHIVED" ? "AND is_archived = 1" : "";
    const rows = this.database
      .prepare(`SELECT * FROM drawings WHERE company_id = ? ${whereClause} ORDER BY updated_at_iso DESC`)
      .all(companyId) as DrawingRow[];
    return rows.map((row) => toDrawingSummary(toDrawing(row)));
  }

  public getDrawingById(drawingId: string, companyId: string): DrawingRecord | null {
    const row = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(drawingId, companyId) as DrawingRow | undefined;
    return row ? toDrawing(row) : null;
  }

  public updateDrawing(input: UpdateDrawingInput): DrawingRecord | null {
    const existing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return null;
    }

    const current = toDrawing(existing);
    const nextVersionNumber = current.versionNumber + 1;
    const update = this.database.transaction(() => {
      this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, layout_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          input.schemaVersion,
          input.rulesVersion,
          nextVersionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.drawingId,
          input.companyId,
        );
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, layout_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          `${input.drawingId}:${nextVersionNumber}`,
          input.drawingId,
          input.companyId,
          input.schemaVersion,
          input.rulesVersion,
          nextVersionNumber,
          "UPDATE",
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          input.updatedByUserId,
          input.updatedAtIso,
        );
    });
    update();

    return {
      ...current,
      name: input.name,
      layout: input.layout,
      estimate: input.estimate,
      schemaVersion: input.schemaVersion,
      rulesVersion: input.rulesVersion,
      versionNumber: nextVersionNumber,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): DrawingRecord | null {
    const existing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return null;
    }

    this.database
      .prepare(
        `
          UPDATE drawings
          SET is_archived = ?, archived_at_iso = ?, archived_by_user_id = ?, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `,
      )
      .run(
        input.archived ? 1 : 0,
        input.archived ? input.archivedAtIso : null,
        input.archived ? input.archivedByUserId : null,
        input.updatedByUserId,
        input.updatedAtIso,
        input.drawingId,
        input.companyId,
      );

    return {
      ...toDrawing(existing),
      isArchived: input.archived,
      archivedAtIso: input.archived ? input.archivedAtIso : null,
      archivedByUserId: input.archived ? input.archivedByUserId : null,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
  }

  public listDrawingVersions(drawingId: string, companyId: string): DrawingVersionRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT dv.*
          FROM drawing_versions dv
          INNER JOIN drawings d ON d.id = dv.drawing_id
          WHERE dv.drawing_id = ? AND dv.company_id = ? AND d.company_id = ?
          ORDER BY dv.version_number DESC
        `,
      )
      .all(drawingId, companyId, companyId) as DrawingVersionRow[];
    return rows.map((row) => toDrawingVersion(row));
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput): DrawingRecord | null {
    const existing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return null;
    }

    const version = this.database
      .prepare("SELECT * FROM drawing_versions WHERE drawing_id = ? AND company_id = ? AND version_number = ?")
      .get(input.drawingId, input.companyId, input.versionNumber) as DrawingVersionRow | undefined;
    if (!version) {
      return null;
    }

    const current = toDrawing(existing);
    const restoredVersionNumber = current.versionNumber + 1;
    const restoredVersion = toDrawingVersion(version);

    const restore = this.database.transaction(() => {
      this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, layout_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          version.name,
          version.layout_json,
          version.estimate_json,
          restoredVersion.schemaVersion,
          restoredVersion.rulesVersion,
          restoredVersionNumber,
          input.restoredByUserId,
          input.restoredAtIso,
          input.drawingId,
          input.companyId,
        );
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, layout_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          `${input.drawingId}:${restoredVersionNumber}`,
          input.drawingId,
          input.companyId,
          restoredVersion.schemaVersion,
          restoredVersion.rulesVersion,
          restoredVersionNumber,
          "RESTORE",
          version.name,
          version.layout_json,
          version.estimate_json,
          input.restoredByUserId,
          input.restoredAtIso,
        );
    });
    restore();

    return {
      ...current,
      name: restoredVersion.name,
      layout: restoredVersion.layout,
      estimate: restoredVersion.estimate,
      schemaVersion: restoredVersion.schemaVersion,
      rulesVersion: restoredVersion.rulesVersion,
      versionNumber: restoredVersionNumber,
      updatedByUserId: input.restoredByUserId,
      updatedAtIso: input.restoredAtIso
    };
  }
}

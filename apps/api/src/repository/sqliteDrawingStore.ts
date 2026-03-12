import Database from "better-sqlite3";
import type { DrawingRecord, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { type DrawingRow, type DrawingVersionRow, toDrawing, toDrawingSummary, toDrawingVersion } from "./shared.js";
import type {
  CreateDrawingInput,
  RestoreDrawingVersionInput,
  SetDrawingArchivedStateInput,
  UpdateDrawingInput
} from "./types.js";

export class SqliteDrawingStore {
  public constructor(private readonly database: Database.Database) {}

  private buildContributorMetadata(companyId: string, drawingIds: string[]) {
    const contributorIdsByDrawingId = new Map<string, Set<string>>();
    for (const drawingId of drawingIds) {
      contributorIdsByDrawingId.set(drawingId, new Set());
    }

    if (drawingIds.length > 0) {
      const placeholders = drawingIds.map(() => "?").join(", ");
      const contributorRows = this.database
        .prepare(
          `
            SELECT drawing_id, created_by_user_id
            FROM drawing_versions
            WHERE company_id = ? AND drawing_id IN (${placeholders})
          `,
        )
        .all(companyId, ...drawingIds) as Array<{ drawing_id: string; created_by_user_id: string }>;

      for (const row of contributorRows) {
        const bucket = contributorIdsByDrawingId.get(row.drawing_id);
        if (bucket) {
          bucket.add(row.created_by_user_id);
        }
      }
    }

    const userRows = this.database
      .prepare("SELECT id, display_name FROM users WHERE company_id = ?")
      .all(companyId) as Array<{ id: string; display_name: string }>;
    const userDisplayNameById = new Map(userRows.map((row) => [row.id, row.display_name] as const));

    return { contributorIdsByDrawingId, userDisplayNameById };
  }

  private toSummary(row: DrawingRow, metadata: ReturnType<SqliteDrawingStore["buildContributorMetadata"]>): DrawingSummary {
    const drawing = toDrawing(row);
    const contributorIds = metadata.contributorIdsByDrawingId.get(drawing.id) ?? new Set<string>();
    contributorIds.add(drawing.createdByUserId);
    contributorIds.add(drawing.updatedByUserId);
    const contributorUserIds = [...contributorIds];

    return toDrawingSummary(drawing, {
      createdByDisplayName: metadata.userDisplayNameById.get(drawing.createdByUserId) ?? "",
      updatedByDisplayName: metadata.userDisplayNameById.get(drawing.updatedByUserId) ?? "",
      contributorUserIds,
      contributorDisplayNames: contributorUserIds
        .map((userId) => metadata.userDisplayNameById.get(userId))
        .filter((displayName): displayName is string => typeof displayName === "string" && displayName.length > 0)
    });
  }

  public createDrawing(input: CreateDrawingInput): DrawingRecord {
    const insert = this.database.transaction(() => {
      this.database
        .prepare(
          `
            INSERT INTO drawings (
              id, company_id, name, customer_name, layout_json, viewport_json, estimate_json, schema_version, rules_version, version_number, is_archived, archived_at_iso, archived_by_user_id,
              created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          input.id,
          input.companyId,
          input.name,
          input.customerName,
          JSON.stringify(input.layout),
          input.savedViewport ? JSON.stringify(input.savedViewport) : null,
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
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, customer_name, layout_json, viewport_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          input.customerName,
          JSON.stringify(input.layout),
          input.savedViewport ? JSON.stringify(input.savedViewport) : null,
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
    const metadata = this.buildContributorMetadata(
      companyId,
      rows.map((row) => row.id)
    );
    return rows.map((row) => this.toSummary(row, metadata));
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
            SET name = ?, customer_name = ?, layout_json = ?, viewport_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          input.name,
          input.customerName,
          JSON.stringify(input.layout),
          input.savedViewport ? JSON.stringify(input.savedViewport) : null,
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
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, customer_name, layout_json, viewport_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          input.customerName,
          JSON.stringify(input.layout),
          input.savedViewport ? JSON.stringify(input.savedViewport) : null,
          JSON.stringify(input.estimate),
          input.updatedByUserId,
          input.updatedAtIso,
        );
    });
    update();

    return {
      ...current,
      name: input.name,
      customerName: input.customerName,
      layout: input.layout,
      savedViewport: input.savedViewport ?? null,
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
            SET name = ?, customer_name = ?, layout_json = ?, viewport_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          version.name,
          version.customer_name,
          version.layout_json,
          version.viewport_json ?? null,
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
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, customer_name, layout_json, viewport_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          version.customer_name,
          version.layout_json,
          version.viewport_json ?? null,
          version.estimate_json,
          input.restoredByUserId,
          input.restoredAtIso,
        );
    });
    restore();

    return {
      ...current,
      name: restoredVersion.name,
      customerName: restoredVersion.customerName,
      layout: restoredVersion.layout,
      savedViewport: restoredVersion.savedViewport ?? null,
      estimate: restoredVersion.estimate,
      schemaVersion: restoredVersion.schemaVersion,
      rulesVersion: restoredVersion.rulesVersion,
      versionNumber: restoredVersionNumber,
      updatedByUserId: input.restoredByUserId,
      updatedAtIso: input.restoredAtIso
    };
  }
}

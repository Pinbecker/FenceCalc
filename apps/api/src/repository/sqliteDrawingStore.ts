import Database from "better-sqlite3";
import { DRAWING_STATUSES, type DrawingRecord, type DrawingSummary, type DrawingVersionRecord } from "@fence-estimator/contracts";

import { type DrawingRow, type DrawingVersionRow, toDrawing, toDrawingSummary, toDrawingVersion } from "./shared.js";
import type {
  CreateDrawingInput,
  DeleteDrawingInput,
  RestoreDrawingVersionInput,
  SetDrawingArchivedStateInput,
  SetDrawingStatusInput,
  UpdateDrawingInput
} from "./types.js";

export class SqliteDrawingStore {
  public constructor(private readonly database: Database.Database) {}

  private normalizeDrawingStatus(raw: string): DrawingRecord["status"] {
    return (DRAWING_STATUSES as readonly string[]).includes(raw) ? (raw as DrawingRecord["status"]) : "DRAFT";
  }

  private tryReadDrawing(row: DrawingRow): DrawingRecord | null {
    try {
      return toDrawing(row);
    } catch {
      return null;
    }
  }

  private tryReadDrawingVersion(row: DrawingVersionRow): DrawingVersionRecord | null {
    try {
      return toDrawingVersion(row);
    } catch {
      return null;
    }
  }

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
    const drawing = this.tryReadDrawing(row);
    if (!drawing) {
      throw new Error(`Unable to summarize corrupt drawing ${row.id}`);
    }
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
              id, company_id, name, customer_id, customer_name, layout_json, viewport_json, estimate_json, schema_version, rules_version, version_number, is_archived, archived_at_iso, archived_by_user_id,
              created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          input.id,
          input.companyId,
          input.name,
          input.customerId,
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
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, customer_id, customer_name, layout_json, viewport_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          input.customerId,
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
      status: "DRAFT" as const,
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null,
      statusChangedAtIso: null,
      statusChangedByUserId: null
    };
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE", search = "") {
    const whereClause =
      scope === "ACTIVE" ? "AND d.is_archived = 0" : scope === "ARCHIVED" ? "AND d.is_archived = 1" : "";
    const searchClause = search.trim()
      ? "AND (lower(d.name) LIKE ? OR lower(COALESCE(c.name, d.customer_name)) LIKE ?)"
      : "";
    const params: unknown[] = [companyId];
    if (search.trim()) {
      const normalized = `%${search.trim().toLowerCase()}%`;
      params.push(normalized, normalized);
    }
    const rows = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.company_id = ? ${whereClause} ${searchClause}
        ORDER BY d.updated_at_iso DESC
      `)
      .all(...params) as DrawingRow[];
    const metadata = this.buildContributorMetadata(
      companyId,
      rows.map((row) => row.id)
    );
    return rows.flatMap((row) => {
      const drawing = this.tryReadDrawing(row);
      if (!drawing) {
        return [];
      }
      const contributorIds = metadata.contributorIdsByDrawingId.get(drawing.id) ?? new Set<string>();
      contributorIds.add(drawing.createdByUserId);
      contributorIds.add(drawing.updatedByUserId);
      const contributorUserIds = [...contributorIds];

      return [toDrawingSummary(drawing, {
        createdByDisplayName: metadata.userDisplayNameById.get(drawing.createdByUserId) ?? "",
        updatedByDisplayName: metadata.userDisplayNameById.get(drawing.updatedByUserId) ?? "",
        contributorUserIds,
        contributorDisplayNames: contributorUserIds
          .map((userId) => metadata.userDisplayNameById.get(userId))
          .filter((displayName): displayName is string => typeof displayName === "string" && displayName.length > 0)
      })];
    });
  }

  public getDrawingById(drawingId: string, companyId: string): DrawingRecord | null {
    const row = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.id = ? AND d.company_id = ?
      `)
      .get(drawingId, companyId) as DrawingRow | undefined;
    return row ? this.tryReadDrawing(row) : null;
  }

  public updateDrawing(input: UpdateDrawingInput): DrawingRecord | null {
    const nextVersionNumber = input.expectedVersionNumber + 1;
    const update = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, customer_id = ?, customer_name = ?, layout_json = ?, viewport_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ? AND version_number = ?
          `,
        )
        .run(
          input.name,
          input.customerId,
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
          input.expectedVersionNumber,
        );
      if (result.changes === 0) {
        return null;
      }
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, customer_id, customer_name, layout_json, viewport_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          input.customerId,
          input.customerName,
          JSON.stringify(input.layout),
          input.savedViewport ? JSON.stringify(input.savedViewport) : null,
          JSON.stringify(input.estimate),
          input.updatedByUserId,
          input.updatedAtIso,
        );
      const row = this.database
        .prepare(`
          SELECT d.*, c.name AS resolved_customer_name
          FROM drawings d
          LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
          WHERE d.id = ? AND d.company_id = ?
        `)
        .get(input.drawingId, input.companyId) as DrawingRow | undefined;
      return row ? this.tryReadDrawing(row) : null;
    });
    return update();
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): DrawingRecord | null {
    const result = this.database
      .prepare(
        `
          UPDATE drawings
          SET is_archived = ?, archived_at_iso = ?, archived_by_user_id = ?, version_number = version_number + 1, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ? AND version_number = ?
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
        input.expectedVersionNumber,
      );
    if (result.changes === 0) {
      return null;
    }

    const row = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.id = ? AND d.company_id = ?
      `)
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    return row ? this.tryReadDrawing(row) : null;
  }

  public setDrawingStatus(input: SetDrawingStatusInput): DrawingRecord | null {
    const result = this.database
      .prepare(
        `
          UPDATE drawings
          SET status = ?, status_changed_at_iso = ?, status_changed_by_user_id = ?, version_number = version_number + 1, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ? AND version_number = ?
        `,
      )
      .run(
        input.status,
        input.statusChangedAtIso,
        input.statusChangedByUserId,
        input.updatedByUserId,
        input.updatedAtIso,
        input.drawingId,
        input.companyId,
        input.expectedVersionNumber,
      );
    if (result.changes === 0) {
      return null;
    }

    const row = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.id = ? AND d.company_id = ?
      `)
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    return row ? this.tryReadDrawing(row) : null;
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
    return rows.flatMap((row) => {
      const version = this.tryReadDrawingVersion(row);
      return version ? [version] : [];
    });
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput): DrawingRecord | null {
    const version = this.database
      .prepare("SELECT * FROM drawing_versions WHERE drawing_id = ? AND company_id = ? AND version_number = ?")
      .get(input.drawingId, input.companyId, input.versionNumber) as DrawingVersionRow | undefined;
    if (!version) {
      return null;
    }

    const restoredVersion = this.tryReadDrawingVersion(version);
    if (!restoredVersion) {
      return null;
    }

    const restoredVersionNumber = input.expectedVersionNumber + 1;

    const restore = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, customer_id = ?, customer_name = ?, layout_json = ?, viewport_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ? AND version_number = ?
          `,
        )
        .run(
          version.name,
          input.customerId,
          input.customerName,
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
          input.expectedVersionNumber,
        );
      if (result.changes === 0) {
        return null;
      }
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, schema_version, rules_version, version_number, source, name, customer_id, customer_name, layout_json, viewport_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          input.customerId,
          input.customerName,
          version.layout_json,
          version.viewport_json ?? null,
          version.estimate_json,
          input.restoredByUserId,
          input.restoredAtIso,
        );
      const row = this.database
        .prepare(`
          SELECT d.*, c.name AS resolved_customer_name
          FROM drawings d
          LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
          WHERE d.id = ? AND d.company_id = ?
        `)
        .get(input.drawingId, input.companyId) as DrawingRow | undefined;
      return row ? this.tryReadDrawing(row) : null;
    });
    return restore();
  }

  public listDrawingsForCustomer(customerId: string, companyId: string): DrawingSummary[] {
    const rows = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.company_id = ? AND d.customer_id = ?
        ORDER BY d.updated_at_iso DESC
      `)
      .all(companyId, customerId) as DrawingRow[];
    const metadata = this.buildContributorMetadata(
      companyId,
      rows.map((row) => row.id)
    );
    return rows.flatMap((row) => {
      const drawing = this.tryReadDrawing(row);
      if (!drawing) {
        return [];
      }
      const contributorIds = metadata.contributorIdsByDrawingId.get(drawing.id) ?? new Set<string>();
      contributorIds.add(drawing.createdByUserId);
      contributorIds.add(drawing.updatedByUserId);
      const contributorUserIds = [...contributorIds];
      return [toDrawingSummary(drawing, {
        createdByDisplayName: metadata.userDisplayNameById.get(drawing.createdByUserId) ?? "",
        updatedByDisplayName: metadata.userDisplayNameById.get(drawing.updatedByUserId) ?? "",
        contributorUserIds,
        contributorDisplayNames: contributorUserIds
          .map((userId) => metadata.userDisplayNameById.get(userId))
          .filter((displayName): displayName is string => typeof displayName === "string" && displayName.length > 0)
      })];
    });
  }

  public deleteDrawing(input: DeleteDrawingInput): boolean {
    const existing = this.database
      .prepare("SELECT id, is_archived FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as { id: string; is_archived: number } | undefined;
    if (!existing) {
      return false;
    }
    const doDelete = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM drawing_versions WHERE drawing_id = ? AND company_id = ?")
        .run(input.drawingId, input.companyId);
      this.database
        .prepare("DELETE FROM quotes WHERE drawing_id = ? AND company_id = ?")
        .run(input.drawingId, input.companyId);
      this.database
        .prepare("DELETE FROM drawings WHERE id = ? AND company_id = ?")
        .run(input.drawingId, input.companyId);
    });
    doDelete();
    return true;
  }
}

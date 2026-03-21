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
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null
    };
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    const whereClause =
      scope === "ACTIVE" ? "AND d.is_archived = 0" : scope === "ARCHIVED" ? "AND d.is_archived = 1" : "";
    const rows = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.company_id = ? ${whereClause}
        ORDER BY d.updated_at_iso DESC
      `)
      .all(companyId) as DrawingRow[];
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
    const existing = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.id = ? AND d.company_id = ?
      `)
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return null;
    }

    const current = this.tryReadDrawing(existing);
    if (!current) {
      return null;
    }
    const nextVersionNumber = current.versionNumber + 1;
    const update = this.database.transaction(() => {
      this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, customer_id = ?, customer_name = ?, layout_json = ?, viewport_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
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
    });
    update();

    return {
      ...current,
      name: input.name,
      customerId: input.customerId,
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
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.id = ? AND d.company_id = ?
      `)
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
      ...(this.tryReadDrawing(existing) ?? {
        id: existing.id,
        companyId: existing.company_id,
        name: existing.name,
        customerId: existing.customer_id,
        customerName: existing.resolved_customer_name ?? existing.customer_name,
        layout: { segments: [] },
        estimate: {
          posts: {
            terminal: 0,
            intermediate: 0,
            total: 0,
            cornerPosts: 0,
            byHeightAndType: {},
            byHeightMm: {}
          },
          corners: {
            total: 0,
            internal: 0,
            external: 0,
            unclassified: 0
          },
          materials: {
            twinBarPanels: 0,
            twinBarPanelsSuperRebound: 0,
            twinBarPanelsByStockHeightMm: {},
            twinBarPanelsByFenceHeight: {},
            roll2100: 0,
            roll900: 0,
            totalRolls: 0,
            rollsByFenceHeight: {}
          },
          optimization: {
            strategy: "CHAINED_CUT_PLANNER",
            twinBar: {
              reuseAllowanceMm: 200,
              stockPanelWidthMm: 2525,
              fixedFullPanels: 0,
              baselinePanels: 0,
              optimizedPanels: 0,
              panelsSaved: 0,
              totalCutDemands: 0,
              stockPanelsOpened: 0,
              reusedCuts: 0,
              totalConsumedMm: 0,
              totalLeftoverMm: 0,
              reusableLeftoverMm: 0,
              utilizationRate: 0,
              buckets: []
            }
          },
          segments: []
        },
        schemaVersion: existing.schema_version,
        rulesVersion: existing.rules_version,
        versionNumber: existing.version_number,
        isArchived: existing.is_archived === 1,
        archivedAtIso: existing.archived_at_iso,
        archivedByUserId: existing.archived_by_user_id,
        createdByUserId: existing.created_by_user_id,
        updatedByUserId: existing.updated_by_user_id,
        createdAtIso: existing.created_at_iso,
        updatedAtIso: existing.updated_at_iso
      }),
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
    return rows.flatMap((row) => {
      const version = this.tryReadDrawingVersion(row);
      return version ? [version] : [];
    });
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput): DrawingRecord | null {
    const existing = this.database
      .prepare(`
        SELECT d.*, c.name AS resolved_customer_name
        FROM drawings d
        LEFT JOIN customers c ON c.id = d.customer_id AND c.company_id = d.company_id
        WHERE d.id = ? AND d.company_id = ?
      `)
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

    const current = this.tryReadDrawing(existing);
    if (!current) {
      return null;
    }
    const restoredVersionNumber = current.versionNumber + 1;
    const restoredVersion = this.tryReadDrawingVersion(version);
    if (!restoredVersion) {
      return null;
    }

    const restore = this.database.transaction(() => {
      this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, customer_id = ?, customer_name = ?, layout_json = ?, viewport_json = ?, estimate_json = ?, schema_version = ?, rules_version = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
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
    });
    restore();

    return {
      ...current,
      name: restoredVersion.name,
      customerId: input.customerId,
      customerName: input.customerName,
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

import type Database from "better-sqlite3";
import type { ProjectRecord, ProjectSummary } from "@fence-estimator/contracts";

import type { ProjectRow, ProjectSummaryRow } from "./shared.js";
import { toProject, toProjectSummary } from "./shared.js";
import type {
  CreateProjectInput,
  DeleteProjectInput,
  ScopeFilter,
  SetProjectArchivedStateInput,
  SetProjectStatusInput,
  UpdateProjectInput,
} from "./types.js";

const SUMMARY_SELECT = `
  SELECT
    p.*,
    c.name AS customer_name,
    (SELECT COUNT(*) FROM drawings d WHERE d.project_id = p.id AND d.is_archived = 0) AS drawing_count,
    (
      SELECT MAX(d.updated_at_iso) FROM drawings d WHERE d.project_id = p.id
    ) AS last_activity_at_iso
  FROM projects p
  INNER JOIN customers c ON c.id = p.customer_id
`;

export class SqliteProjectStore {
  public constructor(private readonly database: Database.Database) {}

  public createProject(input: CreateProjectInput): ProjectRecord {
    this.database
      .prepare(
        `INSERT INTO projects (
          id, company_id, customer_id, name, status, notes, is_archived,
          status_changed_at_iso, status_changed_by_user_id,
          created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.companyId,
        input.customerId,
        input.name,
        input.status,
        input.notes,
        input.createdAtIso,
        input.createdByUserId,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      );
    return {
      id: input.id,
      companyId: input.companyId,
      customerId: input.customerId,
      name: input.name,
      status: input.status,
      notes: input.notes,
      isArchived: false,
      statusChangedAtIso: input.createdAtIso,
      statusChangedByUserId: input.createdByUserId,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public listProjects(
    companyId: string,
    options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
  ): ProjectSummary[] {
    const { scope = "ACTIVE", customerId, search } = options;
    const where = ["p.company_id = ?"];
    const values: Array<string | number> = [companyId];
    if (scope === "ACTIVE") {
      where.push("p.is_archived = 0");
    } else if (scope === "ARCHIVED") {
      where.push("p.is_archived = 1");
    }
    if (customerId) {
      where.push("p.customer_id = ?");
      values.push(customerId);
    }
    const trimmed = search?.trim();
    if (trimmed) {
      where.push("(LOWER(p.name) LIKE ? OR LOWER(c.name) LIKE ?)");
      const needle = `%${trimmed.toLowerCase()}%`;
      values.push(needle, needle);
    }
    const rows = this.database
      .prepare(
        `${SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.updated_at_iso DESC`,
      )
      .all(...values) as ProjectSummaryRow[];
    return rows.map((row) => toProjectSummary(row));
  }

  public getProjectById(projectId: string, companyId: string): ProjectRecord | null {
    const row = this.database
      .prepare("SELECT * FROM projects WHERE id = ? AND company_id = ?")
      .get(projectId, companyId) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  public updateProject(input: UpdateProjectInput): ProjectRecord | null {
    const existing = this.getProjectById(input.projectId, input.companyId);
    if (!existing) {
      return null;
    }
    const next: ProjectRecord = {
      ...existing,
      name: input.name ?? existing.name,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    this.database
      .prepare(
        `UPDATE projects SET name = ?, notes = ?, updated_by_user_id = ?, updated_at_iso = ?
         WHERE id = ? AND company_id = ?`,
      )
      .run(
        next.name,
        next.notes,
        next.updatedByUserId,
        next.updatedAtIso,
        input.projectId,
        input.companyId,
      );
    return next;
  }

  public setProjectStatus(input: SetProjectStatusInput): ProjectRecord | null {
    const existing = this.getProjectById(input.projectId, input.companyId);
    if (!existing) {
      return null;
    }
    this.database
      .prepare(
        `UPDATE projects
         SET status = ?, status_changed_at_iso = ?, status_changed_by_user_id = ?,
             updated_by_user_id = ?, updated_at_iso = ?
         WHERE id = ? AND company_id = ?`,
      )
      .run(
        input.status,
        input.statusChangedAtIso,
        input.statusChangedByUserId,
        input.updatedByUserId,
        input.updatedAtIso,
        input.projectId,
        input.companyId,
      );
    return {
      ...existing,
      status: input.status,
      statusChangedAtIso: input.statusChangedAtIso,
      statusChangedByUserId: input.statusChangedByUserId,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public setProjectArchivedState(input: SetProjectArchivedStateInput): ProjectRecord | null {
    const existing = this.getProjectById(input.projectId, input.companyId);
    if (!existing) {
      return null;
    }
    this.database
      .prepare(
        "UPDATE projects SET is_archived = ?, updated_by_user_id = ?, updated_at_iso = ? WHERE id = ? AND company_id = ?",
      )
      .run(
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.projectId,
        input.companyId,
      );
    return {
      ...existing,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public deleteProject(input: DeleteProjectInput): boolean {
    const result = this.database
      .prepare("DELETE FROM projects WHERE id = ? AND company_id = ? AND is_archived = 1")
      .run(input.projectId, input.companyId);
    return result.changes > 0;
  }
}

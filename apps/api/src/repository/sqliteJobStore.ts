import Database from "better-sqlite3";
import type {
  DrawingTaskRecord,
  DrawingWorkspaceRecord,
  DrawingWorkspaceSummary,
  JobRecord,
  JobSummary,
  JobTaskRecord,
} from "@fence-estimator/contracts";

import {
  type JobRow,
  type JobSummaryRow,
  type JobTaskRow,
  toJob,
  toJobSummary,
  toJobTask,
} from "./shared.js";
import type {
  CreateDrawingWorkspaceInput,
  CompanyTaskListOptions,
  DeleteJobInput,
  CreateJobInput,
  CreateJobTaskInput,
  CustomerScope,
  SetJobPrimaryDrawingInput,
  UpdateDrawingWorkspaceInput,
  UpdateJobInput,
  UpdateJobTaskInput,
} from "./types.js";

export class SqliteJobStore {
  public constructor(private readonly database: Database.Database) {}

  private toDrawingTaskRecord(task: JobTaskRecord): DrawingTaskRecord {
    return {
      id: task.id,
      companyId: task.companyId,
      workspaceId: task.jobId,
      workspaceName: task.jobName,
      rootDrawingId: task.drawingId,
      rootDrawingName: task.drawingName,
      revisionDrawingId: task.revisionDrawingId ?? null,
      revisionDrawingName: task.revisionDrawingName ?? "",
      title: task.title,
      description: task.description,
      priority: task.priority,
      isCompleted: task.isCompleted,
      assignedUserId: task.assignedUserId,
      assignedUserDisplayName: task.assignedUserDisplayName,
      dueAtIso: task.dueAtIso,
      completedAtIso: task.completedAtIso,
      completedByUserId: task.completedByUserId,
      completedByDisplayName: task.completedByDisplayName,
      createdByUserId: task.createdByUserId,
      createdAtIso: task.createdAtIso,
      updatedAtIso: task.updatedAtIso,
    };
  }

  private buildPlaceholderJobExclusionClause(): string {
    return `
      AND NOT (
        j.id LIKE 'job:%'
        AND NOT EXISTS (
          SELECT 1
          FROM drawings live_drawings
          WHERE live_drawings.company_id = j.company_id AND live_drawings.job_id = j.id
        )
      )
    `;
  }

  private buildJobWhereClause(scope: CustomerScope, customerId?: string, search = "") {
    const archivedClause =
      scope === "ACTIVE"
        ? "AND j.is_archived = 0"
        : scope === "ARCHIVED"
          ? "AND j.is_archived = 1"
          : "";
    const searchClause = search.trim()
      ? "AND (lower(j.name) LIKE ? OR lower(COALESCE(c.name, j.customer_name)) LIKE ?)"
      : "";
    const customerClause = customerId ? "AND j.customer_id = ?" : "";

    return { archivedClause, searchClause, customerClause };
  }

  private buildJobListParams(companyId: string, customerId?: string, search = ""): unknown[] {
    const params: unknown[] = [companyId];
    if (customerId) {
      params.push(customerId);
    }
    if (search.trim()) {
      const normalized = `%${search.trim().toLowerCase()}%`;
      params.push(normalized, normalized);
    }
    return params;
  }

  private getJobRow(jobId: string, companyId: string): JobRow | undefined {
    return this.database
      .prepare(
        `
        SELECT
          j.*,
          c.name AS resolved_customer_name,
          owner.display_name AS owner_display_name,
          updater.display_name AS updated_by_display_name
        FROM jobs j
        LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
        LEFT JOIN users owner ON owner.id = j.owner_user_id AND owner.company_id = j.company_id
        LEFT JOIN users updater ON updater.id = j.updated_by_user_id AND updater.company_id = j.company_id
        WHERE j.id = ? AND j.company_id = ?
      `,
      )
      .get(jobId, companyId) as JobRow | undefined;
  }

  private getTaskRow(taskId: string, jobId: string, companyId: string): JobTaskRow | undefined {
    return this.database
      .prepare(
        `
        SELECT
          t.*,
          j.name AS job_name,
          drawing_root.name AS drawing_name,
          revision_drawing.name AS revision_drawing_name,
          assigned.display_name AS assigned_user_display_name,
          completed.display_name AS completed_by_display_name
        FROM job_tasks t
        LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = t.company_id
        LEFT JOIN drawings drawing_root ON drawing_root.id = t.drawing_id AND drawing_root.company_id = t.company_id
        LEFT JOIN drawings revision_drawing ON revision_drawing.id = t.revision_drawing_id AND revision_drawing.company_id = t.company_id
        LEFT JOIN users assigned ON assigned.id = t.assigned_user_id AND assigned.company_id = t.company_id
        LEFT JOIN users completed ON completed.id = t.completed_by_user_id AND completed.company_id = t.company_id
        WHERE t.id = ? AND t.job_id = ? AND t.company_id = ?
      `,
      )
      .get(taskId, jobId, companyId) as JobTaskRow | undefined;
  }

  public createJob(input: CreateJobInput): JobRecord {
    this.database
      .prepare(
        `
        INSERT INTO jobs (
          id,
          company_id,
          customer_id,
          customer_name,
          name,
          stage,
          primary_drawing_id,
          commercial_inputs_json,
          notes,
          owner_user_id,
          is_archived,
          archived_at_iso,
          archived_by_user_id,
          stage_changed_at_iso,
          stage_changed_by_user_id,
          created_by_user_id,
          updated_by_user_id,
          created_at_iso,
          updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, ?, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.companyId,
        input.customerId,
        input.customerName,
        input.name,
        input.stage,
        input.primaryDrawingId,
        JSON.stringify(input.commercialInputs),
        input.notes,
        input.ownerUserId,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      );

    const row = this.getJobRow(input.id, input.companyId);
    if (!row) {
      throw new Error(`Created job ${input.id} could not be reloaded`);
    }
    return toJob(row);
  }

  public createDrawingWorkspace(input: CreateDrawingWorkspaceInput): DrawingWorkspaceRecord {
    return this.createJob(input);
  }

  public listJobs(
    companyId: string,
    scope: CustomerScope = "ACTIVE",
    search = "",
    customerId?: string,
  ): JobSummary[] {
    const { archivedClause, searchClause, customerClause } = this.buildJobWhereClause(
      scope,
      customerId,
      search,
    );
    const placeholderExclusionClause = this.buildPlaceholderJobExclusionClause();
    const params = this.buildJobListParams(companyId, customerId, search);

    try {
      const rows = this.database
        .prepare(
          `
          SELECT
            j.*,
            c.name AS resolved_customer_name,
            owner.display_name AS owner_display_name,
            updater.display_name AS updated_by_display_name,
            (
              SELECT COUNT(*)
              FROM drawings d
              WHERE d.company_id = j.company_id AND d.job_id = j.id
            ) AS drawing_count,
            (
              SELECT COUNT(*)
              FROM job_tasks t
              WHERE t.company_id = j.company_id AND t.job_id = j.id AND t.is_completed = 0
            ) AS open_task_count,
            (
              SELECT COUNT(*)
              FROM job_tasks t
              WHERE t.company_id = j.company_id AND t.job_id = j.id AND t.is_completed = 1
            ) AS completed_task_count,
            NULLIF(MAX(
              COALESCE(j.updated_at_iso, ''),
              COALESCE((SELECT MAX(d.updated_at_iso) FROM drawings d WHERE d.company_id = j.company_id AND d.job_id = j.id), ''),
              COALESCE((SELECT MAX(t.updated_at_iso) FROM job_tasks t WHERE t.company_id = j.company_id AND t.job_id = j.id), ''),
              COALESCE((SELECT MAX(q.created_at_iso) FROM quotes q WHERE q.company_id = j.company_id AND q.job_id = j.id), '')
            ), '') AS last_activity_at_iso,
            (
              SELECT CAST(json_extract(q.quote_json, '$.pricedEstimate.totals.totalCost') AS REAL)
              FROM quotes q
              WHERE q.company_id = j.company_id AND q.job_id = j.id
              ORDER BY q.created_at_iso DESC
              LIMIT 1
            ) AS latest_quote_total,
            (
              SELECT q.created_at_iso
              FROM quotes q
              WHERE q.company_id = j.company_id AND q.job_id = j.id
              ORDER BY q.created_at_iso DESC
              LIMIT 1
            ) AS latest_quote_created_at_iso,
            NULL AS latest_estimate_total,
            d.name AS primary_drawing_name,
            d.updated_at_iso AS primary_drawing_updated_at_iso,
            d.layout_json AS primary_layout_json
          FROM jobs j
          LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
          LEFT JOIN users owner ON owner.id = j.owner_user_id AND owner.company_id = j.company_id
          LEFT JOIN users updater ON updater.id = j.updated_by_user_id AND updater.company_id = j.company_id
          LEFT JOIN drawings d ON d.id = j.primary_drawing_id AND d.company_id = j.company_id
          WHERE j.company_id = ? ${customerClause} ${archivedClause} ${searchClause} ${placeholderExclusionClause}
          ORDER BY COALESCE(j.updated_at_iso, j.created_at_iso) DESC
        `,
        )
        .all(...params) as JobSummaryRow[];

      return rows.map((row) => toJobSummary(row));
    } catch {
      const fallbackRows = this.database
        .prepare(
          `
          SELECT
            j.*,
            c.name AS resolved_customer_name,
            owner.display_name AS owner_display_name,
            updater.display_name AS updated_by_display_name,
            CASE
              WHEN TRIM(COALESCE(j.primary_drawing_id, '')) <> '' THEN 1
              ELSE 0
            END AS drawing_count,
            0 AS open_task_count,
            0 AS completed_task_count,
            COALESCE(j.updated_at_iso, j.created_at_iso) AS last_activity_at_iso,
            NULL AS latest_quote_total,
            NULL AS latest_quote_created_at_iso,
            NULL AS latest_estimate_total,
            NULL AS primary_drawing_name,
            NULL AS primary_drawing_updated_at_iso,
            NULL AS primary_layout_json
          FROM jobs j
          LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
          LEFT JOIN users owner ON owner.id = j.owner_user_id AND owner.company_id = j.company_id
          LEFT JOIN users updater ON updater.id = j.updated_by_user_id AND updater.company_id = j.company_id
          WHERE j.company_id = ? ${customerClause} ${archivedClause} ${searchClause} ${placeholderExclusionClause}
          ORDER BY COALESCE(j.updated_at_iso, j.created_at_iso) DESC
        `,
        )
        .all(...params) as JobSummaryRow[];

      return fallbackRows.flatMap((row) => {
        try {
          return [toJobSummary(row)];
        } catch {
          return [];
        }
      });
    }
  }

  public listDrawingWorkspaces(
    companyId: string,
    scope: CustomerScope = "ACTIVE",
    search = "",
    customerId?: string,
  ): DrawingWorkspaceSummary[] {
    return this.listJobs(companyId, scope, search, customerId);
  }

  public listJobsForCustomer(customerId: string, companyId: string): JobSummary[] {
    return this.listJobs(companyId, "ALL", "", customerId);
  }

  public listDrawingWorkspacesForCustomer(
    customerId: string,
    companyId: string,
  ): DrawingWorkspaceSummary[] {
    return this.listDrawingWorkspaces(companyId, "ALL", "", customerId);
  }

  public getJobById(jobId: string, companyId: string): JobRecord | null {
    const row = this.getJobRow(jobId, companyId);
    return row ? toJob(row) : null;
  }

  public getDrawingWorkspaceById(
    workspaceId: string,
    companyId: string,
  ): DrawingWorkspaceRecord | null {
    return this.getJobById(workspaceId, companyId);
  }

  public updateJob(input: UpdateJobInput): JobRecord | null {
    const result = this.database
      .prepare(
        `
        UPDATE jobs
        SET
          name = ?,
          stage = ?,
          commercial_inputs_json = ?,
          notes = ?,
          owner_user_id = ?,
          is_archived = ?,
          archived_at_iso = ?,
          archived_by_user_id = ?,
          stage_changed_at_iso = ?,
          stage_changed_by_user_id = ?,
          updated_by_user_id = ?,
          updated_at_iso = ?
        WHERE id = ? AND company_id = ?
      `,
      )
      .run(
        input.name,
        input.stage,
        JSON.stringify(input.commercialInputs),
        input.notes,
        input.ownerUserId,
        input.archived ? 1 : 0,
        input.archivedAtIso,
        input.archivedByUserId,
        input.stageChangedAtIso,
        input.stageChangedByUserId,
        input.updatedByUserId,
        input.updatedAtIso,
        input.jobId,
        input.companyId,
      );
    if (result.changes === 0) {
      return null;
    }
    const row = this.getJobRow(input.jobId, input.companyId);
    return row ? toJob(row) : null;
  }

  public updateDrawingWorkspace(
    input: UpdateDrawingWorkspaceInput,
  ): DrawingWorkspaceRecord | null {
    return this.updateJob({ ...input, jobId: input.workspaceId });
  }

  public deleteJob(input: DeleteJobInput): boolean {
    const existing = this.database
      .prepare("SELECT id FROM jobs WHERE id = ? AND company_id = ?")
      .get(input.jobId, input.companyId) as { id: string } | undefined;
    if (!existing) {
      return false;
    }

    const doDelete = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM job_tasks WHERE job_id = ? AND company_id = ?")
        .run(input.jobId, input.companyId);
      this.database
        .prepare("DELETE FROM quotes WHERE job_id = ? AND company_id = ?")
        .run(input.jobId, input.companyId);
      this.database
        .prepare(
          `
          DELETE FROM drawing_versions
          WHERE company_id = ? AND drawing_id IN (
            SELECT id
            FROM drawings
            WHERE company_id = ? AND job_id = ?
          )
        `,
        )
        .run(input.companyId, input.companyId, input.jobId);
      this.database
        .prepare("DELETE FROM drawings WHERE job_id = ? AND company_id = ?")
        .run(input.jobId, input.companyId);
      this.database
        .prepare("DELETE FROM jobs WHERE id = ? AND company_id = ?")
        .run(input.jobId, input.companyId);
    });

    doDelete();
    return true;
  }

  public setJobPrimaryDrawing(input: SetJobPrimaryDrawingInput): JobRecord | null {
    const transact = this.database.transaction(() => {
      const drawing = this.database
        .prepare(
          `
          SELECT id
          FROM drawings
          WHERE id = ? AND job_id = ? AND company_id = ?
        `,
        )
        .get(input.drawingId, input.jobId, input.companyId) as { id: string } | undefined;
      if (!drawing) {
        return null;
      }

      this.database
        .prepare(`UPDATE drawings SET job_role = 'SECONDARY' WHERE job_id = ? AND company_id = ?`)
        .run(input.jobId, input.companyId);
      this.database
        .prepare(
          `UPDATE drawings SET job_role = 'PRIMARY' WHERE id = ? AND job_id = ? AND company_id = ?`,
        )
        .run(input.drawingId, input.jobId, input.companyId);
      this.database
        .prepare(
          `
          UPDATE jobs
          SET primary_drawing_id = ?, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `,
        )
        .run(
          input.drawingId,
          input.updatedByUserId,
          input.updatedAtIso,
          input.jobId,
          input.companyId,
        );

      const row = this.getJobRow(input.jobId, input.companyId);
      return row ? toJob(row) : null;
    });

    return transact();
  }

  public setDrawingWorkspacePrimaryDrawing(
    input: SetJobPrimaryDrawingInput,
  ): DrawingWorkspaceRecord | null {
    return this.setJobPrimaryDrawing(input);
  }

  public listJobTasks(jobId: string, companyId: string): JobTaskRecord[] {
    const rows = this.database
      .prepare(
        `
        SELECT
          t.*,
          j.name AS job_name,
          drawing_root.name AS drawing_name,
          revision_drawing.name AS revision_drawing_name,
          assigned.display_name AS assigned_user_display_name,
          completed.display_name AS completed_by_display_name
        FROM job_tasks t
        LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = t.company_id
        LEFT JOIN drawings drawing_root ON drawing_root.id = t.drawing_id AND drawing_root.company_id = t.company_id
        LEFT JOIN drawings revision_drawing ON revision_drawing.id = t.revision_drawing_id AND revision_drawing.company_id = t.company_id
        LEFT JOIN users assigned ON assigned.id = t.assigned_user_id AND assigned.company_id = t.company_id
        LEFT JOIN users completed ON completed.id = t.completed_by_user_id AND completed.company_id = t.company_id
        WHERE t.job_id = ? AND t.company_id = ?
        ORDER BY t.is_completed ASC, COALESCE(t.due_at_iso, '9999-12-31T00:00:00.000Z') ASC, t.created_at_iso ASC
      `,
      )
      .all(jobId, companyId) as JobTaskRow[];
    return rows.map((row) => toJobTask(row));
  }

  public listDrawingWorkspaceTasks(
    workspaceId: string,
    companyId: string,
  ): DrawingTaskRecord[] {
    return this.listJobTasks(workspaceId, companyId).map((task) =>
      this.toDrawingTaskRecord(task),
    );
  }

  public listCompanyTasks(
    companyId: string,
    options: CompanyTaskListOptions = {},
  ): JobTaskRecord[] {
    const clauses = ["t.company_id = ?"];
    const params: unknown[] = [companyId];
    if (!(options.includeCompleted ?? false)) {
      clauses.push("t.is_completed = 0");
    }
    if (options.assignedUserId?.trim()) {
      if (options.assignedUserId.trim() === "unassigned") {
        clauses.push("t.assigned_user_id IS NULL");
      } else {
        clauses.push("t.assigned_user_id = ?");
        params.push(options.assignedUserId.trim());
      }
    }
    if (options.priority?.trim()) {
      clauses.push("t.priority = ?");
      params.push(options.priority.trim());
    }
    if (options.search?.trim()) {
      clauses.push(
        "(lower(t.title) LIKE ? OR lower(COALESCE(t.description, '')) LIKE ? OR lower(COALESCE(j.name, '')) LIKE ? OR lower(COALESCE(drawing_root.name, '')) LIKE ? OR lower(COALESCE(assigned.display_name, '')) LIKE ? OR lower(COALESCE(completed.display_name, '')) LIKE ?)",
      );
      const normalized = `%${options.search.trim().toLowerCase()}%`;
      params.push(normalized, normalized, normalized, normalized, normalized, normalized);
    }
    if (options.dueBucket === "NO_DATE") {
      clauses.push("t.due_at_iso IS NULL");
    } else if (options.dueBucket === "OVERDUE") {
      clauses.push("t.due_at_iso IS NOT NULL");
      clauses.push("substr(t.due_at_iso, 1, 10) < date('now')");
      clauses.push("t.is_completed = 0");
    } else if (options.dueBucket === "TODAY") {
      clauses.push("t.due_at_iso IS NOT NULL");
      clauses.push("substr(t.due_at_iso, 1, 10) = date('now')");
    } else if (options.dueBucket === "UPCOMING") {
      clauses.push("t.due_at_iso IS NOT NULL");
      clauses.push("substr(t.due_at_iso, 1, 10) > date('now')");
    }

    const rows = this.database
      .prepare(
        `
        SELECT
          t.*,
          j.name AS job_name,
          drawing_root.name AS drawing_name,
          revision_drawing.name AS revision_drawing_name,
          assigned.display_name AS assigned_user_display_name,
          completed.display_name AS completed_by_display_name
        FROM job_tasks t
        LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = t.company_id
        LEFT JOIN drawings drawing_root ON drawing_root.id = t.drawing_id AND drawing_root.company_id = t.company_id
        LEFT JOIN drawings revision_drawing ON revision_drawing.id = t.revision_drawing_id AND revision_drawing.company_id = t.company_id
        LEFT JOIN users assigned ON assigned.id = t.assigned_user_id AND assigned.company_id = t.company_id
        LEFT JOIN users completed ON completed.id = t.completed_by_user_id AND completed.company_id = t.company_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          t.is_completed ASC,
          CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END ASC,
          COALESCE(t.due_at_iso, '9999-12-31T00:00:00.000Z') ASC,
          t.created_at_iso DESC
        LIMIT ?
      `,
      )
      .all(...params, Math.max(1, options.limit ?? 50)) as JobTaskRow[];
    return rows.map((row) => toJobTask(row));
  }

  public listCompanyDrawingTasks(
    companyId: string,
    options: CompanyTaskListOptions = {},
  ): DrawingTaskRecord[] {
    return this.listCompanyTasks(companyId, options).map((task) =>
      this.toDrawingTaskRecord(task),
    );
  }

  public createJobTask(input: CreateJobTaskInput): JobTaskRecord {
    this.database
      .prepare(
        `
        INSERT INTO job_tasks (
          id,
          company_id,
          job_id,
          drawing_id,
          revision_drawing_id,
          title,
          description,
          priority,
          is_completed,
          assigned_user_id,
          due_at_iso,
          completed_at_iso,
          completed_by_user_id,
          created_by_user_id,
          created_at_iso,
          updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.companyId,
        input.jobId,
        input.drawingId,
        input.revisionDrawingId ?? null,
        input.title,
        input.description,
        input.priority,
        input.assignedUserId,
        input.dueAtIso,
        input.createdByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      );
    const row = this.getTaskRow(input.id, input.jobId, input.companyId);
    if (!row) {
      throw new Error(`Created task ${input.id} could not be reloaded`);
    }
    return toJobTask(row);
  }

  public createDrawingTask(input: CreateJobTaskInput): DrawingTaskRecord {
    return this.toDrawingTaskRecord(this.createJobTask(input));
  }

  public updateJobTask(input: UpdateJobTaskInput): JobTaskRecord | null {
    const result = this.database
      .prepare(
        `
        UPDATE job_tasks
        SET
          drawing_id = ?,
          revision_drawing_id = ?,
          title = ?,
          description = ?,
          priority = ?,
          assigned_user_id = ?,
          due_at_iso = ?,
          is_completed = ?,
          completed_at_iso = ?,
          completed_by_user_id = ?,
          updated_at_iso = ?
        WHERE id = ? AND job_id = ? AND company_id = ?
      `,
      )
      .run(
        input.drawingId,
        input.revisionDrawingId ?? null,
        input.title,
        input.description,
        input.priority,
        input.assignedUserId,
        input.dueAtIso,
        input.isCompleted ? 1 : 0,
        input.completedAtIso,
        input.completedByUserId,
        input.updatedAtIso,
        input.taskId,
        input.jobId,
        input.companyId,
      );
    if (result.changes === 0) {
      return null;
    }
    const row = this.getTaskRow(input.taskId, input.jobId, input.companyId);
    return row ? toJobTask(row) : null;
  }

  public updateDrawingTask(input: UpdateJobTaskInput): DrawingTaskRecord | null {
    const updated = this.updateJobTask(input);
    if (!updated) {
      return null;
    }
    return this.toDrawingTaskRecord(updated);
  }

  public deleteJobTask(taskId: string, jobId: string, companyId: string): boolean {
    const result = this.database
      .prepare("DELETE FROM job_tasks WHERE id = ? AND job_id = ? AND company_id = ?")
      .run(taskId, jobId, companyId);
    return result.changes > 0;
  }

  public deleteDrawingTask(taskId: string, workspaceId: string, companyId: string): boolean {
    return this.deleteJobTask(taskId, workspaceId, companyId);
  }
}

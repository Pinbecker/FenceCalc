import type {
  CustomerRecord,
  DrawingTaskRecord,
  DrawingWorkspaceRecord,
  DrawingWorkspaceSummary,
  DrawingRecord,
  DrawingVersionRecord,
  JobRecord,
  JobSummary,
  JobTaskRecord,
  QuoteRecord,
} from "@fence-estimator/contracts";

import { toDrawingSummary } from "./shared.js";
import type {
  CompanyTaskListOptions,
  CreateDrawingWorkspaceInput,
  DeleteJobInput,
  CreateJobInput,
  CreateJobTaskInput,
  CustomerScope,
  SetJobPrimaryDrawingInput,
  StoredUser,
  UpdateDrawingWorkspaceInput,
  UpdateJobInput,
  UpdateJobTaskInput,
} from "./types.js";

export interface InMemoryJobState {
  customers: Map<string, CustomerRecord>;
  drawings: Map<string, DrawingRecord>;
  drawingVersions: Map<string, DrawingVersionRecord[]>;
  jobs: Map<string, JobRecord>;
  jobTasks: Map<string, JobTaskRecord[]>;
  quotesByJobId: Map<string, QuoteRecord[]>;
  users: Map<string, StoredUser>;
}

export class InMemoryJobStore {
  public constructor(private readonly state: InMemoryJobState) {}

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

  private isStalePlaceholderJob(job: JobRecord): boolean {
    if (!job.id.startsWith("job:")) {
      return false;
    }

    return ![...this.state.drawings.values()].some(
      (drawing) => drawing.companyId === job.companyId && drawing.workspaceId === job.id,
    );
  }

  private withDisplayNames(job: JobRecord): JobRecord {
    return {
      ...job,
      customerName: this.state.customers.get(job.customerId)?.name ?? job.customerName,
      ownerDisplayName: job.ownerUserId
        ? (this.state.users.get(job.ownerUserId)?.displayName ?? "")
        : "",
      updatedByDisplayName: this.state.users.get(job.updatedByUserId)?.displayName ?? "",
    };
  }

  private buildSummary(job: JobRecord): JobSummary {
    const resolved = this.withDisplayNames(job);
    const drawings = [...this.state.drawings.values()]
      .filter((drawing) => drawing.companyId === job.companyId && drawing.workspaceId === job.id)
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
    const tasks = (this.state.jobTasks.get(job.id) ?? []).filter(
      (task) => task.companyId === job.companyId,
    );
    const quotes = (this.state.quotesByJobId.get(job.id) ?? []).filter(
      (quote) => quote.companyId === job.companyId,
    );
    const primaryDrawing =
      drawings.find((drawing) => drawing.id === job.primaryDrawingId) ?? drawings[0] ?? null;
    const latestQuote =
      quotes
        .slice()
        .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso))[0] ?? null;
    const lastActivityAtIso =
      [resolved.updatedAtIso]
        .concat(drawings.map((drawing) => drawing.updatedAtIso))
        .concat(tasks.map((task) => task.updatedAtIso))
        .concat(quotes.map((quote) => quote.createdAtIso))
        .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return {
      ...resolved,
      primaryDrawingId: primaryDrawing?.id ?? resolved.primaryDrawingId,
      drawingCount: drawings.length,
      openTaskCount: tasks.filter((task) => !task.isCompleted).length,
      completedTaskCount: tasks.filter((task) => task.isCompleted).length,
      lastActivityAtIso,
      latestQuoteTotal: latestQuote?.pricedEstimate.totals.totalCost ?? null,
      latestQuoteCreatedAtIso: latestQuote?.createdAtIso ?? null,
      latestEstimateTotal: null,
      primaryDrawingName: primaryDrawing?.name ?? null,
      primaryDrawingUpdatedAtIso: primaryDrawing?.updatedAtIso ?? null,
      primaryPreviewLayout: primaryDrawing ? toDrawingSummary(primaryDrawing).previewLayout : null,
    };
  }

  public createJob(input: CreateJobInput): JobRecord {
    const job: JobRecord = {
      ...input,
      ownerDisplayName: input.ownerUserId
        ? (this.state.users.get(input.ownerUserId)?.displayName ?? "")
        : "",
      updatedByDisplayName: this.state.users.get(input.updatedByUserId)?.displayName ?? "",
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null,
      stageChangedAtIso: null,
      stageChangedByUserId: null,
    };
    this.state.jobs.set(job.id, job);
    return this.withDisplayNames(job);
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
    const normalized = search.trim().toLowerCase();
    return [...this.state.jobs.values()]
      .filter((job) => job.companyId === companyId)
      .filter((job) => !this.isStalePlaceholderJob(job))
      .filter((job) => {
        if (scope === "ACTIVE") return !job.isArchived;
        if (scope === "ARCHIVED") return job.isArchived;
        return true;
      })
      .filter((job) => (customerId ? job.customerId === customerId : true))
      .filter((job) => {
        if (!normalized) return true;
        const customerName = this.state.customers.get(job.customerId)?.name ?? job.customerName;
        return (
          job.name.toLowerCase().includes(normalized) ||
          customerName.toLowerCase().includes(normalized)
        );
      })
      .map((job) => this.buildSummary(job))
      .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
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
    const job = this.state.jobs.get(jobId);
    if (!job || job.companyId !== companyId) {
      return null;
    }
    return this.withDisplayNames(job);
  }

  public getDrawingWorkspaceById(
    workspaceId: string,
    companyId: string,
  ): DrawingWorkspaceRecord | null {
    return this.getJobById(workspaceId, companyId);
  }

  public updateJob(input: UpdateJobInput): JobRecord | null {
    const existing = this.state.jobs.get(input.jobId);
    if (!existing || existing.companyId !== input.companyId) {
      return null;
    }
    const updated: JobRecord = {
      ...existing,
      name: input.name,
      stage: input.stage,
      commercialInputs: input.commercialInputs,
      notes: input.notes,
      ownerUserId: input.ownerUserId,
      isArchived: input.archived,
      archivedAtIso: input.archivedAtIso,
      archivedByUserId: input.archivedByUserId,
      stageChangedAtIso: input.stageChangedAtIso,
      stageChangedByUserId: input.stageChangedByUserId,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
      ownerDisplayName: input.ownerUserId
        ? (this.state.users.get(input.ownerUserId)?.displayName ?? "")
        : "",
      updatedByDisplayName: this.state.users.get(input.updatedByUserId)?.displayName ?? "",
    };
    this.state.jobs.set(updated.id, updated);
    return this.withDisplayNames(updated);
  }

  public updateDrawingWorkspace(
    input: UpdateDrawingWorkspaceInput,
  ): DrawingWorkspaceRecord | null {
    return this.updateJob({ ...input, jobId: input.workspaceId });
  }

  public deleteJob(input: DeleteJobInput): boolean {
    const existing = this.state.jobs.get(input.jobId);
    if (!existing || existing.companyId !== input.companyId) {
      return false;
    }

    for (const drawing of [...this.state.drawings.values()]) {
      if (drawing.companyId === input.companyId && drawing.workspaceId === input.jobId) {
        this.state.drawings.delete(drawing.id);
        this.state.drawingVersions.delete(drawing.id);
      }
    }

    this.state.jobTasks.delete(input.jobId);
    this.state.quotesByJobId.delete(input.jobId);
    this.state.jobs.delete(input.jobId);
    return true;
  }

  public setJobPrimaryDrawing(input: SetJobPrimaryDrawingInput): JobRecord | null {
    const job = this.state.jobs.get(input.jobId);
    const drawing = this.state.drawings.get(input.drawingId);
    if (
      !job ||
      job.companyId !== input.companyId ||
      !drawing ||
      drawing.companyId !== input.companyId ||
      drawing.workspaceId !== input.jobId
    ) {
      return null;
    }

    for (const current of this.state.drawings.values()) {
      if (current.companyId === input.companyId && current.workspaceId === input.jobId) {
        this.state.drawings.set(current.id, {
          ...current,
          jobRole: current.id === input.drawingId ? "PRIMARY" : "SECONDARY",
        });
      }
    }

    const updated: JobRecord = {
      ...job,
      primaryDrawingId: input.drawingId,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
      updatedByDisplayName: this.state.users.get(input.updatedByUserId)?.displayName ?? "",
    };
    this.state.jobs.set(updated.id, updated);
    return this.withDisplayNames(updated);
  }

  public setDrawingWorkspacePrimaryDrawing(
    input: SetJobPrimaryDrawingInput,
  ): DrawingWorkspaceRecord | null {
    return this.setJobPrimaryDrawing(input);
  }

  public listJobTasks(jobId: string, companyId: string): JobTaskRecord[] {
    const job = this.state.jobs.get(jobId);
    return (this.state.jobTasks.get(jobId) ?? [])
      .filter((task) => task.companyId === companyId)
      .map((task) => {
        const drawingName = task.drawingId
          ? (this.state.drawings.get(task.drawingId)?.name ?? "")
          : "";
        return {
          ...task,
          jobName: job?.name ?? "",
          drawingName,
          assignedUserDisplayName: task.assignedUserId
            ? (this.state.users.get(task.assignedUserId)?.displayName ?? "")
            : "",
          completedByDisplayName: task.completedByUserId
            ? (this.state.users.get(task.completedByUserId)?.displayName ?? "")
            : "",
        };
      })
      .sort(
        (left, right) =>
          Number(left.isCompleted) - Number(right.isCompleted) ||
          (left.dueAtIso ?? "").localeCompare(right.dueAtIso ?? ""),
      );
  }

  public listDrawingWorkspaceTasks(
    workspaceId: string,
    companyId: string,
  ): DrawingTaskRecord[] {
    return this.listJobTasks(workspaceId, companyId).map((task) => this.toDrawingTaskRecord(task));
  }

  public listCompanyTasks(
    companyId: string,
    options: CompanyTaskListOptions = {},
  ): JobTaskRecord[] {
    const todayIso = new Date().toISOString().slice(0, 10);
    const includeCompleted = options.includeCompleted ?? false;
    const normalizedSearch = options.search?.trim().toLowerCase() ?? "";
    const normalizedAssignedUserId = options.assignedUserId?.trim();
    const allTasks: JobTaskRecord[] = [];
    for (const [jobId, tasks] of this.state.jobTasks) {
      const job = this.state.jobs.get(jobId);
      for (const task of tasks) {
        if (task.companyId !== companyId) {
          continue;
        }
        if (!includeCompleted && task.isCompleted) {
          continue;
        }
        if (normalizedAssignedUserId) {
          if (normalizedAssignedUserId === "unassigned") {
            if (task.assignedUserId) {
              continue;
            }
          } else if (task.assignedUserId !== normalizedAssignedUserId) {
            continue;
          }
        }
        if (options.priority && task.priority !== options.priority) {
          continue;
        }
        if (options.dueBucket === "NO_DATE" && task.dueAtIso) {
          continue;
        }
        if (options.dueBucket && options.dueBucket !== "NO_DATE") {
          if (!task.dueAtIso) {
            continue;
          }
          const taskDate = task.dueAtIso.slice(0, 10);
          if (options.dueBucket === "OVERDUE" && !(taskDate < todayIso && !task.isCompleted)) {
            continue;
          }
          if (options.dueBucket === "TODAY" && taskDate !== todayIso) {
            continue;
          }
          if (options.dueBucket === "UPCOMING" && taskDate <= todayIso) {
            continue;
          }
        }

        const assignedUserDisplayName = task.assignedUserId
          ? (this.state.users.get(task.assignedUserId)?.displayName ?? "")
          : "";
        const completedByDisplayName = task.completedByUserId
          ? (this.state.users.get(task.completedByUserId)?.displayName ?? "")
          : "";
        const jobName = job?.name ?? "";
        const drawingName = task.drawingId
          ? (this.state.drawings.get(task.drawingId)?.name ?? "")
          : "";
        if (normalizedSearch) {
          const haystack = [
            task.title,
            task.description,
            jobName,
            drawingName,
            assignedUserDisplayName,
            completedByDisplayName,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(normalizedSearch)) {
            continue;
          }
        }

        allTasks.push({
          ...task,
          jobName,
          drawingName,
          assignedUserDisplayName,
          completedByDisplayName,
        });
      }
    }
    const sorted = allTasks.sort((left, right) => {
      const priorityOrder = ["URGENT", "HIGH", "NORMAL", "LOW"];
      const lp = priorityOrder.indexOf(left.priority);
      const rp = priorityOrder.indexOf(right.priority);
      if (Number(left.isCompleted) !== Number(right.isCompleted)) {
        return Number(left.isCompleted) - Number(right.isCompleted);
      }
      if (lp !== rp) {
        return lp - rp;
      }
      const dueOrder = (left.dueAtIso ?? "9999-12-31T00:00:00.000Z").localeCompare(
        right.dueAtIso ?? "9999-12-31T00:00:00.000Z",
      );
      if (dueOrder !== 0) {
        return dueOrder;
      }
      return right.createdAtIso.localeCompare(left.createdAtIso);
    });
    const maxItems = options.limit ?? 50;
    return sorted.slice(0, Math.max(1, maxItems));
  }

  public listCompanyDrawingTasks(
    companyId: string,
    options: CompanyTaskListOptions = {},
  ): DrawingTaskRecord[] {
    return this.listCompanyTasks(companyId, options).map((task) => this.toDrawingTaskRecord(task));
  }

  public createJobTask(input: CreateJobTaskInput): JobTaskRecord {
    const job = this.state.jobs.get(input.jobId);
    const task: JobTaskRecord = {
      id: input.id,
      companyId: input.companyId,
      jobId: input.jobId,
      jobName: job?.name ?? "",
      drawingId: input.drawingId,
      drawingName: input.drawingId ? (this.state.drawings.get(input.drawingId)?.name ?? "") : "",
      revisionDrawingId: input.revisionDrawingId ?? null,
      revisionDrawingName:
        input.revisionDrawingId ? (this.state.drawings.get(input.revisionDrawingId)?.name ?? "") : "",
      title: input.title,
      description: input.description,
      priority: input.priority as JobTaskRecord["priority"],
      isCompleted: false,
      assignedUserId: input.assignedUserId,
      assignedUserDisplayName: input.assignedUserId
        ? (this.state.users.get(input.assignedUserId)?.displayName ?? "")
        : "",
      dueAtIso: input.dueAtIso,
      completedAtIso: null,
      completedByUserId: null,
      completedByDisplayName: "",
      createdByUserId: input.createdByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
    this.state.jobTasks.set(input.jobId, [...(this.state.jobTasks.get(input.jobId) ?? []), task]);
    return task;
  }

  public createDrawingTask(input: CreateJobTaskInput): DrawingTaskRecord {
    return this.toDrawingTaskRecord(this.createJobTask(input));
  }

  public updateJobTask(input: UpdateJobTaskInput): JobTaskRecord | null {
    const tasks = this.state.jobTasks.get(input.jobId) ?? [];
    const existing = tasks.find(
      (task) => task.id === input.taskId && task.companyId === input.companyId,
    );
    if (!existing) {
      return null;
    }
    const updated: JobTaskRecord = {
      ...existing,
      drawingId: input.drawingId,
      drawingName: input.drawingId ? (this.state.drawings.get(input.drawingId)?.name ?? "") : "",
      revisionDrawingId: input.revisionDrawingId ?? null,
      revisionDrawingName:
        input.revisionDrawingId ? (this.state.drawings.get(input.revisionDrawingId)?.name ?? "") : "",
      title: input.title,
      description: input.description,
      priority: input.priority as JobTaskRecord["priority"],
      assignedUserId: input.assignedUserId,
      assignedUserDisplayName: input.assignedUserId
        ? (this.state.users.get(input.assignedUserId)?.displayName ?? "")
        : "",
      dueAtIso: input.dueAtIso,
      isCompleted: input.isCompleted,
      completedAtIso: input.completedAtIso,
      completedByUserId: input.completedByUserId,
      completedByDisplayName: input.completedByUserId
        ? (this.state.users.get(input.completedByUserId)?.displayName ?? "")
        : "",
      updatedAtIso: input.updatedAtIso,
    };
    this.state.jobTasks.set(
      input.jobId,
      tasks.map((task) => (task.id === input.taskId ? updated : task)),
    );
    return updated;
  }

  public updateDrawingTask(input: UpdateJobTaskInput): DrawingTaskRecord | null {
    const updated = this.updateJobTask(input);
    return updated ? this.toDrawingTaskRecord(updated) : null;
  }

  public deleteJobTask(taskId: string, jobId: string, companyId: string): boolean {
    const tasks = this.state.jobTasks.get(jobId) ?? [];
    const filtered = tasks.filter((task) => !(task.id === taskId && task.companyId === companyId));
    if (filtered.length === tasks.length) {
      return false;
    }
    this.state.jobTasks.set(jobId, filtered);
    return true;
  }

  public deleteDrawingTask(taskId: string, workspaceId: string, companyId: string): boolean {
    return this.deleteJobTask(taskId, workspaceId, companyId);
  }
}

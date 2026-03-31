import { useEffect, useMemo, useState } from "react";

import type {
  AuthSessionEnvelope,
  CompanyUserRecord,
  DrawingTaskRecord,
  DrawingWorkspaceSummary,
  TaskPriority,
} from "@fence-estimator/contracts";

import { listCompanyDrawingTasks, updateDrawingWorkspaceTask } from "./apiClient";
import { buildTaskWorkspaceNavigationQuery } from "./drawingWorkspace";
import {
  formatTaskDate,
  formatTaskTimestamp,
  getTaskDueLabel,
  getTaskDueTone,
} from "./taskPresentation";
import type { PortalRoute } from "./useHashRoute";

type TaskStatusFilter = "OPEN" | "ALL" | "COMPLETED";
type TaskDueFilter = "ALL" | "OVERDUE" | "TODAY" | "UPCOMING" | "NO_DATE";
type TaskAssigneeFilter = "ALL" | "MINE" | "UNASSIGNED" | "SPECIFIC";

interface TasksPageProps {
  session: AuthSessionEnvelope;
  users: CompanyUserRecord[];
  workspaces: DrawingWorkspaceSummary[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
  onRefreshWorkspaces(this: void): Promise<void>;
}

const PRIORITY_OPTIONS: Array<{ value: "ALL" | TaskPriority; label: string }> = [
  { value: "ALL", label: "All priorities" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOW", label: "Low" },
];

function buildAssignedUserId(
  filter: TaskAssigneeFilter,
  selectedUserId: string,
  currentUserId: string,
): string | undefined {
  if (filter === "MINE") {
    return currentUserId;
  }
  if (filter === "UNASSIGNED") {
    return "unassigned";
  }
  if (filter === "SPECIFIC" && selectedUserId) {
    return selectedUserId;
  }
  return undefined;
}

export function TasksPage({
  session,
  users,
  workspaces,
  onNavigate,
  onRefreshWorkspaces,
}: TasksPageProps) {
  const [tasks, setTasks] = useState<DrawingTaskRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TaskStatusFilter>("OPEN");
  const [dueFilter, setDueFilter] = useState<TaskDueFilter>("ALL");
  const [priority, setPriority] = useState<"ALL" | TaskPriority>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<TaskAssigneeFilter>("ALL");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const taskQueryOptions: Parameters<typeof listCompanyDrawingTasks>[0] = {
      includeCompleted: status !== "OPEN",
      limit: 200,
    };
    const assignedUserId = buildAssignedUserId(assigneeFilter, selectedUserId, session.user.id);
    if (assignedUserId) {
      taskQueryOptions.assignedUserId = assignedUserId;
    }
    if (priority !== "ALL") {
      taskQueryOptions.priority = priority;
    }
    if (search) {
      taskQueryOptions.search = search;
    }
    if (dueFilter !== "ALL") {
      taskQueryOptions.dueBucket = dueFilter;
    }

    void listCompanyDrawingTasks(taskQueryOptions)
      .then((nextTasks) => {
        if (!cancelled) {
          setTasks(
            status === "COMPLETED" ? nextTasks.filter((task) => task.isCompleted) : nextTasks,
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage((error as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assigneeFilter, dueFilter, priority, search, selectedUserId, session.user.id, status]);

  const counts = useMemo(() => {
    let overdue = 0;
    let dueToday = 0;
    for (const task of tasks) {
      const tone = getTaskDueTone(task);
      if (tone === "overdue") overdue += 1;
      if (tone === "today") dueToday += 1;
    }
    return {
      total: tasks.length,
      overdue,
      dueToday,
    };
  }, [tasks]);

  const handleToggleComplete = async (task: DrawingTaskRecord) => {
    setSavingTaskId(task.id);
    setErrorMessage(null);
    try {
      const updated = await updateDrawingWorkspaceTask(task.workspaceId, task.id, {
        isCompleted: !task.isCompleted,
      });
      setTasks((current) => {
        const next = current.map((entry) => (entry.id === updated.id ? updated : entry));
        return status === "COMPLETED" ? next.filter((entry) => entry.isCompleted) : next;
      });
      await onRefreshWorkspaces();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <section className="portal-page portal-tasks-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Workspace tasks</span>
          <h1>Company tasks</h1>
          <p>
            Track follow-ups, overdue work, and ownership across all drawing work without bouncing
            between customer records.
          </p>
        </div>
        <div className="portal-header-actions">
          <button
            type="button"
            className="portal-secondary-button"
            onClick={() => onNavigate("dashboard")}
          >
            Back to dashboard
          </button>
        </div>
      </header>

      <section className="portal-surface-card portal-tasks-toolbar">
        <div className="portal-dashboard-stat-bar" role="group" aria-label="Task summary">
          <div className="portal-dashboard-stat">
            <span>Tasks shown</span>
            <strong>{counts.total}</strong>
          </div>
          <div className="portal-dashboard-stat">
            <span>Overdue</span>
            <strong>{counts.overdue}</strong>
          </div>
          <div className="portal-dashboard-stat">
            <span>Due today</span>
            <strong>{counts.dueToday}</strong>
          </div>
        </div>

        <div className="portal-tasks-toolbar-grid">
          <label className="drawing-library-customer-filter portal-tasks-search">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, workspace, assignee, or notes"
            />
          </label>
          <label className="drawing-library-customer-filter">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatusFilter)}
            >
              <option value="OPEN">Open only</option>
              <option value="ALL">Open and completed</option>
              <option value="COMPLETED">Completed only</option>
            </select>
          </label>
          <label className="drawing-library-customer-filter">
            <span>Due</span>
            <select
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value as TaskDueFilter)}
            >
              <option value="ALL">All due dates</option>
              <option value="OVERDUE">Overdue</option>
              <option value="TODAY">Due today</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="NO_DATE">No due date</option>
            </select>
          </label>
          <label className="drawing-library-customer-filter">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as "ALL" | TaskPriority)}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="drawing-library-customer-filter">
            <span>Assignee</span>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value as TaskAssigneeFilter)}
            >
              <option value="ALL">Anyone</option>
              <option value="MINE">Assigned to me</option>
              <option value="UNASSIGNED">Unassigned</option>
              <option value="SPECIFIC">Specific user</option>
            </select>
          </label>
          {assigneeFilter === "SPECIFIC" ? (
            <label className="drawing-library-customer-filter">
              <span>User</span>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                <option value="">Choose user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      {errorMessage ? <p className="portal-inline-error">{errorMessage}</p> : null}

      <section className="portal-surface-card portal-tasks-list-card">
        {isLoading ? <p className="portal-empty-copy">Loading tasks...</p> : null}
        {!isLoading && tasks.length === 0 ? (
          <div className="portal-empty-state portal-tasks-empty-state">
            <h2>No tasks in this view</h2>
            <p>Adjust the filters or create follow-up work from a drawing workspace.</p>
          </div>
        ) : null}
        <div className="portal-job-task-list">
          {tasks.map((task) => {
            const dueTone = getTaskDueTone(task);
            const dueLabel = getTaskDueLabel(task);
            return (
              <article
                key={task.id}
                className={`portal-job-task-card portal-company-task-card${task.isCompleted ? " is-complete" : ""}${dueTone === "overdue" ? " is-overdue" : ""}`}
              >
                <div className="portal-job-task-card-header">
                  <div className="portal-job-task-card-left">
                    <button
                      type="button"
                      className={`portal-task-check${task.isCompleted ? " is-checked" : ""}`}
                      onClick={() => void handleToggleComplete(task)}
                      aria-label={
                        task.isCompleted
                          ? `Reopen task ${task.title}`
                          : `Complete task ${task.title}`
                      }
                      disabled={savingTaskId === task.id}
                    >
                      {task.isCompleted ? "x" : ""}
                    </button>
                    <div className="portal-job-task-card-title">
                      <h2
                        className={`portal-task-card-heading${task.isCompleted ? " portal-task-done-text" : ""}`}
                      >
                        {task.title}
                      </h2>
                      <div className="portal-job-task-card-context">
                        <span className="portal-job-task-context-pill is-job">
                          {task.workspaceName || "Workspace"}
                        </span>
                        {task.revisionDrawingName || task.rootDrawingName ? (
                          <span className="portal-job-task-context-pill is-drawing">
                            Drawing: {task.revisionDrawingName || task.rootDrawingName}
                          </span>
                        ) : null}
                        <span className="portal-job-task-context-pill">
                          {task.assignedUserDisplayName || "Unassigned"}
                        </span>
                        {task.dueAtIso ? (
                          <span className="portal-job-task-context-pill">
                            Due {formatTaskDate(task.dueAtIso)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="portal-job-task-card-right">
                    {dueLabel ? (
                      <span className={`portal-task-due-badge is-${dueTone}`}>{dueLabel}</span>
                    ) : null}
                    {task.priority !== "NORMAL" ? (
                      <span
                        className={`portal-task-priority-badge priority-${task.priority.toLowerCase()}`}
                      >
                        {task.priority}
                      </span>
                    ) : null}
                    <span
                      className={`portal-task-status-badge ${task.isCompleted ? "status-done" : "status-open"}`}
                    >
                      {task.isCompleted ? "Done" : "Open"}
                    </span>
                  </div>
                </div>
                {task.description ? (
                  <p className="portal-job-task-card-description portal-company-task-description">
                    {task.description}
                  </p>
                ) : null}
                <div className="portal-company-task-footer">
                  <div className="portal-company-task-history">
                    <span>Created {formatTaskTimestamp(task.createdAtIso)}</span>
                    {task.completedAtIso ? (
                      <span>
                        Completed {formatTaskTimestamp(task.completedAtIso)} by{" "}
                        {task.completedByDisplayName || "Team member"}
                      </span>
                    ) : null}
                  </div>
                  <div className="portal-job-task-card-actions">
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() =>
                        onNavigate(
                          "drawing",
                          buildTaskWorkspaceNavigationQuery(task, workspaces, [], "workspace"),
                        )
                      }
                    >
                      Open workspace
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

import {
  TASK_PRIORITIES,
  type CompanyUserRecord,
  type DrawingSummary,
  type DrawingTaskRecord,
  type TaskPriority,
} from "@fence-estimator/contracts";

import { getRevisionLabel } from "../drawingWorkspace";
import {
  formatTaskDate,
  formatTaskTimestamp,
  getTaskDueLabel,
  getTaskDueTone,
} from "../taskPresentation";
import { buildTaskDraft, type TaskDraftState } from "./shared";

interface WorkspaceTasksPanelProps {
  drawings: DrawingSummary[];
  users: CompanyUserRecord[];
  sessionUserId: string;
  taskTitle: string;
  taskDueDate: string;
  taskAssignee: string | null;
  taskDrawingId: string | null;
  taskDescription: string;
  taskPriority: TaskPriority;
  preferredTaskDrawingId: string | null;
  isTaskFormExpanded: boolean;
  isSavingTask: boolean;
  sortedTasks: DrawingTaskRecord[];
  expandedTaskId: string | null;
  taskDrafts: Record<string, TaskDraftState>;
  savingTaskId: string | null;
  onTaskTitleChange: (value: string) => void;
  onTaskDueDateChange: (value: string) => void;
  onTaskAssigneeChange: (value: string | null) => void;
  onTaskDrawingChange: (value: string | null) => void;
  onTaskDescriptionChange: (value: string) => void;
  onTaskPriorityChange: (value: TaskPriority) => void;
  onToggleTaskForm: () => void;
  onShowTaskForm: () => void;
  onCreateTask: () => void;
  onExpandTask: (task: DrawingTaskRecord) => void;
  onTaskDraftChange: (taskId: string, patch: Partial<TaskDraftState>) => void;
  onResetTaskDraft: (task: DrawingTaskRecord) => void;
  onSaveTaskDraft: (task: DrawingTaskRecord) => void;
  onDeleteTask: (task: DrawingTaskRecord) => void;
  onToggleTask: (task: DrawingTaskRecord) => void;
}

export function WorkspaceTasksPanel({
  drawings,
  users,
  sessionUserId,
  taskTitle,
  taskDueDate,
  taskAssignee,
  taskDrawingId,
  taskDescription,
  taskPriority,
  preferredTaskDrawingId,
  isTaskFormExpanded,
  isSavingTask,
  sortedTasks,
  expandedTaskId,
  taskDrafts,
  savingTaskId,
  onTaskTitleChange,
  onTaskDueDateChange,
  onTaskAssigneeChange,
  onTaskDrawingChange,
  onTaskDescriptionChange,
  onTaskPriorityChange,
  onToggleTaskForm,
  onShowTaskForm,
  onCreateTask,
  onExpandTask,
  onTaskDraftChange,
  onResetTaskDraft,
  onSaveTaskDraft,
  onDeleteTask,
  onToggleTask,
}: WorkspaceTasksPanelProps) {
  const hasDrawings = drawings.length > 0;

  return (
    <section className="portal-surface-card portal-job-tasks-panel">
      <div className="portal-section-heading">
        <div>
          <span className="portal-section-kicker">Tasks</span>
        </div>
      </div>

      <div className="portal-job-task-form">
        {!hasDrawings ? (
          <p className="portal-empty-copy">Open a drawing before adding drawing-linked tasks.</p>
        ) : null}
        <div className="portal-job-task-form-compact-row">
          <label className="portal-customer-edit-field portal-task-input-field portal-job-task-title-field">
            <span>Task title</span>
            <input
              placeholder="Add follow-up task"
              value={taskTitle}
              onChange={(event) => onTaskTitleChange(event.target.value)}
              onFocus={() => {
                if (
                  taskDescription ||
                  taskDueDate ||
                  taskAssignee !== sessionUserId ||
                  taskPriority !== "NORMAL" ||
                  taskDrawingId !== preferredTaskDrawingId
                ) {
                  onShowTaskForm();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && taskTitle.trim()) {
                  onCreateTask();
                }
              }}
            />
          </label>
          <div className="portal-job-task-form-actions">
            <button
              type="button"
              className="portal-secondary-button portal-compact-button"
              onClick={onToggleTaskForm}
            >
              {isTaskFormExpanded ? "Hide details" : "Details"}
            </button>
            <button
              type="button"
              className="portal-primary-button portal-compact-button"
              onClick={onCreateTask}
              disabled={isSavingTask || !taskTitle.trim() || !hasDrawings || !taskDrawingId}
            >
              {isSavingTask ? "Saving..." : "Add task"}
            </button>
          </div>
        </div>
        {isTaskFormExpanded ? (
          <>
            <div className="portal-job-task-form-row">
              <label className="portal-customer-edit-field portal-task-input-field">
                <span>Revision</span>
                <select
                  value={taskDrawingId ?? ""}
                  onChange={(event) => onTaskDrawingChange(event.target.value || null)}
                  disabled={!hasDrawings}
                >
                  <option value="">Choose revision</option>
                  {drawings.map((drawing) => (
                    <option key={drawing.id} value={drawing.id}>
                      {getRevisionLabel(drawing)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-customer-edit-field portal-task-input-field">
                <span>Due date</span>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(event) => onTaskDueDateChange(event.target.value)}
                />
              </label>
              <label className="portal-customer-edit-field portal-task-input-field">
                <span>Assignee</span>
                <select
                  value={taskAssignee ?? ""}
                  onChange={(event) => onTaskAssigneeChange(event.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="portal-job-task-form-row portal-job-task-form-row-compact-options">
              <label className="portal-customer-edit-field portal-task-input-field">
                <span>Priority</span>
                <select
                  className="portal-task-priority-select"
                  value={taskPriority}
                  onChange={(event) => onTaskPriorityChange(event.target.value as TaskPriority)}
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0) + priority.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="portal-customer-edit-field portal-task-input-field">
              <span>Description</span>
              <textarea
                className="portal-task-description-input"
                placeholder="Add notes, handoff context, or next steps"
                rows={3}
                value={taskDescription}
                onChange={(event) => onTaskDescriptionChange(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="portal-job-task-list">
        {sortedTasks.length === 0 ? (
          <p className="portal-empty-copy">No tasks on this drawing workspace yet.</p>
        ) : null}
        {sortedTasks.map((task) => {
          const isExpanded = expandedTaskId === task.id;
          const taskDraft = taskDrafts[task.id] ?? buildTaskDraft(task);
          const dueTone = getTaskDueTone(task);
          const dueLabel = getTaskDueLabel(task);
          return (
            <div
              key={task.id}
              className={`portal-job-task-card${task.isCompleted ? " is-complete" : ""}${isExpanded ? " is-expanded" : ""}${dueTone === "overdue" ? " is-overdue" : ""}`}
            >
              <div className="portal-job-task-card-header">
                <div className="portal-job-task-card-left">
                  <button
                    type="button"
                    className={`portal-task-check${task.isCompleted ? " is-checked" : ""}`}
                    onClick={() => onToggleTask(task)}
                    aria-label={task.isCompleted ? `Reopen task ${task.title}` : `Complete task ${task.title}`}
                    disabled={savingTaskId === task.id}
                  >
                    {task.isCompleted ? "v" : ""}
                  </button>
                  <div className="portal-job-task-card-title">
                    <h3 className={`portal-task-card-heading${task.isCompleted ? " portal-task-done-text" : ""}`}>
                      {task.title}
                    </h3>
                    <div className="portal-job-task-card-context">
                      {task.revisionDrawingName || task.rootDrawingName ? (
                        <span className="portal-job-task-context-pill is-drawing">
                          Revision: {task.revisionDrawingName || task.rootDrawingName}
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
                  <button
                    type="button"
                    className="portal-task-expand-button"
                    onClick={() => onExpandTask(task)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? `Collapse task ${task.title}` : `Expand task ${task.title}`}
                  >
                    ...
                  </button>
                  {dueLabel ? (
                    <span className={`portal-task-due-badge is-${dueTone}`}>{dueLabel}</span>
                  ) : null}
                  {task.priority !== "NORMAL" ? (
                    <span className={`portal-task-priority-badge priority-${task.priority.toLowerCase()}`}>
                      {task.priority}
                    </span>
                  ) : null}
                  <span className={`portal-task-status-badge ${task.isCompleted ? "status-done" : "status-open"}`}>
                    {task.isCompleted ? "Done" : "Open"}
                  </span>
                </div>
              </div>
              {task.description && !isExpanded ? (
                <p className="portal-job-task-card-description-preview">{task.description}</p>
              ) : null}
              {isExpanded ? (
                <div className="portal-job-task-card-detail">
                  <div className="portal-job-task-card-fields portal-job-task-card-fields-expanded">
                    <label className="portal-customer-edit-field">
                      <span>Title</span>
                      <input
                        value={taskDraft.title}
                        maxLength={240}
                        onChange={(event) => onTaskDraftChange(task.id, { title: event.target.value })}
                      />
                    </label>
                    <label className="portal-customer-edit-field portal-job-task-card-field-wide">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={taskDraft.description}
                        maxLength={2000}
                        onChange={(event) =>
                          onTaskDraftChange(task.id, { description: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="portal-job-task-card-fields">
                    <label className="portal-customer-edit-field">
                      <span>Revision</span>
                      <select
                        value={taskDraft.revisionDrawingId ?? ""}
                        onChange={(event) =>
                          onTaskDraftChange(task.id, { revisionDrawingId: event.target.value || null })
                        }
                        disabled={!hasDrawings}
                      >
                        <option value="">Choose revision</option>
                        {drawings.map((drawing) => (
                          <option key={drawing.id} value={drawing.id}>
                            {getRevisionLabel(drawing)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="portal-customer-edit-field">
                      <span>Priority</span>
                      <select
                        value={taskDraft.priority}
                        onChange={(event) =>
                          onTaskDraftChange(task.id, { priority: event.target.value as TaskPriority })
                        }
                      >
                        {TASK_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority.charAt(0) + priority.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="portal-customer-edit-field">
                      <span>Assignee</span>
                      <select
                        value={taskDraft.assignedUserId ?? ""}
                        onChange={(event) =>
                          onTaskDraftChange(task.id, { assignedUserId: event.target.value || null })
                        }
                      >
                        <option value="">Unassigned</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="portal-customer-edit-field">
                      <span>Due date</span>
                      <input
                        type="date"
                        value={taskDraft.dueDate}
                        onChange={(event) => onTaskDraftChange(task.id, { dueDate: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="portal-job-task-card-history">
                    <span>Created {formatTaskTimestamp(task.createdAtIso)}</span>
                    {task.completedAtIso ? (
                      <span>
                        Completed {formatTaskTimestamp(task.completedAtIso)} by{" "}
                        {task.completedByDisplayName || "Team member"}
                      </span>
                    ) : null}
                    <span>Last updated {formatTaskTimestamp(task.updatedAtIso)}</span>
                  </div>
                  <div className="portal-job-task-card-actions">
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => onSaveTaskDraft(task)}
                      disabled={savingTaskId === task.id || !taskDraft.title.trim()}
                    >
                      {savingTaskId === task.id ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => onResetTaskDraft(task)}
                      disabled={savingTaskId === task.id}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => onToggleTask(task)}
                    >
                      {task.isCompleted ? "Reopen" : "Complete"}
                    </button>
                    <button
                      type="button"
                      className="portal-text-button portal-danger-text"
                      onClick={() => onDeleteTask(task)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

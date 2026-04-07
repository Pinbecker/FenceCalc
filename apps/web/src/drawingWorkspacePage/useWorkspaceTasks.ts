import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  DrawingSummary,
  DrawingTaskRecord,
  DrawingWorkspaceRecord,
  TaskPriority,
} from "@fence-estimator/contracts";

import {
  createDrawingWorkspaceTask,
  deleteDrawingWorkspaceTask,
  updateDrawingWorkspaceTask,
} from "../apiClient";
import { buildTaskDraft, type TaskDraftState } from "./shared";
import { sortVisibleTasks } from "./selectors";

interface UseWorkspaceTasksOptions {
  workspace: DrawingWorkspaceRecord | null;
  tasks: DrawingTaskRecord[];
  setTasks: Dispatch<SetStateAction<DrawingTaskRecord[]>>;
  activeDrawingChain: DrawingSummary[];
  activeRootDrawing: DrawingSummary | null;
  activeDrawing: DrawingSummary | null;
  activeLatestDrawing: DrawingSummary | null;
  focusTaskId: string | null;
  sessionUserId: string;
  refreshWorkspaces: () => Promise<void>;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setNoticeMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseWorkspaceTasksResult {
  taskTitle: string;
  setTaskTitle: Dispatch<SetStateAction<string>>;
  taskDueDate: string;
  setTaskDueDate: Dispatch<SetStateAction<string>>;
  taskAssignee: string | null;
  setTaskAssignee: Dispatch<SetStateAction<string | null>>;
  taskDrawingId: string | null;
  setTaskDrawingId: Dispatch<SetStateAction<string | null>>;
  taskDescription: string;
  setTaskDescription: Dispatch<SetStateAction<string>>;
  taskPriority: TaskPriority;
  setTaskPriority: Dispatch<SetStateAction<TaskPriority>>;
  preferredTaskDrawingId: string | null;
  isTaskFormExpanded: boolean;
  setIsTaskFormExpanded: Dispatch<SetStateAction<boolean>>;
  isSavingTask: boolean;
  sortedTasks: DrawingTaskRecord[];
  expandedTaskId: string | null;
  taskDrafts: Record<string, TaskDraftState>;
  savingTaskId: string | null;
  openTaskCount: number;
  handleCreateTask: () => Promise<void>;
  handleExpandTask: (task: DrawingTaskRecord) => void;
  handleShowTaskForm: () => void;
  handleTaskDraftChange: (taskId: string, patch: Partial<TaskDraftState>) => void;
  handleResetTaskDraft: (task: DrawingTaskRecord) => void;
  handleSaveTaskDraft: (task: DrawingTaskRecord) => Promise<void>;
  handleDeleteTask: (task: DrawingTaskRecord) => Promise<void>;
  handleToggleTask: (task: DrawingTaskRecord) => Promise<void>;
}

function buildEmptyTaskDraft(): TaskDraftState {
  return {
    title: "",
    description: "",
    priority: "NORMAL",
    assignedUserId: null,
    rootDrawingId: null,
    revisionDrawingId: null,
    dueDate: "",
  };
}

export function useWorkspaceTasks({
  workspace,
  tasks,
  setTasks,
  activeDrawingChain,
  activeRootDrawing,
  activeDrawing,
  activeLatestDrawing,
  focusTaskId,
  sessionUserId,
  refreshWorkspaces,
  loadWorkspace,
  setErrorMessage,
  setNoticeMessage,
}: UseWorkspaceTasksOptions): UseWorkspaceTasksResult {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string | null>(sessionUserId);
  const [taskDrawingId, setTaskDrawingId] = useState<string | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("NORMAL");
  const [isTaskFormExpanded, setIsTaskFormExpanded] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraftState>>({});
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const preferredTaskDrawingId = useMemo(
    () => activeDrawing?.id ?? activeLatestDrawing?.id ?? null,
    [activeDrawing?.id, activeLatestDrawing?.id],
  );
  const sortedTasks = useMemo(
    () => sortVisibleTasks(tasks, activeDrawingChain),
    [activeDrawingChain, tasks],
  );
  const openTaskCount = useMemo(
    () => sortedTasks.filter((entry) => !entry.isCompleted).length,
    [sortedTasks],
  );

  useEffect(() => {
    setTaskDrafts(Object.fromEntries(tasks.map((task) => [task.id, buildTaskDraft(task)])));
    setExpandedTaskId((current) =>
      current && tasks.some((task) => task.id === current) ? current : null,
    );
  }, [tasks]);

  useEffect(() => {
    if (!focusTaskId || !tasks.some((task) => task.id === focusTaskId)) {
      return;
    }
    setExpandedTaskId(focusTaskId);
  }, [focusTaskId, tasks]);

  useEffect(() => {
    setTaskDrawingId((current) => {
      if (current && activeDrawingChain.some((drawing) => drawing.id === current)) {
        return current;
      }
      return preferredTaskDrawingId;
    });
  }, [activeDrawingChain, preferredTaskDrawingId]);

  const handleCreateTask = useCallback(async () => {
    if (!workspace || !taskTitle.trim()) {
      return;
    }
    if (activeDrawingChain.length > 0 && !taskDrawingId) {
      setErrorMessage("Choose a revision for this task.");
      return;
    }

    setIsSavingTask(true);
    setErrorMessage(null);
    try {
      await createDrawingWorkspaceTask(workspace.id, {
        title: taskTitle.trim(),
        assignedUserId: taskAssignee,
        rootDrawingId: activeRootDrawing?.id ?? null,
        revisionDrawingId: taskDrawingId,
        dueAtIso: taskDueDate ? new Date(`${taskDueDate}T09:00:00`).toISOString() : null,
        ...(taskDescription.trim() ? { description: taskDescription.trim() } : {}),
        ...(taskPriority !== "NORMAL" ? { priority: taskPriority } : {}),
      });
      setTaskTitle("");
      setTaskDueDate("");
      setTaskAssignee(sessionUserId);
      setTaskDrawingId(preferredTaskDrawingId);
      setTaskDescription("");
      setTaskPriority("NORMAL");
      setIsTaskFormExpanded(false);
      await Promise.all([loadWorkspace(workspace.id), refreshWorkspaces()]);
      setNoticeMessage("Task added.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingTask(false);
    }
  }, [
    activeDrawingChain.length,
    activeRootDrawing?.id,
    loadWorkspace,
    preferredTaskDrawingId,
    refreshWorkspaces,
    sessionUserId,
    setErrorMessage,
    setNoticeMessage,
    taskAssignee,
    taskDescription,
    taskDrawingId,
    taskDueDate,
    taskPriority,
    taskTitle,
    workspace,
  ]);

  const handleExpandTask = useCallback((task: DrawingTaskRecord) => {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: current[task.id] ?? buildTaskDraft(task),
    }));
    setExpandedTaskId((current) => (current === task.id ? null : task.id));
  }, []);

  const handleShowTaskForm = useCallback(() => {
    setIsTaskFormExpanded(true);
  }, []);

  const handleTaskDraftChange = useCallback(
    (taskId: string, patch: Partial<TaskDraftState>) => {
      setTaskDrafts((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? buildEmptyTaskDraft()),
          ...patch,
        },
      }));
    },
    [],
  );

  const handleResetTaskDraft = useCallback((task: DrawingTaskRecord) => {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: buildTaskDraft(task),
    }));
  }, []);

  const handleSaveTaskDraft = useCallback(
    async (task: DrawingTaskRecord) => {
      if (!workspace) {
        return;
      }

      const draft = taskDrafts[task.id] ?? buildTaskDraft(task);
      if (!draft.title.trim()) {
        setErrorMessage("Task title is required.");
        return;
      }
      if (activeDrawingChain.length > 0 && !draft.revisionDrawingId && !draft.rootDrawingId) {
        setErrorMessage("Choose a revision for this task.");
        return;
      }

      setSavingTaskId(task.id);
      setErrorMessage(null);
      try {
        const updated = await updateDrawingWorkspaceTask(workspace.id, task.id, {
          title: draft.title.trim(),
          description: draft.description.trim(),
          priority: draft.priority,
          assignedUserId: draft.assignedUserId,
          rootDrawingId: draft.rootDrawingId,
          revisionDrawingId: draft.revisionDrawingId,
          dueAtIso: draft.dueDate ? new Date(`${draft.dueDate}T09:00:00`).toISOString() : null,
        });
        setTasks((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        setTaskDrafts((current) => ({
          ...current,
          [updated.id]: buildTaskDraft(updated),
        }));
        await refreshWorkspaces();
        setNoticeMessage("Task details saved.");
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setSavingTaskId(null);
      }
    },
    [
      activeDrawingChain.length,
      refreshWorkspaces,
      setErrorMessage,
      setNoticeMessage,
      setTasks,
      taskDrafts,
      workspace,
    ],
  );

  const handleDeleteTask = useCallback(
    async (task: DrawingTaskRecord) => {
      if (!workspace) {
        return;
      }

      setErrorMessage(null);
      try {
        await deleteDrawingWorkspaceTask(workspace.id, task.id);
        setTasks((current) => current.filter((entry) => entry.id !== task.id));
        setTaskDrafts((current) => {
          const next = { ...current };
          delete next[task.id];
          return next;
        });
        setExpandedTaskId((current) => (current === task.id ? null : current));
        await refreshWorkspaces();
        setNoticeMessage("Task deleted.");
      } catch (error) {
        setErrorMessage((error as Error).message);
      }
    },
    [refreshWorkspaces, setErrorMessage, setNoticeMessage, setTasks, workspace],
  );

  const handleToggleTask = useCallback(
    async (task: DrawingTaskRecord) => {
      if (!workspace) {
        return;
      }

      setSavingTaskId(task.id);
      setErrorMessage(null);
      try {
        const updated = await updateDrawingWorkspaceTask(workspace.id, task.id, {
          isCompleted: !task.isCompleted,
        });
        setTasks((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        setTaskDrafts((current) => ({
          ...current,
          [updated.id]: buildTaskDraft(updated),
        }));
        await refreshWorkspaces();
        setNoticeMessage(updated.isCompleted ? "Task completed." : "Task reopened.");
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setSavingTaskId(null);
      }
    },
    [refreshWorkspaces, setErrorMessage, setNoticeMessage, setTasks, workspace],
  );

  return {
    taskTitle,
    setTaskTitle,
    taskDueDate,
    setTaskDueDate,
    taskAssignee,
    setTaskAssignee,
    taskDrawingId,
    setTaskDrawingId,
    taskDescription,
    setTaskDescription,
    taskPriority,
    setTaskPriority,
    preferredTaskDrawingId,
    isTaskFormExpanded,
    setIsTaskFormExpanded,
    isSavingTask,
    sortedTasks,
    expandedTaskId,
    taskDrafts,
    savingTaskId,
    openTaskCount,
    handleCreateTask,
    handleExpandTask,
    handleShowTaskForm,
    handleTaskDraftChange,
    handleResetTaskDraft,
    handleSaveTaskDraft,
    handleDeleteTask,
    handleToggleTask,
  };
}

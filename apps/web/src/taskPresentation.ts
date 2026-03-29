import type { JobTaskRecord } from "@fence-estimator/contracts";

export type TaskDueTone = "none" | "overdue" | "today" | "upcoming";

export function getTaskDueTone(task: Pick<JobTaskRecord, "dueAtIso" | "isCompleted">, now = new Date()): TaskDueTone {
  if (!task.dueAtIso) {
    return "none";
  }
  if (task.isCompleted) {
    return "none";
  }

  const todayIso = now.toISOString().slice(0, 10);
  const dueDate = task.dueAtIso.slice(0, 10);
  if (dueDate < todayIso) {
    return "overdue";
  }
  if (dueDate === todayIso) {
    return "today";
  }
  return "upcoming";
}

export function getTaskDueLabel(task: Pick<JobTaskRecord, "dueAtIso" | "isCompleted">, now = new Date()): string | null {
  const tone = getTaskDueTone(task, now);
  if (!task.dueAtIso) {
    return null;
  }
  if (tone === "overdue") {
    return "Overdue";
  }
  if (tone === "today") {
    return "Due today";
  }
  if (tone === "upcoming") {
    return "Upcoming";
  }
  return null;
}

export function formatTaskDate(value: string | null): string {
  if (!value) {
    return "No date";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

export function formatTaskTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
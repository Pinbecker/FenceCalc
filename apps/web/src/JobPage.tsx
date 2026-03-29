import { useCallback, useEffect, useMemo, useState } from "react";

import {
  JOB_STAGES,
  TASK_PRIORITIES,
  type AncillaryEstimateItem,
  type AuditLogRecord,
  type AuthSessionEnvelope,
  type CompanyUserRecord,
  type CustomerSummary,
  type DrawingRecord,
  type DrawingSummary,
  type EstimateWorkbookManualEntry,
  type JobCommercialInputs,
  type JobRecord,
  type JobStage,
  type JobTaskRecord,
  type LayoutModel,
  type PricedEstimateResult,
  type QuoteRecord,
  type TaskPriority,
} from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import { exportQuotePdfReport } from "./drawingPdfReport";
import {
  createJobDrawing,
  createJobQuoteSnapshot,
  createJobTask,
  deleteJobTask,
  getDrawing,
  getJob,
  getJobEstimate,
  listJobActivity,
  listJobDrawings,
  listJobQuotes,
  listJobTasks,
  updateJob,
  updateJobTask,
} from "./apiClient";
import {
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_MARKUP_UNITS_CODE,
  COMMERCIAL_TRAVEL_DAYS_CODE,
  COMMERCIAL_TRAVEL_RATE_CODE,
  mergeEstimateWorkbook,
} from "./estimatingWorkbook";
import {
  formatTaskDate,
  formatTaskTimestamp,
  getTaskDueLabel,
  getTaskDueTone,
} from "./taskPresentation";
import type { PortalRoute } from "./useHashRoute";
import { buildEstimateDisplaySections, formatQuantityForDisplay } from "./workbookPresentation";

type JobTab = "overview" | "drawings" | "estimate" | "activity";

const JOB_TAB_LABELS: Record<JobTab, string> = {
  overview: "Overview",
  drawings: "Drawings",
  estimate: "Estimate",
  activity: "Activity",
};

const EMPTY_LAYOUT: LayoutModel = {
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: [],
};

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value ?? 0);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function formatDateOnly(value: string | null): string {
  if (!value) {
    return "No date";
  }
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

interface TaskDraftState {
  title: string;
  description: string;
  priority: TaskPriority;
  assignedUserId: string | null;
  drawingId: string | null;
  dueDate: string;
}

function buildTaskDraft(task: JobTaskRecord): TaskDraftState {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignedUserId: task.assignedUserId,
    drawingId: task.drawingId,
    dueDate: task.dueAtIso ? task.dueAtIso.slice(0, 10) : "",
  };
}

function getTaskRootDrawingId(
  drawing: Pick<DrawingSummary, "id" | "parentDrawingId"> | null | undefined,
): string | null {
  if (!drawing) {
    return null;
  }
  return drawing.parentDrawingId ?? drawing.id;
}

function getRevisionLabel(drawing: Pick<DrawingSummary, "revisionNumber">): string {
  return drawing.revisionNumber === 0 ? "Original" : `REV ${drawing.revisionNumber}`;
}

function getEstimateOptionLabel(drawing: DrawingSummary): string {
  const baseLabel = getRevisionLabel(drawing);
  return drawing.revisionNumber === 0
    ? `${baseLabel} • ${drawing.name}`
    : `${baseLabel} • ${drawing.status}`;
}

function buildAncillaryItem(): AncillaryEstimateItem {
  return {
    id: `ancillary-${crypto.randomUUID()}`,
    description: "",
    quantity: 1,
    materialCost: 0,
    labourCost: 0,
  };
}

function upsertManualEntry(
  current: EstimateWorkbookManualEntry[],
  code: string,
  quantity: number,
): EstimateWorkbookManualEntry[] {
  const existing = current.find((entry) => entry.code === code);
  const nextQuantity = Number.isFinite(quantity) ? quantity : 0;
  if (existing) {
    return current.map((entry) =>
      entry.code === code ? { ...entry, quantity: nextQuantity } : entry,
    );
  }
  return [...current, { code, quantity: nextQuantity }];
}

function buildInitialManualEntries(
  pricedEstimate: PricedEstimateResult,
): EstimateWorkbookManualEntry[] {
  const current = [...(pricedEstimate.manualEntries ?? [])];
  const workbook = pricedEstimate.workbook;
  if (!workbook) {
    return current;
  }
  if (workbook.settings.hardDigDefault && !current.some((entry) => entry.code === "LAB_HARD_DIG")) {
    current.push({ code: "LAB_HARD_DIG", quantity: 1 });
  }
  if (
    workbook.settings.clearSpoilsDefault &&
    !current.some((entry) => entry.code === "LAB_CLEAR_SPOILS")
  ) {
    current.push({ code: "LAB_CLEAR_SPOILS", quantity: 1 });
  }
  return current;
}

function getManualEntryValue(
  entries: EstimateWorkbookManualEntry[],
  code: string,
  fallback: number,
): number {
  return entries.find((entry) => entry.code === code)?.quantity ?? fallback;
}

function buildCommercialInputs(
  pricedEstimate: PricedEstimateResult | null,
  manualEntries: EstimateWorkbookManualEntry[],
): JobCommercialInputs | null {
  const workbook = pricedEstimate?.workbook;
  if (!workbook) {
    return null;
  }

  return {
    labourOverheadPercent: workbook.settings.labourOverheadPercent,
    travelLodgePerDay: workbook.settings.travelLodgePerDay,
    travelDays: workbook.commercialInputs.travelDays,
    markupRate: workbook.settings.markupRate,
    markupUnits: workbook.commercialInputs.markupUnits,
    distributionCharge: workbook.settings.distributionCharge,
    concretePricePerCube: workbook.settings.concretePricePerCube,
    hardDig:
      getManualEntryValue(manualEntries, "LAB_HARD_DIG", workbook.settings.hardDigDefault ? 1 : 0) >
      0,
    clearSpoils:
      getManualEntryValue(
        manualEntries,
        "LAB_CLEAR_SPOILS",
        workbook.settings.clearSpoilsDefault ? 1 : 0,
      ) > 0,
  };
}

interface JobPageProps {
  session: AuthSessionEnvelope;
  query?: Record<string, string>;
  customers: CustomerSummary[];
  users: CompanyUserRecord[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
  onRefreshJobs(this: void): Promise<void>;
  onRefreshDrawings(this: void): Promise<void>;
  onToggleDrawingArchived(this: void, drawingId: string, archived: boolean): Promise<boolean>;
  onDeleteJob(this: void, jobId: string): Promise<boolean>;
}

export function JobPage({
  session,
  query,
  customers,
  users,
  onNavigate,
  onRefreshJobs,
  onRefreshDrawings,
  onToggleDrawingArchived,
  onDeleteJob,
}: JobPageProps) {
  const jobId = query?.jobId ?? null;
  const requestedDrawingId = query?.drawingId ?? null;
  const focusTaskId = query?.focusTaskId ?? null;
  const tabValue = (query?.tab as JobTab | undefined) ?? "overview";
  const currentTab: JobTab = ["overview", "drawings", "estimate", "activity"].includes(tabValue)
    ? tabValue
    : "overview";

  const [job, setJob] = useState<JobRecord | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [selectedDrawingRecord, setSelectedDrawingRecord] = useState<DrawingRecord | null>(null);
  const [tasks, setTasks] = useState<JobTaskRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [activity, setActivity] = useState<AuditLogRecord[]>([]);
  const [basePricedEstimate, setBasePricedEstimate] = useState<PricedEstimateResult | null>(null);
  const [ancillaryItems, setAncillaryItems] = useState<AncillaryEstimateItem[]>([]);
  const [manualEntries, setManualEntries] = useState<EstimateWorkbookManualEntry[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string | null>(null);
  const [taskDrawingId, setTaskDrawingId] = useState<string | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("NORMAL");
  const [isTaskFormExpanded, setIsTaskFormExpanded] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraftState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [isSavingStage, setIsSavingStage] = useState(false);
  const [isSavingControls, setIsSavingControls] = useState(false);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [isAddingDrawing, setIsAddingDrawing] = useState(false);
  const [isCreatingDrawingModalOpen, setIsCreatingDrawingModalOpen] = useState(false);
  const [newDrawingName, setNewDrawingName] = useState("");
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [isDeletingJob, setIsDeletingJob] = useState(false);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState(false);
  const [isEditingJobDetails, setIsEditingJobDetails] = useState(false);
  const [editJobName, setEditJobName] = useState("");
  const [editJobNotes, setEditJobNotes] = useState("");
  const [editJobOwner, setEditJobOwner] = useState<string | null>(null);
  const [isSavingJobDetails, setIsSavingJobDetails] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const canDeleteJob = session.user.role === "OWNER" || session.user.role === "ADMIN";

  useEffect(() => {
    if (!noticeMessage) return;
    const timer = globalThis.setTimeout(() => setNoticeMessage(null), 4000);
    return () => globalThis.clearTimeout(timer);
  }, [noticeMessage]);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === job?.customerId) ?? null,
    [customers, job?.customerId],
  );
  const selectedDrawing = useMemo(
    () =>
      drawings.find((entry) => entry.id === requestedDrawingId) ??
      drawings.find((entry) => entry.id === job?.primaryDrawingId) ??
      drawings[0] ??
      null,
    [drawings, job?.primaryDrawingId, requestedDrawingId],
  );

  const pricedEstimate = useMemo(() => {
    if (!basePricedEstimate) {
      return null;
    }
    return mergeEstimateWorkbook(basePricedEstimate, ancillaryItems, manualEntries);
  }, [ancillaryItems, basePricedEstimate, manualEntries]);

  const workbook = pricedEstimate?.workbook ?? null;
  const materialSections = useMemo(
    () =>
      selectedDrawingRecord && workbook
        ? buildEstimateDisplaySections(workbook, selectedDrawingRecord, "MATERIALS")
        : [],
    [selectedDrawingRecord, workbook],
  );
  const labourSections = useMemo(
    () =>
      selectedDrawingRecord && workbook
        ? buildEstimateDisplaySections(workbook, selectedDrawingRecord, "LABOUR")
        : [],
    [selectedDrawingRecord, workbook],
  );

  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return [...tasks].sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (!a.isCompleted) {
        const pa = priorityOrder[a.priority] ?? 2;
        const pb = priorityOrder[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        if (a.dueAtIso && b.dueAtIso) return a.dueAtIso.localeCompare(b.dueAtIso);
        if (a.dueAtIso) return -1;
        if (b.dueAtIso) return 1;
      }
      return b.createdAtIso.localeCompare(a.createdAtIso);
    });
  }, [tasks]);
  const rootDrawings = useMemo(
    () =>
      drawings
        .filter((drawing) => !drawing.parentDrawingId)
        .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso)),
    [drawings],
  );
  const preferredTaskDrawingId = useMemo(() => {
    const selectedRootDrawingId = getTaskRootDrawingId(selectedDrawing);
    if (selectedRootDrawingId) {
      return selectedRootDrawingId;
    }
    const primaryDrawing = job?.primaryDrawingId
      ? (drawings.find((drawing) => drawing.id === job.primaryDrawingId) ?? null)
      : null;
    const primaryRootDrawingId = getTaskRootDrawingId(primaryDrawing);
    return primaryRootDrawingId ?? rootDrawings[0]?.id ?? null;
  }, [drawings, job?.primaryDrawingId, rootDrawings, selectedDrawing]);
  const openTaskCount = tasks.filter((entry) => !entry.isCompleted).length;
  const latestQuoteByDrawingId = useMemo(() => {
    const latestByDrawingId = new Map<string, QuoteRecord>();
    for (const quote of quotes) {
      if (!latestByDrawingId.has(quote.drawingId)) {
        latestByDrawingId.set(quote.drawingId, quote);
      }
    }
    return latestByDrawingId;
  }, [quotes]);
  const sortedDrawings = useMemo(() => {
    return [...drawings]
      .filter((d) => !d.parentDrawingId)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  }, [drawings]);

  const drawingGroups = useMemo(() => {
    return sortedDrawings.map((rootDrawing) => ({
      rootDrawing,
      chain: [
        rootDrawing,
        ...drawings
          .filter((drawing) => drawing.parentDrawingId === rootDrawing.id)
          .sort((left, right) => {
            if (left.revisionNumber !== right.revisionNumber) {
              return left.revisionNumber - right.revisionNumber;
            }
            return left.createdAtIso.localeCompare(right.createdAtIso);
          }),
      ],
    }));
  }, [drawings, sortedDrawings]);

  const latestDrawingByRootId = useMemo(() => {
    return new Map(
      drawingGroups.map(({ rootDrawing, chain }) => [
        rootDrawing.id,
        chain[chain.length - 1] ?? rootDrawing,
      ]),
    );
  }, [drawingGroups]);

  const revisionCountByDrawing = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drawings) {
      if (d.parentDrawingId) {
        counts.set(d.parentDrawingId, (counts.get(d.parentDrawingId) ?? 0) + 1);
      }
    }
    return counts;
  }, [drawings]);

  const navigateToJob = useCallback(
    (nextTab: JobTab, nextDrawingId?: string | null) => {
      if (!jobId) {
        return;
      }
      onNavigate("job", {
        jobId,
        tab: nextTab,
        ...(nextDrawingId ? { drawingId: nextDrawingId } : {}),
      });
    },
    [jobId, onNavigate],
  );

  const loadWorkspace = useCallback(
    async (targetJobId: string) => {
      setIsLoading(true);
      try {
        const [nextJob, nextDrawings, nextTasks, nextQuotes, nextActivity] = await Promise.all([
          getJob(targetJobId),
          listJobDrawings(targetJobId),
          listJobTasks(targetJobId),
          listJobQuotes(targetJobId),
          listJobActivity(targetJobId),
        ]);
        setJob(nextJob);
        setDrawings(
          [...nextDrawings].sort((left, right) => {
            if (left.id === nextJob.primaryDrawingId) {
              return -1;
            }
            if (right.id === nextJob.primaryDrawingId) {
              return 1;
            }
            return right.updatedAtIso.localeCompare(left.updatedAtIso);
          }),
        );
        setTasks(nextTasks);
        setTaskDrafts(Object.fromEntries(nextTasks.map((task) => [task.id, buildTaskDraft(task)])));
        setQuotes(nextQuotes);
        setActivity(nextActivity);
        setErrorMessage(null);
      } catch (error) {
        try {
          const drawing = await getDrawing(targetJobId);
          if (drawing.jobId && drawing.jobId !== targetJobId) {
            onNavigate("job", {
              jobId: drawing.jobId,
              tab: currentTab,
              drawingId: requestedDrawingId ?? drawing.id,
            });
            return;
          }
        } catch {
          // Fall back to the original job error below if the ID is not a drawing either.
        }
        setJob(null);
        setDrawings([]);
        setTasks([]);
        setTaskDrafts({});
        setQuotes([]);
        setActivity([]);
        setErrorMessage((error as Error).message);
      } finally {
        setIsLoading(false);
      }
    },
    [currentTab, onNavigate, requestedDrawingId],
  );

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setDrawings([]);
      setTasks([]);
      setTaskDrafts({});
      setQuotes([]);
      setActivity([]);
      setBasePricedEstimate(null);
      setSelectedDrawingRecord(null);
      setIsLoading(false);
      return;
    }
    void loadWorkspace(jobId);
  }, [jobId, loadWorkspace]);

  useEffect(() => {
    if (!jobId || !selectedDrawing) {
      setBasePricedEstimate(null);
      setSelectedDrawingRecord(null);
      setAncillaryItems([]);
      setManualEntries([]);
      return;
    }

    let cancelled = false;
    setIsLoadingEstimate(true);
    void (async () => {
      try {
        const [nextEstimate, nextDrawingRecord] = await Promise.all([
          getJobEstimate(jobId, selectedDrawing.id),
          getDrawing(selectedDrawing.id),
        ]);
        if (cancelled) {
          return;
        }
        setBasePricedEstimate(nextEstimate);
        setSelectedDrawingRecord(nextDrawingRecord);
        setAncillaryItems([]);
        setManualEntries(buildInitialManualEntries(nextEstimate));
      } catch (error) {
        if (!cancelled) {
          setBasePricedEstimate(null);
          setSelectedDrawingRecord(null);
          setErrorMessage((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingEstimate(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, selectedDrawing]);

  useEffect(() => {
    if (!focusTaskId || !tasks.some((task) => task.id === focusTaskId)) {
      return;
    }
    setExpandedTaskId(focusTaskId);
  }, [focusTaskId, tasks]);

  useEffect(() => {
    setTaskDrawingId((current) => {
      if (current && rootDrawings.some((drawing) => drawing.id === current)) {
        return current;
      }
      return preferredTaskDrawingId;
    });
  }, [preferredTaskDrawingId, rootDrawings]);

  const handleStageChange = async (stage: JobStage) => {
    if (!job) {
      return;
    }
    setIsSavingStage(true);
    setErrorMessage(null);
    try {
      const updated = await updateJob(job.id, { stage });
      setJob(updated);
      await onRefreshJobs();
      setNoticeMessage(`Updated stage to ${stage.replaceAll("_", " ").toLowerCase()}.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingStage(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!job) {
      return;
    }
    setIsSavingStage(true);
    setErrorMessage(null);
    try {
      const updated = await updateJob(job.id, { archived: !job.isArchived });
      setJob(updated);
      await onRefreshJobs();
      setNoticeMessage(
        updated.isArchived ? `Archived ${updated.name}.` : `Restored ${updated.name}.`,
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingStage(false);
    }
  };

  const handleDeleteJob = async () => {
    if (!job) {
      return;
    }
    setIsDeletingJob(true);
    setErrorMessage(null);
    try {
      const deleted = await onDeleteJob(job.id);
      if (deleted) {
        onNavigate("customer", { customerId: job.customerId });
      }
    } finally {
      setIsDeletingJob(false);
      setConfirmDeleteJob(false);
    }
  };

  const openCreateDrawingModal = () => {
    setNewDrawingName("");
    setIsCreatingDrawingModalOpen(true);
  };

  const handleAddDrawing = async (sourceDrawingId?: string, name?: string) => {
    if (!job) {
      return;
    }
    setIsAddingDrawing(true);
    setErrorMessage(null);
    try {
      const drawing = await createJobDrawing(job.id, {
        ...(sourceDrawingId ? { sourceDrawingId } : {}),
        ...(name?.trim() ? { name: name.trim() } : {}),
      });
      await Promise.all([loadWorkspace(job.id), onRefreshJobs(), onRefreshDrawings()]);
      if (!sourceDrawingId) {
        setIsCreatingDrawingModalOpen(false);
        setNewDrawingName("");
      }
      onNavigate("editor", { drawingId: drawing.id });
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsAddingDrawing(false);
    }
  };

  const handleCreateRootDrawing = async () => {
    if (!newDrawingName.trim()) {
      return;
    }
    await handleAddDrawing(undefined, newDrawingName);
  };

  const handleCreateTask = async () => {
    if (!job || !taskTitle.trim()) {
      return;
    }
    if (rootDrawings.length > 0 && !taskDrawingId) {
      setErrorMessage("Choose a drawing for this task.");
      return;
    }
    setIsSavingTask(true);
    setErrorMessage(null);
    try {
      const createTaskInput = {
        title: taskTitle.trim(),
        assignedUserId: taskAssignee,
        drawingId: taskDrawingId,
        dueAtIso: taskDueDate ? new Date(`${taskDueDate}T09:00:00`).toISOString() : null,
        ...(taskDescription.trim() ? { description: taskDescription.trim() } : {}),
        ...(taskPriority !== "NORMAL" ? { priority: taskPriority } : {}),
      };
      await createJobTask(job.id, createTaskInput);
      setTaskTitle("");
      setTaskDueDate("");
      setTaskAssignee(null);
      setTaskDrawingId(preferredTaskDrawingId);
      setTaskDescription("");
      setTaskPriority("NORMAL");
      setIsTaskFormExpanded(false);
      await Promise.all([loadWorkspace(job.id), onRefreshJobs()]);
      setNoticeMessage("Task added.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleExpandTask = (task: JobTaskRecord) => {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: current[task.id] ?? buildTaskDraft(task),
    }));
    setExpandedTaskId((current) => (current === task.id ? null : task.id));
  };

  const handleTaskDraftChange = <K extends keyof TaskDraftState>(
    taskId: string,
    field: K,
    value: TaskDraftState[K],
  ) => {
    setTaskDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {
          title: "",
          description: "",
          priority: "NORMAL",
          assignedUserId: null,
          drawingId: null,
          dueDate: "",
        }),
        [field]: value,
      },
    }));
  };

  const handleResetTaskDraft = (task: JobTaskRecord) => {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: buildTaskDraft(task),
    }));
  };

  const handleSaveTaskDraft = async (task: JobTaskRecord) => {
    if (!job) {
      return;
    }
    const draft = taskDrafts[task.id] ?? buildTaskDraft(task);
    if (!draft.title.trim()) {
      setErrorMessage("Task title is required.");
      return;
    }
    if (rootDrawings.length > 0 && !draft.drawingId) {
      setErrorMessage("Choose a drawing for this task.");
      return;
    }
    setSavingTaskId(task.id);
    setErrorMessage(null);
    try {
      const updated = await updateJobTask(job.id, task.id, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        assignedUserId: draft.assignedUserId,
        drawingId: draft.drawingId,
        dueAtIso: draft.dueDate ? new Date(`${draft.dueDate}T09:00:00`).toISOString() : null,
      });
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setTaskDrafts((current) => ({
        ...current,
        [updated.id]: buildTaskDraft(updated),
      }));
      await onRefreshJobs();
      setNoticeMessage("Task details saved.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleDeleteTask = async (task: JobTaskRecord) => {
    if (!job) {
      return;
    }
    setErrorMessage(null);
    try {
      await deleteJobTask(job.id, task.id);
      setTasks((current) => current.filter((entry) => entry.id !== task.id));
      setTaskDrafts((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      if (expandedTaskId === task.id) {
        setExpandedTaskId(null);
      }
      await onRefreshJobs();
      setNoticeMessage("Task deleted.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  const handleToggleTask = async (task: JobTaskRecord) => {
    if (!job) {
      return;
    }
    setSavingTaskId(task.id);
    setErrorMessage(null);
    try {
      const updated = await updateJobTask(job.id, task.id, { isCompleted: !task.isCompleted });
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setTaskDrafts((current) => ({
        ...current,
        [updated.id]: buildTaskDraft(updated),
      }));
      await onRefreshJobs();
      setNoticeMessage(updated.isCompleted ? "Task completed." : "Task reopened.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleSaveControls = async () => {
    if (!job) {
      return;
    }
    const commercialInputs = buildCommercialInputs(pricedEstimate, manualEntries);
    if (!commercialInputs) {
      return;
    }
    setIsSavingControls(true);
    setErrorMessage(null);
    try {
      const updated = await updateJob(job.id, { commercialInputs });
      setJob(updated);
      await onRefreshJobs();
      setNoticeMessage("Estimate controls saved to this job.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingControls(false);
    }
  };

  const handleGenerateQuotePdf = async () => {
    if (!job || !selectedDrawing || !selectedDrawingRecord || !pricedEstimate) {
      return;
    }
    setIsSavingQuote(true);
    setErrorMessage(null);
    try {
      const quote = await createJobQuoteSnapshot(
        job.id,
        ancillaryItems,
        manualEntries,
        selectedDrawing.id,
      );
      setQuotes((current) => [quote, ...current]);
      await onRefreshJobs();

      const revisionLabel = getRevisionLabel(selectedDrawing);

      const layout = selectedDrawingRecord.layout ?? EMPTY_LAYOUT;
      const segments = layout.segments ?? [];
      const ordinalMap = new Map(segments.map((s, i) => [s.id, i + 1]));

      const opened = exportQuotePdfReport({
        companyName: session.company.name ?? null,
        preparedBy: session.user.displayName ?? null,
        customerName: customer?.name ?? "",
        jobName: job.name,
        drawingName: selectedDrawing.name,
        revisionLabel,
        generatedAtIso: new Date().toISOString(),
        layout,
        materialSections: materialSections.map((s) => ({
          title: s.title,
          subtotal: s.subtotal,
          rows: s.rows.map((r) => ({
            label: r.label,
            unit: r.unit,
            quantity: r.quantity,
            rate: r.rate,
            total: r.total,
          })),
        })),
        labourSections: labourSections.map((s) => ({
          title: s.title,
          subtotal: s.subtotal,
          rows: s.rows.map((r) => ({
            label: r.label,
            unit: r.unit,
            quantity: r.quantity,
            rate: r.rate,
            total: r.total,
          })),
        })),
        totals: pricedEstimate.totals,
        warnings: pricedEstimate.warnings,
        estimateSegments: segments,
        segmentOrdinalById: ordinalMap,
      });

      if (!opened) {
        setErrorMessage(
          "Could not open quote PDF. Please allow pop-ups for this site and try again.",
        );
      } else {
        setNoticeMessage("Quote saved and PDF generated.");
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingQuote(false);
    }
  };

  const handleOpenEditDetails = () => {
    if (!job) return;
    setEditJobName(job.name);
    setEditJobNotes(job.notes);
    setEditJobOwner(job.ownerUserId);
    setIsEditingJobDetails(true);
  };

  const handleSaveJobDetails = async () => {
    if (!job) return;
    setIsSavingJobDetails(true);
    setErrorMessage(null);
    try {
      const updates: Record<string, unknown> = {};
      if (editJobName.trim() && editJobName.trim() !== job.name) updates.name = editJobName.trim();
      if (editJobNotes !== job.notes) updates.notes = editJobNotes;
      if (editJobOwner !== job.ownerUserId) updates.ownerUserId = editJobOwner;
      if (Object.keys(updates).length === 0) {
        setIsEditingJobDetails(false);
        return;
      }
      const updated = await updateJob(job.id, updates as Parameters<typeof updateJob>[1]);
      setJob(updated);
      await onRefreshJobs();
      setIsEditingJobDetails(false);
      setNoticeMessage("Job details updated.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingJobDetails(false);
    }
  };

  if (!jobId) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>No job selected</h1>
          <p>
            Open a customer workspace and choose a job to review drawings, estimates, and activity.
          </p>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => onNavigate("customers")}
          >
            Browse customers
          </button>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h2>Loading job workspace...</h2>
        </div>
      </section>
    );
  }

  if (!job) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>Job not found</h1>
          <p>The selected job could not be loaded.</p>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => onNavigate("customers")}
          >
            Back to customers
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="portal-page portal-customer-page portal-job-page">
      <header className="portal-page-header">
        <div className="portal-job-heading">
          <span className="portal-eyebrow">Job workspace</span>
          <h1>{job.name}</h1>
          <p>
            {job.customerName}
            {customer?.siteAddress ? ` | ${customer.siteAddress}` : ""}
            {job.ownerDisplayName ? ` | Owner: ${job.ownerDisplayName}` : ""}
          </p>
          <div className="workbook-summary-strip portal-job-summary-strip">
            <article>
              <span>Stage</span>
              <strong>{job.stage.replaceAll("_", " ")}</strong>
            </article>
            <article>
              <span>Drawings</span>
              <strong>{drawings.length}</strong>
            </article>
            <article>
              <span>Open tasks</span>
              <strong>{openTaskCount}</strong>
            </article>
            <article>
              <span>Last activity</span>
              <strong>{formatTimestamp(job.updatedAtIso)}</strong>
            </article>
          </div>
        </div>
        <div className="portal-header-actions">
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={handleOpenEditDetails}
          >
            Edit details
          </button>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => void handleArchiveToggle()}
            disabled={isSavingStage}
          >
            {job.isArchived ? "Restore job" : "Archive job"}
          </button>
          {canDeleteJob ? (
            <button
              type="button"
              className="portal-danger-button portal-compact-button"
              onClick={() => setConfirmDeleteJob(true)}
              disabled={isDeletingJob}
            >
              {isDeletingJob ? "Deleting..." : "Delete job"}
            </button>
          ) : null}
        </div>
      </header>

      {errorMessage ? (
        <div className="portal-inline-message portal-inline-error">{errorMessage}</div>
      ) : null}
      {noticeMessage ? (
        <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div>
      ) : null}

      <div
        className="portal-filter-row portal-job-tab-row"
        role="tablist"
        aria-label="Job sections"
      >
        {(Object.keys(JOB_TAB_LABELS) as JobTab[]).map((jobTab) => (
          <button
            key={jobTab}
            type="button"
            className={currentTab === jobTab ? "is-active" : undefined}
            onClick={() => navigateToJob(jobTab, selectedDrawing?.id ?? null)}
          >
            {JOB_TAB_LABELS[jobTab]}
          </button>
        ))}
      </div>

      {currentTab === "overview" ? (
        <>
          <section className="portal-surface-card portal-job-drawing-timeline-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Drawing history</span>
                <h2>Drawing revision timeline</h2>
              </div>
            </div>
            {drawingGroups.length === 0 ? (
              <p className="portal-empty-copy">
                No drawings yet. Create a drawing to start this job timeline.
              </p>
            ) : null}
            <div
              className="portal-job-drawing-timeline"
              role="list"
              aria-label="Drawing revision timeline"
            >
              {drawingGroups.map(({ rootDrawing, chain }) => (
                <section
                  key={rootDrawing.id}
                  className="portal-job-drawing-timeline-group"
                  role="listitem"
                >
                  <div className="portal-job-drawing-timeline-group-header">
                    <div>
                      <span className="portal-section-kicker">
                        {chain.length - 1} revision{chain.length - 1 !== 1 ? "s" : ""}
                      </span>
                      <h3>{rootDrawing.name}</h3>
                    </div>
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => onNavigate("drawing", { drawingId: rootDrawing.id })}
                    >
                      View chain
                    </button>
                  </div>
                  <div className="portal-job-drawing-timeline-chain">
                    {chain.map((drawing, index) => {
                      const isLatest = index === chain.length - 1;
                      return (
                        <div key={drawing.id} className="portal-job-drawing-timeline-node-wrap">
                          <button
                            type="button"
                            className={`portal-job-drawing-timeline-node${isLatest ? " is-latest" : ""}${drawing.status === "QUOTED" ? " is-quoted" : ""}${drawing.isArchived ? " is-archived" : ""}`}
                            onClick={() => onNavigate("drawing", { drawingId: drawing.id })}
                          >
                            <span className="portal-job-drawing-timeline-node-label">
                              {getRevisionLabel(drawing)}
                            </span>
                            <strong>{drawing.name}</strong>
                            <span>{formatDateOnly(drawing.createdAtIso)}</span>
                          </button>
                          {index < chain.length - 1 ? (
                            <div
                              className="portal-job-drawing-timeline-connector"
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <div className="portal-dashboard-layout portal-job-overview-layout">
            <section className="portal-surface-card portal-dashboard-primary">
              <div className="portal-section-heading">
                <div>
                  <span className="portal-section-kicker">Pipeline</span>
                  <h2>Stage and tasks</h2>
                </div>
              </div>

              <div className="portal-job-meta-grid">
                <label className="portal-customer-edit-field">
                  <span>Job stage</span>
                  <select
                    value={job.stage}
                    onChange={(event) => void handleStageChange(event.target.value as JobStage)}
                    disabled={isSavingStage}
                  >
                    {JOB_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="portal-customer-edit-field">
                  <span>Owner</span>
                  <strong>{job.ownerDisplayName || session.user.displayName}</strong>
                </div>
                <div className="portal-customer-edit-field">
                  <span>Next action</span>
                  <strong>
                    {sortedTasks.find((entry) => !entry.isCompleted)?.title ?? "No open tasks"}
                  </strong>
                </div>
              </div>

              <div className="portal-job-task-form">
                {rootDrawings.length === 0 ? (
                  <p className="portal-empty-copy">
                    Create a drawing for this job before adding drawing-specific tasks.
                  </p>
                ) : null}
                <div className="portal-job-task-form-compact-row">
                  <label className="portal-customer-edit-field portal-task-input-field portal-job-task-title-field">
                    <span>Task title</span>
                    <input
                      placeholder="Add follow-up task"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      onFocus={() => {
                        if (
                          taskDescription ||
                          taskDueDate ||
                          taskAssignee ||
                          taskPriority !== "NORMAL"
                        ) {
                          setIsTaskFormExpanded(true);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && taskTitle.trim()) void handleCreateTask();
                      }}
                    />
                  </label>
                  <div className="portal-job-task-form-actions">
                    <button
                      type="button"
                      className="portal-secondary-button portal-compact-button"
                      onClick={() => setIsTaskFormExpanded((current) => !current)}
                    >
                      {isTaskFormExpanded ? "Hide details" : "Details"}
                    </button>
                    <button
                      type="button"
                      className="portal-primary-button portal-compact-button"
                      onClick={() => void handleCreateTask()}
                      disabled={
                        isSavingTask ||
                        !taskTitle.trim() ||
                        rootDrawings.length === 0 ||
                        (rootDrawings.length > 0 && !taskDrawingId)
                      }
                    >
                      {isSavingTask ? "Saving..." : "Add task"}
                    </button>
                  </div>
                </div>
                {isTaskFormExpanded ? (
                  <>
                    <div className="portal-job-task-form-row">
                      <label className="portal-customer-edit-field portal-task-input-field">
                        <span>Drawing</span>
                        <select
                          value={taskDrawingId ?? ""}
                          onChange={(event) => setTaskDrawingId(event.target.value || null)}
                          disabled={rootDrawings.length === 0}
                        >
                          <option value="">Choose drawing</option>
                          {rootDrawings.map((drawing) => (
                            <option key={drawing.id} value={drawing.id}>
                              {drawing.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="portal-customer-edit-field portal-task-input-field">
                        <span>Due date</span>
                        <input
                          type="date"
                          value={taskDueDate}
                          onChange={(event) => setTaskDueDate(event.target.value)}
                        />
                      </label>
                      <label className="portal-customer-edit-field portal-task-input-field">
                        <span>Assignee</span>
                        <select
                          value={taskAssignee ?? ""}
                          onChange={(event) => setTaskAssignee(event.target.value || null)}
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
                          onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}
                        >
                          {TASK_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p.charAt(0) + p.slice(1).toLowerCase()}
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
                        onChange={(event) => setTaskDescription(event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <div className="portal-job-task-list">
                {sortedTasks.length === 0 ? (
                  <p className="portal-empty-copy">No tasks on this job yet.</p>
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
                            onClick={() => void handleToggleTask(task)}
                            aria-label={
                              task.isCompleted
                                ? `Reopen task ${task.title}`
                                : `Complete task ${task.title}`
                            }
                            disabled={savingTaskId === task.id}
                          >
                            {task.isCompleted ? "✓" : ""}
                          </button>
                          <div className="portal-job-task-card-title">
                            <h3
                              className={`portal-task-card-heading${task.isCompleted ? " portal-task-done-text" : ""}`}
                            >
                              {task.title}
                            </h3>
                            <span className="portal-job-task-card-meta">
                              {task.drawingName ? `${task.drawingName} · ` : ""}
                              {task.assignedUserDisplayName || "Unassigned"}
                              {task.dueAtIso ? ` · Due ${formatTaskDate(task.dueAtIso)}` : ""}
                            </span>
                          </div>
                        </div>
                        <div className="portal-job-task-card-right">
                          {dueLabel ? (
                            <span className={`portal-task-due-badge is-${dueTone}`}>
                              {dueLabel}
                            </span>
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
                          <button
                            type="button"
                            className="portal-task-expand-button"
                            onClick={() => handleExpandTask(task)}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? `Collapse task ${task.title}`
                                : `Expand task ${task.title}`
                            }
                          >
                            {isExpanded ? "Hide" : "Edit"}
                          </button>
                        </div>
                      </div>
                      {task.description && !isExpanded ? (
                        <p className="portal-job-task-card-description-preview">
                          {task.description}
                        </p>
                      ) : null}
                      {isExpanded ? (
                        <div className="portal-job-task-card-detail">
                          <div className="portal-job-task-card-fields portal-job-task-card-fields-expanded">
                            <label className="portal-customer-edit-field">
                              <span>Title</span>
                              <input
                                value={taskDraft.title}
                                maxLength={240}
                                onChange={(event) =>
                                  handleTaskDraftChange(task.id, "title", event.target.value)
                                }
                              />
                            </label>
                            <label className="portal-customer-edit-field portal-job-task-card-field-wide">
                              <span>Description</span>
                              <textarea
                                rows={4}
                                value={taskDraft.description}
                                maxLength={2000}
                                onChange={(event) =>
                                  handleTaskDraftChange(task.id, "description", event.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div className="portal-job-task-card-fields">
                            <label className="portal-customer-edit-field">
                              <span>Drawing</span>
                              <select
                                value={taskDraft.drawingId ?? ""}
                                onChange={(event) =>
                                  handleTaskDraftChange(
                                    task.id,
                                    "drawingId",
                                    event.target.value || null,
                                  )
                                }
                                disabled={rootDrawings.length === 0}
                              >
                                <option value="">Choose drawing</option>
                                {rootDrawings.map((drawing) => (
                                  <option key={drawing.id} value={drawing.id}>
                                    {drawing.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="portal-customer-edit-field">
                              <span>Priority</span>
                              <select
                                value={taskDraft.priority}
                                onChange={(event) =>
                                  handleTaskDraftChange(
                                    task.id,
                                    "priority",
                                    event.target.value as TaskPriority,
                                  )
                                }
                              >
                                {TASK_PRIORITIES.map((p) => (
                                  <option key={p} value={p}>
                                    {p.charAt(0) + p.slice(1).toLowerCase()}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="portal-customer-edit-field">
                              <span>Assignee</span>
                              <select
                                value={taskDraft.assignedUserId ?? ""}
                                onChange={(event) =>
                                  handleTaskDraftChange(
                                    task.id,
                                    "assignedUserId",
                                    event.target.value || null,
                                  )
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
                                onChange={(event) =>
                                  handleTaskDraftChange(task.id, "dueDate", event.target.value)
                                }
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
                              onClick={() => void handleSaveTaskDraft(task)}
                              disabled={savingTaskId === task.id || !taskDraft.title.trim()}
                            >
                              {savingTaskId === task.id ? "Saving..." : "Save changes"}
                            </button>
                            <button
                              type="button"
                              className="portal-text-button"
                              onClick={() => handleResetTaskDraft(task)}
                              disabled={savingTaskId === task.id}
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              className="portal-text-button"
                              onClick={() => void handleToggleTask(task)}
                            >
                              {task.isCompleted ? "Reopen" : "Complete"}
                            </button>
                            <button
                              type="button"
                              className="portal-text-button portal-danger-text"
                              onClick={() => void handleDeleteTask(task)}
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

            {job.notes ? (
              <div className="portal-dashboard-side">
                <section className="portal-surface-card portal-dashboard-activity">
                  <div className="portal-section-heading">
                    <div>
                      <span className="portal-section-kicker">Job notes</span>
                      <h2>Notes</h2>
                    </div>
                  </div>
                  <p
                    className="portal-empty-copy portal-job-notes-copy"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {job.notes}
                  </p>
                </section>
              </div>
            ) : null}

            <section className="portal-surface-card portal-job-primary-card">
              <div className="portal-section-heading">
                <div>
                  <span className="portal-section-kicker">Drawings</span>
                  <h2>Drawings</h2>
                </div>
                <button
                  type="button"
                  className="portal-secondary-button portal-compact-button"
                  onClick={openCreateDrawingModal}
                  disabled={isAddingDrawing}
                >
                  {isAddingDrawing ? "Adding..." : "New drawing"}
                </button>
              </div>
              <div className="portal-customer-drawing-grid">
                {sortedDrawings.length === 0 ? (
                  <p className="portal-empty-copy">
                    No drawings yet. Create a drawing to get started.
                  </p>
                ) : null}
                {sortedDrawings.map((drawing) => {
                  const revCount = revisionCountByDrawing.get(drawing.id) ?? 0;
                  const latestRevision = latestDrawingByRootId.get(drawing.id) ?? drawing;
                  return (
                    <article key={drawing.id} className="portal-customer-drawing-card">
                      <div
                        className="portal-customer-drawing-card-preview"
                        role="button"
                        tabIndex={0}
                        onClick={() => onNavigate("drawing", { drawingId: drawing.id })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            onNavigate("drawing", { drawingId: drawing.id });
                          }
                        }}
                      >
                        <DrawingPreview
                          layout={drawing.previewLayout}
                          label={drawing.name}
                          variant="card"
                        />
                      </div>
                      <div className="portal-customer-drawing-card-body">
                        <div className="portal-customer-drawing-card-head">
                          <div className="portal-customer-drawing-card-copy">
                            <h3>{drawing.name}</h3>
                            <span>Latest: {getRevisionLabel(latestRevision)}</span>
                          </div>
                          <div className="portal-customer-drawing-card-badges">
                            {latestRevision.status === "QUOTED" ? (
                              <span className="portal-customer-drawing-badge is-quoted">
                                Quoted
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="portal-customer-drawing-card-meta">
                          <span>
                            {drawing.segmentCount} segments | {drawing.gateCount} gates
                          </span>
                          <span>
                            {revCount} revision{revCount !== 1 ? "s" : ""}
                          </span>
                          <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                        </div>
                        <div className="portal-customer-drawing-card-footer">
                          <button
                            type="button"
                            className="portal-text-button"
                            onClick={() => onNavigate("drawing", { drawingId: drawing.id })}
                          >
                            View drawing
                          </button>
                          <button
                            type="button"
                            className="portal-text-button"
                            onClick={() => onNavigate("editor", { drawingId: drawing.id })}
                          >
                            Open editor
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="portal-surface-card">
              <div className="portal-section-heading">
                <div>
                  <span className="portal-section-kicker">Quotes</span>
                  <h2>Revision quotes</h2>
                </div>
              </div>
              <div className="estimate-ancillary-list">
                {drawingGroups.length === 0 ? (
                  <p className="portal-empty-copy">Add a drawing to generate a quote.</p>
                ) : null}
                {drawingGroups.map(({ rootDrawing, chain }) => (
                  <div key={rootDrawing.id} className="portal-revision-chain-group">
                    <div className="estimate-item-copy portal-revision-chain-header">
                      <strong>{rootDrawing.name}</strong>
                      <span>
                        {chain.length - 1} revision{chain.length - 1 !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {chain.map((drawing) => {
                      const drawingQuote = latestQuoteByDrawingId.get(drawing.id) ?? null;
                      return (
                        <article key={drawing.id} className="estimate-ancillary-row">
                          <div className="estimate-item-copy">
                            <strong>{getRevisionLabel(drawing)}</strong>
                            <span>
                              {drawingQuote
                                ? `${drawing.name} • ${drawing.status}`
                                : `${drawing.name} • No quote saved`}
                            </span>
                          </div>
                          <span>
                            {drawingQuote
                              ? formatMoney(drawingQuote.pricedEstimate.totals.totalCost)
                              : "No quote yet"}
                          </span>
                          <button
                            type="button"
                            className="portal-text-button"
                            onClick={() => navigateToJob("estimate", drawing.id)}
                          >
                            {drawingQuote ? "Update" : "Generate"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}

      {currentTab === "drawings" ? (
        <section className="portal-surface-card portal-customer-drawings-panel">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">All drawings</span>
              <h2>Drawings</h2>
            </div>
            <button
              type="button"
              className="portal-secondary-button portal-compact-button"
              onClick={openCreateDrawingModal}
              disabled={isAddingDrawing}
            >
              {isAddingDrawing ? "Adding..." : "New drawing"}
            </button>
          </div>

          <div className="portal-customer-drawing-grid">
            {sortedDrawings.map((drawing) => {
              const revCount = revisionCountByDrawing.get(drawing.id) ?? 0;
              const latestRevision = latestDrawingByRootId.get(drawing.id) ?? drawing;
              return (
                <article
                  key={drawing.id}
                  className={`portal-customer-drawing-card${drawing.isArchived ? " is-archived" : ""}`}
                >
                  <div
                    className="portal-customer-drawing-card-preview"
                    role="button"
                    tabIndex={0}
                    onClick={() => onNavigate("drawing", { drawingId: drawing.id })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onNavigate("drawing", { drawingId: drawing.id });
                      }
                    }}
                  >
                    <DrawingPreview
                      layout={drawing.previewLayout}
                      label={drawing.name}
                      variant="card"
                    />
                  </div>
                  <div className="portal-customer-drawing-card-body">
                    <div className="portal-customer-drawing-card-head">
                      <div className="portal-customer-drawing-card-copy">
                        <h3>{drawing.name}</h3>
                        <span>Latest: {getRevisionLabel(latestRevision)}</span>
                      </div>
                      <div className="portal-customer-drawing-card-badges">
                        {latestRevision.status === "QUOTED" ? (
                          <span className="portal-customer-drawing-badge is-quoted">Quoted</span>
                        ) : null}
                        {drawing.isArchived ? (
                          <span className="portal-customer-drawing-badge is-archived">
                            Archived
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="portal-customer-drawing-card-meta">
                      <span>
                        {drawing.segmentCount} segments | {drawing.gateCount} gates
                      </span>
                      <span>
                        {revCount} revision{revCount !== 1 ? "s" : ""}
                      </span>
                      <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                    </div>
                    <div className="portal-customer-drawing-card-footer">
                      <button
                        type="button"
                        className="portal-text-button"
                        onClick={() => onNavigate("drawing", { drawingId: drawing.id })}
                      >
                        View drawing
                      </button>
                      <button
                        type="button"
                        className="portal-text-button"
                        onClick={() => onNavigate("editor", { drawingId: drawing.id })}
                      >
                        Open editor
                      </button>
                      <button
                        type="button"
                        className="portal-text-button"
                        onClick={() =>
                          void onToggleDrawingArchived(drawing.id, !drawing.isArchived)
                        }
                      >
                        {drawing.isArchived ? "Unarchive" : "Archive"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {currentTab === "estimate" ? (
        <>
          <section className="portal-surface-card workbook-commercial-card estimate-control-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Estimate controls</span>
                <h2>Job commercial inputs</h2>
              </div>
              <div className="portal-header-actions">
                <button
                  type="button"
                  className="portal-secondary-button portal-compact-button"
                  onClick={() => void handleSaveControls()}
                  disabled={isSavingControls || !pricedEstimate}
                >
                  {isSavingControls ? "Saving..." : "Save controls"}
                </button>
                <button
                  type="button"
                  className="portal-primary-button portal-compact-button"
                  onClick={() => void handleGenerateQuotePdf()}
                  disabled={isSavingQuote || !pricedEstimate}
                >
                  {isSavingQuote ? "Generating..." : "Generate quote PDF"}
                </button>
              </div>
            </div>

            {selectedDrawing ? (
              <div className="portal-job-task-form">
                <label className="portal-customer-edit-field">
                  <span>Drawing revision</span>
                  <select
                    value={selectedDrawing.id}
                    onChange={(event) => navigateToJob("estimate", event.target.value)}
                  >
                    {drawingGroups.map(({ rootDrawing, chain }) => (
                      <optgroup key={rootDrawing.id} label={rootDrawing.name}>
                        {chain.map((drawing) => (
                          <option key={drawing.id} value={drawing.id}>
                            {getEstimateOptionLabel(drawing)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {isLoadingEstimate ? <p className="portal-empty-copy">Loading estimate...</p> : null}
            {workbook ? (
              <div className="workbook-settings-grid estimate-control-grid">
                <label>
                  <span>Labour overhead %</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.settings.labourOverheadPercent}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Travel / lodge per day</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.settings.travelLodgePerDay}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_TRAVEL_RATE_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Travel days</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.commercialInputs.travelDays}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_TRAVEL_DAYS_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Markup rate</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.settings.markupRate}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_MARKUP_RATE_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Markup units</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.commercialInputs.markupUnits}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_MARKUP_UNITS_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Distribution charge</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.settings.distributionCharge}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Concrete price per cube</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workbook.settings.concretePricePerCube}
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
                          Number(event.target.value || 0),
                        ),
                      )
                    }
                  />
                </label>
                <label className="workbook-toggle-field">
                  <span>Hard dig</span>
                  <input
                    type="checkbox"
                    checked={
                      getManualEntryValue(
                        manualEntries,
                        "LAB_HARD_DIG",
                        workbook.settings.hardDigDefault ? 1 : 0,
                      ) > 0
                    }
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(current, "LAB_HARD_DIG", event.target.checked ? 1 : 0),
                      )
                    }
                  />
                </label>
                <label className="workbook-toggle-field">
                  <span>Clear spoils</span>
                  <input
                    type="checkbox"
                    checked={
                      getManualEntryValue(
                        manualEntries,
                        "LAB_CLEAR_SPOILS",
                        workbook.settings.clearSpoilsDefault ? 1 : 0,
                      ) > 0
                    }
                    onChange={(event) =>
                      setManualEntries((current) =>
                        upsertManualEntry(
                          current,
                          "LAB_CLEAR_SPOILS",
                          event.target.checked ? 1 : 0,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ) : null}
          </section>

          {pricedEstimate ? (
            <>
              <section className="portal-surface-card workbook-summary-strip">
                <article>
                  <span>Customer</span>
                  <strong>{job.customerName}</strong>
                </article>
                <article>
                  <span>Revision</span>
                  <strong>
                    {selectedDrawing
                      ? `${selectedDrawing.name} (${getRevisionLabel(selectedDrawing)})`
                      : "None"}
                  </strong>
                </article>
                <article>
                  <span>Materials</span>
                  <strong>{formatMoney(workbook?.totals.materialsSubtotal)}</strong>
                </article>
                <article>
                  <span>Labour</span>
                  <strong>{formatMoney(workbook?.totals.labourSubtotal)}</strong>
                </article>
                <article>
                  <span>Total</span>
                  <strong>{formatMoney(pricedEstimate.totals.totalCost)}</strong>
                </article>
                <article>
                  <span>Pricing</span>
                  <strong>
                    {pricedEstimate.pricingSnapshot.source === "DEFAULT"
                      ? "Default pricing"
                      : "Company pricing"}
                  </strong>
                </article>
              </section>

              <section className="portal-surface-card estimate-ancillary-card">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">Ancillary items</span>
                    <h2>Manual line items</h2>
                  </div>
                  <button
                    type="button"
                    className="portal-secondary-button"
                    onClick={() =>
                      setAncillaryItems((current) => [...current, buildAncillaryItem()])
                    }
                  >
                    Add ancillary line
                  </button>
                </div>
                <div className="estimate-ancillary-list">
                  {ancillaryItems.length === 0 ? (
                    <p className="portal-empty-copy">No ancillary items added yet.</p>
                  ) : null}
                  {ancillaryItems.map((item) => (
                    <div key={item.id} className="estimate-ancillary-row">
                      <input
                        placeholder="Description"
                        value={item.description}
                        onChange={(event) =>
                          setAncillaryItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, description: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) =>
                          setAncillaryItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, quantity: Number(event.target.value || 0) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.materialCost}
                        onChange={(event) =>
                          setAncillaryItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, materialCost: Number(event.target.value || 0) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.labourCost}
                        onChange={(event) =>
                          setAncillaryItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, labourCost: Number(event.target.value || 0) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="portal-text-button"
                        onClick={() =>
                          setAncillaryItems((current) =>
                            current.filter((entry) => entry.id !== item.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="workbook-sheet-stack">
                {[
                  {
                    key: "materials",
                    title: "Materials",
                    sections: materialSections,
                    rateLabel: "Material rate",
                  },
                  {
                    key: "labour",
                    title: "Labour",
                    sections: labourSections,
                    rateLabel: "Labour rate",
                  },
                ].map((sheet) => (
                  <section key={sheet.key} className="portal-surface-card workbook-sheet-card">
                    <div className="portal-section-heading">
                      <div>
                        <span className="portal-section-kicker">Estimate sheet</span>
                        <h2>{sheet.title}</h2>
                      </div>
                    </div>
                    {sheet.sections.length === 0 ? (
                      <p className="portal-empty-copy">
                        No {sheet.title.toLowerCase()} lines are currently on this job.
                      </p>
                    ) : null}
                    <div className="workbook-section-grid">
                      {sheet.sections.map((section) => (
                        <section
                          key={section.key}
                          className="workbook-section-card estimate-display-card"
                        >
                          <header className="workbook-section-head">
                            <div>
                              <h3>{section.title}</h3>
                            </div>
                            <strong>{formatMoney(section.subtotal)}</strong>
                          </header>

                          <div
                            className="workbook-table estimate-display-table"
                            role="table"
                            aria-label={`${section.title} ${sheet.title.toLowerCase()} rows`}
                          >
                            <div
                              className="workbook-table-row workbook-table-head estimate-display-head"
                              role="row"
                            >
                              <span>Item</span>
                              <span>Qty</span>
                              <span>{sheet.rateLabel}</span>
                              <span>Total</span>
                            </div>
                            {section.rows.map((row) => (
                              <div
                                key={row.key}
                                className="workbook-table-row estimate-display-row"
                                role="row"
                              >
                                <div className="workbook-item-copy">
                                  <strong>{row.label}</strong>
                                  {row.notes ? <span>{row.notes}</span> : null}
                                </div>
                                {row.isEditable ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={row.quantity}
                                    onChange={(event) =>
                                      setManualEntries((current) =>
                                        upsertManualEntry(
                                          current,
                                          row.key.split(":").at(-1) ?? row.key,
                                          Number(event.target.value || 0),
                                        ),
                                      )
                                    }
                                  />
                                ) : (
                                  <span>{formatQuantityForDisplay(row.quantity)}</span>
                                )}
                                <span>{formatMoney(row.rate)}</span>
                                <strong>{formatMoney(row.total)}</strong>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {currentTab === "activity" ? (
        <section className="portal-surface-card portal-dashboard-activity">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Job activity</span>
              <h2>Timeline</h2>
            </div>
          </div>
          <div className="portal-dashboard-activity-list">
            {activity.length === 0 ? <p className="portal-empty-copy">No activity yet.</p> : null}
            {activity.map((entry) => (
              <div key={entry.id} className="portal-dashboard-activity-row">
                <div className="portal-dashboard-activity-copy">
                  <strong>{entry.summary}</strong>
                  <span>{entry.entityType}</span>
                </div>
                <time className="portal-dashboard-activity-time">
                  {formatTimestamp(entry.createdAtIso)}
                </time>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isCreatingDrawingModalOpen ? (
        <div
          className="portal-customer-edit-backdrop portal-modal-backdrop"
          onClick={() => setIsCreatingDrawingModalOpen(false)}
        >
          <div
            className="portal-customer-edit-modal portal-modal-card"
            role="dialog"
            aria-label="Create drawing"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>New drawing</h2>
              <button
                type="button"
                className="portal-text-button"
                onClick={() => setIsCreatingDrawingModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <label className="portal-customer-edit-field">
                <span>Drawing title</span>
                <input
                  value={newDrawingName}
                  onChange={(event) => setNewDrawingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newDrawingName.trim()) {
                      void handleCreateRootDrawing();
                    }
                  }}
                  autoFocus
                />
              </label>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button
                type="button"
                className="portal-secondary-button portal-compact-button"
                onClick={() => setIsCreatingDrawingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                disabled={isAddingDrawing || !newDrawingName.trim()}
                onClick={() => void handleCreateRootDrawing()}
              >
                {isAddingDrawing ? "Creating..." : "Create drawing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditingJobDetails ? (
        <div
          className="portal-customer-edit-backdrop portal-modal-backdrop"
          onClick={() => setIsEditingJobDetails(false)}
        >
          <div
            className="portal-customer-edit-modal portal-modal-card"
            role="dialog"
            aria-label="Edit job details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Edit job details</h2>
              <button
                type="button"
                className="portal-text-button"
                onClick={() => setIsEditingJobDetails(false)}
              >
                Close
              </button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <label className="portal-customer-edit-field">
                <span>Job name</span>
                <input
                  value={editJobName}
                  onChange={(event) => setEditJobName(event.target.value)}
                />
              </label>
              <label className="portal-customer-edit-field">
                <span>Owner</span>
                <select
                  value={editJobOwner ?? ""}
                  onChange={(event) => setEditJobOwner(event.target.value || null)}
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
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={editJobNotes}
                  onChange={(event) => setEditJobNotes(event.target.value)}
                />
              </label>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button
                type="button"
                className="portal-secondary-button portal-compact-button"
                onClick={() => setIsEditingJobDetails(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-primary-button portal-compact-button"
                disabled={isSavingJobDetails || !editJobName.trim()}
                onClick={() => void handleSaveJobDetails()}
              >
                {isSavingJobDetails ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteJob ? (
        <div
          className="portal-customer-edit-backdrop portal-modal-backdrop"
          onClick={() => setConfirmDeleteJob(false)}
        >
          <div
            className="portal-customer-edit-modal portal-confirm-modal portal-modal-card"
            role="dialog"
            aria-label="Confirm delete job"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Permanently delete job?</h2>
              <button
                type="button"
                className="portal-text-button"
                onClick={() => setConfirmDeleteJob(false)}
              >
                Close
              </button>
            </div>
            <div className="portal-customer-edit-modal-body portal-modal-body">
              <p>
                This will permanently remove the job, its drawings, tasks, and quote history. This
                action cannot be undone.
              </p>
            </div>
            <div className="portal-customer-edit-modal-footer portal-modal-footer">
              <button
                type="button"
                className="portal-secondary-button portal-compact-button"
                onClick={() => setConfirmDeleteJob(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-danger-button portal-compact-button"
                disabled={isDeletingJob}
                onClick={() => void handleDeleteJob()}
              >
                {isDeletingJob ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  TASK_PRIORITIES,
  type AncillaryEstimateItem,
  type AuditLogRecord,
  type AuthSessionEnvelope,
  type CompanyUserRecord,
  type CustomerSummary,
  type DrawingRecord,
  type DrawingSummary,
  type DrawingTaskRecord,
  type DrawingWorkspaceCommercialInputs,
  type DrawingWorkspaceRecord,
  type DrawingWorkspaceStage,
  type EstimateWorkbookManualEntry,
  type LayoutModel,
  type PricedEstimateResult,
  type QuoteDrawingSnapshot,
  type QuoteRecord,
  type TaskPriority,
} from "@fence-estimator/contracts";

import { DrawingPreview } from "./DrawingPreview";
import { exportQuotePdfReport } from "./drawingPdfReport";
import {
  createDrawingWorkspaceDrawing,
  createDrawingWorkspaceQuoteSnapshot,
  createDrawingWorkspaceTask,
  deleteDrawingWorkspaceTask,
  getDrawing,
  getDrawingWorkspace,
  getDrawingWorkspaceEstimate,
  listDrawingWorkspaceActivity,
  listDrawingWorkspaceDrawings,
  listDrawingWorkspaceQuotes,
  listDrawingWorkspaceTasks,
  updateDrawing,
  updateDrawingWorkspace,
  updateDrawingWorkspaceTask,
} from "./apiClient";
import {
  DRAWING_WORKSPACE_TAB_LABELS,
  DRAWING_WORKSPACE_TABS,
  buildDrawingWorkspaceQuery,
  getRevisionLabel,
  normalizeDrawingWorkspaceTab,
  resolveDrawingWorkspaceLoadTarget,
  type DrawingWorkspaceTab,
} from "./drawingWorkspace";
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

const DRAWING_STATUS_LABELS: Record<DrawingSummary["status"], string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
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
  rootDrawingId: string | null;
  revisionDrawingId: string | null;
  dueDate: string;
}

function buildTaskDraft(task: DrawingTaskRecord): TaskDraftState {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignedUserId: task.assignedUserId,
    rootDrawingId: task.rootDrawingId,
    revisionDrawingId: task.revisionDrawingId,
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

function getEstimateOptionLabel(drawing: DrawingSummary): string {
  const baseLabel = getRevisionLabel(drawing);
  return drawing.revisionNumber === 0
    ? `${baseLabel} • ${drawing.name}`
    : `${baseLabel} • ${DRAWING_STATUS_LABELS[drawing.status]}`;
}

function buildDrawingRecordFromQuoteSnapshot(
  snapshot: QuoteDrawingSnapshot,
  workspaceId: string | null,
): DrawingRecord {
  return {
    id: snapshot.drawingId,
    companyId: "",
    ...(workspaceId ? { workspaceId } : {}),
    jobRole: snapshot.revisionNumber && snapshot.revisionNumber > 0 ? "SECONDARY" : "PRIMARY",
    parentDrawingId: null,
    revisionNumber: snapshot.revisionNumber ?? 0,
    name: snapshot.drawingName,
    customerId: snapshot.customerId ?? "",
    customerName: snapshot.customerName,
    layout: snapshot.layout,
    savedViewport: snapshot.savedViewport ?? null,
    estimate: snapshot.estimate,
    schemaVersion: snapshot.schemaVersion,
    rulesVersion: snapshot.rulesVersion,
    versionNumber: snapshot.versionNumber,
    status: "QUOTED",
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    statusChangedAtIso: null,
    statusChangedByUserId: null,
    createdByUserId: "",
    updatedByUserId: "",
    createdAtIso: "",
    updatedAtIso: "",
  };
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
): DrawingWorkspaceCommercialInputs | null {
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

function serializeCommercialInputs(inputs: DrawingWorkspaceCommercialInputs | null): string | null {
  return inputs ? JSON.stringify(inputs) : null;
}

interface DrawingWorkspacePageProps {
  session: AuthSessionEnvelope;
  query?: Record<string, string>;
  customers: CustomerSummary[];
  users: CompanyUserRecord[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
  onRefreshWorkspaces(this: void): Promise<void>;
  onRefreshDrawings(this: void): Promise<void>;
  onToggleDrawingArchived(this: void, drawingId: string, archived: boolean): Promise<boolean>;
  onSetWorkspaceArchived(this: void, workspaceId: string, archived: boolean): Promise<boolean>;
  onDeleteWorkspace(this: void, workspaceId: string): Promise<boolean>;
}

export function DrawingWorkspacePage({
  session,
  query,
  customers,
  users,
  onNavigate,
  onRefreshWorkspaces,
  onRefreshDrawings,
  onToggleDrawingArchived,
  onSetWorkspaceArchived,
  onDeleteWorkspace,
}: DrawingWorkspacePageProps) {
  const refreshWorkspaces = onRefreshWorkspaces;
  const setWorkspaceArchived = onSetWorkspaceArchived;
  const workspaceId = query?.workspaceId ?? query?.drawingId ?? null;
  const requestedDrawingId = query?.drawingId ?? null;
  const focusTaskId = query?.focusTaskId ?? null;
  const currentTab = normalizeDrawingWorkspaceTab(query?.tab);

  const [job, setJob] = useState<DrawingWorkspaceRecord | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [activeDrawingRecord, setActiveDrawingRecord] = useState<DrawingRecord | null>(null);
  const [tasks, setTasks] = useState<DrawingTaskRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [activity, setActivity] = useState<AuditLogRecord[]>([]);
  const [basePricedEstimate, setBasePricedEstimate] = useState<PricedEstimateResult | null>(null);
  const [ancillaryItems, setAncillaryItems] = useState<AncillaryEstimateItem[]>([]);
  const [manualEntries, setManualEntries] = useState<EstimateWorkbookManualEntry[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string | null>(session.user.id);
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
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [isEditingJobDetails, setIsEditingJobDetails] = useState(false);
  const [editJobName, setEditJobName] = useState("");
  const [editJobNotes, setEditJobNotes] = useState("");
  const [editJobOwner, setEditJobOwner] = useState<string | null>(null);
  const [isSavingJobDetails, setIsSavingJobDetails] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const latestCommercialSaveRequestRef = useRef(0);
  useEffect(() => {
    if (!noticeMessage) return;
    const timer = globalThis.setTimeout(() => setNoticeMessage(null), 4000);
    return () => globalThis.clearTimeout(timer);
  }, [noticeMessage]);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === job?.customerId) ?? null,
    [customers, job?.customerId],
  );
  const canDeleteWorkspace = session.user.role === "OWNER" || session.user.role === "ADMIN";
  const activeDrawing = useMemo(
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
  const commercialInputs = useMemo(
    () => buildCommercialInputs(pricedEstimate, manualEntries),
    [manualEntries, pricedEstimate],
  );
  const commercialInputsKey = useMemo(
    () => serializeCommercialInputs(commercialInputs),
    [commercialInputs],
  );
  const workspaceCommercialInputsKey = useMemo(
    () => serializeCommercialInputs(job?.commercialInputs ?? null),
    [job?.commercialInputs],
  );
  const materialSections = useMemo(
    () =>
      activeDrawingRecord && workbook
        ? buildEstimateDisplaySections(workbook, activeDrawingRecord, "MATERIALS")
        : [],
    [activeDrawingRecord, workbook],
  );
  const labourSections = useMemo(
    () =>
      activeDrawingRecord && workbook
        ? buildEstimateDisplaySections(workbook, activeDrawingRecord, "LABOUR")
        : [],
    [activeDrawingRecord, workbook],
  );

  const allRootDrawings = useMemo(
    () =>
      drawings
        .filter((drawing) => !drawing.parentDrawingId)
        .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso)),
    [drawings],
  );
  const activeRootDrawingId = useMemo(() => {
    const selectedRootDrawingId = getTaskRootDrawingId(activeDrawing);
    if (selectedRootDrawingId) {
      return selectedRootDrawingId;
    }
    const primaryDrawing = job?.primaryDrawingId
      ? (drawings.find((drawing) => drawing.id === job.primaryDrawingId) ?? null)
      : null;
    const primaryRootDrawingId = getTaskRootDrawingId(primaryDrawing);
    return primaryRootDrawingId ?? allRootDrawings[0]?.id ?? null;
  }, [allRootDrawings, drawings, job?.primaryDrawingId, activeDrawing]);
  const activeRootDrawing = useMemo(
    () =>
      activeRootDrawingId
        ? drawings.find((drawing) => drawing.id === activeRootDrawingId) ?? null
        : null,
    [activeRootDrawingId, drawings],
  );
  const rootDrawings = useMemo(
    () => (activeRootDrawing ? [activeRootDrawing] : []),
    [activeRootDrawing],
  );
  const activeDrawingChain = useMemo(() => {
    if (!activeRootDrawing) {
      return [] as DrawingSummary[];
    }
    return [
      activeRootDrawing,
      ...drawings
        .filter((drawing) => drawing.parentDrawingId === activeRootDrawing.id)
        .sort((left, right) => {
          if (left.revisionNumber !== right.revisionNumber) {
            return left.revisionNumber - right.revisionNumber;
          }
          return left.createdAtIso.localeCompare(right.createdAtIso);
        }),
    ];
  }, [activeRootDrawing, drawings]);
  const activeLatestDrawing = useMemo(
    () => activeDrawingChain[activeDrawingChain.length - 1] ?? activeRootDrawing ?? null,
    [activeDrawingChain, activeRootDrawing],
  );
  const activeDrawingIds = useMemo(
    () => new Set(activeDrawingChain.map((drawing) => drawing.id)),
    [activeDrawingChain],
  );
  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return [...tasks]
      .filter((task) => {
        const taskDrawingId = task.revisionDrawingId ?? task.rootDrawingId;
        return !taskDrawingId || activeDrawingIds.has(taskDrawingId);
      })
      .sort((a, b) => {
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
  }, [activeDrawingIds, tasks]);
  const preferredTaskDrawingId = useMemo(() => {
    return activeDrawing?.id ?? activeLatestDrawing?.id ?? null;
  }, [activeLatestDrawing?.id, activeDrawing?.id]);
  const openTaskCount = sortedTasks.filter((entry) => !entry.isCompleted).length;
  const latestQuoteByDrawingId = useMemo(() => {
    const latestByDrawingId = new Map<string, QuoteRecord>();
    for (const quote of quotes) {
      if (!latestByDrawingId.has(quote.drawingId)) {
        latestByDrawingId.set(quote.drawingId, quote);
      }
    }
    return latestByDrawingId;
  }, [quotes]);

  const drawingGroups = useMemo(() => {
    return activeRootDrawing ? [{ rootDrawing: activeRootDrawing, chain: activeDrawingChain }] : [];
  }, [activeDrawingChain, activeRootDrawing]);

  const navigateToWorkspace = useCallback(
    (nextTab: DrawingWorkspaceTab, nextDrawingId?: string | null) => {
      const targetDrawingId = nextDrawingId ?? activeDrawing?.id ?? requestedDrawingId ?? null;
      const fallbackWorkspaceId = job?.id ?? query?.workspaceId ?? null;
      if (!targetDrawingId && !fallbackWorkspaceId) {
        return;
      }
      onNavigate(
        "drawing",
        buildDrawingWorkspaceQuery({
          workspaceId: fallbackWorkspaceId,
          drawingId: targetDrawingId,
          tab: nextTab,
        }),
      );
    },
    [job?.id, onNavigate, query?.workspaceId, requestedDrawingId, activeDrawing?.id],
  );

  const openDrawingInEditor = useCallback(
    (drawingId: string | null | undefined) => {
      if (!drawingId) {
        return;
      }
      onNavigate("editor", { drawingId });
    },
    [onNavigate],
  );

  const loadWorkspace = useCallback(
    async (targetId: string) => {
      setIsLoading(true);
      try {
        const targetDrawing = requestedDrawingId ? await getDrawing(requestedDrawingId) : null;
        const { workspaceLookupId } = resolveDrawingWorkspaceLoadTarget({
          targetId,
          requestedDrawingId,
          query,
          resolvedDrawingWorkspaceId: targetDrawing?.workspaceId ?? null,
        });

        if (!workspaceLookupId) {
          throw new Error("Drawing is not linked to a workspace.");
        }

        const [nextJob, nextDrawings, nextTasks, nextQuotes, nextActivity] = await Promise.all([
          getDrawingWorkspace(workspaceLookupId),
          listDrawingWorkspaceDrawings(workspaceLookupId),
          listDrawingWorkspaceTasks(workspaceLookupId),
          listDrawingWorkspaceQuotes(workspaceLookupId),
          listDrawingWorkspaceActivity(workspaceLookupId),
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
    [query?.workspaceId, requestedDrawingId],
  );

  useEffect(() => {
    if (!workspaceId) {
      setJob(null);
      setDrawings([]);
      setTasks([]);
      setTaskDrafts({});
      setQuotes([]);
      setActivity([]);
      setBasePricedEstimate(null);
      setActiveDrawingRecord(null);
      setIsLoading(false);
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, workspaceId]);

  useEffect(() => {
    if (!job?.id || !activeDrawing) {
      setBasePricedEstimate(null);
      setActiveDrawingRecord(null);
      setAncillaryItems([]);
      setManualEntries([]);
      return;
    }

    let cancelled = false;
    setIsLoadingEstimate(true);
    void (async () => {
      try {
        const [nextEstimate, nextDrawingRecord] = await Promise.all([
          getDrawingWorkspaceEstimate(job.id, activeDrawing.id),
          getDrawing(activeDrawing.id),
        ]);
        if (cancelled) {
          return;
        }
        setBasePricedEstimate(nextEstimate);
        setActiveDrawingRecord(nextDrawingRecord);
        setAncillaryItems([]);
        setManualEntries(buildInitialManualEntries(nextEstimate));
      } catch (error) {
        if (!cancelled) {
          setBasePricedEstimate(null);
          setActiveDrawingRecord(null);
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
  }, [job?.id, activeDrawing]);

  useEffect(() => {
    if (!focusTaskId || !tasks.some((task) => task.id === focusTaskId)) {
      return;
    }
    setExpandedTaskId(focusTaskId);
  }, [focusTaskId, tasks]);

  useEffect(() => {
    if (!workspaceId || !activeDrawing?.id) {
      return;
    }

    onNavigate(
      "drawing",
        buildDrawingWorkspaceQuery({
        workspaceId: job?.id ?? query?.workspaceId ?? workspaceId,
        drawingId: activeDrawing.id,
        tab: currentTab,
        focusTaskId,
      }),
    );
  }, [currentTab, focusTaskId, job?.id, onNavigate, query?.workspaceId, activeDrawing?.id, workspaceId]);

  useEffect(() => {
    if (!job?.id || !commercialInputs) {
      return;
    }
    if (commercialInputsKey === workspaceCommercialInputsKey) {
      return;
    }

    const timer = globalThis.setTimeout(() => {
      const requestId = latestCommercialSaveRequestRef.current + 1;
      latestCommercialSaveRequestRef.current = requestId;
      setIsSavingControls(true);
      void (async () => {
        try {
          const updated = await updateDrawingWorkspace(job.id, { commercialInputs });
          if (latestCommercialSaveRequestRef.current !== requestId) {
            return;
          }
          setJob(updated);
        } catch (error) {
          if (latestCommercialSaveRequestRef.current !== requestId) {
            return;
          }
          setErrorMessage((error as Error).message);
        } finally {
          if (latestCommercialSaveRequestRef.current === requestId) {
            setIsSavingControls(false);
          }
        }
      })();
    }, 600);

    return () => globalThis.clearTimeout(timer);
  }, [commercialInputs, commercialInputsKey, job?.id, workspaceCommercialInputsKey]);

  useEffect(() => {
    setTaskDrawingId((current) => {
      if (current && activeDrawingChain.some((drawing) => drawing.id === current)) {
        return current;
      }
      return preferredTaskDrawingId;
    });
  }, [activeDrawingChain, preferredTaskDrawingId]);

  const handleArchiveToggle = async () => {
    if (!job) {
      return;
    }
    setIsSavingStage(true);
    setErrorMessage(null);
    try {
      const updated = await setWorkspaceArchived(job.id, !job.isArchived);
      if (updated) {
        if (job.isArchived) {
          await loadWorkspace(job.id);
          return;
        }
        onNavigate("customer", { customerId: job.customerId });
        return;
      }
      setErrorMessage(
        job.isArchived
          ? "This workspace could not be restored right now."
          : "This workspace could not be archived right now.",
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingStage(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!job || !job.isArchived || !canDeleteWorkspace) {
      return;
    }
    if (!window.confirm(`Delete workspace "${activeRootDrawing?.name ?? job.name}" permanently?`)) {
      return;
    }

    setIsDeletingWorkspace(true);
    setErrorMessage(null);
    try {
      const deleted = await onDeleteWorkspace(job.id);
      if (deleted) {
        onNavigate("customer", { customerId: job.customerId });
        return;
      }
      setErrorMessage("This workspace could not be deleted right now.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsDeletingWorkspace(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!job || !activeLatestDrawing) {
      return;
    }
    setIsAddingDrawing(true);
    setErrorMessage(null);
    try {
      const drawing = await createDrawingWorkspaceDrawing(job.id, {
        sourceDrawingId: activeLatestDrawing.id,
      });
      await Promise.all([loadWorkspace(job.id), refreshWorkspaces(), onRefreshDrawings()]);
      onNavigate(
        "drawing",
        buildDrawingWorkspaceQuery({
          workspaceId: job.id,
          drawingId: drawing.id,
          tab: "workspace",
        }),
      );
      setNoticeMessage("Revision created. Open it in the editor when you're ready.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsAddingDrawing(false);
    }
  };

  const handleCreateTask = async () => {
    if (!job || !taskTitle.trim()) {
      return;
    }
    if (activeDrawingChain.length > 0 && !taskDrawingId) {
      setErrorMessage("Choose a revision for this task.");
      return;
    }
    setIsSavingTask(true);
    setErrorMessage(null);
    try {
      const createTaskInput = {
        title: taskTitle.trim(),
        assignedUserId: taskAssignee,
        rootDrawingId: activeRootDrawing?.id ?? null,
        revisionDrawingId: taskDrawingId,
        dueAtIso: taskDueDate ? new Date(`${taskDueDate}T09:00:00`).toISOString() : null,
        ...(taskDescription.trim() ? { description: taskDescription.trim() } : {}),
        ...(taskPriority !== "NORMAL" ? { priority: taskPriority } : {}),
      };
      await createDrawingWorkspaceTask(job.id, createTaskInput);
      setTaskTitle("");
      setTaskDueDate("");
      setTaskAssignee(session.user.id);
      setTaskDrawingId(preferredTaskDrawingId);
      setTaskDescription("");
      setTaskPriority("NORMAL");
      setIsTaskFormExpanded(false);
      await Promise.all([loadWorkspace(job.id), refreshWorkspaces()]);
      setNoticeMessage("Task added.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleExpandTask = (task: DrawingTaskRecord) => {
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
          rootDrawingId: null,
          revisionDrawingId: null,
          dueDate: "",
        }),
        [field]: value,
      },
    }));
  };

  const handleResetTaskDraft = (task: DrawingTaskRecord) => {
    setTaskDrafts((current) => ({
      ...current,
      [task.id]: buildTaskDraft(task),
    }));
  };

  const handleSaveTaskDraft = async (task: DrawingTaskRecord) => {
    if (!job) {
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
      const updated = await updateDrawingWorkspaceTask(job.id, task.id, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        assignedUserId: draft.assignedUserId,
        rootDrawingId: draft.rootDrawingId,
        revisionDrawingId: draft.revisionDrawingId,
        dueAtIso: draft.dueDate ? new Date(`${draft.dueDate}T09:00:00`).toISOString() : null,
      });
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
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
  };

  const handleDeleteTask = async (task: DrawingTaskRecord) => {
    if (!job) {
      return;
    }
    setErrorMessage(null);
    try {
      await deleteDrawingWorkspaceTask(job.id, task.id);
      setTasks((current) => current.filter((entry) => entry.id !== task.id));
      setTaskDrafts((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      if (expandedTaskId === task.id) {
        setExpandedTaskId(null);
      }
      await refreshWorkspaces();
      setNoticeMessage("Task deleted.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  const handleToggleTask = async (task: DrawingTaskRecord) => {
    if (!job) {
      return;
    }
    setSavingTaskId(task.id);
    setErrorMessage(null);
    try {
      const updated = await updateDrawingWorkspaceTask(job.id, task.id, {
        isCompleted: !task.isCompleted,
      });
      setTasks((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
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
  };

  const handleGenerateQuotePdf = async () => {
    if (!job || !activeDrawing || !activeDrawingRecord || !pricedEstimate) {
      return;
    }
    setIsSavingQuote(true);
    setErrorMessage(null);
    try {
      const quote = await createDrawingWorkspaceQuoteSnapshot(
        job.id,
        ancillaryItems,
        manualEntries,
        activeDrawing.id,
      );
      setQuotes((current) => [quote, ...current]);
      await refreshWorkspaces();

      const revisionLabel = getRevisionLabel(activeDrawing);

      const layout = activeDrawingRecord.layout ?? EMPTY_LAYOUT;
      const segments = layout.segments ?? [];
      const ordinalMap = new Map(segments.map((s, i) => [s.id, i + 1]));

      const opened = exportQuotePdfReport({
        companyName: session.company.name ?? null,
        preparedBy: session.user.displayName ?? null,
        customerName: customer?.name ?? "",
        jobName: activeRootDrawing?.name ?? job.name,
        drawingName: activeDrawing.name,
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

  const handleOpenSavedQuotePdf = useCallback(
    (quote: QuoteRecord) => {
      const workbook = quote.pricedEstimate.workbook;
      if (!workbook) {
        setErrorMessage("This quote snapshot cannot be opened because its workbook data is unavailable.");
        return;
      }

      const snapshotDrawing = buildDrawingRecordFromQuoteSnapshot(quote.drawingSnapshot, job?.id ?? null);
      const materialSections = buildEstimateDisplaySections(workbook, snapshotDrawing, "MATERIALS");
      const labourSections = buildEstimateDisplaySections(workbook, snapshotDrawing, "LABOUR");
      const layout = quote.drawingSnapshot.layout ?? EMPTY_LAYOUT;
      const estimateSegments = layout.segments ?? [];
      const segmentOrdinalById = new Map(estimateSegments.map((segment, index) => [segment.id, index + 1]));
      const preparedBy =
        users.find((user) => user.id === quote.createdByUserId)?.displayName ?? session.user.displayName ?? null;
      const workspaceName =
        activeRootDrawing?.name ?? job?.name ?? quote.drawingSnapshot.drawingName;
      const opened = exportQuotePdfReport({
        companyName: session.company.name ?? null,
        preparedBy,
        customerName: quote.drawingSnapshot.customerName,
        jobName: workspaceName,
        drawingName: quote.drawingSnapshot.drawingName,
        revisionLabel: getRevisionLabel({
          revisionNumber: quote.drawingSnapshot.revisionNumber ?? 0,
        }),
        generatedAtIso: quote.createdAtIso,
        layout,
        materialSections: materialSections.map((section) => ({
          title: section.title,
          subtotal: section.subtotal,
          rows: section.rows.map((row) => ({
            label: row.label,
            unit: row.unit,
            quantity: row.quantity,
            rate: row.rate,
            total: row.total,
          })),
        })),
        labourSections: labourSections.map((section) => ({
          title: section.title,
          subtotal: section.subtotal,
          rows: section.rows.map((row) => ({
            label: row.label,
            unit: row.unit,
            quantity: row.quantity,
            rate: row.rate,
            total: row.total,
          })),
        })),
        totals: quote.pricedEstimate.totals,
        warnings: quote.pricedEstimate.warnings,
        estimateSegments,
        segmentOrdinalById,
      });

      if (!opened) {
        setErrorMessage(
          "Could not open quote PDF. Please allow pop-ups for this site and try again.",
        );
      }
    },
    [activeRootDrawing?.name, job?.name, session.company.name, session.user.displayName, users],
  );

  const handleOpenEditDetails = () => {
    if (!job) return;
    setEditJobName(activeRootDrawing?.name ?? job.name);
    setEditJobNotes(job.notes);
    setEditJobOwner(job.ownerUserId);
    setIsEditingJobDetails(true);
  };

  const handleSaveJobDetails = async () => {
    if (!job) return;
    const trimmedName = editJobName.trim();
    const currentWorkspaceName = activeRootDrawing?.name ?? job.name;
    const nameChanged = trimmedName !== currentWorkspaceName;
    const detailsChanged = editJobNotes !== job.notes || editJobOwner !== job.ownerUserId;
    if (!trimmedName) {
      setErrorMessage("Drawing name is required.");
      return;
    }
    setIsSavingJobDetails(true);
    setErrorMessage(null);
    try {
      if (!nameChanged && !detailsChanged) {
        setIsEditingJobDetails(false);
        return;
      }
      if (nameChanged) {
        if (!activeRootDrawing) {
          setErrorMessage("This workspace has no drawing to rename.");
          return;
        }
        await updateDrawing(activeRootDrawing.id, {
          expectedVersionNumber: activeRootDrawing.versionNumber,
          name: trimmedName,
        });
      }
      if (detailsChanged) {
        const updated = await updateDrawingWorkspace(job.id, {
          ...(editJobNotes !== job.notes ? { notes: editJobNotes } : {}),
          ...(editJobOwner !== job.ownerUserId ? { ownerUserId: editJobOwner } : {}),
        });
        setJob(updated);
      }
      await Promise.all([loadWorkspace(job.id), refreshWorkspaces(), onRefreshDrawings()]);
      setIsEditingJobDetails(false);
      setNoticeMessage(
        nameChanged ? "Drawing name updated across the workspace." : "Drawing workspace details updated.",
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingJobDetails(false);
    }
  };

  if (!workspaceId) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>No drawing workspace selected</h1>
          <p>
            Open a customer workspace and choose a drawing chain to review revisions, estimates, and activity.
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
          <h2>Loading drawing workspace...</h2>
        </div>
      </section>
    );
  }

  if (!job) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>Drawing workspace not found</h1>
          <p>The drawing workspace could not be loaded.</p>
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

  const taskPanel = (
    <section className="portal-surface-card portal-job-tasks-panel">
      <div className="portal-section-heading">
        <div>
          <span className="portal-section-kicker">Tasks</span>
        </div>
      </div>

      <div className="portal-job-task-form">
        {rootDrawings.length === 0 ? (
          <p className="portal-empty-copy">
            Open a drawing before adding drawing-linked tasks.
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
                  taskAssignee !== session.user.id ||
                  taskPriority !== "NORMAL" ||
                  taskDrawingId !== preferredTaskDrawingId
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
                activeDrawingChain.length === 0 ||
                (activeDrawingChain.length > 0 && !taskDrawingId)
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
                <span>Revision</span>
                <select
                  value={taskDrawingId ?? ""}
                  onChange={(event) => setTaskDrawingId(event.target.value || null)}
                  disabled={activeDrawingChain.length === 0}
                >
                  <option value="">Choose revision</option>
                  {activeDrawingChain.map((drawing) => (
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
                    onClick={() => void handleToggleTask(task)}
                    aria-label={
                      task.isCompleted ? `Reopen task ${task.title}` : `Complete task ${task.title}`
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
                    onClick={() => handleExpandTask(task)}
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded ? `Collapse task ${task.title}` : `Expand task ${task.title}`
                    }
                  >
                    ...
                  </button>
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
                        onChange={(event) =>
                          handleTaskDraftChange(task.id, "title", event.target.value)
                        }
                      />
                    </label>
                    <label className="portal-customer-edit-field portal-job-task-card-field-wide">
                      <span>Description</span>
                      <textarea
                        rows={3}
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
                      <span>Revision</span>
                      <select
                        value={taskDraft.revisionDrawingId ?? ""}
                        onChange={(event) =>
                          handleTaskDraftChange(
                            task.id,
                            "revisionDrawingId",
                            event.target.value || null,
                          )
                        }
                        disabled={activeDrawingChain.length === 0}
                      >
                        <option value="">Choose revision</option>
                        {activeDrawingChain.map((drawing) => (
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
  );

  return (
    <section className="portal-page portal-customer-page portal-job-page">
      <header className="portal-page-header">
        <div className="portal-job-heading">
          <span className="portal-eyebrow">Drawing workspace</span>
          <h1>{activeRootDrawing?.name ?? job.name}</h1>
          <p>
            {job.customerName}
            {customer?.siteAddress ? ` | ${customer.siteAddress}` : ""}
            {job.ownerDisplayName ? ` | Owner: ${job.ownerDisplayName}` : ""}
          </p>
          <div className="workbook-summary-strip portal-job-summary-strip">
            <article>
              <span>Status</span>
              <strong>{(activeLatestDrawing?.status ?? job.stage).replaceAll("_", " ")}</strong>
            </article>
            <article>
              <span>Revisions</span>
              <strong>{Math.max(activeDrawingChain.length - 1, 0)}</strong>
            </article>
            <article>
              <span>Open tasks</span>
              <strong>{openTaskCount}</strong>
            </article>
            <article>
              <span>Last activity</span>
              <strong>{formatTimestamp(activeLatestDrawing?.updatedAtIso ?? job.updatedAtIso)}</strong>
            </article>
          </div>
        </div>
        <div className="portal-header-actions">
          <button
            type="button"
            className="portal-primary-button portal-compact-button"
            onClick={() => void handleCreateRevision()}
            disabled={isAddingDrawing || !activeLatestDrawing}
          >
            {isAddingDrawing ? "Creating..." : "Create revision"}
          </button>
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
            {job.isArchived ? "Restore workspace" : "Archive workspace"}
          </button>
          {job.isArchived && canDeleteWorkspace ? (
            <button
              type="button"
              className="portal-danger-button portal-compact-button"
              onClick={() => void handleDeleteWorkspace()}
              disabled={isDeletingWorkspace}
            >
              {isDeletingWorkspace ? "Deleting..." : "Delete workspace"}
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
      {job.isArchived ? (
        <div className="portal-inline-message portal-inline-notice">
          This workspace is archived. Restore it to resume work, or delete it permanently if it is no longer needed.
        </div>
      ) : null}

      <div
        className="portal-filter-row portal-job-tab-row"
        role="tablist"
        aria-label="Drawing workspace sections"
      >
        {DRAWING_WORKSPACE_TABS.map((workspaceTab) => (
          <button
            key={workspaceTab}
            type="button"
            className={currentTab === workspaceTab ? "is-active" : undefined}
            role="tab"
            id={`workspace-tab-${workspaceTab}`}
            aria-selected={currentTab === workspaceTab}
            aria-controls={`workspace-tab-panel-${workspaceTab}`}
            onClick={() => navigateToWorkspace(workspaceTab, activeDrawing?.id ?? null)}
          >
            {DRAWING_WORKSPACE_TAB_LABELS[workspaceTab]}
          </button>
        ))}
      </div>

      {currentTab === "workspace" ? (
        <div
          role="tabpanel"
          id="workspace-tab-panel-workspace"
          aria-labelledby="workspace-tab-workspace"
        >
          <section className="portal-surface-card portal-job-drawing-timeline-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Drawing history</span>
              </div>
              <button
                type="button"
                className="portal-secondary-button portal-compact-button"
                onClick={() => void handleCreateRevision()}
                disabled={isAddingDrawing || !activeLatestDrawing}
              >
                {isAddingDrawing ? "Creating..." : "Create revision"}
              </button>
            </div>
            {drawingGroups.length === 0 ? (
              <p className="portal-empty-copy">
                No drawing chain loaded yet.
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
                      onClick={() => void handleCreateRevision()}
                      disabled={isAddingDrawing || !activeLatestDrawing}
                    >
                      {isAddingDrawing ? "Creating..." : "Create revision"}
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
                            onClick={() => openDrawingInEditor(drawing.id)}
                          >
                            <span className="portal-job-drawing-timeline-node-label">
                              {getRevisionLabel(drawing)}
                            </span>
                            <strong>{drawing.name}</strong>
                            <span className="portal-job-drawing-timeline-node-meta">
                              <span>{formatDateOnly(drawing.createdAtIso)}</span>
                              {drawing.status === "QUOTED" ? (
                                <span className="portal-customer-drawing-badge is-quoted">
                                  Quoted
                                </span>
                              ) : null}
                            </span>
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

          <div className="portal-job-overview-stack">
            {taskPanel}

            {job.notes ? (
              <section className="portal-surface-card portal-dashboard-activity">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">Workspace notes</span>
                  </div>
                </div>
                <p
                  className="portal-empty-copy portal-job-notes-copy"
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {job.notes}
                </p>
              </section>
            ) : null}

            <div className="portal-job-overview-secondary">
              <section className="portal-surface-card portal-job-primary-card">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">Workspace revisions</span>
                  </div>
                  <button
                    type="button"
                    className="portal-secondary-button portal-compact-button"
                    onClick={() => void handleCreateRevision()}
                    disabled={isAddingDrawing || !activeLatestDrawing}
                  >
                    {isAddingDrawing ? "Creating..." : "Create revision"}
                  </button>
                </div>
                <div className="portal-customer-drawing-grid">
                  {activeDrawingChain.length === 0 ? (
                    <p className="portal-empty-copy">
                      No drawings are available in this workspace.
                    </p>
                  ) : null}
                  {activeDrawingChain.map((drawing) => {
                    const isLatestRevision = drawing.id === activeLatestDrawing?.id;
                    const drawingQuote = latestQuoteByDrawingId.get(drawing.id) ?? null;
                    return (
                      <article key={drawing.id} className="portal-customer-drawing-card">
                        <div
                          className="portal-customer-drawing-card-preview"
                          role="button"
                          tabIndex={0}
                          onClick={() => openDrawingInEditor(drawing.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              openDrawingInEditor(drawing.id);
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
                              <h3>{getRevisionLabel(drawing)}</h3>
                              <span>{drawing.name}</span>
                            </div>
                            <div className="portal-customer-drawing-card-badges">
                              {isLatestRevision ? (
                                <span className="portal-customer-drawing-badge">Latest</span>
                              ) : null}
                              <span className={`portal-customer-drawing-badge drawing-status-${drawing.status.toLowerCase()}`}>
                                {DRAWING_STATUS_LABELS[drawing.status]}
                              </span>
                              {drawing.isArchived ? (
                                <span className="portal-customer-drawing-badge is-archived">
                                  Archived
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="portal-customer-drawing-card-meta">
                            <strong>
                              {drawingQuote
                                ? `Quote ${formatMoney(drawingQuote.pricedEstimate.totals.totalCost)}`
                                : "No quote yet"}
                            </strong>
                          </div>
                          <div className="portal-customer-drawing-card-footer">
                            <button
                              type="button"
                              className="portal-text-button"
                              onClick={() => navigateToWorkspace("estimate", drawing.id)}
                            >
                              Estimate
                            </button>
                            {drawingQuote ? (
                              <button
                                type="button"
                                className="portal-text-button"
                                onClick={() => handleOpenSavedQuotePdf(drawingQuote)}
                              >
                                Quote PDF
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {currentTab === "estimate" ? (
        <div
          role="tabpanel"
          id="workspace-tab-panel-estimate"
          aria-labelledby="workspace-tab-estimate"
        >
          <section className="portal-surface-card workbook-commercial-card estimate-control-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Estimate defaults</span>
                <p className="portal-empty-copy" style={{ margin: "6px 0 0" }}>
                  {isSavingControls
                    ? "Saving workspace defaults..."
                    : "Changes here save to this workspace automatically."}
                </p>
              </div>
              <div className="portal-header-actions">
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

            {activeDrawing ? (
              <div className="portal-job-task-form">
                <label className="portal-customer-edit-field">
                  <span>Drawing revision</span>
                  <select
                    value={activeDrawing.id}
                    onChange={(event) => navigateToWorkspace("estimate", event.target.value)}
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
                    {activeDrawing
                      ? `${activeDrawing.name} (${getRevisionLabel(activeDrawing)})`
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
                      </div>
                    </div>
                    {sheet.sections.length === 0 ? (
                      <p className="portal-empty-copy">
                        No {sheet.title.toLowerCase()} lines are currently on this drawing workspace.
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
        </div>
      ) : null}

      {currentTab === "history" ? (
        <section
          className="portal-surface-card portal-dashboard-activity"
          role="tabpanel"
          id="workspace-tab-panel-history"
          aria-labelledby="workspace-tab-history"
        >
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Drawing activity</span>
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

      {isEditingJobDetails ? (
        <div
          className="portal-customer-edit-backdrop portal-modal-backdrop"
          onClick={() => setIsEditingJobDetails(false)}
        >
          <div
            className="portal-customer-edit-modal portal-modal-card"
            role="dialog"
            aria-label="Edit drawing workspace details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="portal-customer-edit-modal-header portal-modal-header">
              <h2>Edit drawing workspace details</h2>
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
                <span>Drawing name</span>
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
    </section>
  );
}


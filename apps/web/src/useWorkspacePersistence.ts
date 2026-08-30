import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AuthSessionEnvelope,
  CustomerRecord,
  CustomerSummary,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingSummary,
  LayoutModel,
} from "@fence-estimator/contracts";
import { validateLayoutIntegrity, type LayoutIntegrityIssue } from "@fence-estimator/geometry";

import {
  ApiError,
  createCustomer,
  createDrawing,
  getCustomer,
  getDrawing,
  getProject,
  getRevision,
  listCustomers,
  listDrawingsForProject,
  renameDrawing,
  saveRevision,
} from "./apiClient";
import { useSession } from "./useSession";

interface UseWorkspacePersistenceOptions {
  layout: LayoutModel;
  getSavedViewport: () => DrawingCanvasViewport | null;
  onLoadDrawing: (
    drawing: DrawingRecord & { layout: LayoutModel; savedViewport: DrawingCanvasViewport | null },
  ) => void;
}

export interface WorkspacePersistenceState {
  session: AuthSessionEnvelope | null;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  currentDrawingId: string | null;
  currentDrawingName: string;
  currentDrawingStatus: null;
  currentWorkspaceId: string | null;
  currentCustomerId: string | null;
  currentCustomerName: string;
  isReadOnly: boolean;
  isDirty: boolean;
  isRestoringSession: boolean;
  isLoadingCustomers: boolean;
  isLoadingDrawings: boolean;
  isSavingCustomer: boolean;
  isSavingDrawing: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  integrityIssues: LayoutIntegrityIssue[];
  setCurrentDrawingName: (name: string) => void;
  saveCustomer: (input: {
    name: string;
    primaryContactName?: string;
    primaryEmail?: string;
    primaryPhone?: string;
    siteAddress?: string;
    notes?: string;
  }) => Promise<CustomerRecord | null>;
  refreshCustomers: () => Promise<void>;
  refreshDrawings: () => Promise<void>;
  loadDrawing: (drawingId: string, revisionId?: string | null) => Promise<void>;
  saveDrawing: () => Promise<void>;
  saveDrawingAsCopy: (input: { name: string; customerId: string }) => Promise<boolean>;
}

interface LoadedRevisionState {
  drawing: DrawingRecord;
  revision: DrawingRevisionRecord;
}

export function useWorkspacePersistence({
  layout,
  getSavedViewport,
  onLoadDrawing,
}: UseWorkspacePersistenceOptions): WorkspacePersistenceState {
  const { session, isRestoring } = useSession();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loaded, setLoaded] = useState<LoadedRevisionState | null>(null);
  const [currentDrawingName, setCurrentDrawingNameState] = useState<string>("");
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [currentCustomer, setCurrentCustomer] = useState<CustomerRecord | null>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [savedLayoutSnapshot, setSavedLayoutSnapshot] = useState<string>(() =>
    serializeEditorLayout(layout),
  );

  const currentLayoutSerialized = useMemo(() => serializeEditorLayout(layout), [layout]);
  const integrityIssues = useMemo(() => validateLayoutIntegrity(layout), [layout]);
  const isDirty = loaded !== null && currentLayoutSerialized !== savedLayoutSnapshot;
  const isReadOnly =
    loaded !== null &&
    (loaded.revision.id !== loaded.drawing.currentRevisionId ||
      loaded.drawing.status !== "WORKING");

  const refreshCustomers = useCallback(async () => {
    if (!session) return;
    setIsLoadingCustomers(true);
    try {
      const result = await listCustomers({ scope: "ACTIVE" });
      setCustomers(result.customers);
    } catch (error) {
      setErrorMessage(formatApiError(error));
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      void refreshCustomers();
    } else {
      setCustomers([]);
      setDrawings([]);
      setCurrentCustomer(null);
      setLoaded(null);
      setCurrentDrawingNameState("");
    }
  }, [refreshCustomers, session]);

  const loadDrawing = useCallback(
    async (drawingId: string, revisionId?: string | null) => {
      if (!session) return;
      try {
        const { drawing } = await getDrawing(drawingId);
        const [{ revision }, { project }] = await Promise.all([
          getRevision(revisionId ?? drawing.currentRevisionId),
          getProject(drawing.projectId),
        ]);
        if (revision.drawingId !== drawing.id) {
          throw new Error("The requested revision does not belong to this design");
        }
        const [{ customer }, drawingResult] = await Promise.all([
          getCustomer(project.customerId),
          listDrawingsForProject(project.id),
        ]);
        setLoaded({ drawing, revision });
        setCurrentCustomer(customer);
        setDrawings(drawingResult.drawings);
        setCurrentDrawingNameState(drawing.name);
        setSavedLayoutSnapshot(serializeEditorLayout(revision.layout));
        onLoadDrawing({
          ...drawing,
          layout: revision.layout,
          savedViewport: revision.savedViewport,
        } as DrawingRecord & { layout: LayoutModel; savedViewport: DrawingCanvasViewport | null });
      } catch (error) {
        setErrorMessage(formatApiError(error));
      }
    },
    [onLoadDrawing, session],
  );

  const saveDrawing = useCallback(async () => {
    if (!loaded || !session || isReadOnly) return;
    if (integrityIssues.length > 0) {
      setErrorMessage(integrityIssues[0]?.message ?? "The drawing contains invalid geometry");
      return;
    }
    setIsSavingDrawing(true);
    setErrorMessage(null);
    try {
      const viewport = getSavedViewport();
      const { revision } = await saveRevision(loaded.revision.id, {
        expectedVersionNumber: loaded.revision.versionNumber,
        layout,
        savedViewport: viewport,
      });
      setLoaded({ drawing: loaded.drawing, revision });
      setSavedLayoutSnapshot(serializeEditorLayout(revision.layout));
      setNoticeMessage("Design saved");
    } catch (error) {
      setErrorMessage(formatApiError(error));
    } finally {
      setIsSavingDrawing(false);
    }
  }, [getSavedViewport, integrityIssues, isReadOnly, layout, loaded, session]);

  const saveCustomer = useCallback(
    async (input: {
      name: string;
      primaryContactName?: string;
      primaryEmail?: string;
      primaryPhone?: string;
      siteAddress?: string;
      notes?: string;
    }) => {
      if (!session) return null;
      setIsSavingCustomer(true);
      setErrorMessage(null);
      try {
        const { customer } = await createCustomer({
          name: input.name,
          contactName: input.primaryContactName ?? null,
          contactEmail: input.primaryEmail ?? null,
          contactPhone: input.primaryPhone ?? null,
          siteAddress: input.siteAddress ?? null,
          notes: input.notes ?? null,
        });
        await refreshCustomers();
        return customer;
      } catch (error) {
        setErrorMessage(formatApiError(error));
        return null;
      } finally {
        setIsSavingCustomer(false);
      }
    },
    [refreshCustomers, session],
  );

  const refreshDrawings = useCallback(async () => {
    if (!loaded) return;
    const result = await listDrawingsForProject(loaded.drawing.projectId);
    setDrawings(result.drawings);
  }, [loaded]);

  const saveDrawingAsCopy = useCallback(
    async (input: { name: string }): Promise<boolean> => {
      if (!loaded || isReadOnly) return false;
      if (integrityIssues.length > 0) {
        setErrorMessage(integrityIssues[0]?.message ?? "The drawing contains invalid geometry");
        return false;
      }
      try {
        const savedViewport = getSavedViewport();
        const { drawing: copy } = await createDrawing({
          projectId: loaded.drawing.projectId,
          name: input.name.trim(),
          initialLayout: layout,
          ...(savedViewport ? { initialViewport: savedViewport } : {}),
        });
        await loadDrawing(copy.id);
        setNoticeMessage("Design copy created");
        return true;
      } catch (error) {
        setErrorMessage(formatApiError(error));
        return false;
      }
    },
    [getSavedViewport, integrityIssues, isReadOnly, layout, loadDrawing, loaded],
  );

  const setCurrentDrawingName = useCallback(
    (name: string) => {
      if (!loaded || isReadOnly || !name.trim()) return;
      void (async () => {
        try {
          const { drawing } = await renameDrawing(loaded.drawing.id, name.trim());
          setLoaded((current) => (current ? { ...current, drawing } : current));
          setCurrentDrawingNameState(drawing.name);
          setNoticeMessage("Design renamed");
        } catch (error) {
          setErrorMessage(formatApiError(error));
        }
      })();
    },
    [isReadOnly, loaded],
  );

  return {
    session,
    customers,
    drawings,
    currentDrawingId: loaded?.drawing.id ?? null,
    currentDrawingName,
    currentDrawingStatus: null,
    currentWorkspaceId: loaded?.drawing.projectId ?? null,
    currentCustomerId: currentCustomer?.id ?? null,
    currentCustomerName: currentCustomer?.name ?? "",
    isReadOnly,
    isDirty,
    isRestoringSession: isRestoring,
    isLoadingCustomers,
    isLoadingDrawings: false,
    isSavingCustomer,
    isSavingDrawing,
    errorMessage,
    noticeMessage,
    integrityIssues,
    setCurrentDrawingName,
    saveCustomer,
    refreshCustomers,
    refreshDrawings,
    loadDrawing,
    saveDrawing,
    saveDrawingAsCopy,
  };
}

function serializeEditorLayout(layout: LayoutModel): string {
  return JSON.stringify({
    segments: layout.segments,
    gates: layout.gates ?? [],
    basketballPosts: layout.basketballPosts ?? layout.basketballFeatures ?? [],
    floodlightColumns: layout.floodlightColumns ?? [],
    goalUnits: layout.goalUnits ?? [],
    kickboards: layout.kickboards ?? [],
    pitchDividers: layout.pitchDividers ?? [],
    sideNettings: layout.sideNettings ?? [],
  });
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.payload.error;
  }
  return (error as Error).message ?? "An unexpected error occurred";
}

// Keep the legacy ref-tracking helper for any callers that still want it.
export function useLastDrawingIdRef(currentDrawingId: string | null) {
  const ref = useRef<string | null>(currentDrawingId);
  useEffect(() => {
    ref.current = currentDrawingId;
  }, [currentDrawingId]);
  return ref;
}

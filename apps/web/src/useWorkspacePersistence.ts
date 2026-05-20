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

import {
  ApiError,
  createCustomer,
  getDrawing,
  getRevision,
  listCustomers,
  saveRevision,
} from "./apiClient";
import { useSession } from "./useSession";

interface UseWorkspacePersistenceOptions {
  layout: LayoutModel;
  getSavedViewport: () => DrawingCanvasViewport | null;
  onLoadDrawing: (drawing: DrawingRecord & { layout: LayoutModel; savedViewport: DrawingCanvasViewport | null }) => void;
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
  isDirty: boolean;
  isRestoringSession: boolean;
  isLoadingCustomers: boolean;
  isLoadingDrawings: boolean;
  isSavingCustomer: boolean;
  isSavingDrawing: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
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
  loadDrawing: (drawingId: string) => Promise<void>;
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
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [savedLayoutSnapshot, setSavedLayoutSnapshot] = useState<string>(() =>
    JSON.stringify(layout),
  );

  const currentLayoutSerialized = useMemo(() => JSON.stringify(layout), [layout]);
  const isDirty = loaded !== null && currentLayoutSerialized !== savedLayoutSnapshot;

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
      setLoaded(null);
      setCurrentDrawingNameState("");
    }
  }, [refreshCustomers, session]);

  const loadDrawing = useCallback(
    async (drawingId: string) => {
      if (!session) return;
      try {
        const { drawing } = await getDrawing(drawingId);
        const { revision } = await getRevision(drawing.currentRevisionId);
        setLoaded({ drawing, revision });
        setCurrentDrawingNameState(drawing.name);
        setSavedLayoutSnapshot(JSON.stringify(revision.layout));
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
    if (!loaded || !session) return;
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
      setSavedLayoutSnapshot(JSON.stringify(revision.layout));
      setNoticeMessage("Drawing saved");
    } catch (error) {
      setErrorMessage(formatApiError(error));
    } finally {
      setIsSavingDrawing(false);
    }
  }, [getSavedViewport, layout, loaded, session]);

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
    /* drawings are now scoped under a project; the editor doesn't list them */
  }, []);

  const saveDrawingAsCopy = useCallback(async (): Promise<boolean> => {
    setErrorMessage("Use the project page to start a new revision");
    return false;
  }, []);

  const setCurrentDrawingName = useCallback((_name: string) => {
    /* renaming is handled from the project page in the new flow */
  }, []);

  return {
    session,
    customers,
    drawings: [],
    currentDrawingId: loaded?.drawing.id ?? null,
    currentDrawingName,
    currentDrawingStatus: null,
    currentWorkspaceId: loaded?.drawing.projectId ?? null,
    currentCustomerId: null,
    currentCustomerName: "",
    isDirty,
    isRestoringSession: isRestoring,
    isLoadingCustomers,
    isLoadingDrawings: false,
    isSavingCustomer,
    isSavingDrawing,
    errorMessage,
    noticeMessage,
    setCurrentDrawingName,
    saveCustomer,
    refreshCustomers,
    refreshDrawings,
    loadDrawing,
    saveDrawing,
    saveDrawingAsCopy,
  };
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

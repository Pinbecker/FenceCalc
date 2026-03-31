import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AuthSessionEnvelope,
  CustomerRecord,
  CustomerSummary,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingStatus,
  DrawingSummary,
  LayoutModel,
} from "@fence-estimator/contracts";

import {
  createCustomer,
  createDrawing,
  getDrawing,
  updateDrawing,
  type LoginInput,
  type RegisterAccountInput
} from "./apiClient";
import { extractApiErrorMessage, extractCurrentVersionNumber } from "./apiErrors";
import { usePortalFeedbackState } from "./usePortalFeedbackState";
import { useWorkspaceSavedState } from "./useWorkspaceSavedState";
import { useWorkspaceSessionState } from "./useWorkspaceSessionState";
import { normalizeLayout } from "./workspacePersistenceUtils";

interface UseWorkspacePersistenceOptions {
  layout: LayoutModel;
  getSavedViewport: () => DrawingCanvasViewport | null;
  onLoadDrawing: (drawing: DrawingRecord) => void;
}

export interface WorkspacePersistenceState {
  session: AuthSessionEnvelope | null;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  currentDrawingId: string | null;
  currentDrawingName: string;
  currentDrawingStatus: DrawingStatus | null;
  currentWorkspaceId: string | null;
  currentCustomerId: string | null;
  currentCustomerName: string;
  isDirty: boolean;
  isRestoringSession: boolean;
  isAuthenticating: boolean;
  isLoadingCustomers: boolean;
  isLoadingDrawings: boolean;
  isSavingCustomer: boolean;
  isSavingDrawing: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  setCurrentDrawingName: (name: string) => void;
  saveCustomer: (input: {
    name: string;
    primaryContactName: string;
    primaryEmail: string;
    primaryPhone: string;
    siteAddress: string;
    notes: string;
  }) => Promise<CustomerRecord | null>;
  register: (input: RegisterAccountInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  refreshCustomers: () => Promise<void>;
  refreshDrawings: () => Promise<void>;
  loadDrawing: (drawingId: string) => Promise<void>;
  createDrawingRecord: (input: { name: string; customerId: string }) => Promise<boolean>;
  saveDrawing: () => Promise<void>;
  saveDrawingAsCopy: (input: { name: string; customerId: string }) => Promise<boolean>;
  startNewDraft: () => void;
}

export function useWorkspacePersistence({ layout, getSavedViewport, onLoadDrawing }: UseWorkspacePersistenceOptions): WorkspacePersistenceState {
  const normalizedLayout = useMemo(() => normalizeLayout(layout), [layout]);
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null);
  const [currentDrawingVersion, setCurrentDrawingVersion] = useState<number | null>(null);
  const [currentDrawingName, setCurrentDrawingName] = useState("");
  const [currentDrawingStatus, setCurrentDrawingStatus] = useState<DrawingStatus | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [currentCustomerId, setCurrentCustomerIdState] = useState<string | null>(null);
  const [currentCustomerName, setCurrentCustomerName] = useState("");
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const feedback = usePortalFeedbackState();
  const savedState = useWorkspaceSavedState(normalizedLayout, currentDrawingId, currentDrawingName, currentCustomerId);
  const sessionState = useWorkspaceSessionState({
    clearMessages: feedback.clearMessages,
    setErrorMessage: feedback.setErrorMessage,
    setNoticeMessage: feedback.setNoticeMessage
  });
  const {
    customers,
    isLoadingCustomers,
    drawings,
    isAuthenticating,
    isLoadingDrawings,
    isRestoringSession,
    login,
    logout: logoutSession,
    refreshCustomers,
    refreshDrawings,
    register: registerSession,
    session
  } = sessionState;
  const { clearMessages, errorMessage, noticeMessage, setErrorMessage, setNoticeMessage } = feedback;

  useEffect(() => {
    if (!currentCustomerId) {
      return;
    }
    const customer = customers.find((entry) => entry.id === currentCustomerId);
    if (!customer) {
      return;
    }
    if (customer.name !== currentCustomerName) {
      setCurrentCustomerName(customer.name);
    }
  }, [currentCustomerId, currentCustomerName, customers]);

  useEffect(() => {
    if (!currentDrawingId) {
      return;
    }
    const drawing = drawings.find((entry) => entry.id === currentDrawingId);
    if (!drawing) {
      return;
    }
    if (drawing.versionNumber !== currentDrawingVersion) {
      setCurrentDrawingVersion(drawing.versionNumber);
    }
    if (drawing.status !== currentDrawingStatus) {
      setCurrentDrawingStatus(drawing.status);
    }
  }, [currentDrawingId, currentDrawingStatus, currentDrawingVersion, drawings]);

  const applyPersistedDrawing = useCallback((drawing: DrawingRecord) => {
    setCurrentDrawingId(drawing.id);
    setCurrentDrawingVersion(drawing.versionNumber);
    setCurrentDrawingName(drawing.name);
    setCurrentDrawingStatus(drawing.status);
    setCurrentWorkspaceId(drawing.workspaceId ?? null);
    setCurrentCustomerIdState(drawing.customerId);
    setCurrentCustomerName(drawing.customerName);
    savedState.rememberSavedState(normalizeLayout(drawing.layout), drawing.name, drawing.customerId);
  }, [savedState]);

  const reloadDrawingFromServer = useCallback(async (drawingId: string, notice: string) => {
    if (!session) {
      return;
    }

    const drawing = await getDrawing(drawingId);
    const nextLayout = normalizeLayout(drawing.layout);
    onLoadDrawing({ ...drawing, layout: nextLayout });
    applyPersistedDrawing({ ...drawing, layout: nextLayout });
    setNoticeMessage(notice);
    await refreshCustomers();
    await refreshDrawings();
  }, [applyPersistedDrawing, onLoadDrawing, refreshCustomers, refreshDrawings, session, setNoticeMessage]);

  const register = useCallback(async (input: RegisterAccountInput) => {
    await registerSession(input, () => {
      setCurrentDrawingId(null);
      setCurrentDrawingVersion(null);
      setCurrentDrawingName("");
      setCurrentDrawingStatus(null);
      setCurrentWorkspaceId(null);
      setCurrentCustomerIdState(null);
      setCurrentCustomerName("");
      savedState.resetSavedState();
    });
  }, [registerSession, savedState]);

  const loginToWorkspace = useCallback(async (input: LoginInput) => {
    await login(input);
  }, [login]);

  const logout = useCallback(() => {
    logoutSession(() => {
      setCurrentDrawingId(null);
      setCurrentDrawingVersion(null);
      setCurrentDrawingName("");
      setCurrentDrawingStatus(null);
      setCurrentWorkspaceId(null);
      setCurrentCustomerIdState(null);
      setCurrentCustomerName("");
      savedState.resetSavedState();
    });
  }, [logoutSession, savedState]);

  const loadDrawingIntoWorkspace = useCallback(async (drawingId: string) => {
    if (!session) {
      return;
    }

    clearMessages();
    try {
      const drawing = await getDrawing(drawingId);
      const nextLayout = normalizeLayout(drawing.layout);
      onLoadDrawing({ ...drawing, layout: nextLayout });
      applyPersistedDrawing({ ...drawing, layout: nextLayout });
      setNoticeMessage(`Loaded "${drawing.name}"`);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    }
  }, [applyPersistedDrawing, clearMessages, onLoadDrawing, session, setErrorMessage, setNoticeMessage]);

  const saveCustomerRecord = useCallback(async (input: {
    name: string;
    primaryContactName: string;
    primaryEmail: string;
    primaryPhone: string;
    siteAddress: string;
    notes: string;
  }): Promise<CustomerRecord | null> => {
    if (!session) {
      return null;
    }

    setIsSavingCustomer(true);
    clearMessages();
    try {
      const customer = await createCustomer(input);
      await refreshCustomers();
      setCurrentCustomerIdState(customer.id);
      setCurrentCustomerName(customer.name);
      setNoticeMessage(`Added customer ${customer.name}`);
      return customer;
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
      return null;
    } finally {
      setIsSavingCustomer(false);
    }
  }, [clearMessages, refreshCustomers, session, setErrorMessage, setNoticeMessage]);

  const createWorkspaceDrawing = useCallback(async (input: { name: string; customerId: string }) => {
    if (!session) {
      return false;
    }

    clearMessages();

    const drawingName = input.name.trim();
    if (!drawingName) {
      setErrorMessage("Enter a drawing name before creating this drawing.");
      return false;
    }
    if (!input.customerId) {
      setErrorMessage("Select a customer before creating this drawing.");
      return false;
    }

    setIsSavingDrawing(true);
    const savedViewport = getSavedViewport();
    try {
      const drawing = await createDrawing({
        name: drawingName,
        customerId: input.customerId,
        layout: normalizedLayout,
        savedViewport
      });

      applyPersistedDrawing(drawing);
      setNoticeMessage(`Created drawing "${drawing.name}"`);
      await refreshCustomers();
      await refreshDrawings();
      return true;
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
      return false;
    } finally {
      setIsSavingDrawing(false);
    }
  }, [
    applyPersistedDrawing,
    clearMessages,
    getSavedViewport,
    normalizedLayout,
    refreshCustomers,
    refreshDrawings,
    session,
    setErrorMessage,
    setNoticeMessage
  ]);

  const saveWorkspaceDrawing = useCallback(async () => {
    if (!session) {
      return;
    }

    clearMessages();

    if (!currentDrawingId) {
      setErrorMessage("Create a drawing before saving.");
      return;
    }
    if (currentDrawingStatus === "QUOTED") {
      setErrorMessage("Quoted drawings open in view-only mode. Create a new revision from the drawing workspace before making changes.");
      return;
    }

    const drawingName = currentDrawingName.trim();
    if (!drawingName) {
      setErrorMessage("Enter a drawing name before saving this drawing.");
      return;
    }
    if (!currentCustomerId) {
      setErrorMessage("Select a customer before saving this drawing.");
      return;
    }

    setIsSavingDrawing(true);
    const savedViewport = getSavedViewport();
    try {
      const drawing = await updateDrawing(currentDrawingId, {
        expectedVersionNumber: currentDrawingVersion ?? 1,
        name: drawingName,
        customerId: currentCustomerId,
        layout: normalizedLayout,
        savedViewport
      });

      applyPersistedDrawing(drawing);
      setNoticeMessage(`Saved "${drawing.name}"`);
      await refreshCustomers();
      await refreshDrawings();
    } catch (error) {
      const conflictVersion = extractCurrentVersionNumber(error);
      if (conflictVersion !== null) {
        const reloadLatest = window.confirm(
          `"${drawingName}" changed on the server while you were editing. Reload the latest saved version now? Your local unsaved changes will be lost.`,
        );
        if (reloadLatest) {
          try {
            await reloadDrawingFromServer(
              currentDrawingId,
              `Reloaded the latest saved version of "${drawingName}" after a version conflict.`,
            );
            return;
          } catch (reloadError) {
            setErrorMessage(extractApiErrorMessage(reloadError));
            return;
          }
        }

        setErrorMessage(
          `"${drawingName}" is out of date and could not be saved. Reload the latest saved version before retrying.`,
        );
        return;
      }

      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsSavingDrawing(false);
    }
  }, [
    applyPersistedDrawing,
    clearMessages,
    currentCustomerId,
    currentDrawingId,
    currentDrawingName,
    currentDrawingStatus,
    currentDrawingVersion,
    getSavedViewport,
    normalizedLayout,
    refreshCustomers,
    refreshDrawings,
    reloadDrawingFromServer,
    session,
    setErrorMessage,
    setNoticeMessage
  ]);

  const saveWorkspaceDrawingAsCopy = useCallback(async (input: { name: string; customerId: string }) => {
    if (!session) {
      return false;
    }

    clearMessages();
    if (currentDrawingStatus === "QUOTED") {
      setErrorMessage("Quoted drawings open in view-only mode. Create a new revision from the drawing workspace instead of saving over this quote.");
      return false;
    }

    const drawingName = input.name.trim();
    if (!drawingName) {
      setErrorMessage("Enter a drawing name before saving a copy.");
      return false;
    }
    if (!input.customerId) {
      setErrorMessage("Select a customer before saving a copy.");
      return false;
    }

    setIsSavingDrawing(true);
    const savedViewport = getSavedViewport();
    try {
      const drawing = await createDrawing({
        name: drawingName,
        customerId: input.customerId,
        layout: normalizedLayout,
        savedViewport,
      });

      applyPersistedDrawing(drawing);
      setNoticeMessage(`Saved copy "${drawing.name}"`);
      await refreshCustomers();
      await refreshDrawings();
      return true;
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
      return false;
    } finally {
      setIsSavingDrawing(false);
    }
  }, [
    applyPersistedDrawing,
    clearMessages,
    currentDrawingStatus,
    getSavedViewport,
    normalizedLayout,
    refreshCustomers,
    refreshDrawings,
    session,
    setErrorMessage,
    setNoticeMessage
  ]);

  const startNewDraft = useCallback(() => {
    clearMessages();
    setCurrentDrawingId(null);
    setCurrentDrawingVersion(null);
    setCurrentDrawingName("");
    setCurrentDrawingStatus(null);
    setCurrentWorkspaceId(null);
    setCurrentCustomerIdState(null);
    setCurrentCustomerName("");
    savedState.resetSavedState();
  }, [clearMessages, savedState]);

  return {
    session,
    customers,
    drawings,
    currentDrawingId,
    currentDrawingName,
    currentDrawingStatus,
    currentWorkspaceId,
    currentCustomerId,
    currentCustomerName,
    isDirty: savedState.isDirty,
    isRestoringSession,
    isAuthenticating,
    isLoadingCustomers,
    isLoadingDrawings,
    isSavingCustomer,
    isSavingDrawing,
    errorMessage,
    noticeMessage,
    setCurrentDrawingName,
    saveCustomer: saveCustomerRecord,
    register,
    login: loginToWorkspace,
    logout,
    refreshCustomers,
    refreshDrawings,
    loadDrawing: loadDrawingIntoWorkspace,
    createDrawingRecord: createWorkspaceDrawing,
    saveDrawing: saveWorkspaceDrawing,
    saveDrawingAsCopy: saveWorkspaceDrawingAsCopy,
    startNewDraft
  };
}

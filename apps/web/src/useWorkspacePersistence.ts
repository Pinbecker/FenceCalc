import { useCallback, useMemo, useState } from "react";

import type { AuthSessionEnvelope, DrawingCanvasViewport, DrawingRecord, DrawingSummary, LayoutModel } from "@fence-estimator/contracts";

import {
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
import { buildDefaultDrawingName, normalizeLayout } from "./workspacePersistenceUtils";

interface UseWorkspacePersistenceOptions {
  layout: LayoutModel;
  getSavedViewport: () => DrawingCanvasViewport | null;
  onLoadDrawing: (drawing: DrawingRecord) => void;
}

export interface WorkspacePersistenceState {
  session: AuthSessionEnvelope | null;
  drawings: DrawingSummary[];
  currentDrawingId: string | null;
  currentDrawingName: string;
  currentCustomerName: string;
  isDirty: boolean;
  isRestoringSession: boolean;
  isAuthenticating: boolean;
  isLoadingDrawings: boolean;
  isSavingDrawing: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  setCurrentDrawingName: (name: string) => void;
  setCurrentCustomerName: (name: string) => void;
  register: (input: RegisterAccountInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  refreshDrawings: () => Promise<void>;
  loadDrawing: (drawingId: string) => Promise<void>;
  saveDrawing: () => Promise<void>;
  saveDrawingAsNew: () => Promise<void>;
  startNewDraft: (nextName?: string) => void;
}

export function useWorkspacePersistence({ layout, getSavedViewport, onLoadDrawing }: UseWorkspacePersistenceOptions): WorkspacePersistenceState {
  const normalizedLayout = useMemo(() => normalizeLayout(layout), [layout]);
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null);
  const [currentDrawingVersion, setCurrentDrawingVersion] = useState<number | null>(null);
  const [currentDrawingName, setCurrentDrawingName] = useState("");
  const [currentCustomerName, setCurrentCustomerName] = useState("");
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const feedback = usePortalFeedbackState();
  const savedState = useWorkspaceSavedState(normalizedLayout, currentDrawingId, currentDrawingName, currentCustomerName);
  const sessionState = useWorkspaceSessionState({
    clearMessages: feedback.clearMessages,
    setErrorMessage: feedback.setErrorMessage,
    setNoticeMessage: feedback.setNoticeMessage
  });
  const {
    drawings,
    isAuthenticating,
    isLoadingDrawings,
    isRestoringSession,
    login,
    logout: logoutSession,
    refreshDrawings,
    register: registerSession,
    session
  } = sessionState;
  const { clearMessages, errorMessage, noticeMessage, setErrorMessage, setNoticeMessage } = feedback;

  const reloadDrawingFromServer = useCallback(async (drawingId: string, notice: string) => {
    if (!session) {
      return;
    }

    const drawing = await getDrawing(drawingId);
    const nextLayout = normalizeLayout(drawing.layout);
    onLoadDrawing({ ...drawing, layout: nextLayout });
    setCurrentDrawingId(drawing.id);
    setCurrentDrawingVersion(drawing.versionNumber);
    setCurrentDrawingName(drawing.name);
    setCurrentCustomerName(drawing.customerName);
    savedState.rememberSavedState(nextLayout, drawing.name, drawing.customerName);
    setNoticeMessage(notice);
    await refreshDrawings();
  }, [onLoadDrawing, refreshDrawings, savedState, session, setNoticeMessage]);

  const register = useCallback(async (input: RegisterAccountInput) => {
    await registerSession(input, () => {
      setCurrentDrawingId(null);
      setCurrentDrawingVersion(null);
      setCurrentDrawingName("");
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
      setCurrentDrawingId(drawing.id);
      setCurrentDrawingVersion(drawing.versionNumber);
      setCurrentDrawingName(drawing.name);
      setCurrentCustomerName(drawing.customerName);
      savedState.rememberSavedState(nextLayout, drawing.name, drawing.customerName);
      setNoticeMessage(`Loaded "${drawing.name}"`);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    }
  }, [clearMessages, onLoadDrawing, savedState, session, setErrorMessage, setNoticeMessage]);

  const persistDrawing = useCallback(async (forceCreate: boolean) => {
    if (!session) {
      return;
    }

    setIsSavingDrawing(true);
    clearMessages();

    const drawingName = currentDrawingName.trim() || buildDefaultDrawingName();
    const customerName = currentCustomerName.trim() || drawingName;
    const savedViewport = getSavedViewport();
    try {
      const drawing =
        !forceCreate && currentDrawingId
          ? await updateDrawing(currentDrawingId, {
              expectedVersionNumber: currentDrawingVersion ?? 1,
              name: drawingName,
              customerName,
              layout: normalizedLayout,
              savedViewport
            })
          : await createDrawing({
              name: drawingName,
              customerName,
              layout: normalizedLayout,
              savedViewport
            });

      setCurrentDrawingId(drawing.id);
      setCurrentDrawingVersion(drawing.versionNumber);
      setCurrentDrawingName(drawing.name);
      setCurrentCustomerName(drawing.customerName);
      savedState.rememberSavedState(drawing.layout, drawing.name, drawing.customerName);
      setNoticeMessage(forceCreate || !currentDrawingId ? `Saved new drawing "${drawing.name}"` : `Saved "${drawing.name}"`);
      await refreshDrawings();
    } catch (error) {
      const conflictVersion = extractCurrentVersionNumber(error);
      if (conflictVersion !== null && currentDrawingId) {
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
    currentDrawingId,
    currentCustomerName,
    currentDrawingName,
    currentDrawingVersion,
    clearMessages,
    getSavedViewport,
    normalizedLayout,
    refreshDrawings,
    reloadDrawingFromServer,
    savedState,
    session,
    setErrorMessage,
    setNoticeMessage
  ]);

  const startNewDraft = useCallback((nextName?: string) => {
    clearMessages();
    setCurrentDrawingId(null);
    setCurrentDrawingVersion(null);
    setCurrentDrawingName(nextName ?? "");
    setCurrentCustomerName("");
    savedState.resetSavedState();
  }, [clearMessages, savedState]);

  return {
    session,
    drawings,
    currentDrawingId,
    currentDrawingName,
    currentCustomerName,
    isDirty: savedState.isDirty,
    isRestoringSession,
    isAuthenticating,
    isLoadingDrawings,
    isSavingDrawing,
    errorMessage,
    noticeMessage,
    setCurrentDrawingName,
    setCurrentCustomerName,
    register,
    login: loginToWorkspace,
    logout,
    refreshDrawings,
    loadDrawing: loadDrawingIntoWorkspace,
    saveDrawing: async () => persistDrawing(false),
    saveDrawingAsNew: async () => persistDrawing(true),
    startNewDraft
  };
}

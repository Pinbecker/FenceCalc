import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionEnvelope, DrawingSummary, LayoutModel } from "@fence-estimator/contracts";

import {
  ApiClientError,
  createDrawing,
  getAuthenticatedUser,
  getDrawing,
  listDrawings,
  login,
  logout as logoutSession,
  registerAccount,
  updateDrawing,
  type LoginInput,
  type RegisterAccountInput
} from "./apiClient";

export const SESSION_STORAGE_KEY = "fence-estimator.auth-session";

function buildDefaultDrawingName(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16).replace(":", "");
  return `Drawing ${date} ${time}`;
}

function isEmptyLayout(layout: LayoutModel): boolean {
  return layout.segments.length === 0 && (layout.gates?.length ?? 0) === 0;
}

function normalizeLayout(layout: LayoutModel): LayoutModel {
  return {
    segments: layout.segments,
    gates: layout.gates ?? []
  };
}

function readStoredSession(): AuthSessionEnvelope | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSessionEnvelope;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: AuthSessionEnvelope | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function extractMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected request failure";
}

interface UseWorkspacePersistenceOptions {
  layout: LayoutModel;
  onLoadLayout: (layout: LayoutModel) => void;
}

export interface WorkspacePersistenceState {
  session: AuthSessionEnvelope | null;
  drawings: DrawingSummary[];
  currentDrawingId: string | null;
  currentDrawingName: string;
  isDirty: boolean;
  isRestoringSession: boolean;
  isAuthenticating: boolean;
  isLoadingDrawings: boolean;
  isSavingDrawing: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  setCurrentDrawingName: (name: string) => void;
  register: (input: RegisterAccountInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  refreshDrawings: () => Promise<void>;
  loadDrawing: (drawingId: string) => Promise<void>;
  saveDrawing: () => Promise<void>;
  saveDrawingAsNew: () => Promise<void>;
  startNewDraft: (nextName?: string) => void;
}

export function useWorkspacePersistence({ layout, onLoadLayout }: UseWorkspacePersistenceOptions): WorkspacePersistenceState {
  const normalizedLayout = useMemo(() => normalizeLayout(layout), [layout]);
  const [session, setSession] = useState<AuthSessionEnvelope | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [currentDrawingId, setCurrentDrawingId] = useState<string | null>(null);
  const [currentDrawingName, setCurrentDrawingName] = useState("");
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingDrawings, setIsLoadingDrawings] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const savedLayoutSnapshotRef = useRef<string>(JSON.stringify({ segments: [], gates: [] }));
  const savedNameRef = useRef("");

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const rememberSavedState = useCallback((layout: LayoutModel, drawingName: string) => {
    savedLayoutSnapshotRef.current = JSON.stringify(normalizeLayout(layout));
    savedNameRef.current = drawingName;
  }, []);

  const refreshDrawings = useCallback(async () => {
    if (!session) {
      setDrawings([]);
      return;
    }
    setIsLoadingDrawings(true);
    try {
      const nextDrawings = await listDrawings(session.session.token);
      setDrawings(nextDrawings);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsLoadingDrawings(false);
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    const storedSession = readStoredSession();
    if (!storedSession) {
      setIsRestoringSession(false);
      return;
    }

    setSession(storedSession);
    void (async () => {
      try {
        const authenticated = await getAuthenticatedUser(storedSession.session.token);
        if (cancelled) {
          return;
        }
        const hydratedSession: AuthSessionEnvelope = {
          ...storedSession,
          company: authenticated.company,
          user: authenticated.user
        };
        setSession(hydratedSession);
        writeStoredSession(hydratedSession);
        const nextDrawings = await listDrawings(hydratedSession.session.token);
        if (cancelled) {
          return;
        }
        setDrawings(nextDrawings);
      } catch {
        if (cancelled) {
          return;
        }
        setSession(null);
        setDrawings([]);
        writeStoredSession(null);
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (input: RegisterAccountInput) => {
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await registerAccount(input);
      setSession(nextSession);
      writeStoredSession(nextSession);
      setDrawings([]);
      setCurrentDrawingId(null);
      setCurrentDrawingName("");
      rememberSavedState({ segments: [], gates: [] }, "");
      setNoticeMessage(`Signed in as ${nextSession.user.displayName}`);
      const nextDrawings = await listDrawings(nextSession.session.token);
      setDrawings(nextDrawings);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsAuthenticating(false);
      setIsRestoringSession(false);
    }
  }, [clearMessages, rememberSavedState]);

  const loginToWorkspace = useCallback(async (input: LoginInput) => {
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await login(input);
      setSession(nextSession);
      writeStoredSession(nextSession);
      const nextDrawings = await listDrawings(nextSession.session.token);
      setDrawings(nextDrawings);
      setNoticeMessage(`Welcome back, ${nextSession.user.displayName}`);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsAuthenticating(false);
      setIsRestoringSession(false);
    }
  }, [clearMessages]);

  const logout = useCallback(() => {
    if (session) {
      void logoutSession(session.session.token);
    }
    setSession(null);
    setDrawings([]);
    setCurrentDrawingId(null);
    setCurrentDrawingName("");
    rememberSavedState({ segments: [], gates: [] }, "");
    writeStoredSession(null);
    clearMessages();
  }, [clearMessages, rememberSavedState, session]);

  const loadDrawingIntoWorkspace = useCallback(async (drawingId: string) => {
    if (!session) {
      return;
    }
    setIsLoadingDrawings(true);
    clearMessages();
    try {
      const drawing = await getDrawing(session.session.token, drawingId);
      const nextLayout = normalizeLayout(drawing.layout);
      onLoadLayout(nextLayout);
      setCurrentDrawingId(drawing.id);
      setCurrentDrawingName(drawing.name);
      rememberSavedState(nextLayout, drawing.name);
      setNoticeMessage(`Loaded "${drawing.name}"`);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsLoadingDrawings(false);
    }
  }, [clearMessages, onLoadLayout, rememberSavedState, session]);

  const persistDrawing = useCallback(async (forceCreate: boolean) => {
    if (!session) {
      return;
    }
    setIsSavingDrawing(true);
    clearMessages();

    const drawingName = currentDrawingName.trim() || buildDefaultDrawingName();
    try {
      const drawing =
        !forceCreate && currentDrawingId
          ? await updateDrawing(session.session.token, currentDrawingId, {
              name: drawingName,
              layout: normalizedLayout
            })
          : await createDrawing(session.session.token, {
              name: drawingName,
              layout: normalizedLayout
            });

      setCurrentDrawingId(drawing.id);
      setCurrentDrawingName(drawing.name);
      rememberSavedState(drawing.layout, drawing.name);
      setNoticeMessage(forceCreate || !currentDrawingId ? `Saved new drawing "${drawing.name}"` : `Saved "${drawing.name}"`);
      const nextDrawings = await listDrawings(session.session.token);
      setDrawings(nextDrawings);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsSavingDrawing(false);
    }
  }, [clearMessages, currentDrawingId, currentDrawingName, normalizedLayout, rememberSavedState, session]);

  const startNewDraft = useCallback((nextName?: string) => {
    clearMessages();
    setCurrentDrawingId(null);
    setCurrentDrawingName(nextName ?? "");
    rememberSavedState({ segments: [], gates: [] }, "");
  }, [clearMessages, rememberSavedState]);

  const isDirty = useMemo(() => {
    const nameChanged = currentDrawingName.trim() !== savedNameRef.current.trim();
    if (currentDrawingId) {
      return JSON.stringify(normalizedLayout) !== savedLayoutSnapshotRef.current || nameChanged;
    }
    return nameChanged || !isEmptyLayout(normalizedLayout);
  }, [currentDrawingId, currentDrawingName, normalizedLayout]);

  return {
    session,
    drawings,
    currentDrawingId,
    currentDrawingName,
    isDirty,
    isRestoringSession,
    isAuthenticating,
    isLoadingDrawings,
    isSavingDrawing,
    errorMessage,
    noticeMessage,
    setCurrentDrawingName,
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

import { useCallback, useEffect, useState } from "react";

import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  DrawingSummary,
  DrawingVersionRecord
} from "@fence-estimator/contracts";

import {
  ApiClientError,
  bootstrapOwner,
  createUser,
  getAuthenticatedUser,
  getSetupStatus,
  listAuditLog,
  listDrawingVersions,
  listDrawings,
  listUsers,
  login,
  logout as logoutSession,
  restoreDrawingVersion,
  setDrawingArchivedState,
  type CreateCompanyUserInput,
  type LoginInput,
  type RegisterAccountInput,
  type SetupStatus
} from "./apiClient";
import { SESSION_STORAGE_KEY } from "./useWorkspacePersistence";

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

function mergeDrawingSummary(current: DrawingSummary, update: DrawingSummary): DrawingSummary {
  return {
    ...current,
    ...update
  };
}

export interface PortalSessionState {
  session: AuthSessionEnvelope | null;
  setupStatus: SetupStatus | null;
  drawings: DrawingSummary[];
  users: CompanyUserRecord[];
  auditLog: AuditLogRecord[];
  isRestoringSession: boolean;
  isAuthenticating: boolean;
  isLoadingDrawings: boolean;
  isLoadingUsers: boolean;
  isLoadingAuditLog: boolean;
  isSavingUser: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  bootstrapOwner: (input: RegisterAccountInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => void;
  refreshDrawings: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshAuditLog: () => Promise<void>;
  createUser: (input: CreateCompanyUserInput) => Promise<boolean>;
  setDrawingArchived: (drawingId: string, archived: boolean) => Promise<boolean>;
  loadDrawingVersions: (drawingId: string) => Promise<DrawingVersionRecord[]>;
  restoreDrawingVersion: (drawingId: string, versionNumber: number) => Promise<boolean>;
  clearMessages: () => void;
}

export function usePortalSession(): PortalSessionState {
  const [session, setSession] = useState<AuthSessionEnvelope | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [users, setUsers] = useState<CompanyUserRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingDrawings, setIsLoadingDrawings] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingAuditLog, setIsLoadingAuditLog] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
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

  const refreshUsers = useCallback(async () => {
    if (!session) {
      setUsers([]);
      return;
    }

    setIsLoadingUsers(true);
    try {
      const nextUsers = await listUsers(session.session.token);
      setUsers(nextUsers);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsLoadingUsers(false);
    }
  }, [session]);

  const refreshAuditLog = useCallback(async () => {
    if (!session) {
      setAuditLog([]);
      return;
    }

    setIsLoadingAuditLog(true);
    try {
      const nextAuditLog = await listAuditLog(session.session.token);
      setAuditLog(nextAuditLog);
    } catch (error) {
      setErrorMessage(extractMessage(error));
    } finally {
      setIsLoadingAuditLog(false);
    }
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextSetupStatus = await getSetupStatus();
        if (!cancelled) {
          setSetupStatus(nextSetupStatus);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(extractMessage(error));
        }
      }

      const storedSession = readStoredSession();
      if (!storedSession) {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
        return;
      }

      setSession(storedSession);
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

        const canManage = hydratedSession.user.role === "OWNER" || hydratedSession.user.role === "ADMIN";
        const [nextDrawings, nextUsers, nextAuditLog] = await Promise.all([
          listDrawings(hydratedSession.session.token),
          canManage ? listUsers(hydratedSession.session.token) : Promise.resolve([]),
          canManage ? listAuditLog(hydratedSession.session.token) : Promise.resolve([])
        ]);
        if (cancelled) {
          return;
        }
        setDrawings(nextDrawings);
        setUsers(nextUsers);
        setAuditLog(nextAuditLog);
      } catch {
        if (!cancelled) {
          setSession(null);
          setDrawings([]);
          setUsers([]);
          setAuditLog([]);
          writeStoredSession(null);
        }
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

  const bootstrap = useCallback(async (input: RegisterAccountInput) => {
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await bootstrapOwner(input);
      setSession(nextSession);
      writeStoredSession(nextSession);
      setSetupStatus({ bootstrapRequired: false });
      const [nextDrawings, nextUsers, nextAuditLog] = await Promise.all([
        listDrawings(nextSession.session.token),
        listUsers(nextSession.session.token),
        listAuditLog(nextSession.session.token)
      ]);
      setDrawings(nextDrawings);
      setUsers(nextUsers);
      setAuditLog(nextAuditLog);
      setNoticeMessage(`Workspace ready for ${nextSession.company.name}`);
      return true;
    } catch (error) {
      setErrorMessage(extractMessage(error));
      return false;
    } finally {
      setIsAuthenticating(false);
      setIsRestoringSession(false);
    }
  }, [clearMessages]);

  const loginToPortal = useCallback(async (input: LoginInput) => {
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await login(input);
      setSession(nextSession);
      writeStoredSession(nextSession);
      const canManage = nextSession.user.role === "OWNER" || nextSession.user.role === "ADMIN";
      const [nextDrawings, nextUsers, nextAuditLog] = await Promise.all([
        listDrawings(nextSession.session.token),
        canManage ? listUsers(nextSession.session.token) : Promise.resolve([]),
        canManage ? listAuditLog(nextSession.session.token) : Promise.resolve([])
      ]);
      setDrawings(nextDrawings);
      setUsers(nextUsers);
      setAuditLog(nextAuditLog);
      setNoticeMessage(`Signed in as ${nextSession.user.displayName}`);
      return true;
    } catch (error) {
      setErrorMessage(extractMessage(error));
      return false;
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
    setUsers([]);
    setAuditLog([]);
    writeStoredSession(null);
    clearMessages();
  }, [clearMessages, session]);

  const createCompanyUser = useCallback(async (input: CreateCompanyUserInput) => {
    if (!session) {
      return false;
    }

    setIsSavingUser(true);
    clearMessages();
    try {
      const user = await createUser(session.session.token, input);
      setUsers((current) => [...current, user].sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso)));
      setAuditLog(await listAuditLog(session.session.token));
      setNoticeMessage(`Added ${user.displayName}`);
      return true;
    } catch (error) {
      setErrorMessage(extractMessage(error));
      return false;
    } finally {
      setIsSavingUser(false);
    }
  }, [clearMessages, session]);

  const setDrawingArchived = useCallback(async (drawingId: string, archived: boolean) => {
    if (!session) {
      return false;
    }

    clearMessages();
    try {
      const drawing = await setDrawingArchivedState(session.session.token, drawingId, archived);
      setDrawings((current) =>
        current.map((entry) =>
          entry.id === drawing.id
            ? mergeDrawingSummary(entry, {
                id: drawing.id,
                companyId: drawing.companyId,
                name: drawing.name,
                previewLayout: drawing.layout,
                segmentCount: drawing.layout.segments.length,
                gateCount: drawing.layout.gates?.length ?? 0,
                versionNumber: drawing.versionNumber,
                isArchived: drawing.isArchived,
                archivedAtIso: drawing.archivedAtIso,
                archivedByUserId: drawing.archivedByUserId,
                createdByUserId: drawing.createdByUserId,
                updatedByUserId: drawing.updatedByUserId,
                createdAtIso: drawing.createdAtIso,
                updatedAtIso: drawing.updatedAtIso
              })
            : entry,
        ),
      );
      setAuditLog(await listAuditLog(session.session.token));
      setNoticeMessage(archived ? `Archived "${drawing.name}"` : `Restored "${drawing.name}"`);
      return true;
    } catch (error) {
      setErrorMessage(extractMessage(error));
      return false;
    }
  }, [clearMessages, session]);

  const loadVersions = useCallback(async (drawingId: string) => {
    if (!session) {
      return [];
    }
    try {
      return await listDrawingVersions(session.session.token, drawingId);
    } catch (error) {
      setErrorMessage(extractMessage(error));
      return [];
    }
  }, [session]);

  const restoreVersion = useCallback(async (drawingId: string, versionNumber: number) => {
    if (!session) {
      return false;
    }

    clearMessages();
    try {
      const drawing = await restoreDrawingVersion(session.session.token, drawingId, versionNumber);
      setDrawings((current) =>
        current.map((entry) =>
          entry.id === drawing.id
            ? mergeDrawingSummary(entry, {
                id: drawing.id,
                companyId: drawing.companyId,
                name: drawing.name,
                previewLayout: drawing.layout,
                segmentCount: drawing.layout.segments.length,
                gateCount: drawing.layout.gates?.length ?? 0,
                versionNumber: drawing.versionNumber,
                isArchived: drawing.isArchived,
                archivedAtIso: drawing.archivedAtIso,
                archivedByUserId: drawing.archivedByUserId,
                createdByUserId: drawing.createdByUserId,
                updatedByUserId: drawing.updatedByUserId,
                createdAtIso: drawing.createdAtIso,
                updatedAtIso: drawing.updatedAtIso
              })
            : entry,
        ),
      );
      setAuditLog(await listAuditLog(session.session.token));
      setNoticeMessage(`Restored drawing version ${versionNumber}`);
      return true;
    } catch (error) {
      setErrorMessage(extractMessage(error));
      return false;
    }
  }, [clearMessages, session]);

  return {
    session,
    setupStatus,
    drawings,
    users,
    auditLog,
    isRestoringSession,
    isAuthenticating,
    isLoadingDrawings,
    isLoadingUsers,
    isLoadingAuditLog,
    isSavingUser,
    errorMessage,
    noticeMessage,
    bootstrapOwner: bootstrap,
    login: loginToPortal,
    logout,
    refreshDrawings,
    refreshUsers,
    refreshAuditLog,
    createUser: createCompanyUser,
    setDrawingArchived,
    loadDrawingVersions: loadVersions,
    restoreDrawingVersion: restoreVersion,
    clearMessages
  };
}

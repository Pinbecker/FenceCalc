import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  DrawingSummary,
  DrawingVersionRecord
} from "@fence-estimator/contracts";

import {
  bootstrapOwner,
  getAuthenticatedUser,
  getSetupStatus,
  login,
  logout as logoutSession,
  type CreateCompanyUserInput,
  type LoginInput,
  type RegisterAccountInput,
  type SetupStatus
} from "./apiClient";
import { extractApiErrorMessage } from "./apiErrors";
import { readStoredSession, writeStoredSession } from "./sessionEnvelopeStore";
import { usePortalCompanyData } from "./usePortalCompanyData";
import { usePortalFeedbackState } from "./usePortalFeedbackState";

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
  isResettingUserId: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  bootstrapOwner: (input: RegisterAccountInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => void;
  refreshDrawings: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshAuditLog: () => Promise<void>;
  createUser: (input: CreateCompanyUserInput) => Promise<boolean>;
  resetUserPassword: (userId: string, password: string) => Promise<boolean>;
  setDrawingArchived: (drawingId: string, archived: boolean) => Promise<boolean>;
  loadDrawingVersions: (drawingId: string) => Promise<DrawingVersionRecord[]>;
  restoreDrawingVersion: (drawingId: string, versionNumber: number) => Promise<boolean>;
  clearMessages: () => void;
}

export function usePortalSession(): PortalSessionState {
  const [session, setSession] = useState<AuthSessionEnvelope | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const sessionRequestIdRef = useRef(0);
  const feedback = usePortalFeedbackState();
  const companyData = usePortalCompanyData({
    session,
    clearMessages: feedback.clearMessages,
    setErrorMessage: feedback.setErrorMessage,
    setNoticeMessage: feedback.setNoticeMessage
  });
  const {
    clearCompanyData,
    createUser,
    drawings,
    auditLog,
    isLoadingAuditLog,
    isLoadingDrawings,
    isLoadingUsers,
    isResettingUserId,
    isSavingUser,
    loadCompanyData,
    loadDrawingVersions,
    refreshAuditLog,
    refreshDrawings,
    refreshUsers,
    resetUserPassword,
    restoreDrawingVersion,
    setDrawingArchived,
    users
  } = companyData;
  const { clearMessages, errorMessage, noticeMessage, setErrorMessage, setNoticeMessage } = feedback;

  const beginSessionRequest = useCallback(() => {
    sessionRequestIdRef.current += 1;
    return sessionRequestIdRef.current;
  }, []);

  const isActiveSessionRequest = useCallback((requestId: number) => sessionRequestIdRef.current === requestId, []);

  useEffect(() => {
    let cancelled = false;
    const requestId = beginSessionRequest();

    void (async () => {
      try {
        const nextSetupStatus = await getSetupStatus();
        if (!cancelled) {
          setSetupStatus(nextSetupStatus);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(extractApiErrorMessage(error));
        }
      }

      const storedSession = readStoredSession();
      if (storedSession) {
        setSession(storedSession);
      }

      try {
        const authenticated = await getAuthenticatedUser();
        if (cancelled || !isActiveSessionRequest(requestId)) {
          return;
        }

        setSession(authenticated);
        writeStoredSession(authenticated);
        clearCompanyData();
        try {
          await loadCompanyData(authenticated);
        } catch (error) {
          if (!cancelled && isActiveSessionRequest(requestId)) {
            setErrorMessage(extractApiErrorMessage(error));
          }
        }
      } catch {
        if (!cancelled && isActiveSessionRequest(requestId)) {
          setSession(null);
          clearCompanyData();
          writeStoredSession(null);
        }
      } finally {
        if (!cancelled && isActiveSessionRequest(requestId)) {
          setIsRestoringSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [beginSessionRequest, clearCompanyData, isActiveSessionRequest, loadCompanyData, setErrorMessage]);

  const bootstrap = useCallback(async (input: RegisterAccountInput) => {
    const requestId = beginSessionRequest();
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await bootstrapOwner(input);
      if (!isActiveSessionRequest(requestId)) {
        return false;
      }

      setSession(nextSession);
      writeStoredSession(nextSession);
      clearCompanyData();
      setSetupStatus({ bootstrapRequired: false, bootstrapSecretRequired: false });
      setNoticeMessage(`Workspace ready for ${nextSession.company.name}`);
      void loadCompanyData(nextSession).catch((error) => {
        if (isActiveSessionRequest(requestId)) {
          setErrorMessage(extractApiErrorMessage(error));
        }
      });
      return true;
    } catch (error) {
      if (isActiveSessionRequest(requestId)) {
        setErrorMessage(extractApiErrorMessage(error));
      }
      return false;
    } finally {
      if (isActiveSessionRequest(requestId)) {
        setIsAuthenticating(false);
        setIsRestoringSession(false);
      }
    }
  }, [
    beginSessionRequest,
    clearCompanyData,
    clearMessages,
    isActiveSessionRequest,
    loadCompanyData,
    setErrorMessage,
    setNoticeMessage
  ]);

  const loginToPortal = useCallback(async (input: LoginInput) => {
    const requestId = beginSessionRequest();
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await login(input);
      if (!isActiveSessionRequest(requestId)) {
        return false;
      }

      setSession(nextSession);
      writeStoredSession(nextSession);
      clearCompanyData();
      setNoticeMessage(`Signed in as ${nextSession.user.displayName}`);
      void loadCompanyData(nextSession).catch((error) => {
        if (isActiveSessionRequest(requestId)) {
          setErrorMessage(extractApiErrorMessage(error));
        }
      });
      return true;
    } catch (error) {
      if (isActiveSessionRequest(requestId)) {
        setErrorMessage(extractApiErrorMessage(error));
      }
      return false;
    } finally {
      if (isActiveSessionRequest(requestId)) {
        setIsAuthenticating(false);
        setIsRestoringSession(false);
      }
    }
  }, [
    beginSessionRequest,
    clearCompanyData,
    clearMessages,
    isActiveSessionRequest,
    loadCompanyData,
    setErrorMessage,
    setNoticeMessage
  ]);

  const logout = useCallback(() => {
    beginSessionRequest();
    if (session) {
      void logoutSession();
    }

    setSession(null);
    clearCompanyData();
    writeStoredSession(null);
    clearMessages();
  }, [beginSessionRequest, clearCompanyData, clearMessages, session]);

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
    isResettingUserId,
    errorMessage,
    noticeMessage,
    bootstrapOwner: bootstrap,
    login: loginToPortal,
    logout,
    refreshDrawings,
    refreshUsers,
    refreshAuditLog,
    createUser,
    resetUserPassword,
    setDrawingArchived,
    loadDrawingVersions,
    restoreDrawingVersion,
    clearMessages
  };
}

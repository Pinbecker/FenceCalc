import { useCallback, useEffect, useState } from "react";

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
          setErrorMessage(extractApiErrorMessage(error));
        }
      }

      const storedSession = readStoredSession();
      if (storedSession) {
        setSession(storedSession);
      }

      try {
        const authenticated = await getAuthenticatedUser();
        if (cancelled) {
          return;
        }

        setSession(authenticated);
        writeStoredSession(authenticated);
        await loadCompanyData(authenticated);
      } catch {
        if (!cancelled) {
          setSession(null);
          clearCompanyData();
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
  }, [clearCompanyData, loadCompanyData, setErrorMessage]);

  const bootstrap = useCallback(async (input: RegisterAccountInput) => {
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await bootstrapOwner(input);
      setSession(nextSession);
      writeStoredSession(nextSession);
      setSetupStatus({ bootstrapRequired: false, bootstrapSecretRequired: false });
      await loadCompanyData(nextSession);
      setNoticeMessage(`Workspace ready for ${nextSession.company.name}`);
      return true;
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
      return false;
    } finally {
      setIsAuthenticating(false);
      setIsRestoringSession(false);
    }
  }, [clearMessages, loadCompanyData, setErrorMessage, setNoticeMessage]);

  const loginToPortal = useCallback(async (input: LoginInput) => {
    setIsAuthenticating(true);
    clearMessages();
    try {
      const nextSession = await login(input);
      setSession(nextSession);
      writeStoredSession(nextSession);
      await loadCompanyData(nextSession);
      setNoticeMessage(`Signed in as ${nextSession.user.displayName}`);
      return true;
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
      return false;
    } finally {
      setIsAuthenticating(false);
      setIsRestoringSession(false);
    }
  }, [clearMessages, loadCompanyData, setErrorMessage, setNoticeMessage]);

  const logout = useCallback(() => {
    if (session) {
      void logoutSession();
    }

    setSession(null);
    clearCompanyData();
    writeStoredSession(null);
    clearMessages();
  }, [clearCompanyData, clearMessages, session]);

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

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  CustomerRecord,
  CustomerSummary,
  DrawingStatus,
  DrawingSummary,
  DrawingVersionRecord
} from "@fence-estimator/contracts";

import {
  bootstrapOwner,
  getAuthenticatedUser,
  getSetupStatus,
  login,
  logout as logoutSession,
  type AuditLogQueryOptions,
  type CreateCompanyUserInput,
  type LoginInput,
  type RegisterAccountInput,
  type SetupStatus
} from "./apiClient";
import { extractApiErrorMessage } from "./apiErrors";
import { reportClientError, setClientTelemetrySession } from "./errorReporting";
import { readStoredSession, writeStoredSession } from "./sessionEnvelopeStore";
import { usePortalCompanyData } from "./usePortalCompanyData";
import { usePortalFeedbackState } from "./usePortalFeedbackState";

export interface PortalSessionState {
  session: AuthSessionEnvelope | null;
  setupStatus: SetupStatus | null;
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  users: CompanyUserRecord[];
  auditLog: AuditLogRecord[];
  isRestoringSession: boolean;
  isAuthenticating: boolean;
  isLoadingCustomers: boolean;
  isLoadingDrawings: boolean;
  isLoadingUsers: boolean;
  isLoadingAuditLog: boolean;
  isSavingCustomer: boolean;
  isSavingUser: boolean;
  isArchivingCustomerId: string | null;
  isResettingUserId: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  bootstrapOwner: (input: RegisterAccountInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  refreshDrawings: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshAuditLog: () => Promise<void>;
  refreshFilteredAuditLog: (query: AuditLogQueryOptions) => Promise<void>;
  exportAuditLog: (query: AuditLogQueryOptions) => Promise<string>;
  saveCustomer: (
    input:
      | { mode: "create"; customer: { name: string; primaryContactName: string; primaryEmail: string; primaryPhone: string; siteAddress: string; notes: string } }
      | { mode: "update"; customerId: string; customer: { name?: string; primaryContactName?: string; primaryEmail?: string; primaryPhone?: string; siteAddress?: string; notes?: string } },
  ) => Promise<CustomerRecord | null>;
  setCustomerArchived: (customerId: string, archived: boolean, cascadeDrawings?: boolean) => Promise<boolean>;
  createUser: (input: CreateCompanyUserInput) => Promise<boolean>;
  resetUserPassword: (userId: string, password: string) => Promise<boolean>;
  setDrawingArchived: (drawingId: string, archived: boolean) => Promise<boolean>;
  changeDrawingStatus: (drawingId: string, status: DrawingStatus) => Promise<boolean>;
  loadDrawingVersions: (drawingId: string) => Promise<DrawingVersionRecord[]>;
  restoreDrawingVersion: (drawingId: string, versionNumber: number) => Promise<boolean>;
  deleteDrawing: (drawingId: string) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
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
    customers,
    clearCompanyData,
    createUser,
    drawings,
    auditLog,
    isArchivingCustomerId,
    isLoadingAuditLog,
    isLoadingCustomers,
    isLoadingDrawings,
    isLoadingUsers,
    isSavingCustomer,
    isResettingUserId,
    isSavingUser,
    changeDrawingStatus,
    loadCompanyData,
    refreshCustomers,
    loadDrawingVersions,
    refreshAuditLog,
    refreshFilteredAuditLog,
    refreshDrawings,
    refreshUsers,
    resetUserPassword,
    restoreDrawingVersion,
    saveCustomer,
    setCustomerArchived,
    setDrawingArchived,
    exportAuditLog,
    deleteDrawing,
    deleteCustomer,
    users
  } = companyData;
  const { clearMessages, errorMessage, noticeMessage, setErrorMessage, setNoticeMessage } = feedback;

  const beginSessionRequest = useCallback(() => {
    sessionRequestIdRef.current += 1;
    return sessionRequestIdRef.current;
  }, []);

  const isActiveSessionRequest = useCallback((requestId: number) => sessionRequestIdRef.current === requestId, []);

  useEffect(() => {
    setClientTelemetrySession(session);
  }, [session]);

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

  const logout = useCallback(async () => {
    beginSessionRequest();
    if (session) {
      try {
        await logoutSession();
      } catch (error) {
        reportClientError(error, "portal.logout");
      }
    }

    setSession(null);
    clearCompanyData();
    writeStoredSession(null);
    clearMessages();
  }, [beginSessionRequest, clearCompanyData, clearMessages, session]);

  return {
    session,
    setupStatus,
    customers,
    drawings,
    users,
    auditLog,
    isRestoringSession,
    isAuthenticating,
    isLoadingCustomers,
    isLoadingDrawings,
    isLoadingUsers,
    isLoadingAuditLog,
    isSavingCustomer,
    isSavingUser,
    isArchivingCustomerId,
    isResettingUserId,
    errorMessage,
    noticeMessage,
    bootstrapOwner: bootstrap,
    login: loginToPortal,
    logout,
    refreshCustomers,
    refreshDrawings,
    refreshUsers,
    refreshAuditLog,
    refreshFilteredAuditLog,
    exportAuditLog,
    saveCustomer,
    setCustomerArchived,
    createUser,
    resetUserPassword,
    setDrawingArchived,
    changeDrawingStatus,
    loadDrawingVersions,
    restoreDrawingVersion,
    deleteDrawing,
    deleteCustomer,
    clearMessages
  };
}

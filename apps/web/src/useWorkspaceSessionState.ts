import { useCallback, useEffect, useState } from "react";
import type { AuthSessionEnvelope, DrawingSummary } from "@fence-estimator/contracts";

import {
  getAuthenticatedUser,
  listDrawings,
  login,
  logout as logoutSession,
  registerAccount,
  type LoginInput,
  type RegisterAccountInput
} from "./apiClient";
import { extractApiErrorMessage } from "./apiErrors";
import { readStoredSession, writeStoredSession } from "./sessionEnvelopeStore";

interface UseWorkspaceSessionStateOptions {
  clearMessages: () => void;
  setErrorMessage: (message: string | null) => void;
  setNoticeMessage: (message: string | null) => void;
}

export function useWorkspaceSessionState({
  clearMessages,
  setErrorMessage,
  setNoticeMessage
}: UseWorkspaceSessionStateOptions) {
  const [session, setSession] = useState<AuthSessionEnvelope | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingDrawings, setIsLoadingDrawings] = useState(false);

  const clearSessionData = useCallback(() => {
    setSession(null);
    setDrawings([]);
    writeStoredSession(null);
  }, []);

  const refreshDrawings = useCallback(async () => {
    if (!session) {
      setDrawings([]);
      return;
    }

    setIsLoadingDrawings(true);
    try {
      setDrawings(await listDrawings());
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoadingDrawings(false);
    }
  }, [session, setErrorMessage]);

  useEffect(() => {
    let cancelled = false;
    const storedSession = readStoredSession();
    if (storedSession) {
      setSession(storedSession);
    }

    void (async () => {
      try {
        const authenticated = await getAuthenticatedUser();
        if (cancelled) {
          return;
        }

        setSession(authenticated);
        writeStoredSession(authenticated);
        const nextDrawings = await listDrawings();
        if (cancelled) {
          return;
        }

        setDrawings(nextDrawings);
      } catch {
        if (cancelled) {
          return;
        }

        clearSessionData();
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSessionData]);

  const register = useCallback(
    async (input: RegisterAccountInput, onRegistered: () => void) => {
      setIsAuthenticating(true);
      clearMessages();
      try {
        const nextSession = await registerAccount(input);
        setSession(nextSession);
        writeStoredSession(nextSession);
        onRegistered();
        setNoticeMessage(`Signed in as ${nextSession.user.displayName}`);
        setDrawings(await listDrawings());
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
      } finally {
        setIsAuthenticating(false);
        setIsRestoringSession(false);
      }
    },
    [clearMessages, setErrorMessage, setNoticeMessage],
  );

  const loginToWorkspace = useCallback(
    async (input: LoginInput) => {
      setIsAuthenticating(true);
      clearMessages();
      try {
        const nextSession = await login(input);
        setSession(nextSession);
        writeStoredSession(nextSession);
        setDrawings(await listDrawings());
        setNoticeMessage(`Welcome back, ${nextSession.user.displayName}`);
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
      } finally {
        setIsAuthenticating(false);
        setIsRestoringSession(false);
      }
    },
    [clearMessages, setErrorMessage, setNoticeMessage],
  );

  const logout = useCallback(
    (onLoggedOut: () => void) => {
      if (session) {
        void logoutSession();
      }

      clearSessionData();
      onLoggedOut();
      clearMessages();
    },
    [clearMessages, clearSessionData, session],
  );

  return {
    session,
    drawings,
    isRestoringSession,
    isAuthenticating,
    isLoadingDrawings,
    setDrawings,
    refreshDrawings,
    register,
    login: loginToWorkspace,
    logout
  };
}

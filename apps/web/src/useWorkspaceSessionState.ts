import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import {
  getAuthenticatedUser,
  listCustomers,
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
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingDrawings, setIsLoadingDrawings] = useState(false);
  const sessionRequestIdRef = useRef(0);

  const beginSessionRequest = useCallback(() => {
    sessionRequestIdRef.current += 1;
    return sessionRequestIdRef.current;
  }, []);

  const isActiveSessionRequest = useCallback((requestId: number) => sessionRequestIdRef.current === requestId, []);

  const clearSessionData = useCallback(() => {
    setSession(null);
    setCustomers([]);
    setDrawings([]);
    writeStoredSession(null);
  }, []);

  const refreshCustomers = useCallback(async () => {
    if (!session) {
      setCustomers([]);
      return;
    }

    setIsLoadingCustomers(true);
    try {
      setCustomers(await listCustomers());
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [session, setErrorMessage]);

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
    const requestId = beginSessionRequest();
    const storedSession = readStoredSession();
    if (storedSession) {
      setSession(storedSession);
    }

    void (async () => {
      try {
        const authenticated = await getAuthenticatedUser();
        if (cancelled || !isActiveSessionRequest(requestId)) {
          return;
        }

        setSession(authenticated);
        writeStoredSession(authenticated);
        setCustomers([]);
        setDrawings([]);
        try {
          const [nextCustomers, nextDrawings] = await Promise.all([listCustomers(), listDrawings()]);
          if (!cancelled && isActiveSessionRequest(requestId)) {
            setCustomers(nextCustomers);
            setDrawings(nextDrawings);
          }
        } catch (error) {
          if (!cancelled && isActiveSessionRequest(requestId)) {
            setErrorMessage(extractApiErrorMessage(error));
          }
        }
      } catch {
        if (cancelled || !isActiveSessionRequest(requestId)) {
          return;
        }

        clearSessionData();
      } finally {
        if (!cancelled && isActiveSessionRequest(requestId)) {
          setIsRestoringSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [beginSessionRequest, clearSessionData, isActiveSessionRequest, setErrorMessage]);

  const register = useCallback(
    async (input: RegisterAccountInput, onRegistered: () => void) => {
      const requestId = beginSessionRequest();
      setIsAuthenticating(true);
      clearMessages();
      try {
        const nextSession = await registerAccount(input);
        if (!isActiveSessionRequest(requestId)) {
          return;
        }

        setSession(nextSession);
        writeStoredSession(nextSession);
        setCustomers([]);
        setDrawings([]);
        onRegistered();
        setNoticeMessage(`Signed in as ${nextSession.user.displayName}`);
        void Promise.all([listCustomers(), listDrawings()])
          .then(([nextCustomers, nextDrawings]) => {
            if (isActiveSessionRequest(requestId)) {
              setCustomers(nextCustomers);
              setDrawings(nextDrawings);
            }
          })
          .catch((error) => {
            if (isActiveSessionRequest(requestId)) {
              setErrorMessage(extractApiErrorMessage(error));
            }
          });
      } catch (error) {
        if (isActiveSessionRequest(requestId)) {
          setErrorMessage(extractApiErrorMessage(error));
        }
      } finally {
        if (isActiveSessionRequest(requestId)) {
          setIsAuthenticating(false);
          setIsRestoringSession(false);
        }
      }
    },
    [beginSessionRequest, clearMessages, isActiveSessionRequest, setErrorMessage, setNoticeMessage],
  );

  const loginToWorkspace = useCallback(
    async (input: LoginInput) => {
      const requestId = beginSessionRequest();
      setIsAuthenticating(true);
      clearMessages();
      try {
        const nextSession = await login(input);
        if (!isActiveSessionRequest(requestId)) {
          return;
        }

        setSession(nextSession);
        writeStoredSession(nextSession);
        setCustomers([]);
        setDrawings([]);
        setNoticeMessage(`Welcome back, ${nextSession.user.displayName}`);
        void Promise.all([listCustomers(), listDrawings()])
          .then(([nextCustomers, nextDrawings]) => {
            if (isActiveSessionRequest(requestId)) {
              setCustomers(nextCustomers);
              setDrawings(nextDrawings);
            }
          })
          .catch((error) => {
            if (isActiveSessionRequest(requestId)) {
              setErrorMessage(extractApiErrorMessage(error));
            }
          });
      } catch (error) {
        if (isActiveSessionRequest(requestId)) {
          setErrorMessage(extractApiErrorMessage(error));
        }
      } finally {
        if (isActiveSessionRequest(requestId)) {
          setIsAuthenticating(false);
          setIsRestoringSession(false);
        }
      }
    },
    [beginSessionRequest, clearMessages, isActiveSessionRequest, setErrorMessage, setNoticeMessage],
  );

  const logout = useCallback(
    (onLoggedOut: () => void) => {
      beginSessionRequest();
      if (session) {
        void logoutSession();
      }

      clearSessionData();
      onLoggedOut();
      clearMessages();
    },
    [beginSessionRequest, clearMessages, clearSessionData, session],
  );

  return {
    session,
    customers,
    drawings,
    isRestoringSession,
    isAuthenticating,
    isLoadingCustomers,
    isLoadingDrawings,
    setDrawings,
    setCustomers,
    refreshCustomers,
    refreshDrawings,
    register,
    login: loginToWorkspace,
    logout
  };
}

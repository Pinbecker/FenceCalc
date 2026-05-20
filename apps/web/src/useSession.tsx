import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AuthSessionEnvelope } from "@fence-estimator/contracts";

import {
  ApiError,
  bootstrapOwner,
  getCurrentSession,
  getSetupStatus,
  login as apiLogin,
  logout as apiLogout,
  type BootstrapOwnerInput,
  type LoginInput,
  type SetupStatus,
} from "./apiClient";

interface SessionContextValue {
  session: AuthSessionEnvelope | null;
  setupStatus: SetupStatus | null;
  isRestoring: boolean;
  isAuthenticating: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  login: (input: LoginInput) => Promise<boolean>;
  bootstrap: (input: BootstrapOwnerInput) => Promise<boolean>;
  logout: () => Promise<void>;
  clearMessages: () => void;
  refreshSetupStatus: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionEnvelope | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const fetchSetupStatus = useCallback(async () => {
    try {
      const status = await getSetupStatus();
      setSetupStatus(status);
    } catch (error) {
      setSetupStatus({ bootstrapRequired: false, bootstrapSecretRequired: false });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const envelope = await getCurrentSession();
        if (!cancelled) setSession(envelope);
      } catch (error) {
        if (!cancelled) setSession(null);
      } finally {
        await fetchSetupStatus();
        if (!cancelled) setIsRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSetupStatus]);

  const login = useCallback(async (input: LoginInput) => {
    setIsAuthenticating(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const envelope = await apiLogin(input);
      setSession(envelope);
      return true;
    } catch (error) {
      const message =
        error instanceof ApiError ? error.payload.error : (error as Error).message;
      setErrorMessage(message);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const bootstrap = useCallback(
    async (input: BootstrapOwnerInput) => {
      setIsAuthenticating(true);
      setErrorMessage(null);
      setNoticeMessage(null);
      try {
        const envelope = await bootstrapOwner(input);
        setSession(envelope);
        await fetchSetupStatus();
        return true;
      } catch (error) {
        const message =
          error instanceof ApiError ? error.payload.error : (error as Error).message;
        setErrorMessage(message);
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [fetchSetupStatus],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    setSession(null);
    setNoticeMessage("Signed out");
  }, []);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      setupStatus,
      isRestoring,
      isAuthenticating,
      errorMessage,
      noticeMessage,
      login,
      bootstrap,
      logout,
      clearMessages,
      refreshSetupStatus: fetchSetupStatus,
    }),
    [
      session,
      setupStatus,
      isRestoring,
      isAuthenticating,
      errorMessage,
      noticeMessage,
      login,
      bootstrap,
      logout,
      clearMessages,
      fetchSetupStatus,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

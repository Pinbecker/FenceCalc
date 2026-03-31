import { useCallback, useState } from "react";
import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  CustomerContact,
  CustomerRecord,
  CustomerSummary,
  DrawingWorkspaceRecord,
  DrawingWorkspaceSummary,
  DrawingStatus,
  DrawingSummary,
  DrawingVersionRecord,
} from "@fence-estimator/contracts";

import {
  createDrawingWorkspace,
  createDrawing as createDrawingRecord,
  createCustomer,
  createUser,
  deleteCustomer,
  deleteDrawing,
  deleteDrawingWorkspace,
  exportAuditLogCsv,
  listCustomers,
  listAuditLog,
  listDrawingVersions,
  listDrawings,
  listDrawingWorkspaceDrawings,
  listDrawingWorkspaces,
  listUsers,
  restoreDrawingVersion,
  setCustomerArchivedState,
  setDrawingArchivedState,
  setDrawingStatus,
  setUserPassword,
  updateDrawingWorkspace,
  updateCustomer,
  type AuditLogQueryOptions,
  type CreateCompanyUserInput
} from "./apiClient";
import { extractApiErrorMessage, extractCurrentVersionNumber } from "./apiErrors";
import {
  EMPTY_PORTAL_COMPANY_DATA,
  loadPortalCompanyData,
  updateDrawingSummaryFromRecord
} from "./portalSessionData";

function mergeDrawingSummary(current: DrawingSummary, update: DrawingSummary): DrawingSummary {
  return {
    ...current,
    ...update
  };
}

interface UsePortalCompanyDataOptions {
  session: AuthSessionEnvelope | null;
  clearMessages: () => void;
  setErrorMessage: (message: string | null) => void;
  setNoticeMessage: (message: string | null) => void;
}

export function usePortalCompanyData({
  session,
  clearMessages,
  setErrorMessage,
  setNoticeMessage
}: UsePortalCompanyDataOptions) {
  const workspaceListScope = "ALL" as const;
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<DrawingWorkspaceSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [users, setUsers] = useState<CompanyUserRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [isArchivingCustomerId, setIsArchivingCustomerId] = useState<string | null>(null);
  const [isLoadingDrawings, setIsLoadingDrawings] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingAuditLog, setIsLoadingAuditLog] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isResettingUserId, setIsResettingUserId] = useState<string | null>(null);
  const [auditLogQuery, setAuditLogQuery] = useState<AuditLogQueryOptions>({ limit: 50 });

  const loadAuditLog = useCallback(
    async (query: AuditLogQueryOptions) => {
      const entries = await listAuditLog(query);
      setAuditLogQuery(query);
      setAuditLog(entries);
      return entries;
    },
    [],
  );

  const clearCompanyData = useCallback(() => {
    setCustomers(EMPTY_PORTAL_COMPANY_DATA.customers);
    setDrawings(EMPTY_PORTAL_COMPANY_DATA.drawings);
    setWorkspaces(EMPTY_PORTAL_COMPANY_DATA.workspaces);
    setUsers(EMPTY_PORTAL_COMPANY_DATA.users);
    setAuditLog(EMPTY_PORTAL_COMPANY_DATA.auditLog);
  }, []);

  const loadCompanyData = useCallback(async (nextSession: AuthSessionEnvelope) => {
    const nextData = await loadPortalCompanyData(nextSession);
    setCustomers(nextData.customers);
    setDrawings(nextData.drawings);
    setWorkspaces(nextData.workspaces);
    setUsers(nextData.users);
    setAuditLog(nextData.auditLog);
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

  const refreshWorkspaces = useCallback(async () => {
    if (!session) {
      setWorkspaces([]);
      return;
    }

    try {
      const nextWorkspaces = await listDrawingWorkspaces({ scope: workspaceListScope });
      setWorkspaces(nextWorkspaces);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    }
  }, [session, setErrorMessage, workspaceListScope]);

  const refreshUsers = useCallback(async () => {
    if (!session) {
      setUsers([]);
      return;
    }

    setIsLoadingUsers(true);
    try {
      setUsers(await listUsers());
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoadingUsers(false);
    }
  }, [session, setErrorMessage]);

  const refreshAuditLog = useCallback(async () => {
    if (!session) {
      setAuditLog([]);
      return;
    }

    setIsLoadingAuditLog(true);
    try {
      await loadAuditLog(auditLogQuery);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsLoadingAuditLog(false);
    }
  }, [auditLogQuery, loadAuditLog, session, setErrorMessage]);

  const refreshFilteredAuditLog = useCallback(
    async (query: AuditLogQueryOptions) => {
      if (!session) {
        setAuditLog([]);
        return;
      }

      setIsLoadingAuditLog(true);
      try {
        await loadAuditLog({ limit: query.limit ?? auditLogQuery.limit ?? 50, ...query });
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
      } finally {
        setIsLoadingAuditLog(false);
      }
    },
    [auditLogQuery.limit, loadAuditLog, session, setErrorMessage],
  );

  const exportFilteredAuditLog = useCallback(
    async (query: AuditLogQueryOptions) => {
      if (!session) {
        return "";
      }

      try {
        return await exportAuditLogCsv(query);
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return "";
      }
    },
    [session, setErrorMessage],
  );

  const createCompanyUser = useCallback(
    async (input: CreateCompanyUserInput) => {
      if (!session) {
        return false;
      }

      setIsSavingUser(true);
      clearMessages();
      try {
        const user = await createUser(input);
        setUsers((current) => [...current, user].sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso)));
        await loadAuditLog(auditLogQuery);
        setNoticeMessage(`Added ${user.displayName}`);
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      } finally {
        setIsSavingUser(false);
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage],
  );

  const createCompanyWorkspace = useCallback(
    async (input: { customerId: string; name: string; notes: string }): Promise<DrawingWorkspaceRecord | null> => {
      if (!session) {
        return null;
      }

      clearMessages();
      try {
        const workspace = await createDrawingWorkspace(input);
        const [nextWorkspaces, nextDrawings] = await Promise.all([
          listDrawingWorkspaces({ scope: workspaceListScope }),
          listDrawings(),
          loadAuditLog(auditLogQuery)
        ]);
        setWorkspaces(nextWorkspaces);
        setDrawings(nextDrawings);
        setNoticeMessage(`Created workspace ${workspace.name}`);
        return workspace;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return null;
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const createCompanyDrawing = useCallback(
    async (input: { customerId: string; name: string }) => {
      if (!session) {
        return null;
      }

      clearMessages();
      try {
        const drawing = await createDrawingRecord({
          name: input.name,
          customerId: input.customerId,
          layout: {
            segments: [],
            gates: [],
            basketballPosts: [],
            floodlightColumns: [],
            goalUnits: [],
            kickboards: [],
            pitchDividers: [],
            sideNettings: [],
          },
          savedViewport: null,
        });
        const [nextCustomers, nextDrawings, nextWorkspaces] = await Promise.all([
          listCustomers(),
          listDrawings(),
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery),
        ]);
        setCustomers(nextCustomers);
        setDrawings(nextDrawings);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage(`Created drawing ${drawing.name}`);
        return drawing;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return null;
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const resetCompanyUserPassword = useCallback(
    async (userId: string, password: string) => {
      if (!session) {
        return false;
      }

      setIsResettingUserId(userId);
      clearMessages();
      try {
        await setUserPassword(userId, { password });
        const [nextUsers] = await Promise.all([listUsers(), loadAuditLog(auditLogQuery)]);
        const targetUser = nextUsers.find((entry) => entry.id === userId) ?? null;
        setUsers(nextUsers);
        setNoticeMessage(
          targetUser
            ? `Reset password for ${targetUser.displayName}. Their active sessions were revoked.`
            : "Password updated. Active sessions were revoked.",
        );
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      } finally {
        setIsResettingUserId(null);
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage],
  );

  const setDrawingArchived = useCallback(
    async (drawingId: string, archived: boolean) => {
      if (!session) {
        return false;
      }

      clearMessages();
      const currentDrawing = drawings.find((entry) => entry.id === drawingId);
      const currentDrawingName = currentDrawing?.name ?? "Drawing";
      try {
        if (!currentDrawing) {
          setErrorMessage("Drawing not found");
          return false;
        }

        const drawing = await setDrawingArchivedState(drawingId, archived, currentDrawing.versionNumber);
        const nextSummary = updateDrawingSummaryFromRecord(drawing, currentDrawing);
        setDrawings((current) =>
          current.map((entry) => (entry.id === drawing.id ? mergeDrawingSummary(entry, nextSummary) : entry)),
        );
        const [nextWorkspaces] = await Promise.all([
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery),
        ]);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage(archived ? `Archived "${drawing.name}"` : `Restored "${drawing.name}"`);
        return true;
      } catch (error) {
        if (extractCurrentVersionNumber(error) !== null) {
          setDrawings(await listDrawings());
          setErrorMessage(
            `"${currentDrawingName}" changed before this action completed. The drawings list has been refreshed; retry the action.`,
          );
          return false;
        }

        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, drawings, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const changeDrawingStatus = useCallback(
    async (drawingId: string, status: DrawingStatus) => {
      if (!session) {
        return false;
      }

      clearMessages();
      const currentDrawing = drawings.find((entry) => entry.id === drawingId);
      const currentDrawingName = currentDrawing?.name ?? "Drawing";
      try {
        if (!currentDrawing) {
          setErrorMessage("Drawing not found");
          return false;
        }

        const drawing = await setDrawingStatus(drawingId, status, currentDrawing.versionNumber);
        const nextSummary = updateDrawingSummaryFromRecord(drawing, currentDrawing);
        setDrawings((current) =>
          current.map((entry) => (entry.id === drawing.id ? mergeDrawingSummary(entry, nextSummary) : entry)),
        );
        const [nextWorkspaces] = await Promise.all([
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery),
        ]);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage(`Updated "${drawing.name}" status to ${status.charAt(0) + status.slice(1).toLowerCase()}`);
        return true;
      } catch (error) {
        if (extractCurrentVersionNumber(error) !== null) {
          setDrawings(await listDrawings());
          setErrorMessage(
            `"${currentDrawingName}" changed before this action completed. The drawings list has been refreshed; retry the action.`,
          );
          return false;
        }

        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, drawings, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const loadDrawingVersions = useCallback(
    async (drawingId: string): Promise<DrawingVersionRecord[]> => {
      if (!session) {
        return [];
      }

      try {
        return await listDrawingVersions(drawingId);
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return [];
      }
    },
    [session, setErrorMessage],
  );

  const restoreVersion = useCallback(
    async (drawingId: string, versionNumber: number) => {
      if (!session) {
        return false;
      }

      clearMessages();
      const currentDrawing = drawings.find((entry) => entry.id === drawingId);
      const currentDrawingName = currentDrawing?.name ?? "Drawing";
      try {
        if (!currentDrawing) {
          setErrorMessage("Drawing not found");
          return false;
        }

        const drawing = await restoreDrawingVersion(drawingId, versionNumber, currentDrawing.versionNumber);
        const nextSummary = updateDrawingSummaryFromRecord(drawing, currentDrawing);
        setDrawings((current) =>
          current.map((entry) => (entry.id === drawing.id ? mergeDrawingSummary(entry, nextSummary) : entry)),
        );
        const [nextWorkspaces] = await Promise.all([
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery),
        ]);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage(`Restored drawing version ${versionNumber}`);
        return true;
      } catch (error) {
        if (extractCurrentVersionNumber(error) !== null) {
          setDrawings(await listDrawings());
          setErrorMessage(
            `"${currentDrawingName}" changed before this version restore completed. The drawings list has been refreshed; retry the action.`,
          );
          return false;
        }

        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, drawings, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const createOrUpdateCustomer = useCallback(
    async (
      input:
        | { mode: "create"; customer: { name: string; primaryContactName: string; primaryEmail: string; primaryPhone: string; additionalContacts?: CustomerContact[]; siteAddress: string; notes: string } }
        | { mode: "update"; customerId: string; customer: { name?: string; primaryContactName?: string; primaryEmail?: string; primaryPhone?: string; additionalContacts?: CustomerContact[]; siteAddress?: string; notes?: string } },
    ): Promise<CustomerRecord | null> => {
      if (!session) {
        return null;
      }

      setIsSavingCustomer(true);
      clearMessages();
      try {
        const customer =
          input.mode === "create"
            ? await createCustomer(input.customer)
            : await updateCustomer(input.customerId, input.customer);
        const [nextCustomers] = await Promise.all([listCustomers(), loadAuditLog(auditLogQuery)]);
        setCustomers(nextCustomers);
        setNoticeMessage(
          input.mode === "create" ? `Added customer ${customer.name}` : `Updated customer ${customer.name}`,
        );
        return customer;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return null;
      } finally {
        setIsSavingCustomer(false);
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage],
  );

  const archiveCustomer = useCallback(
    async (customerId: string, archived: boolean, cascadeDrawings = false) => {
      if (!session) {
        return false;
      }

      setIsArchivingCustomerId(customerId);
      clearMessages();
      try {
        const customer = await setCustomerArchivedState(customerId, archived, cascadeDrawings);
        const [nextCustomers, nextDrawings, nextWorkspaces] = await Promise.all([
          listCustomers(),
          listDrawings(),
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery)
        ]);
        setCustomers(nextCustomers);
        setDrawings(nextDrawings);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage(archived ? `Archived customer ${customer.name}` : `Restored customer ${customer.name}`);
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      } finally {
        setIsArchivingCustomerId(null);
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const deleteDrawingPermanently = useCallback(
    async (drawingId: string) => {
      if (!session) return false;
      clearMessages();
      try {
        await deleteDrawing(drawingId);
        const [nextDrawings, nextWorkspaces] = await Promise.all([
          listDrawings(),
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery)
        ]);
        setDrawings(nextDrawings);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage("Drawing permanently deleted");
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const deleteCustomerPermanently = useCallback(
    async (customerId: string) => {
      if (!session) return false;
      clearMessages();
      try {
        await deleteCustomer(customerId);
        const [nextCustomers, nextDrawings, nextWorkspaces] = await Promise.all([
          listCustomers(),
          listDrawings(),
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery)
        ]);
        setCustomers(nextCustomers);
        setDrawings(nextDrawings);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage("Customer permanently deleted");
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const setWorkspaceArchived = useCallback(
    async (workspaceId: string, archived: boolean) => {
      if (!session) return false;
      clearMessages();
      try {
        const workspaceDrawings = await listDrawingWorkspaceDrawings(workspaceId);
        await updateDrawingWorkspace(workspaceId, { archived });
        await Promise.all(
          workspaceDrawings
            .filter((drawing) => drawing.isArchived !== archived)
            .map((drawing) =>
              setDrawingArchivedState(drawing.id, archived, drawing.versionNumber),
            ),
        );
        const [nextCustomers, nextDrawings, nextWorkspaces] = await Promise.all([
          listCustomers(),
          listDrawings(),
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery)
        ]);
        setCustomers(nextCustomers);
        setDrawings(nextDrawings);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage(archived ? "Workspace archived" : "Workspace restored");
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  const deleteWorkspacePermanently = useCallback(
    async (workspaceId: string) => {
      if (!session) return false;
      clearMessages();
      try {
        await deleteDrawingWorkspace(workspaceId);
        const [nextCustomers, nextDrawings, nextWorkspaces] = await Promise.all([
          listCustomers(),
          listDrawings(),
          listDrawingWorkspaces({ scope: workspaceListScope }),
          loadAuditLog(auditLogQuery)
        ]);
        setCustomers(nextCustomers);
        setDrawings(nextDrawings);
        setWorkspaces(nextWorkspaces);
        setNoticeMessage("Workspace permanently deleted");
        return true;
      } catch (error) {
        setErrorMessage(extractApiErrorMessage(error));
        return false;
      }
    },
    [auditLogQuery, clearMessages, loadAuditLog, session, setErrorMessage, setNoticeMessage, workspaceListScope],
  );

  return {
    customers,
    drawings,
    workspaces,
    users,
    auditLog,
    isLoadingCustomers,
    isLoadingDrawings,
    isLoadingUsers,
    isLoadingAuditLog,
    isSavingCustomer,
    isSavingUser,
    isArchivingCustomerId,
    isResettingUserId,
    clearCompanyData,
    loadCompanyData,
    refreshCustomers,
    refreshDrawings,
    refreshWorkspaces,
    refreshUsers,
    refreshAuditLog,
    refreshFilteredAuditLog,
    exportAuditLog: exportFilteredAuditLog,
    saveCustomer: createOrUpdateCustomer,
    createDrawing: createCompanyDrawing,
    createWorkspace: createCompanyWorkspace,
    setCustomerArchived: archiveCustomer,
    createUser: createCompanyUser,
    resetUserPassword: resetCompanyUserPassword,
    setDrawingArchived,
    changeDrawingStatus,
    loadDrawingVersions,
    restoreDrawingVersion: restoreVersion,
    deleteDrawing: deleteDrawingPermanently,
    deleteCustomer: deleteCustomerPermanently,
    setWorkspaceArchived,
    deleteWorkspace: deleteWorkspacePermanently
  };
}

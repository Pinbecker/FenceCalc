import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import type {
  DrawingSummary,
  DrawingWorkspaceRecord,
} from "@fence-estimator/contracts";

import {
  createDrawingWorkspaceDrawing,
  updateDrawing,
  updateDrawingWorkspace,
} from "../apiClient";
import { buildDrawingWorkspaceQuery } from "../drawingWorkspace";
import type { PortalRoute } from "../useHashRoute";

interface UseWorkspaceLifecycleOptions {
  workspace: DrawingWorkspaceRecord | null;
  setWorkspace: Dispatch<SetStateAction<DrawingWorkspaceRecord | null>>;
  activeRootDrawing: DrawingSummary | null;
  activeLatestDrawing: DrawingSummary | null;
  canDeleteWorkspace: boolean;
  loadWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  refreshDrawings: () => Promise<void>;
  setWorkspaceArchived: (workspaceId: string, archived: boolean) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  onNavigate: (route: PortalRoute, query?: Record<string, string>) => void;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setNoticeMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseWorkspaceLifecycleResult {
  isSavingStage: boolean;
  isDeletingWorkspace: boolean;
  isAddingRevision: boolean;
  isEditingDetails: boolean;
  editWorkspaceName: string;
  editWorkspaceNotes: string;
  editWorkspaceOwnerUserId: string | null;
  isSavingDetails: boolean;
  setEditWorkspaceName: Dispatch<SetStateAction<string>>;
  setEditWorkspaceNotes: Dispatch<SetStateAction<string>>;
  setEditWorkspaceOwnerUserId: Dispatch<SetStateAction<string | null>>;
  handleArchiveToggle: () => Promise<void>;
  handleDeleteWorkspace: () => Promise<void>;
  handleCreateRevision: () => Promise<void>;
  handleOpenEditDetails: () => void;
  handleCloseEditDetails: () => void;
  handleSaveWorkspaceDetails: () => Promise<void>;
}

export function useWorkspaceLifecycle({
  workspace,
  setWorkspace,
  activeRootDrawing,
  activeLatestDrawing,
  canDeleteWorkspace,
  loadWorkspace,
  refreshWorkspaces,
  refreshDrawings,
  setWorkspaceArchived,
  deleteWorkspace,
  onNavigate,
  setErrorMessage,
  setNoticeMessage,
}: UseWorkspaceLifecycleOptions): UseWorkspaceLifecycleResult {
  const [isSavingStage, setIsSavingStage] = useState(false);
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const [isAddingRevision, setIsAddingRevision] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editWorkspaceName, setEditWorkspaceName] = useState("");
  const [editWorkspaceNotes, setEditWorkspaceNotes] = useState("");
  const [editWorkspaceOwnerUserId, setEditWorkspaceOwnerUserId] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const handleArchiveToggle = useCallback(async () => {
    if (!workspace) {
      return;
    }

    setIsSavingStage(true);
    setErrorMessage(null);
    try {
      const updated = await setWorkspaceArchived(workspace.id, !workspace.isArchived);
      if (updated) {
        if (workspace.isArchived) {
          await loadWorkspace(workspace.id);
          return;
        }
        onNavigate("customer", { customerId: workspace.customerId });
        return;
      }
      setErrorMessage(
        workspace.isArchived
          ? "This workspace could not be restored right now."
          : "This workspace could not be archived right now.",
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingStage(false);
    }
  }, [loadWorkspace, onNavigate, setErrorMessage, setWorkspaceArchived, workspace]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (!workspace || !workspace.isArchived || !canDeleteWorkspace) {
      return;
    }
    if (
      !window.confirm(
        `Delete workspace "${activeRootDrawing?.name ?? workspace.name}" permanently?`,
      )
    ) {
      return;
    }

    setIsDeletingWorkspace(true);
    setErrorMessage(null);
    try {
      const deleted = await deleteWorkspace(workspace.id);
      if (deleted) {
        onNavigate("customer", { customerId: workspace.customerId });
        return;
      }
      setErrorMessage("This workspace could not be deleted right now.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsDeletingWorkspace(false);
    }
  }, [
    activeRootDrawing?.name,
    canDeleteWorkspace,
    deleteWorkspace,
    onNavigate,
    setErrorMessage,
    workspace,
  ]);

  const handleCreateRevision = useCallback(async () => {
    if (!workspace || !activeLatestDrawing) {
      return;
    }

    setIsAddingRevision(true);
    setErrorMessage(null);
    try {
      const drawing = await createDrawingWorkspaceDrawing(workspace.id, {
        sourceDrawingId: activeLatestDrawing.id,
      });
      await Promise.all([loadWorkspace(workspace.id), refreshWorkspaces(), refreshDrawings()]);
      onNavigate(
        "drawing",
        buildDrawingWorkspaceQuery({
          workspaceId: workspace.id,
          drawingId: drawing.id,
        }),
      );
      setNoticeMessage("Revision created. Open it in the editor when you're ready.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsAddingRevision(false);
    }
  }, [
    activeLatestDrawing,
    loadWorkspace,
    onNavigate,
    refreshDrawings,
    refreshWorkspaces,
    setErrorMessage,
    setNoticeMessage,
    workspace,
  ]);

  const handleOpenEditDetails = useCallback(() => {
    if (!workspace) {
      return;
    }

    setEditWorkspaceName(activeRootDrawing?.name ?? workspace.name);
    setEditWorkspaceNotes(workspace.notes);
    setEditWorkspaceOwnerUserId(workspace.ownerUserId);
    setIsEditingDetails(true);
  }, [activeRootDrawing?.name, workspace]);

  const handleCloseEditDetails = useCallback(() => {
    setIsEditingDetails(false);
  }, []);

  const handleSaveWorkspaceDetails = useCallback(async () => {
    if (!workspace) {
      return;
    }

    const trimmedName = editWorkspaceName.trim();
    const currentWorkspaceName = activeRootDrawing?.name ?? workspace.name;
    const nameChanged = trimmedName !== currentWorkspaceName;
    const detailsChanged =
      editWorkspaceNotes !== workspace.notes ||
      editWorkspaceOwnerUserId !== workspace.ownerUserId;

    if (!trimmedName) {
      setErrorMessage("Drawing name is required.");
      return;
    }

    setIsSavingDetails(true);
    setErrorMessage(null);
    try {
      if (!nameChanged && !detailsChanged) {
        setIsEditingDetails(false);
        return;
      }
      if (nameChanged) {
        if (!activeRootDrawing) {
          setErrorMessage("This workspace has no drawing to rename.");
          return;
        }
        await updateDrawing(activeRootDrawing.id, {
          expectedVersionNumber: activeRootDrawing.versionNumber,
          name: trimmedName,
        });
      }
      if (detailsChanged) {
        const updated = await updateDrawingWorkspace(workspace.id, {
          ...(editWorkspaceNotes !== workspace.notes ? { notes: editWorkspaceNotes } : {}),
          ...(editWorkspaceOwnerUserId !== workspace.ownerUserId
            ? { ownerUserId: editWorkspaceOwnerUserId }
            : {}),
        });
        setWorkspace(updated);
      }
      await Promise.all([loadWorkspace(workspace.id), refreshWorkspaces(), refreshDrawings()]);
      setIsEditingDetails(false);
      setNoticeMessage(
        nameChanged
          ? "Drawing name updated across the workspace."
          : "Drawing workspace details updated.",
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSavingDetails(false);
    }
  }, [
    activeRootDrawing,
    editWorkspaceName,
    editWorkspaceNotes,
    editWorkspaceOwnerUserId,
    loadWorkspace,
    refreshDrawings,
    refreshWorkspaces,
    setErrorMessage,
    setNoticeMessage,
    setWorkspace,
    workspace,
  ]);

  return {
    isSavingStage,
    isDeletingWorkspace,
    isAddingRevision,
    isEditingDetails,
    editWorkspaceName,
    editWorkspaceNotes,
    editWorkspaceOwnerUserId,
    isSavingDetails,
    setEditWorkspaceName,
    setEditWorkspaceNotes,
    setEditWorkspaceOwnerUserId,
    handleArchiveToggle,
    handleDeleteWorkspace,
    handleCreateRevision,
    handleOpenEditDetails,
    handleCloseEditDetails,
    handleSaveWorkspaceDetails,
  };
}

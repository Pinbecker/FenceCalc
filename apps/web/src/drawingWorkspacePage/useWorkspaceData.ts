import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  DrawingSummary,
  DrawingTaskRecord,
  DrawingWorkspaceRecord,
  QuoteRecord,
} from "@fence-estimator/contracts";

import {
  getDrawing,
  getDrawingWorkspace,
  listDrawingWorkspaceDrawings,
  listDrawingWorkspaceQuotes,
  listDrawingWorkspaceTasks,
} from "../apiClient";
import { resolveDrawingWorkspaceLoadTarget } from "../drawingWorkspace";

interface UseWorkspaceDataOptions {
  workspaceId: string | null;
  routedDrawingId: string | null;
  query: Record<string, string> | undefined;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
}

interface WorkspaceDataState {
  workspace: DrawingWorkspaceRecord | null;
  drawings: DrawingSummary[];
  tasks: DrawingTaskRecord[];
  quotes: QuoteRecord[];
}

export interface UseWorkspaceDataResult {
  workspace: DrawingWorkspaceRecord | null;
  setWorkspace: Dispatch<SetStateAction<DrawingWorkspaceRecord | null>>;
  drawings: DrawingSummary[];
  tasks: DrawingTaskRecord[];
  setTasks: Dispatch<SetStateAction<DrawingTaskRecord[]>>;
  quotes: QuoteRecord[];
  setQuotes: Dispatch<SetStateAction<QuoteRecord[]>>;
  isLoading: boolean;
  loadWorkspace: (targetId: string) => Promise<void>;
}

const EMPTY_WORKSPACE_DATA: WorkspaceDataState = {
  workspace: null,
  drawings: [],
  tasks: [],
  quotes: [],
};

export function useWorkspaceData({
  workspaceId,
  routedDrawingId,
  query,
  setErrorMessage,
}: UseWorkspaceDataOptions): UseWorkspaceDataResult {
  const [workspaceData, setWorkspaceData] = useState<WorkspaceDataState>(EMPTY_WORKSPACE_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const loadWorkspace = useCallback(
    async (targetId: string) => {
      setIsLoading(true);
      try {
        const targetDrawing = routedDrawingId ? await getDrawing(routedDrawingId) : null;
        const { workspaceLookupId } = resolveDrawingWorkspaceLoadTarget({
          targetId,
          requestedDrawingId: routedDrawingId,
          query,
          resolvedDrawingWorkspaceId: targetDrawing?.workspaceId ?? null,
        });

        if (!workspaceLookupId) {
          throw new Error("Drawing is not linked to a workspace.");
        }

        const [workspace, drawings, tasks, quotes] = await Promise.all([
          getDrawingWorkspace(workspaceLookupId),
          listDrawingWorkspaceDrawings(workspaceLookupId),
          listDrawingWorkspaceTasks(workspaceLookupId),
          listDrawingWorkspaceQuotes(workspaceLookupId),
        ]);

        setWorkspaceData({
          workspace,
          drawings: [...drawings].sort((left, right) => {
            if (left.id === workspace.primaryDrawingId) {
              return -1;
            }
            if (right.id === workspace.primaryDrawingId) {
              return 1;
            }
            return right.updatedAtIso.localeCompare(left.updatedAtIso);
          }),
          tasks,
          quotes,
        });
        setErrorMessage(null);
      } catch (error) {
        setWorkspaceData(EMPTY_WORKSPACE_DATA);
        setErrorMessage((error as Error).message);
      } finally {
        setIsLoading(false);
      }
    },
    [query, routedDrawingId, setErrorMessage],
  );

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceData(EMPTY_WORKSPACE_DATA);
      setIsLoading(false);
      return;
    }
    void loadWorkspace(workspaceId);
  }, [loadWorkspace, workspaceId]);

  const setWorkspace = useCallback<Dispatch<SetStateAction<DrawingWorkspaceRecord | null>>>(
    (value) => {
      setWorkspaceData((current) => ({
        ...current,
        workspace: typeof value === "function" ? value(current.workspace) : value,
      }));
    },
    [],
  );

  const setTasks = useCallback<Dispatch<SetStateAction<DrawingTaskRecord[]>>>((value) => {
    setWorkspaceData((current) => ({
      ...current,
      tasks: typeof value === "function" ? value(current.tasks) : value,
    }));
  }, []);

  const setQuotes = useCallback<Dispatch<SetStateAction<QuoteRecord[]>>>((value) => {
    setWorkspaceData((current) => ({
      ...current,
      quotes: typeof value === "function" ? value(current.quotes) : value,
    }));
  }, []);

  return {
    workspace: workspaceData.workspace,
    setWorkspace,
    drawings: workspaceData.drawings,
    tasks: workspaceData.tasks,
    setTasks,
    quotes: workspaceData.quotes,
    setQuotes,
    isLoading,
    loadWorkspace,
  };
}

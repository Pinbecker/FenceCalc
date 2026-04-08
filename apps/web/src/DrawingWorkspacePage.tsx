import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AuthSessionEnvelope,
  type CompanyUserRecord,
  type CustomerSummary,
} from "@fence-estimator/contracts";

import { buildDrawingWorkspaceQuery, countDrawingRevisions } from "./drawingWorkspace";
import type { PortalRoute } from "./useHashRoute";
import { WorkspaceEditDetailsModal } from "./drawingWorkspacePage/WorkspaceEditDetailsModal";
import { WorkspaceEstimatePanel } from "./drawingWorkspacePage/WorkspaceEstimatePanel";
import { WorkspaceHeader } from "./drawingWorkspacePage/WorkspaceHeader";
import { WorkspaceRevisionsPanel } from "./drawingWorkspacePage/WorkspaceRevisionsPanel";
import { WorkspaceTasksPanel } from "./drawingWorkspacePage/WorkspaceTasksPanel";
import {
  buildLatestQuoteByDrawingId,
  resolveActiveDrawing,
  resolveActiveDrawingContext,
} from "./drawingWorkspacePage/selectors";
import {
  DRAWING_STATUS_LABELS,
  formatTimestamp,
} from "./drawingWorkspacePage/shared";
import { useWorkspaceData } from "./drawingWorkspacePage/useWorkspaceData";
import { useWorkspaceEstimate } from "./drawingWorkspacePage/useWorkspaceEstimate";
import { useWorkspaceLifecycle } from "./drawingWorkspacePage/useWorkspaceLifecycle";
import { useWorkspaceTasks } from "./drawingWorkspacePage/useWorkspaceTasks";

interface DrawingWorkspacePageProps {
  session: AuthSessionEnvelope;
  query?: Record<string, string>;
  customers: CustomerSummary[];
  users: CompanyUserRecord[];
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
  onRefreshWorkspaces(this: void): Promise<void>;
  onRefreshDrawings(this: void): Promise<void>;
  onSetWorkspaceArchived(this: void, workspaceId: string, archived: boolean): Promise<boolean>;
  onDeleteWorkspace(this: void, workspaceId: string): Promise<boolean>;
}

export function DrawingWorkspacePage({
  session,
  query,
  customers,
  users,
  onNavigate,
  onRefreshWorkspaces,
  onRefreshDrawings,
  onSetWorkspaceArchived,
  onDeleteWorkspace,
}: DrawingWorkspacePageProps) {
  const refreshWorkspaces = onRefreshWorkspaces;
  const setWorkspaceArchived = onSetWorkspaceArchived;
  const workspaceId = query?.workspaceId ?? query?.drawingId ?? query?.estimateDrawingId ?? null;
  const requestedDrawingId = query?.drawingId ?? null;
  const requestedEstimateDrawingId = query?.estimateDrawingId ?? null;
  const routedDrawingId = requestedEstimateDrawingId ?? requestedDrawingId;
  const focusTaskId = query?.focusTaskId ?? null;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const {
    workspace,
    setWorkspace,
    drawings,
    tasks,
    setTasks,
    quotes,
    setQuotes,
    isLoading,
    loadWorkspace,
  } = useWorkspaceData({
    workspaceId,
    routedDrawingId,
    query,
    setErrorMessage,
  });

  useEffect(() => {
    if (!noticeMessage) return;
    const timer = globalThis.setTimeout(() => setNoticeMessage(null), 4000);
    return () => globalThis.clearTimeout(timer);
  }, [noticeMessage]);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === workspace?.customerId) ?? null,
    [customers, workspace?.customerId],
  );
  const canDeleteWorkspace = session.user.role === "OWNER" || session.user.role === "ADMIN";
  const activeDrawing = useMemo(
    () => resolveActiveDrawing(drawings, routedDrawingId, workspace?.primaryDrawingId),
    [drawings, routedDrawingId, workspace?.primaryDrawingId],
  );
  const isEstimateVisible =
    requestedEstimateDrawingId !== null && activeDrawing?.id === requestedEstimateDrawingId;
  const { activeRootDrawing, activeDrawingChain, activeLatestDrawing } = useMemo(
    () => resolveActiveDrawingContext(drawings, activeDrawing, workspace?.primaryDrawingId),
    [activeDrawing, drawings, workspace?.primaryDrawingId],
  );
  const latestQuoteByDrawingId = useMemo(
    () => buildLatestQuoteByDrawingId(quotes),
    [quotes],
  );
  const taskState = useWorkspaceTasks({
    workspace,
    tasks,
    setTasks,
    activeDrawingChain,
    activeRootDrawing,
    activeDrawing,
    activeLatestDrawing,
    focusTaskId,
    sessionUserId: session.user.id,
    refreshWorkspaces,
    loadWorkspace,
    setErrorMessage,
    setNoticeMessage,
  });
  const estimateState = useWorkspaceEstimate({
    workspace,
    setWorkspace,
    activeDrawing,
    activeRootDrawing,
    customerName: customer?.name ?? workspace?.customerName ?? "",
    isEstimateVisible,
    session,
    users,
    refreshWorkspaces,
    setQuotes,
    setErrorMessage,
    setNoticeMessage,
  });
  const lifecycleState = useWorkspaceLifecycle({
    workspace,
    setWorkspace,
    activeRootDrawing,
    activeLatestDrawing,
    canDeleteWorkspace,
    loadWorkspace,
    refreshWorkspaces,
    refreshDrawings: onRefreshDrawings,
    setWorkspaceArchived,
    deleteWorkspace: onDeleteWorkspace,
    onNavigate,
    setErrorMessage,
    setNoticeMessage,
  });

  const navigateToWorkspace = useCallback(
    (options?: {
      drawingId?: string | null;
      estimateDrawingId?: string | null;
      focusTaskId?: string | null;
    }) => {
      const targetDrawingId =
        options?.drawingId ?? activeDrawing?.id ?? requestedDrawingId ?? requestedEstimateDrawingId ?? null;
      const fallbackWorkspaceId = workspace?.id ?? query?.workspaceId ?? null;
      if (!targetDrawingId && !fallbackWorkspaceId) {
        return;
      }
      onNavigate(
        "drawing",
        buildDrawingWorkspaceQuery({
          workspaceId: fallbackWorkspaceId,
          drawingId: targetDrawingId,
          estimateDrawingId: options?.estimateDrawingId ?? null,
          focusTaskId: options?.focusTaskId ?? focusTaskId,
        }),
      );
    },
    [
      activeDrawing?.id,
      focusTaskId,
      workspace?.id,
      onNavigate,
      query?.workspaceId,
      requestedDrawingId,
      requestedEstimateDrawingId,
    ],
  );

  const openDrawingEstimate = useCallback(
    (drawingId: string | null | undefined) => {
      if (!drawingId) {
        return;
      }
      navigateToWorkspace({ drawingId, estimateDrawingId: drawingId });
    },
    [navigateToWorkspace],
  );

  const closeDrawingEstimate = useCallback(() => {
    navigateToWorkspace({ estimateDrawingId: null });
  }, [navigateToWorkspace]);

  const backToCustomer = useCallback(() => {
    if (!workspace?.customerId) {
      return;
    }
    onNavigate("customer", { customerId: workspace.customerId });
  }, [onNavigate, workspace?.customerId]);

  const openDrawingInEditor = useCallback(
    (drawingId: string | null | undefined) => {
      if (!drawingId) {
        return;
      }
      onNavigate("editor", { drawingId });
    },
    [onNavigate],
  );

  useEffect(() => {
    if (!workspaceId || !activeDrawing?.id) {
      return;
    }

    onNavigate(
      "drawing",
      buildDrawingWorkspaceQuery({
        workspaceId: workspace?.id ?? query?.workspaceId ?? workspaceId,
        drawingId: activeDrawing.id,
        estimateDrawingId: isEstimateVisible ? activeDrawing.id : null,
        focusTaskId,
      }),
    );
  }, [
    activeDrawing?.id,
    focusTaskId,
    isEstimateVisible,
    workspace?.id,
    onNavigate,
    query?.workspaceId,
    workspaceId,
  ]);

  if (!workspaceId) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>No drawing workspace selected</h1>
          <p>
            Open a customer workspace to review revisions, tasks, and estimates.
          </p>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => onNavigate("customers")}
          >
            Browse customers
          </button>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h2>Loading drawing workspace...</h2>
        </div>
      </section>
    );
  }

  if (!workspace) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>Drawing workspace not found</h1>
          <p>The drawing workspace could not be loaded.</p>
          <button
            type="button"
            className="portal-secondary-button portal-compact-button"
            onClick={() => onNavigate("customers")}
          >
            Back to customers
          </button>
        </div>
      </section>
    );
  }

  const taskPanel = (
    <WorkspaceTasksPanel
      drawings={activeDrawingChain}
      users={users}
      sessionUserId={session.user.id}
      taskTitle={taskState.taskTitle}
      taskDueDate={taskState.taskDueDate}
      taskAssignee={taskState.taskAssignee}
      taskDrawingId={taskState.taskDrawingId}
      taskDescription={taskState.taskDescription}
      taskPriority={taskState.taskPriority}
      preferredTaskDrawingId={taskState.preferredTaskDrawingId}
      isTaskFormExpanded={taskState.isTaskFormExpanded}
      isSavingTask={taskState.isSavingTask}
      sortedTasks={taskState.sortedTasks}
      expandedTaskId={taskState.expandedTaskId}
      taskDrafts={taskState.taskDrafts}
      savingTaskId={taskState.savingTaskId}
      onTaskTitleChange={taskState.setTaskTitle}
      onTaskDueDateChange={taskState.setTaskDueDate}
      onTaskAssigneeChange={taskState.setTaskAssignee}
      onTaskDrawingChange={taskState.setTaskDrawingId}
      onTaskDescriptionChange={taskState.setTaskDescription}
      onTaskPriorityChange={taskState.setTaskPriority}
      onToggleTaskForm={() => taskState.setIsTaskFormExpanded((current) => !current)}
      onShowTaskForm={taskState.handleShowTaskForm}
      onCreateTask={() => void taskState.handleCreateTask()}
      onExpandTask={taskState.handleExpandTask}
      onTaskDraftChange={taskState.handleTaskDraftChange}
      onResetTaskDraft={taskState.handleResetTaskDraft}
      onSaveTaskDraft={(task) => void taskState.handleSaveTaskDraft(task)}
      onDeleteTask={(task) => void taskState.handleDeleteTask(task)}
      onToggleTask={(task) => void taskState.handleToggleTask(task)}
    />
  );

  return (
    <section className="portal-page portal-customer-page portal-job-page">
      <WorkspaceHeader
        workspace={workspace}
        workspaceTitle={activeRootDrawing?.name ?? workspace.name}
        customerSiteAddress={customer?.siteAddress ?? null}
        activeStatusLabel={
          activeLatestDrawing
            ? DRAWING_STATUS_LABELS[activeLatestDrawing.status]
            : workspace.stage.replaceAll("_", " ")
        }
        revisionCount={countDrawingRevisions(activeDrawingChain)}
        openTaskCount={taskState.openTaskCount}
        lastActivityLabel={formatTimestamp(activeLatestDrawing?.updatedAtIso ?? workspace.updatedAtIso)}
        canDeleteWorkspace={canDeleteWorkspace}
        canCreateRevision={Boolean(activeLatestDrawing)}
        isAddingRevision={lifecycleState.isAddingRevision}
        isSavingStage={lifecycleState.isSavingStage}
        isDeletingWorkspace={lifecycleState.isDeletingWorkspace}
        onBackToCustomer={backToCustomer}
        onCreateRevision={() => void lifecycleState.handleCreateRevision()}
        onOpenEditDetails={lifecycleState.handleOpenEditDetails}
        onToggleArchive={() => void lifecycleState.handleArchiveToggle()}
        onDeleteWorkspace={() => void lifecycleState.handleDeleteWorkspace()}
      />

      {errorMessage ? (
        <div className="portal-inline-message portal-inline-error">{errorMessage}</div>
      ) : null}
      {noticeMessage ? (
        <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div>
      ) : null}
      {workspace.isArchived ? (
        <div className="portal-inline-message portal-inline-notice">
          This workspace is archived. Restore it to resume work, or delete it permanently if it is no longer needed.
        </div>
      ) : null}

      <div className="portal-job-overview-stack">
        {taskPanel}

        {workspace.notes ? (
          <section className="portal-surface-card portal-dashboard-activity">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Workspace notes</span>
              </div>
            </div>
            <p
              className="portal-empty-copy portal-job-notes-copy"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {workspace.notes}
            </p>
          </section>
        ) : null}

        <div className="portal-job-overview-secondary">
          <WorkspaceRevisionsPanel
            drawings={activeDrawingChain}
            activeDrawing={activeDrawing}
            activeLatestDrawing={activeLatestDrawing}
            isEstimateVisible={isEstimateVisible}
            latestQuoteByDrawingId={latestQuoteByDrawingId}
            isAddingRevision={lifecycleState.isAddingRevision}
            onCreateRevision={() => void lifecycleState.handleCreateRevision()}
            onOpenDrawingInEditor={openDrawingInEditor}
            onOpenDrawingEstimate={openDrawingEstimate}
            onCloseDrawingEstimate={closeDrawingEstimate}
            onOpenSavedQuotePdf={estimateState.handleOpenSavedQuotePdf}
          />
        </div>
      </div>

      {isEstimateVisible && activeDrawing ? (
        <WorkspaceEstimatePanel
          customerName={workspace.customerName}
          activeDrawing={activeDrawing}
          isLoadingEstimate={estimateState.isLoadingEstimate}
          isSavingControls={estimateState.isSavingControls}
          isSavingQuote={estimateState.isSavingQuote}
          pricedEstimate={estimateState.pricedEstimate}
          workbook={estimateState.workbook}
          ancillaryItems={estimateState.ancillaryItems}
          materialSections={estimateState.materialSections}
          labourSections={estimateState.labourSections}
          externalCornersEnabled={estimateState.externalCornersEnabled}
          onCloseEstimate={closeDrawingEstimate}
          onGenerateQuotePdf={() => void estimateState.handleGenerateQuotePdf()}
          onAddAncillaryItem={estimateState.handleAddAncillaryItem}
          onUpdateAncillaryItem={estimateState.handleUpdateAncillaryItem}
          onRemoveAncillaryItem={estimateState.handleRemoveAncillaryItem}
          onManualEntryChange={estimateState.handleManualEntryChange}
          onExternalCornersEnabledChange={(enabled) =>
            void estimateState.handleExternalCornersEnabledChange(enabled)
          }
        />
      ) : null}

      <WorkspaceEditDetailsModal
        isOpen={lifecycleState.isEditingDetails}
        users={users}
        workspaceName={lifecycleState.editWorkspaceName}
        workspaceNotes={lifecycleState.editWorkspaceNotes}
        workspaceOwnerUserId={lifecycleState.editWorkspaceOwnerUserId}
        isSaving={lifecycleState.isSavingDetails}
        onClose={lifecycleState.handleCloseEditDetails}
        onWorkspaceNameChange={lifecycleState.setEditWorkspaceName}
        onWorkspaceNotesChange={lifecycleState.setEditWorkspaceNotes}
        onWorkspaceOwnerUserIdChange={lifecycleState.setEditWorkspaceOwnerUserId}
        onSave={() => void lifecycleState.handleSaveWorkspaceDetails()}
      />
    </section>
  );
}


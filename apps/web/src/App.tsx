import { Suspense, lazy, useEffect } from "react";

import { ErrorBoundary } from "./ErrorBoundary";
import { useHashRoute, type PortalRoute } from "./useHashRoute";
import { usePortalSession } from "./usePortalSession";

const AdminPage = lazy(async () => {
  const module = await import("./AdminPage");
  return { default: module.AdminPage };
});

const DashboardPage = lazy(async () => {
  const module = await import("./DashboardPage");
  return { default: module.DashboardPage };
});

const CustomersPage = lazy(async () => {
  const module = await import("./CustomersPage");
  return { default: module.CustomersPage };
});

const TasksPage = lazy(async () => {
  const module = await import("./TasksPage");
  return { default: module.TasksPage };
});

const CustomerPage = lazy(async () => {
  const module = await import("./CustomerPage");
  return { default: module.CustomerPage };
});

const DrawingWorkspacePage = lazy(async () => {
  const module = await import("./DrawingWorkspacePage");
  return { default: module.DrawingWorkspacePage };
});

const EditorPage = lazy(async () => {
  const module = await import("./EditorPage");
  return { default: module.EditorPage };
});

const LoginPage = lazy(async () => {
  const module = await import("./LoginPage");
  return { default: module.LoginPage };
});

const PricingPage = lazy(async () => {
  const module = await import("./PricingPage");
  return { default: module.PricingPage };
});

function formatRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function PortalNav(props: {
  companyName: string;
  userName: string;
  userRole: string;
  currentRoute: string;
  onNavigate: (route: "dashboard" | "tasks" | "customers" | "pricing" | "admin") => void;
  onLogout: () => void;
  showAdmin: boolean;
  showPricing: boolean;
}) {
  return (
    <header className="portal-topbar">
      <div className="portal-topbar-main">
        <div className="portal-brand-block">
          <span className="portal-logo">FE</span>
          <div className="portal-brand-copy">
            <strong>{props.companyName}</strong>
            <span>{props.userName}</span>
          </div>
        </div>
        <nav className="portal-nav-links" aria-label="Primary">
          <button
            type="button"
            className={props.currentRoute === "dashboard" ? "is-active" : undefined}
            onClick={() => props.onNavigate("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={props.currentRoute === "tasks" ? "is-active" : undefined}
            onClick={() => props.onNavigate("tasks")}
          >
            Tasks
          </button>
          <button
            type="button"
            className={
              props.currentRoute === "customers" ||
              props.currentRoute === "customer" ||
              props.currentRoute === "job" ||
              props.currentRoute === "drawing"
                ? "is-active"
                : undefined
            }
            onClick={() => props.onNavigate("customers")}
          >
            Customers
          </button>
          {props.showPricing ? (
            <button
              type="button"
              className={props.currentRoute === "pricing" ? "is-active" : undefined}
              onClick={() => props.onNavigate("pricing")}
            >
              Pricing
            </button>
          ) : null}
          {props.showAdmin ? (
            <button
              type="button"
              className={props.currentRoute === "admin" ? "is-active" : undefined}
              onClick={() => props.onNavigate("admin")}
            >
              Admin
            </button>
          ) : null}
        </nav>
      </div>
      <div className="portal-topbar-actions">
        <span className="portal-user-chip">{formatRoleLabel(props.userRole)}</span>
        <button type="button" className="portal-logout-button" onClick={props.onLogout}>
          Log Out
        </button>
      </div>
    </header>
  );
}

function PortalLoadingCard(props: { label: string }) {
  return (
    <div className="portal-loading-screen">
      <div className="portal-loading-card">
        <strong>{props.label}</strong>
      </div>
    </div>
  );
}

export function canManageAdmin(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManagePricing(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function getPortalRedirectTarget(input: {
  hasSession: boolean;
  route: string;
  showAdmin: boolean;
  showPricing: boolean;
}): "login" | "dashboard" | null {
  if (!input.hasSession && input.route !== "login") {
    return "login";
  }

  if (input.hasSession && input.route === "login") {
    return "dashboard";
  }

  if (input.hasSession && input.route === "pricing" && !input.showPricing) {
    return "dashboard";
  }

  if (input.hasSession && input.route === "admin" && !input.showAdmin) {
    return "dashboard";
  }

  return null;
}

export function shouldRefreshPortalDrawings(route: string): boolean {
  return (
    route === "dashboard" ||
    route === "tasks" ||
    route === "customers" ||
    route === "customer" ||
    route === "drawing" ||
    route === "editor"
  );
}

export function shouldRefreshPortalAdminData(route: string, showAdmin: boolean): boolean {
  return showAdmin && (route === "admin" || route === "dashboard" || route === "tasks");
}

function getLegacyRouteRedirect(
  route: PortalRoute,
  query: Record<string, string>,
): { route: PortalRoute; query?: Record<string, string> } | null {
  if (route === "drawings") {
    return { route: "customers" };
  }

  if (route === "job") {
    return {
      route: "drawing",
      query: {
        ...query,
        ...(query.jobId && !query.workspaceId ? { workspaceId: query.jobId } : {}),
      },
    };
  }

  if (route === "estimate") {
    if (!query.drawingId && !query.jobId && !query.workspaceId) {
      return { route: "customers" };
    }

    return {
      route: "drawing",
      query: {
        ...(query.jobId && !query.workspaceId ? { workspaceId: query.jobId } : {}),
        ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
        ...(query.drawingId ? { drawingId: query.drawingId } : {}),
        ...(query.drawingId ? { estimateDrawingId: query.drawingId } : {}),
        ...(query.focusTaskId ? { focusTaskId: query.focusTaskId } : {}),
      },
    };
  }

  if (route === "drawing" && (query.jobId || query.tab)) {
    const workspaceId = query.workspaceId ?? query.jobId ?? undefined;
    const estimateDrawingId =
      query.estimateDrawingId ?? (query.tab === "estimate" ? query.drawingId : undefined);

    return {
      route: "drawing",
      query: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(query.drawingId ? { drawingId: query.drawingId } : {}),
        ...(estimateDrawingId ? { estimateDrawingId } : {}),
        ...(query.focusTaskId ? { focusTaskId: query.focusTaskId } : {}),
      },
    };
  }

  return null;
}

export function App() {
  const { route, query, navigate } = useHashRoute();
  const portal = usePortalSession();
  const showAdmin = canManageAdmin(portal.session?.user.role);
  const showPricing = canManagePricing(portal.session?.user.role);

  useEffect(() => {
    if (portal.isRestoringSession) {
      return;
    }

    const redirectTarget = getPortalRedirectTarget({
      hasSession: Boolean(portal.session),
      route,
      showAdmin,
      showPricing,
    });
    if (redirectTarget) {
      navigate(redirectTarget);
    }
  }, [navigate, portal.isRestoringSession, portal.session, route, showAdmin, showPricing]);

  useEffect(() => {
    if (portal.isRestoringSession) {
      return;
    }

    const redirect = getLegacyRouteRedirect(route, query);
    if (redirect) {
      navigate(redirect.route, redirect.query);
    }
  }, [navigate, portal.isRestoringSession, query, route]);

  useEffect(() => {
    if (!portal.session) {
      return;
    }

    if (shouldRefreshPortalDrawings(route)) {
      void portal.refreshCustomers();
      void portal.refreshDrawings();
      void portal.refreshWorkspaces();
    }

    if (shouldRefreshPortalAdminData(route, showAdmin)) {
      void portal.refreshUsers();
      void portal.refreshAuditLog();
    }

    if (route === "tasks" || route === "drawing") {
      void portal.refreshUsers();
    }
  }, [
    portal.refreshAuditLog,
    portal.refreshDrawings,
    portal.refreshWorkspaces,
    portal.refreshUsers,
    portal.session,
    route,
    showAdmin,
  ]);

  if (portal.isRestoringSession) {
    return <PortalLoadingCard label="Loading workspace..." />;
  }

  if (!portal.session) {
    return (
      <Suspense fallback={<PortalLoadingCard label="Loading sign-in..." />}>
        <LoginPage
          bootstrapRequired={portal.setupStatus?.bootstrapRequired ?? false}
          bootstrapSecretRequired={portal.setupStatus?.bootstrapSecretRequired ?? false}
          isSubmitting={portal.isAuthenticating}
          errorMessage={portal.errorMessage}
          noticeMessage={portal.noticeMessage}
          onLogin={async (input): Promise<boolean> => {
            if (await portal.login(input)) {
              navigate("dashboard");
              return true;
            }
            return false;
          }}
          onBootstrap={async (input): Promise<boolean> => {
            if (await portal.bootstrapOwner(input)) {
              navigate("dashboard");
              return true;
            }
            return false;
          }}
        />
      </Suspense>
    );
  }

  if (route === "editor") {
    return (
      <Suspense fallback={<PortalLoadingCard label="Loading editor..." />}>
        <ErrorBoundary>
          <EditorPage initialDrawingId={query.drawingId ?? null} onNavigate={navigate} />
        </ErrorBoundary>
      </Suspense>
    );
  }

  return (
    <div className="portal-shell">
      <PortalNav
        companyName={portal.session.company.name}
        userName={portal.session.user.displayName}
        userRole={portal.session.user.role}
        currentRoute={route}
        showAdmin={showAdmin}
        showPricing={showPricing}
        onNavigate={navigate}
        onLogout={() => {
          void (async () => {
            await portal.logout();
            navigate("login");
          })();
        }}
      />
      <main className="portal-main">
        <Suspense fallback={<PortalLoadingCard label="Loading page..." />}>
          <ErrorBoundary>
            {route === "dashboard" ? (
              <DashboardPage
                session={portal.session}
                customers={portal.customers}
                workspaces={portal.workspaces}
                drawings={portal.drawings}
                onNavigate={navigate}
              />
            ) : null}
            {route === "tasks" ? (
              <TasksPage
                session={portal.session}
                users={portal.users}
                workspaces={portal.workspaces}
                onNavigate={navigate}
                onRefreshWorkspaces={portal.refreshWorkspaces}
              />
            ) : null}
            {route === "customers" ? (
              <CustomersPage
                customers={portal.customers}
                drawings={portal.drawings}
                isLoading={portal.isLoadingCustomers || portal.isLoadingDrawings}
                isSavingCustomer={portal.isSavingCustomer}
                onRefresh={async () => {
                  await Promise.all([portal.refreshCustomers(), portal.refreshDrawings()]);
                }}
                onSaveCustomer={portal.saveCustomer}
                onNavigate={navigate}
              />
            ) : null}
            {route === "customer" ? (
              <CustomerPage
                query={query}
                customers={portal.customers}
                workspaces={portal.workspaces}
                drawings={portal.drawings}
                userRole={portal.session.user.role}
                isSavingCustomer={portal.isSavingCustomer}
                isArchivingCustomerId={portal.isArchivingCustomerId}
                errorMessage={portal.errorMessage}
                noticeMessage={portal.noticeMessage}
                onSaveCustomer={portal.saveCustomer}
                onCreateDrawing={portal.createDrawing}
                onSetCustomerArchived={portal.setCustomerArchived}
                onSetWorkspaceArchived={portal.setWorkspaceArchived}
                onDeleteWorkspace={portal.deleteWorkspace}
                onDeleteCustomer={portal.deleteCustomer}
                onNavigate={navigate}
              />
            ) : null}
            {route === "drawing" ? (
              <DrawingWorkspacePage
                session={portal.session}
                query={query}
                customers={portal.customers}
                users={portal.users}
                onNavigate={navigate}
                onRefreshWorkspaces={portal.refreshWorkspaces}
                onRefreshDrawings={portal.refreshDrawings}
                onSetWorkspaceArchived={portal.setWorkspaceArchived}
                onDeleteWorkspace={portal.deleteWorkspace}
              />
            ) : null}
            {route === "pricing" && showPricing ? (
              <PricingPage session={portal.session} />
            ) : null}
            {route === "admin" && showAdmin ? (
              <AdminPage
                users={portal.users}
                auditLog={portal.auditLog}
                customers={portal.customers}
                workspaces={portal.workspaces}
                currentUserId={portal.session.user.id}
                currentUserRole={portal.session.user.role}
                isLoadingUsers={portal.isLoadingUsers}
                isLoadingAuditLog={portal.isLoadingAuditLog}
                isSavingUser={portal.isSavingUser}
                isResettingUserId={portal.isResettingUserId}
                isArchivingCustomerId={portal.isArchivingCustomerId}
                errorMessage={portal.errorMessage}
                noticeMessage={portal.noticeMessage}
                onRefresh={portal.refreshUsers}
                onRefreshAudit={portal.refreshAuditLog}
                onApplyAuditFilters={portal.refreshFilteredAuditLog}
                onExportAudit={portal.exportAuditLog}
                onCreateUser={portal.createUser}
                onResetUserPassword={portal.resetUserPassword}
                onRestoreCustomer={async (customerId) => {
                  await portal.setCustomerArchived(customerId, false, false);
                  void portal.refreshCustomers();
                }}
                onRestoreWorkspace={(workspaceId) => portal.setWorkspaceArchived(workspaceId, false)}
                onDeleteWorkspace={portal.deleteWorkspace}
              />
            ) : null}
          </ErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}

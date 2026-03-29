import { Suspense, lazy, useEffect, useRef } from "react";

import { CustomerPickerModal } from "./CustomerPickerModal";
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

const TasksPage = lazy(async () => {
  const module = await import("./TasksPage");
  return { default: module.TasksPage };
});

const CustomerPage = lazy(async () => {
  const module = await import("./CustomerPage");
  return { default: module.CustomerPage };
});

const JobPage = lazy(async () => {
  const module = await import("./JobPage");
  return { default: module.JobPage };
});

const DrawingPage = lazy(async () => {
  const module = await import("./DrawingPage");
  return { default: module.DrawingPage };
});

const EstimatePage = lazy(async () => {
  const module = await import("./EstimatePage");
  return { default: module.EstimatePage };
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

function isCustomerModalRoute(route: string): route is "customers" | "drawings" {
  return route === "customers" || route === "drawings";
}

function getCustomerModalBaseRoute(route: PortalRoute): PortalRoute {
  if (route === "login" || route === "customers" || route === "drawings") {
    return "dashboard";
  }
  return route;
}

function PortalNav(props: {
  companyName: string;
  userName: string;
  userRole: string;
  currentRoute: string;
  onNavigate: (route: "dashboard" | "tasks" | "customers" | "editor" | "estimate" | "pricing" | "admin") => void;
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
              props.currentRoute === "customers" || props.currentRoute === "drawings" || props.currentRoute === "customer" || props.currentRoute === "job"
                ? "is-active"
                : undefined
            }
            onClick={() => props.onNavigate("customers")}
          >
            Customers
          </button>
          <button
            type="button"
            className={props.currentRoute === "editor" ? "is-active" : undefined}
            onClick={() => props.onNavigate("editor")}
          >
            Editor
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
  return route === "dashboard" || route === "tasks" || route === "drawings" || route === "customers" || route === "customer" || route === "job" || route === "drawing" || route === "estimate" || route === "editor";
}

export function shouldRefreshPortalAdminData(route: string, showAdmin: boolean): boolean {
  return showAdmin && (route === "admin" || route === "dashboard" || route === "tasks");
}

export function App() {
  const { route, query, navigate } = useHashRoute();
  const portal = usePortalSession();
  const showAdmin = canManageAdmin(portal.session?.user.role);
  const showPricing = canManagePricing(portal.session?.user.role);
  const customerModalReturnRef = useRef<{ route: PortalRoute; query?: Record<string, string> }>({ route: "dashboard" });
  const isCustomerModalOpen = isCustomerModalRoute(route);
  const modalBaseRouteState: { route: PortalRoute; query?: Record<string, string> } = isCustomerModalOpen
    ? customerModalReturnRef.current
    : Object.keys(query).length > 0
      ? { route, query }
      : { route };
  const modalBaseRoute = isCustomerModalOpen ? getCustomerModalBaseRoute(modalBaseRouteState.route) : route;
  const modalBaseQuery = isCustomerModalOpen ? (modalBaseRouteState.query ?? {}) : query;

  useEffect(() => {
    if (isCustomerModalOpen || route === "login") {
      return;
    }
    customerModalReturnRef.current = Object.keys(query).length > 0 ? { route, query } : { route };
  }, [isCustomerModalOpen, query, route]);

  useEffect(() => {
    if (portal.isRestoringSession) {
      return;
    }

    const redirectTarget = getPortalRedirectTarget({
      hasSession: Boolean(portal.session),
      route,
      showAdmin,
      showPricing
    });
    if (redirectTarget) {
      navigate(redirectTarget);
    }
  }, [navigate, portal.isRestoringSession, portal.session, route, showAdmin, showPricing]);

  useEffect(() => {
    if (!portal.session) {
      return;
    }

    if (shouldRefreshPortalDrawings(route)) {
      void portal.refreshCustomers();
      void portal.refreshDrawings();
      void portal.refreshJobs();
    }

    if (shouldRefreshPortalAdminData(route, showAdmin)) {
      void portal.refreshUsers();
      void portal.refreshAuditLog();
    }

    if (route === "tasks" || route === "job") {
      void portal.refreshUsers();
    }
  }, [portal.refreshAuditLog, portal.refreshDrawings, portal.refreshJobs, portal.refreshUsers, portal.session, route, showAdmin]);

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

  const customerPickerModal = isCustomerModalOpen ? (
    <CustomerPickerModal
      customers={portal.customers}
      drawings={portal.drawings}
      isSavingCustomer={portal.isSavingCustomer}
      onClose={() => {
        const target = customerModalReturnRef.current;
        if (target.route !== "login" && !isCustomerModalRoute(target.route)) {
          navigate(target.route, target.query);
          return;
        }
        navigate("dashboard");
      }}
      onOpenCustomer={(customerId) => navigate("customer", { customerId })}
      onCreateCustomer={(customer) => portal.saveCustomer({ mode: "create", customer })}
    />
  ) : null;

  if (modalBaseRoute === "editor") {
    return (
      <>
        <Suspense fallback={<PortalLoadingCard label="Loading editor..." />}>
          <ErrorBoundary>
            <EditorPage initialDrawingId={modalBaseQuery.drawingId ?? null} onNavigate={navigate} />
          </ErrorBoundary>
        </Suspense>
        {customerPickerModal}
      </>
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
            {modalBaseRoute === "dashboard" ? (
              <DashboardPage session={portal.session} customers={portal.customers} jobs={portal.jobs} drawings={portal.drawings} onNavigate={navigate} />
            ) : null}
            {modalBaseRoute === "tasks" ? (
              <TasksPage session={portal.session} users={portal.users} onNavigate={navigate} onRefreshJobs={portal.refreshJobs} />
            ) : null}
            {modalBaseRoute === "customer" ? (
              <CustomerPage
                query={modalBaseQuery}
                customers={portal.customers}
                jobs={portal.jobs}
                drawings={portal.drawings}
                userRole={portal.session.user.role}
                isSavingCustomer={portal.isSavingCustomer}
                isArchivingCustomerId={portal.isArchivingCustomerId}
                errorMessage={portal.errorMessage}
                noticeMessage={portal.noticeMessage}
                onSaveCustomer={portal.saveCustomer}
                onCreateJob={portal.createJob}
                onSetCustomerArchived={portal.setCustomerArchived}
                onOpenJob={(jobId) => navigate("job", { jobId })}
                onOpenDrawing={(drawingId) => navigate("editor", { drawingId })}
                onOpenEstimate={(jobId, drawingId) => navigate("job", { jobId, tab: "estimate", ...(drawingId ? { drawingId } : {}) })}
                onDeleteCustomer={portal.deleteCustomer}
                onSetJobArchived={portal.setJobArchived}
                onDeleteJob={portal.deleteJob}
                onNavigate={navigate}
              />
            ) : null}
            {modalBaseRoute === "job" ? (
              <JobPage
                session={portal.session}
                query={modalBaseQuery}
                customers={portal.customers}
                users={portal.users}
                onNavigate={navigate}
                onRefreshJobs={portal.refreshJobs}
                onRefreshDrawings={portal.refreshDrawings}
                onToggleDrawingArchived={portal.setDrawingArchived}
                onDeleteJob={portal.deleteJob}
              />
            ) : null}
            {modalBaseRoute === "drawing" ? (
              <DrawingPage
                session={portal.session}
                query={modalBaseQuery}
                onNavigate={navigate}
                onRefreshJobs={portal.refreshJobs}
                onRefreshDrawings={portal.refreshDrawings}
              />
            ) : null}
            {modalBaseRoute === "estimate" ? (
              <EstimatePage session={portal.session} drawingId={modalBaseQuery.drawingId ?? null} onNavigate={navigate} />
            ) : null}
            {modalBaseRoute === "pricing" && showPricing ? <PricingPage session={portal.session} /> : null}
            {modalBaseRoute === "admin" && showAdmin ? (
              <AdminPage
                users={portal.users}
                auditLog={portal.auditLog}
                customers={portal.customers}
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
              />
            ) : null}
          </ErrorBoundary>
        </Suspense>
      </main>
      {customerPickerModal}
    </div>
  );
}

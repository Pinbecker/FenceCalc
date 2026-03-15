import { Suspense, lazy, useEffect } from "react";

import { useHashRoute } from "./useHashRoute";
import { usePortalSession } from "./usePortalSession";

const AdminPage = lazy(async () => {
  const module = await import("./AdminPage");
  return { default: module.AdminPage };
});

const DashboardPage = lazy(async () => {
  const module = await import("./DashboardPage");
  return { default: module.DashboardPage };
});

const DrawingsPage = lazy(async () => {
  const module = await import("./DrawingsPage");
  return { default: module.DrawingsPage };
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

function PortalNav(props: {
  companyName: string;
  userName: string;
  userRole: string;
  currentRoute: string;
  onNavigate: (route: "dashboard" | "drawings" | "editor" | "estimate" | "pricing" | "admin") => void;
  onLogout: () => void;
  showAdmin: boolean;
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
            className={props.currentRoute === "drawings" ? "is-active" : undefined}
            onClick={() => props.onNavigate("drawings")}
          >
            Drawings
          </button>
          <button
            type="button"
            className={props.currentRoute === "editor" ? "is-active" : undefined}
            onClick={() => props.onNavigate("editor")}
          >
            Editor
          </button>
          <button
            type="button"
            className={props.currentRoute === "pricing" ? "is-active" : undefined}
            onClick={() => props.onNavigate("pricing")}
          >
            Pricing
          </button>
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
        <span className="portal-user-chip">{props.userRole}</span>
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

export function App() {
  const { route, query, navigate } = useHashRoute();
  const portal = usePortalSession();
  const showAdmin = portal.session?.user.role === "OWNER" || portal.session?.user.role === "ADMIN";

  useEffect(() => {
    if (portal.isRestoringSession) {
      return;
    }

    if (!portal.session && route !== "login") {
      navigate("login");
      return;
    }

    if (portal.session && route === "login") {
      navigate("dashboard");
    }
  }, [navigate, portal.isRestoringSession, portal.session, route]);

  useEffect(() => {
    if (!portal.session) {
      return;
    }

    if (route === "dashboard" || route === "drawings" || route === "estimate") {
      void portal.refreshDrawings();
    }

    if ((route === "admin" || route === "dashboard") && showAdmin) {
      void portal.refreshUsers();
      void portal.refreshAuditLog();
    }
  }, [portal.refreshAuditLog, portal.refreshDrawings, portal.refreshUsers, portal.session, route, showAdmin]);

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
        <EditorPage initialDrawingId={query.drawingId ?? null} onNavigate={navigate} />
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
        onNavigate={navigate}
        onLogout={() => {
          portal.logout();
          navigate("login");
        }}
      />
      <main className="portal-main">
        <Suspense fallback={<PortalLoadingCard label="Loading page..." />}>
          {route === "dashboard" ? (
            <DashboardPage session={portal.session} drawings={portal.drawings} onNavigate={navigate} />
          ) : null}
          {route === "drawings" ? (
            <DrawingsPage
              session={portal.session}
              drawings={portal.drawings}
              isLoading={portal.isLoadingDrawings}
              onRefresh={portal.refreshDrawings}
              onOpenDrawing={(drawingId) => navigate("editor", { drawingId })}
              onOpenEstimate={(drawingId) => navigate("estimate", { drawingId })}
              onCreateDrawing={() => navigate("editor")}
              onToggleArchive={portal.setDrawingArchived}
              onLoadVersions={portal.loadDrawingVersions}
              onRestoreVersion={portal.restoreDrawingVersion}
            />
          ) : null}
          {route === "estimate" ? (
            <EstimatePage session={portal.session} drawingId={query.drawingId ?? null} onNavigate={navigate} />
          ) : null}
          {route === "pricing" ? <PricingPage session={portal.session} /> : null}
          {route === "admin" ? (
            <AdminPage
              users={portal.users}
              auditLog={portal.auditLog}
              currentUserId={portal.session.user.id}
              currentUserRole={portal.session.user.role}
              isLoadingUsers={portal.isLoadingUsers}
              isLoadingAuditLog={portal.isLoadingAuditLog}
              isSavingUser={portal.isSavingUser}
              isResettingUserId={portal.isResettingUserId}
              errorMessage={portal.errorMessage}
              noticeMessage={portal.noticeMessage}
              onRefresh={portal.refreshUsers}
              onRefreshAudit={portal.refreshAuditLog}
              onCreateUser={portal.createUser}
              onResetUserPassword={portal.resetUserPassword}
            />
          ) : null}
        </Suspense>
      </main>
    </div>
  );
}

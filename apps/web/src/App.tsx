import { useEffect } from "react";

import { AdminPage } from "./AdminPage";
import { DashboardPage } from "./DashboardPage";
import { DrawingsPage } from "./DrawingsPage";
import { EditorPage } from "./EditorPage";
import { LoginPage } from "./LoginPage";
import { useHashRoute } from "./useHashRoute";
import { usePortalSession } from "./usePortalSession";

function PortalNav(props: {
  companyName: string;
  userName: string;
  userRole: string;
  currentRoute: string;
  onNavigate: (route: "dashboard" | "drawings" | "editor" | "admin") => void;
  onLogout: () => void;
  showAdmin: boolean;
}) {
  return (
    <header className="portal-topbar">
      <div className="portal-brand-block">
        <span className="portal-logo">FE</span>
        <div>
          <strong>{props.companyName}</strong>
          <span>
            {props.userName} · {props.userRole}
          </span>
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
      <button type="button" className="portal-logout-button" onClick={props.onLogout}>
        Log Out
      </button>
    </header>
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

    if (route === "dashboard" || route === "drawings") {
      void portal.refreshDrawings();
    }

    if ((route === "admin" || route === "dashboard") && showAdmin) {
      void portal.refreshUsers();
      void portal.refreshAuditLog();
    }
  }, [portal.refreshAuditLog, portal.refreshDrawings, portal.refreshUsers, portal.session, route, showAdmin]);

  if (portal.isRestoringSession) {
    return (
      <div className="portal-loading-screen">
        <div className="portal-loading-card">
          <strong>Loading workspace...</strong>
        </div>
      </div>
    );
  }

  if (!portal.session) {
    return (
      <LoginPage
        bootstrapRequired={portal.setupStatus?.bootstrapRequired ?? false}
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
    );
  }

  if (route === "editor") {
    return <EditorPage initialDrawingId={query.drawingId ?? null} onNavigate={navigate} />;
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
        {route === "dashboard" ? (
          <DashboardPage session={portal.session} drawings={portal.drawings} onNavigate={navigate} />
        ) : null}
        {route === "drawings" ? (
          <DrawingsPage
            drawings={portal.drawings}
            isLoading={portal.isLoadingDrawings}
            onRefresh={portal.refreshDrawings}
            onOpenDrawing={(drawingId) => navigate("editor", { drawingId })}
            onCreateDrawing={() => navigate("editor")}
            onToggleArchive={portal.setDrawingArchived}
            onLoadVersions={portal.loadDrawingVersions}
            onRestoreVersion={portal.restoreDrawingVersion}
          />
        ) : null}
        {route === "admin" ? (
          <AdminPage
            users={portal.users}
            auditLog={portal.auditLog}
            currentUserRole={portal.session.user.role}
            isLoadingUsers={portal.isLoadingUsers}
            isLoadingAuditLog={portal.isLoadingAuditLog}
            isSavingUser={portal.isSavingUser}
            errorMessage={portal.errorMessage}
            noticeMessage={portal.noticeMessage}
            onRefresh={portal.refreshUsers}
            onRefreshAudit={portal.refreshAuditLog}
            onCreateUser={portal.createUser}
          />
        ) : null}
      </main>
    </div>
  );
}


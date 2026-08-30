import { Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/ErrorBoundary";
import { SessionProvider, useSession } from "@/useSession";
import { useHashRoute, type AppRoute } from "@/useHashRoute";

const LoginPage = lazy(async () => {
  const mod = await import("@/pages/LoginPage");
  return { default: mod.LoginPage };
});

const CustomersPage = lazy(async () => {
  const mod = await import("@/pages/CustomersPage");
  return { default: mod.CustomersPage };
});

const CustomerPage = lazy(async () => {
  const mod = await import("@/pages/CustomerPage");
  return { default: mod.CustomerPage };
});

const ProjectPage = lazy(async () => {
  const mod = await import("@/pages/ProjectPage");
  return { default: mod.ProjectPage };
});

const DrawingPage = lazy(async () => {
  const mod = await import("@/pages/DrawingPage");
  return { default: mod.DrawingPage };
});

const EstimatePage = lazy(async () => {
  const mod = await import("@/pages/EstimatePage");
  return { default: mod.EstimatePage };
});

const QuotePage = lazy(async () => {
  const mod = await import("@/pages/QuotePage");
  return { default: mod.QuotePage };
});

const AdminPage = lazy(async () => {
  const mod = await import("@/pages/AdminPage");
  return { default: mod.AdminPage };
});

const PricingPage = lazy(async () => {
  const mod = await import("@/pages/PricingPage");
  return { default: mod.PricingPage };
});

const EditorPage = lazy(async () => {
  const mod = await import("@/EditorPage");
  return { default: mod.EditorPage };
});

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Loading...
    </div>
  );
}

function isProtectedRoute(route: AppRoute): boolean {
  return route !== "login";
}

function AppRouter() {
  const { route, query, navigate } = useHashRoute();
  const { session, isRestoring } = useSession();
  const isAdmin = session?.user.role === "ADMIN";

  useEffect(() => {
    if (isRestoring) return;
    if (!session && isProtectedRoute(route)) {
      navigate("login");
      return;
    }
    if (session && route === "login") {
      navigate("customers");
      return;
    }
    if (session && (route === "admin" || route === "pricing") && !isAdmin) {
      navigate("customers");
    }
  }, [isAdmin, isRestoring, navigate, route, session]);

  if (isRestoring) {
    return <FullScreenLoader />;
  }

  if (!session) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <ErrorBoundary>
          <LoginPage />
        </ErrorBoundary>
      </Suspense>
    );
  }

  if (route === "editor") {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <ErrorBoundary>
          <EditorPage
            initialDrawingId={query.drawingId ?? null}
            initialRevisionId={query.revisionId ?? null}
            onNavigate={(nextRoute, nextQuery) => navigate(nextRoute, nextQuery)}
          />
        </ErrorBoundary>
      </Suspense>
    );
  }

  return (
    <AppShell currentRoute={route} onNavigate={navigate}>
      <Suspense fallback={<FullScreenLoader />}>
        <ErrorBoundary>
          {route === "customers" || route === "dashboard" ? (
            <CustomersPage onNavigate={navigate} />
          ) : null}
          {route === "customer" ? (
            <CustomerPage
              customerId={query.customerId ?? null}
              onNavigate={navigate}
            />
          ) : null}
          {route === "project" ? (
            <ProjectPage
              projectId={query.projectId ?? null}
              onNavigate={navigate}
            />
          ) : null}
          {route === "drawing" ? (
            <DrawingPage
              drawingId={query.drawingId ?? null}
              onNavigate={navigate}
            />
          ) : null}
          {route === "estimate" ? (
            <EstimatePage
              estimateId={query.estimateId ?? null}
              versionId={query.versionId ?? null}
              onNavigate={navigate}
            />
          ) : null}
          {route === "quote" ? (
            <QuotePage
              quoteId={query.quoteId ?? null}
              versionId={query.versionId ?? null}
              onNavigate={navigate}
            />
          ) : null}
          {route === "admin" && isAdmin ? <AdminPage /> : null}
          {route === "pricing" && isAdmin ? <PricingPage /> : null}
        </ErrorBoundary>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <SessionProvider>
      <AppRouter />
      <Toaster />
    </SessionProvider>
  );
}

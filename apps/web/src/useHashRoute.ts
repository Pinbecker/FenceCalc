import { useCallback, useEffect, useMemo, useState } from "react";

export type AppRoute =
  | "login"
  | "dashboard"
  | "customers"
  | "customer"
  | "project"
  | "drawing"
  | "estimate"
  | "quote"
  | "editor"
  | "pricing"
  | "admin";

export interface AppLocation {
  route: AppRoute;
  query: Record<string, string>;
}

const DEFAULT_ROUTE: AppRoute = "customers";
const KNOWN_ROUTES = new Set<AppRoute>([
  "login",
  "dashboard",
  "customers",
  "customer",
  "project",
  "drawing",
  "estimate",
  "quote",
  "editor",
  "pricing",
  "admin",
]);

function parseLocation(hash: string): AppLocation {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) {
    return { route: DEFAULT_ROUTE, query: {} };
  }
  const [rawPath = "", rawQuery = ""] = raw.split("?");
  const nextRoute = rawPath.replace(/^\//, "") as AppRoute;
  const route = KNOWN_ROUTES.has(nextRoute) ? nextRoute : DEFAULT_ROUTE;
  const params = new URLSearchParams(rawQuery);
  const query: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    query[key] = value;
  }
  return { route, query };
}

function buildHash(route: AppRoute, query?: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) params.set(key, value);
  }
  const queryString = params.toString();
  return `#/${route}${queryString ? `?${queryString}` : ""}`;
}

export function useHashRoute() {
  const [location, setLocation] = useState<AppLocation>(() =>
    parseLocation(window.location.hash),
  );

  useEffect(() => {
    const handleHashChange = () => setLocation(parseLocation(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = useCallback((route: AppRoute, query?: Record<string, string>) => {
    const nextHash = buildHash(route, query);
    if (window.location.hash === nextHash) {
      setLocation(parseLocation(nextHash));
      return;
    }
    window.location.hash = nextHash;
  }, []);

  return useMemo(() => ({ ...location, navigate }), [location, navigate]);
}

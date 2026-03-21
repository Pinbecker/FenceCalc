import { useCallback, useEffect } from "react";

export type EditorRoute = "dashboard" | "drawings" | "customers" | "customer" | "editor" | "estimate" | "pricing" | "admin" | "login";

interface UseEditorNavigationGuardsOptions {
  isDirty: boolean;
  onNavigate: (route: EditorRoute, query?: Record<string, string>) => void;
}

export function useEditorNavigationGuards({ isDirty, onNavigate }: UseEditorNavigationGuardsOptions) {
  const confirmDiscardChanges = useCallback(
    (message: string): boolean => {
      if (!isDirty) {
        return true;
      }

      return window.confirm(message);
    },
    [isDirty],
  );

  const guardedNavigate = useCallback(
    (route: EditorRoute, query?: Record<string, string>) => {
      if (!confirmDiscardChanges("Discard unsaved changes and leave the editor?")) {
        return;
      }

      onNavigate(route, query);
    },
    [confirmDiscardChanges, onNavigate],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  return {
    confirmDiscardChanges,
    guardedNavigate
  };
}

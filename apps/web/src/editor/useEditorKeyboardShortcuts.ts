import { useEffect } from "react";

export interface UseEditorKeyboardShortcutsOptions {
  undo(): void;
  redo(): void;
  deleteSelectedGate(): boolean;
  deleteSelectedSegment(): boolean;
  setInteractionMode(mode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE"): void;
  setIsSpacePressed(value: boolean): void;
  setDisableSnap(value: boolean): void;
  cancelActiveDrawing(): void;
  finishActiveInteraction(): void;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  if (element.isContentEditable) {
    return true;
  }

  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return typeof element.getAttribute === "function" && element.getAttribute("role") === "textbox";
}

export function useEditorKeyboardShortcuts(options: UseEditorKeyboardShortcutsOptions): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (isModifierPressed && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) {
          options.redo();
        } else {
          options.undo();
        }
        return;
      }
      if (isModifierPressed && event.code === "KeyY") {
        event.preventDefault();
        options.redo();
        return;
      }
      if (!isModifierPressed && event.code === "KeyD") {
        options.setInteractionMode("DRAW");
      }
      if (!isModifierPressed && event.code === "KeyS") {
        options.setInteractionMode("SELECT");
      }
      if (!isModifierPressed && event.code === "KeyX") {
        options.setInteractionMode("RECTANGLE");
      }
      if (!isModifierPressed && event.code === "KeyR") {
        options.setInteractionMode("RECESS");
      }
      if (!isModifierPressed && event.code === "KeyG") {
        options.setInteractionMode("GATE");
      }
      if (event.code === "Space") {
        event.preventDefault();
        options.setIsSpacePressed(true);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        options.setDisableSnap(true);
      }
      if (event.code === "Delete" || event.code === "Backspace") {
        if (options.deleteSelectedGate()) {
          return;
        }
        options.deleteSelectedSegment();
      }
      if (event.code === "Escape") {
        options.cancelActiveDrawing();
      }
      if (event.code === "Enter") {
        options.finishActiveInteraction();
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        options.setIsSpacePressed(false);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        options.setDisableSnap(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [options]);
}

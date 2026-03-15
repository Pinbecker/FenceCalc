import { useEffect } from "react";

export interface UseEditorKeyboardShortcutsOptions {
  undo(this: void): void;
  redo(this: void): void;
  deleteSelectedBasketballPost(this: void): boolean;
  deleteSelectedFloodlightColumn?(this: void): boolean;
  deleteSelectedGate(this: void): boolean;
  deleteSelectedSegment(this: void): boolean;
  setInteractionMode(
    this: void,
    mode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE" | "BASKETBALL_POST" | "FLOODLIGHT_COLUMN"
  ): void;
  setIsSpacePressed(this: void, value: boolean): void;
  setDisableSnap(this: void, value: boolean): void;
  cancelActiveDrawing(this: void): void;
  finishActiveInteraction(this: void): void;
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
    const deleteSelectedFloodlightColumn = options.deleteSelectedFloodlightColumn ?? (() => false);

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
      if (!isModifierPressed && event.code === "KeyB") {
        options.setInteractionMode("BASKETBALL_POST");
      }
      if (!isModifierPressed && event.code === "KeyF") {
        options.setInteractionMode("FLOODLIGHT_COLUMN");
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
        if (options.deleteSelectedBasketballPost()) {
          return;
        }
        if (deleteSelectedFloodlightColumn()) {
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

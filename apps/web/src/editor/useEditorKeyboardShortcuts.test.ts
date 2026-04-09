import { afterEach, describe, expect, it, vi } from "vitest";

import { isEditableShortcutTarget } from "./useEditorKeyboardShortcuts.js";

describe("useEditorKeyboardShortcuts", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
    vi.unstubAllGlobals();
  });

  it("treats form controls as editable shortcut targets", () => {
    expect(isEditableShortcutTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(
      isEditableShortcutTarget(
        { getAttribute: (name: string) => (name === "role" ? "textbox" : null) } as unknown as EventTarget
      )
    ).toBe(true);
  });

  it("ignores non-editable targets", () => {
    expect(isEditableShortcutTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
    expect(isEditableShortcutTarget(null)).toBe(false);
  });

  it("registers keyboard handlers and dispatches editor actions", async () => {
    let cleanupFn: (() => void) | undefined;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const listeners: Record<string, (event: KeyboardEvent) => void> = {};
    const windowMock = {
      addEventListener: vi.fn((event: string, listener: (event: KeyboardEvent) => void) => {
        listeners[event] = listener;
        addEventListener(event, listener);
      }),
      removeEventListener: vi.fn((event: string, listener: (event: KeyboardEvent) => void) => {
        removeEventListener(event, listener);
      })
    };

    vi.doMock("react", () => ({
      useEffect: (effect: () => void | (() => void)) => {
        const cleanup = effect();
        cleanupFn = typeof cleanup === "function" ? cleanup : undefined;
      }
    }));
    vi.stubGlobal("window", windowMock);

    const { useEditorKeyboardShortcuts } = await import("./useEditorKeyboardShortcuts.js");
    const options = {
      undo: vi.fn(),
      redo: vi.fn(),
      deleteSelectedBasketballPost: vi.fn(() => false),
      deleteSelectedFloodlightColumn: vi.fn(() => false),
      deleteSelectedGate: vi.fn(() => false),
      deleteSelectedSegment: vi.fn(() => true),
      setInteractionMode: vi.fn(),
      setIsSpacePressed: vi.fn(),
      setDisableSnap: vi.fn(),
      cancelActiveDrawing: vi.fn(),
      finishActiveInteraction: vi.fn()
    };

    useEditorKeyboardShortcuts(options);

    const editableTarget = { tagName: "INPUT" } as unknown as EventTarget;
    const plainTarget = { tagName: "DIV" } as unknown as EventTarget;
    const createEvent = (code: string, extra: Partial<KeyboardEvent> = {}) =>
      ({
        code,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        target: plainTarget,
        preventDefault: vi.fn(),
        ...extra
      }) as unknown as KeyboardEvent;

    listeners.keydown?.(createEvent("KeyZ", { ctrlKey: true }));
    listeners.keydown?.(createEvent("KeyZ", { ctrlKey: true, shiftKey: true }));
    listeners.keydown?.(createEvent("KeyY", { ctrlKey: true }));
    listeners.keydown?.(createEvent("KeyD"));
    listeners.keydown?.(createEvent("KeyS"));
    listeners.keydown?.(createEvent("KeyX"));
    listeners.keydown?.(createEvent("KeyR"));
    listeners.keydown?.(createEvent("KeyG"));
    listeners.keydown?.(createEvent("KeyU"));
    listeners.keydown?.(createEvent("KeyB"));
    listeners.keydown?.(createEvent("KeyF"));
    listeners.keydown?.(createEvent("KeyK"));
    listeners.keydown?.(createEvent("KeyP"));
    listeners.keydown?.(createEvent("KeyN"));
    listeners.keydown?.(createEvent("Space"));
    listeners.keydown?.(createEvent("ShiftLeft"));
    listeners.keydown?.(createEvent("Delete"));
    listeners.keydown?.(createEvent("Backspace", { target: editableTarget }));
    listeners.keydown?.(createEvent("Escape"));
    listeners.keydown?.(createEvent("Enter"));
    listeners.keyup?.(createEvent("Space"));
    listeners.keyup?.(createEvent("ShiftRight"));

    expect(windowMock.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(windowMock.addEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));
    expect(options.undo).toHaveBeenCalledTimes(1);
    expect(options.redo).toHaveBeenCalledTimes(2);
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(1, "DRAW");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(2, "SELECT");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(3, "RECTANGLE");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(4, "RECESS");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(5, "GATE");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(6, "GOAL_UNIT");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(7, "BASKETBALL_POST");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(8, "FLOODLIGHT_COLUMN");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(9, "KICKBOARD");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(10, "PITCH_DIVIDER");
    expect(options.setInteractionMode).toHaveBeenNthCalledWith(11, "SIDE_NETTING");
    expect(options.setIsSpacePressed).toHaveBeenCalledWith(true);
    expect(options.setIsSpacePressed).toHaveBeenCalledWith(false);
    expect(options.setDisableSnap).toHaveBeenCalledWith(true);
    expect(options.setDisableSnap).toHaveBeenCalledWith(false);
    expect(options.deleteSelectedGate).toHaveBeenCalledTimes(1);
    expect(options.deleteSelectedBasketballPost).toHaveBeenCalledTimes(1);
    expect(options.deleteSelectedFloodlightColumn).toHaveBeenCalledTimes(1);
    expect(options.deleteSelectedSegment).toHaveBeenCalledTimes(1);
    expect(options.cancelActiveDrawing).toHaveBeenCalledTimes(1);
    expect(options.finishActiveInteraction).toHaveBeenCalledTimes(1);

    cleanupFn?.();
    expect(windowMock.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(windowMock.removeEventListener).toHaveBeenCalledWith("keyup", expect.any(Function));
  });
});

import { describe, expect, it } from "vitest";

import { isEditableShortcutTarget } from "./useEditorKeyboardShortcuts.js";

describe("useEditorKeyboardShortcuts", () => {
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
});

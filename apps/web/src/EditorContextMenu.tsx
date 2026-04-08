import { useCallback, useEffect, useRef } from "react";

export interface ContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface EditorContextMenuProps {
  readonly position: ContextMenuPosition;
  readonly hasSelectedSegment: boolean;
  readonly hasSelectedGate: boolean;
  readonly hasSelectedBasketballPost: boolean;
  readonly hasSelectedFloodlightColumn: boolean;
  readonly isReadOnly: boolean;
  readonly onEditLength: () => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

export function EditorContextMenu({
  position,
  hasSelectedSegment,
  hasSelectedGate,
  hasSelectedBasketballPost,
  hasSelectedFloodlightColumn,
  isReadOnly,
  onEditLength,
  onDelete,
  onClose,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const hasAnySelection =
    hasSelectedSegment || hasSelectedGate || hasSelectedBasketballPost || hasSelectedFloodlightColumn;

  const deleteLabel = hasSelectedGate
    ? "Delete Gate"
    : hasSelectedBasketballPost
      ? "Delete Basketball Post"
      : hasSelectedFloodlightColumn
        ? "Delete Floodlight Column"
        : hasSelectedSegment
          ? "Delete Segment"
          : "Delete";

  return (
    <div
      ref={menuRef}
      className="context-menu-panel"
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {hasSelectedSegment && !isReadOnly && (
        <button
          role="menuitem"
          onClick={() => {
            onEditLength();
            onClose();
          }}
        >
          Edit Length…<em>L</em>
        </button>
      )}
      {hasAnySelection && !isReadOnly && (
        <button
          role="menuitem"
          className="menu-item-danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          {deleteLabel}<em>Del</em>
        </button>
      )}
      {!hasAnySelection && (
        <button role="menuitem" disabled>
          No selection
        </button>
      )}
    </div>
  );
}

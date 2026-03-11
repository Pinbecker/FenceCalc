import { useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

export interface PanelOffset {
  x: number;
  y: number;
}

interface ActivePanelDrag<TPanel extends string> {
  panel: TPanel;
  startPointer: { x: number; y: number };
  startOffset: PanelOffset;
}

export function useDraggablePanels<TPanel extends string>(initialOffsets: Record<TPanel, PanelOffset>) {
  const [panelOffsets, setPanelOffsets] = useState<Record<TPanel, PanelOffset>>(initialOffsets);
  const [activePanelDrag, setActivePanelDrag] = useState<ActivePanelDrag<TPanel> | null>(null);

  useEffect(() => {
    if (!activePanelDrag) {
      return;
    }

    const drag = activePanelDrag;

    function onMouseMove(event: MouseEvent): void {
      const deltaX = event.clientX - drag.startPointer.x;
      const deltaY = event.clientY - drag.startPointer.y;
      setPanelOffsets((previous) => ({
        ...previous,
        [drag.panel]: {
          x: drag.startOffset.x + deltaX,
          y: drag.startOffset.y + deltaY
        }
      }));
    }

    function onMouseUp(): void {
      setActivePanelDrag(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [activePanelDrag]);

  const startPanelDrag = useCallback((panel: TPanel, event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setActivePanelDrag({
      panel,
      startPointer: { x: event.clientX, y: event.clientY },
      startOffset: panelOffsets[panel]
    });
  }, [panelOffsets]);

  const panelDragStyle = useCallback((panel: TPanel): { transform: string; zIndex: number } => {
    const offset = panelOffsets[panel];
    return {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      zIndex: activePanelDrag?.panel === panel ? 50 : 32
    };
  }, [activePanelDrag?.panel, panelOffsets]);

  return {
    activePanelDrag,
    panelOffsets,
    panelDragStyle,
    setPanelOffsets,
    startPanelDrag
  };
}

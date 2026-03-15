import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  WheelEventHandler
} from "react";

import { clamp, DEFAULT_ORBIT, type OrbitState } from "./optimization3DRenderData.js";

interface PointerDragState {
  pointerId: number;
  x: number;
  y: number;
  mode: "rotate" | "pan";
}

type OrbitUpdater = OrbitState | ((current: OrbitState) => OrbitState);

export interface Optimization3DStageHandlers {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onWheel: WheelEventHandler<HTMLDivElement>;
  onDoubleClick: MouseEventHandler<HTMLDivElement>;
  onContextMenu: MouseEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

export function applyOrbitPointerDelta(
  orbit: OrbitState,
  deltaX: number,
  deltaY: number,
  mode: "rotate" | "pan"
): OrbitState {
  if (mode === "pan") {
    return {
      ...orbit,
      panX: orbit.panX + deltaX,
      panY: orbit.panY + deltaY
    };
  }

  return {
    ...orbit,
    yaw: orbit.yaw - deltaX * 0.0052,
    pitch: clamp(orbit.pitch + deltaY * 0.0042, 0.2, 1.1)
  };
}

export function applyOrbitWheelDelta(orbit: OrbitState, deltaY: number): OrbitState {
  return {
    ...orbit,
    zoom: clamp(orbit.zoom * Math.exp(-deltaY * 0.0028), 0.1, 8.5)
  };
}

export function applyOrbitKeyboardInput(orbit: OrbitState, key: string): OrbitState {
  if (key === "ArrowLeft") {
    return { ...orbit, yaw: orbit.yaw - 0.08 };
  }
  if (key === "ArrowRight") {
    return { ...orbit, yaw: orbit.yaw + 0.08 };
  }
  if (key === "ArrowUp") {
    return { ...orbit, pitch: clamp(orbit.pitch - 0.06, 0.2, 1.1) };
  }
  if (key === "ArrowDown") {
    return { ...orbit, pitch: clamp(orbit.pitch + 0.06, 0.2, 1.1) };
  }
  if (key === "0") {
    return DEFAULT_ORBIT;
  }
  if (key === "w" || key === "W") {
    return { ...orbit, panY: orbit.panY - 24 };
  }
  if (key === "s" || key === "S") {
    return { ...orbit, panY: orbit.panY + 24 };
  }
  if (key === "a" || key === "A") {
    return { ...orbit, panX: orbit.panX - 24 };
  }
  if (key === "d" || key === "D") {
    return { ...orbit, panX: orbit.panX + 24 };
  }
  return orbit;
}

export function useOptimization3DOrbit(): {
  orbit: OrbitState;
  resetOrbit(): void;
  stageHandlers: Optimization3DStageHandlers;
} {
  const [orbit, setOrbitState] = useState<OrbitState>(DEFAULT_ORBIT);
  const dragStateRef = useRef<PointerDragState | null>(null);
  const orbitRef = useRef<OrbitState>(DEFAULT_ORBIT);
  const pendingOrbitRef = useRef<OrbitState | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const setOrbit = (updater: OrbitUpdater) => {
    const nextOrbit = typeof updater === "function" ? updater(orbitRef.current) : updater;
    orbitRef.current = nextOrbit;
    pendingOrbitRef.current = nextOrbit;

    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pendingOrbit = pendingOrbitRef.current;
      if (pendingOrbit) {
        setOrbitState(pendingOrbit);
      }
    });
  };

  useEffect(() => {
    orbitRef.current = orbit;
  }, [orbit]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    orbit,
    resetOrbit: () => {
      setOrbit(DEFAULT_ORBIT);
    },
    stageHandlers: {
      onPointerDown(event) {
        event.preventDefault();
        dragStateRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          mode: event.shiftKey || event.button === 1 || event.button === 2 ? "pan" : "rotate"
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event) {
        const dragState = dragStateRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        const deltaX = event.clientX - dragState.x;
        const deltaY = event.clientY - dragState.y;
        dragStateRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          mode: dragState.mode
        };
        setOrbit((current) => applyOrbitPointerDelta(current, deltaX, deltaY, dragState.mode));
      },
      onPointerUp(event) {
        if (dragStateRef.current?.pointerId === event.pointerId) {
          dragStateRef.current = null;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerCancel(event) {
        if (dragStateRef.current?.pointerId === event.pointerId) {
          dragStateRef.current = null;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onWheel(event) {
        event.preventDefault();
        event.stopPropagation();
        setOrbit((current) => applyOrbitWheelDelta(current, event.deltaY));
      },
      onDoubleClick() {
        setOrbit(DEFAULT_ORBIT);
      },
      onContextMenu(event) {
        event.preventDefault();
      },
      onKeyDown(event) {
        const nextOrbit = applyOrbitKeyboardInput(orbitRef.current, event.key);
        if (nextOrbit === orbitRef.current) {
          return;
        }
        event.preventDefault();
        setOrbit(nextOrbit);
      }
    }
  };
}

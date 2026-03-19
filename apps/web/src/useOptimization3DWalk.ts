import { useMemo, useRef, useState } from "react";

import type { Optimization3DScene } from "./optimization3D.js";
import { clamp, type WalkState } from "./optimization3DRenderData.js";
import type { Optimization3DStageHandlers } from "./useOptimization3DOrbit.js";

interface PointerLookState {
  pointerId: number;
  x: number;
  y: number;
}

const WALK_PITCH_MIN = -0.74;
const WALK_PITCH_MAX = 0.38;
const WALK_STEP_MM = 420;
const WALK_TURN_STEP = 0.12;
const WALK_HEIGHT_STEP_MM = 140;
const WALK_EYE_HEIGHT_MIN_MM = 1200;
const WALK_EYE_HEIGHT_MAX_MM = 2600;
const WALK_BOUNDARY_PADDING_MM = 1800;

export function buildDefaultWalkState(scene: Optimization3DScene): WalkState {
  const centerX = (scene.bounds.minX + scene.bounds.maxX) / 2;
  const spanZ = scene.bounds.maxZ - scene.bounds.minZ;
  const entryZ =
    spanZ > 1200
      ? scene.bounds.minZ + spanZ * 0.18
      : (scene.bounds.minZ + scene.bounds.maxZ) / 2;

  return {
    x: centerX,
    z: entryZ,
    eyeHeightMm: 1700,
    yaw: 0,
    pitch: -0.08
  };
}

function clampWalkStateToScene(walk: WalkState, scene: Optimization3DScene): WalkState {
  return {
    ...walk,
    x: clamp(walk.x, scene.bounds.minX - WALK_BOUNDARY_PADDING_MM, scene.bounds.maxX + WALK_BOUNDARY_PADDING_MM),
    z: clamp(walk.z, scene.bounds.minZ - WALK_BOUNDARY_PADDING_MM, scene.bounds.maxZ + WALK_BOUNDARY_PADDING_MM),
    eyeHeightMm: clamp(walk.eyeHeightMm, WALK_EYE_HEIGHT_MIN_MM, WALK_EYE_HEIGHT_MAX_MM),
    pitch: clamp(walk.pitch, WALK_PITCH_MIN, WALK_PITCH_MAX)
  };
}

export function applyWalkPointerDelta(walk: WalkState, deltaX: number, deltaY: number): WalkState {
  return {
    ...walk,
    yaw: walk.yaw + deltaX * 0.0048,
    pitch: clamp(walk.pitch - deltaY * 0.0036, WALK_PITCH_MIN, WALK_PITCH_MAX)
  };
}

export function applyWalkWheelDelta(walk: WalkState, deltaY: number): WalkState {
  return {
    ...walk,
    eyeHeightMm: clamp(walk.eyeHeightMm - deltaY * 1.2, WALK_EYE_HEIGHT_MIN_MM, WALK_EYE_HEIGHT_MAX_MM)
  };
}

export function applyWalkKeyboardInput(walk: WalkState, key: string): WalkState {
  const forwardX = Math.sin(walk.yaw);
  const forwardZ = Math.cos(walk.yaw);
  const rightX = Math.cos(walk.yaw);
  const rightZ = -Math.sin(walk.yaw);

  if (key === "ArrowLeft") {
    return { ...walk, yaw: walk.yaw - WALK_TURN_STEP };
  }
  if (key === "ArrowRight") {
    return { ...walk, yaw: walk.yaw + WALK_TURN_STEP };
  }
  if (key === "ArrowUp") {
    return { ...walk, pitch: clamp(walk.pitch + 0.05, WALK_PITCH_MIN, WALK_PITCH_MAX) };
  }
  if (key === "ArrowDown") {
    return { ...walk, pitch: clamp(walk.pitch - 0.05, WALK_PITCH_MIN, WALK_PITCH_MAX) };
  }
  if (key === "w" || key === "W") {
    return {
      ...walk,
      x: walk.x + forwardX * WALK_STEP_MM,
      z: walk.z + forwardZ * WALK_STEP_MM
    };
  }
  if (key === "s" || key === "S") {
    return {
      ...walk,
      x: walk.x - forwardX * WALK_STEP_MM,
      z: walk.z - forwardZ * WALK_STEP_MM
    };
  }
  if (key === "a" || key === "A") {
    return {
      ...walk,
      x: walk.x - rightX * WALK_STEP_MM,
      z: walk.z - rightZ * WALK_STEP_MM
    };
  }
  if (key === "d" || key === "D") {
    return {
      ...walk,
      x: walk.x + rightX * WALK_STEP_MM,
      z: walk.z + rightZ * WALK_STEP_MM
    };
  }
  if (key === "q" || key === "Q") {
    return {
      ...walk,
      eyeHeightMm: clamp(walk.eyeHeightMm - WALK_HEIGHT_STEP_MM, WALK_EYE_HEIGHT_MIN_MM, WALK_EYE_HEIGHT_MAX_MM)
    };
  }
  if (key === "e" || key === "E") {
    return {
      ...walk,
      eyeHeightMm: clamp(walk.eyeHeightMm + WALK_HEIGHT_STEP_MM, WALK_EYE_HEIGHT_MIN_MM, WALK_EYE_HEIGHT_MAX_MM)
    };
  }
  return walk;
}

export function useOptimization3DWalk(scene: Optimization3DScene): {
  walk: WalkState;
  resetWalk(): void;
  stageHandlers: Optimization3DStageHandlers;
} {
  const defaultWalk = useMemo(() => buildDefaultWalkState(scene), [scene]);
  const [walk, setWalk] = useState<WalkState>(defaultWalk);
  const walkRef = useRef<WalkState>(defaultWalk);
  const pointerLookRef = useRef<PointerLookState | null>(null);

  const setClampedWalk = (updater: WalkState | ((current: WalkState) => WalkState)) => {
    const nextWalk = typeof updater === "function" ? updater(walkRef.current) : updater;
    const clampedWalk = clampWalkStateToScene(nextWalk, scene);
    walkRef.current = clampedWalk;
    setWalk(clampedWalk);
  };

  return {
    walk,
    resetWalk() {
      const nextWalk = buildDefaultWalkState(scene);
      walkRef.current = nextWalk;
      setWalk(nextWalk);
    },
    stageHandlers: {
      onPointerDown(event) {
        event.preventDefault();
        event.currentTarget.focus();
        pointerLookRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event) {
        const pointerLook = pointerLookRef.current;
        if (!pointerLook || pointerLook.pointerId !== event.pointerId) {
          return;
        }
        const deltaX = event.clientX - pointerLook.x;
        const deltaY = event.clientY - pointerLook.y;
        pointerLookRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY
        };
        setClampedWalk((current) => applyWalkPointerDelta(current, deltaX, deltaY));
      },
      onPointerUp(event) {
        if (pointerLookRef.current?.pointerId === event.pointerId) {
          pointerLookRef.current = null;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerCancel(event) {
        if (pointerLookRef.current?.pointerId === event.pointerId) {
          pointerLookRef.current = null;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onWheel(event) {
        event.preventDefault();
        event.stopPropagation();
        setClampedWalk((current) => applyWalkWheelDelta(current, event.deltaY));
      },
      onDoubleClick() {
        const nextWalk = buildDefaultWalkState(scene);
        walkRef.current = nextWalk;
        setWalk(nextWalk);
      },
      onContextMenu(event) {
        event.preventDefault();
      },
      onKeyDown(event) {
        if (event.key === "0") {
          event.preventDefault();
          const nextWalk = buildDefaultWalkState(scene);
          walkRef.current = nextWalk;
          setWalk(nextWalk);
          return;
        }
        const nextWalk = applyWalkKeyboardInput(walkRef.current, event.key);
        if (nextWalk === walkRef.current) {
          return;
        }
        event.preventDefault();
        setClampedWalk(nextWalk);
      }
    }
  };
}

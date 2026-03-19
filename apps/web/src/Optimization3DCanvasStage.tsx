import { useEffect, useMemo, useRef } from "react";

import { useElementSize } from "./editor/useElementSize.js";
import type { Optimization3DScene } from "./optimization3D.js";
import { drawOptimization3DCanvas } from "./optimization3DCanvas.js";
import { buildOptimization3DRenderData, type Optimization3DCameraState } from "./optimization3DRenderData.js";
import type { Optimization3DStageHandlers } from "./useOptimization3DOrbit.js";

interface Optimization3DCanvasStageProps {
  scene: Optimization3DScene;
  camera: Optimization3DCameraState;
  mode: "orbit" | "walk";
  stageHandlers: Optimization3DStageHandlers;
  walkHud?: {
    heading: string;
    eyeHeight: string;
    position: string;
  } | null;
}

export function Optimization3DCanvasStage({
  scene,
  camera,
  mode,
  stageHandlers,
  walkHud = null
}: Optimization3DCanvasStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportWidth = size.width > 0 ? size.width : 920;
  const viewportHeight = size.height > 0 ? size.height : 320;
  const renderData = useMemo(
    () => buildOptimization3DRenderData(scene, camera, viewportWidth, viewportHeight),
    [camera, scene, viewportHeight, viewportWidth]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawOptimization3DCanvas(canvas, renderData, viewportWidth, viewportHeight, mode);
  }, [mode, renderData, viewportHeight, viewportWidth]);

  return (
    <div ref={ref} className={`optimization-3d-stage ${mode === "walk" ? "is-walk" : "is-orbit"}`} tabIndex={0} {...stageHandlers}>
      <canvas
        ref={canvasRef}
        className="optimization-3d-canvas"
        role="img"
        aria-label={mode === "walk" ? "Walkable 3D fence view" : "3D twin-bar fence reuse plan"}
      />
      {mode === "walk" && walkHud ? (
        <>
          <div className="optimization-3d-walk-banner" aria-hidden="true">
            <strong>Walk View</strong>
            <span>Click to focus. Drag to look. Hold Shift for longer strides.</span>
          </div>
          <div className="optimization-3d-walk-hud" aria-hidden="true">
            <span>{walkHud.heading}</span>
            <span>{walkHud.eyeHeight}</span>
            <span>{walkHud.position}</span>
          </div>
          <div className="optimization-3d-walk-reticle" aria-hidden="true">
            <i />
            <i />
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";

import { useElementSize } from "./editor/useElementSize.js";
import type { Optimization3DScene } from "./optimization3D.js";
import { drawOptimization3DCanvas } from "./optimization3DCanvas.js";
import { buildOptimization3DRenderData, type OrbitState } from "./optimization3DRenderData.js";
import type { Optimization3DStageHandlers } from "./useOptimization3DOrbit.js";

interface Optimization3DCanvasStageProps {
  scene: Optimization3DScene;
  orbit: OrbitState;
  stageHandlers: Optimization3DStageHandlers;
}

export function Optimization3DCanvasStage({
  scene,
  orbit,
  stageHandlers
}: Optimization3DCanvasStageProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportWidth = size.width > 0 ? size.width : 920;
  const viewportHeight = size.height > 0 ? size.height : 320;
  const renderData = useMemo(
    () => buildOptimization3DRenderData(scene, orbit, viewportWidth, viewportHeight),
    [orbit, scene, viewportHeight, viewportWidth]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawOptimization3DCanvas(canvas, renderData, viewportWidth, viewportHeight);
  }, [renderData, viewportHeight, viewportWidth]);

  return (
    <div ref={ref} className="optimization-3d-stage" tabIndex={0} {...stageHandlers}>
      <canvas ref={canvasRef} className="optimization-3d-canvas" role="img" aria-label="3D twin-bar fence reuse plan" />
    </div>
  );
}

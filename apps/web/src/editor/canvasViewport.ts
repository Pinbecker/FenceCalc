import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PointMm } from "@fence-estimator/contracts";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface VisibleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface GridLine {
  coordinate: number;
  major: boolean;
}

interface UseEditorCanvasViewportOptions {
  canvasWidth: number;
  canvasHeight: number;
  minScale: number;
  maxScale: number;
  initialVisibleWidthMm: number;
  chooseGridStep: (scale: number) => number;
}

const DEFAULT_VIEWPORT: Viewport = { x: 120, y: 120, scale: 0.1 };

export function screenToWorld(pointer: ScreenPoint, view: Viewport): PointMm {
  return {
    x: (pointer.x - view.x) / view.scale,
    y: (pointer.y - view.y) / view.scale
  };
}

export function buildVisibleBounds(canvasWidth: number, canvasHeight: number, view: Viewport): VisibleBounds {
  return {
    left: -view.x / view.scale,
    right: (canvasWidth - view.x) / view.scale,
    top: -view.y / view.scale,
    bottom: (canvasHeight - view.y) / view.scale
  };
}

export function buildCanvasGrid(
  visibleBounds: VisibleBounds,
  scale: number,
  chooseGridStep: (scale: number) => number,
): { gridStepMm: number; majorGridStepMm: number; verticalLines: GridLine[]; horizontalLines: GridLine[] } {
  const gridStepMm = chooseGridStep(scale);
  const majorGridStepMm = gridStepMm * 5;
  const verticalLines: GridLine[] = [];
  const horizontalLines: GridLine[] = [];

  const startX = Math.floor(visibleBounds.left / gridStepMm) * gridStepMm;
  for (let x = startX; x <= visibleBounds.right; x += gridStepMm) {
    verticalLines.push({ coordinate: x, major: x % majorGridStepMm === 0 });
  }

  const startY = Math.floor(visibleBounds.top / gridStepMm) * gridStepMm;
  for (let y = startY; y <= visibleBounds.bottom; y += gridStepMm) {
    horizontalLines.push({ coordinate: y, major: y % majorGridStepMm === 0 });
  }

  return {
    gridStepMm,
    majorGridStepMm,
    verticalLines,
    horizontalLines
  };
}

export function zoomViewportAtPointer(
  view: Viewport,
  pointer: ScreenPoint,
  deltaY: number,
  minScale: number,
  maxScale: number,
): Viewport {
  const zoomFactor = 1.08;
  const direction = deltaY > 0 ? -1 : 1;
  const candidateScale = direction > 0 ? view.scale * zoomFactor : view.scale / zoomFactor;
  const nextScale = Math.min(maxScale, Math.max(minScale, candidateScale));
  const focus = {
    x: (pointer.x - view.x) / view.scale,
    y: (pointer.y - view.y) / view.scale
  };

  return {
    scale: nextScale,
    x: pointer.x - focus.x * nextScale,
    y: pointer.y - focus.y * nextScale
  };
}

export function useEditorCanvasViewport({
  canvasWidth,
  canvasHeight,
  minScale,
  maxScale,
  initialVisibleWidthMm,
  chooseGridStep
}: UseEditorCanvasViewportOptions) {
  const [view, setView] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [pointerWorld, setPointerWorld] = useState<PointMm | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panAnchor, setPanAnchor] = useState<ScreenPoint | null>(null);
  const initialScaleApplied = useRef(false);

  useEffect(() => {
    if (initialScaleApplied.current || canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }

    const targetScale = Math.min(maxScale, Math.max(minScale, canvasWidth / initialVisibleWidthMm));
    setView({
      x: canvasWidth * 0.08,
      y: canvasHeight * 0.12,
      scale: targetScale
    });
    initialScaleApplied.current = true;
  }, [canvasHeight, canvasWidth, initialVisibleWidthMm, maxScale, minScale]);

  const toWorld = useCallback((pointer: ScreenPoint) => screenToWorld(pointer, view), [view]);

  const beginPan = useCallback(
    (pointer: ScreenPoint) => {
      setIsPanning(true);
      setPanAnchor({
        x: pointer.x - view.x,
        y: pointer.y - view.y
      });
    },
    [view.x, view.y],
  );

  const updatePan = useCallback(
    (pointer: ScreenPoint) => {
      if (!panAnchor) {
        return false;
      }

      setView((previous) => ({
        ...previous,
        x: pointer.x - panAnchor.x,
        y: pointer.y - panAnchor.y
      }));
      return true;
    },
    [panAnchor],
  );

  const endPan = useCallback(() => {
    setIsPanning(false);
    setPanAnchor(null);
  }, []);

  const zoomAtPointer = useCallback(
    (pointer: ScreenPoint, deltaY: number) => {
      setView((previous) => zoomViewportAtPointer(previous, pointer, deltaY, minScale, maxScale));
    },
    [maxScale, minScale],
  );

  const visibleBounds = useMemo(
    () => buildVisibleBounds(canvasWidth, canvasHeight, view),
    [canvasHeight, canvasWidth, view],
  );

  const grid = useMemo(
    () => buildCanvasGrid(visibleBounds, view.scale, chooseGridStep),
    [chooseGridStep, view.scale, visibleBounds],
  );

  return {
    view,
    setView,
    pointerWorld,
    setPointerWorld,
    isSpacePressed,
    setIsSpacePressed,
    isPanning,
    beginPan,
    updatePan,
    endPan,
    zoomAtPointer,
    toWorld,
    visibleBounds,
    gridStepMm: grid.gridStepMm,
    majorGridStepMm: grid.majorGridStepMm,
    verticalLines: grid.verticalLines,
    horizontalLines: grid.horizontalLines
  };
}

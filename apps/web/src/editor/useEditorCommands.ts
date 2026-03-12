import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  FenceSpec,
  GatePlacement,
  GateType,
  LayoutModel,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { formatMetersInputFromMm } from "../formatters";
import { MIN_SEGMENT_MM, parseMetersInputToMm, quantize } from "./constants";
import { dot, rangesOverlap } from "./editorMath";
import {
  buildRectangleSegments,
  moveGatePlacementCollection,
  offsetSegmentCollection,
  remapGatePlacementsForRecess,
  resizeSegmentCollection
} from "./editorCommandUtils";
import { buildRecessReplacementSegments } from "./recess";
import type {
  GateInsertionPreview,
  InteractionMode,
  RecessInsertionPreview,
  ResolvedGatePlacement,
  SegmentConnectivity
} from "./types";

interface SegmentDragEntry {
  segmentId: string;
  lastPointer: PointMm;
}

interface GateDragEntry {
  gateId: string;
  lastPointer: PointMm;
}

type SegmentDragState = SegmentDragEntry | null;
type GateDragState = GateDragEntry | null;

interface PointerScreenPoint {
  x: number;
  y: number;
}

interface UseEditorCommandsOptions {
  stageRef: RefObject<Konva.Stage | null>;
  applyLayout: (updater: (previous: LayoutModel) => LayoutModel) => void;
  applySegments: (updater: (previous: LayoutSegment[]) => LayoutSegment[]) => void;
  applyGatePlacements: (updater: (previous: GatePlacement[]) => GatePlacement[]) => void;
  segmentsById: Map<string, LayoutSegment>;
  resolvedGateById: Map<string, ResolvedGatePlacement>;
  connectivity: SegmentConnectivity;
  activeSpec: FenceSpec;
  interactionMode: InteractionMode;
  gateType: GateType;
  drawStart: PointMm | null;
  rectangleStart: PointMm | null;
  selectedSegmentId: string | null;
  selectedGateId: string | null;
  selectedLengthInputM: string;
  isSpacePressed: boolean;
  isPanning: boolean;
  activeSegmentDrag: SegmentDragState;
  activeGateDrag: GateDragState;
  recessWidthMm: number;
  recessDepthMm: number;
  customGateWidthMm: number;
  recessPreview: RecessInsertionPreview | null;
  gatePreview: GateInsertionPreview | null;
  resolveDrawPoint: (worldPoint: PointMm) => { point: PointMm; guide: { coordinateMm: number; orientation: "VERTICAL" | "HORIZONTAL"; anchor: PointMm } | null };
  toWorld: (screenPoint: PointerScreenPoint) => PointMm;
  beginPan: (pointer: PointerScreenPoint) => void;
  updatePan: (pointer: PointerScreenPoint) => boolean;
  endPan: () => void;
  zoomAtPointer: (pointer: PointerScreenPoint, deltaY: number) => void;
  setPointerWorld: (point: PointMm | null) => void;
  setDrawStart: Dispatch<SetStateAction<PointMm | null>>;
  setRectangleStart: Dispatch<SetStateAction<PointMm | null>>;
  setSelectedSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedGateId: Dispatch<SetStateAction<string | null>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
  setSelectedLengthInputM: Dispatch<SetStateAction<string>>;
  setIsLengthEditorOpen: Dispatch<SetStateAction<boolean>>;
  setActiveSegmentDrag: Dispatch<SetStateAction<SegmentDragState>>;
  setActiveGateDrag: Dispatch<SetStateAction<GateDragState>>;
  setRecessWidthMm: Dispatch<SetStateAction<number>>;
  setRecessDepthMm: Dispatch<SetStateAction<number>>;
  setRecessWidthInputM: Dispatch<SetStateAction<string>>;
  setRecessDepthInputM: Dispatch<SetStateAction<string>>;
  setCustomGateWidthMm: Dispatch<SetStateAction<number>>;
  setCustomGateWidthInputM: Dispatch<SetStateAction<string>>;
}

export function useEditorCommands({
  stageRef,
  applyLayout,
  applySegments,
  applyGatePlacements,
  segmentsById,
  resolvedGateById,
  connectivity,
  activeSpec,
  interactionMode,
  gateType,
  drawStart,
  rectangleStart,
  selectedSegmentId,
  selectedGateId,
  selectedLengthInputM,
  isSpacePressed,
  isPanning,
  activeSegmentDrag,
  activeGateDrag,
  recessWidthMm,
  recessDepthMm,
  customGateWidthMm,
  recessPreview,
  gatePreview,
  resolveDrawPoint,
  toWorld,
  beginPan,
  updatePan,
  endPan,
  zoomAtPointer,
  setPointerWorld,
  setDrawStart,
  setRectangleStart,
  setSelectedSegmentId,
  setSelectedGateId,
  setSelectedPlanId,
  setSelectedLengthInputM,
  setIsLengthEditorOpen,
  setActiveSegmentDrag,
  setActiveGateDrag,
  setRecessWidthMm,
  setRecessDepthMm,
  setRecessWidthInputM,
  setRecessDepthInputM,
  setCustomGateWidthMm,
  setCustomGateWidthInputM
}: UseEditorCommandsOptions) {
  const updateSegment = useCallback(
    (segmentId: string, updater: (segment: LayoutSegment) => LayoutSegment): void => {
      applySegments((previous) =>
        previous.map((segment) => (segment.id === segmentId ? updater(segment) : segment))
      );
    },
    [applySegments]
  );

  const onRecessWidthInputChange = useCallback(
    (value: string): void => {
      setRecessWidthInputM(value);
      const parsed = parseMetersInputToMm(value);
      if (parsed !== null) {
        setRecessWidthMm(parsed);
      }
    },
    [setRecessWidthInputM, setRecessWidthMm]
  );

  const onRecessDepthInputChange = useCallback(
    (value: string): void => {
      setRecessDepthInputM(value);
      const parsed = parseMetersInputToMm(value);
      if (parsed !== null) {
        setRecessDepthMm(parsed);
      }
    },
    [setRecessDepthInputM, setRecessDepthMm]
  );

  const normalizeRecessInputs = useCallback((): void => {
    setRecessWidthInputM(formatMetersInputFromMm(recessWidthMm));
    setRecessDepthInputM(formatMetersInputFromMm(recessDepthMm));
  }, [recessDepthMm, recessWidthMm, setRecessDepthInputM, setRecessWidthInputM]);

  const onCustomGateWidthInputChange = useCallback(
    (value: string): void => {
      setCustomGateWidthInputM(value);
      const parsed = parseMetersInputToMm(value);
      if (parsed !== null) {
        setCustomGateWidthMm(parsed);
      }
    },
    [setCustomGateWidthInputM, setCustomGateWidthMm]
  );

  const normalizeGateInputs = useCallback((): void => {
    setCustomGateWidthInputM(formatMetersInputFromMm(customGateWidthMm));
  }, [customGateWidthMm, setCustomGateWidthInputM]);

  const openLengthEditor = useCallback(
    (segmentId: string): void => {
      if (interactionMode !== "SELECT") {
        return;
      }
      const segment = segmentsById.get(segmentId);
      if (!segment) {
        return;
      }
      setSelectedSegmentId(segmentId);
      setSelectedLengthInputM((distanceMm(segment.start, segment.end) / 1000).toFixed(2));
      setIsLengthEditorOpen(true);
    },
    [
      interactionMode,
      segmentsById,
      setIsLengthEditorOpen,
      setSelectedLengthInputM,
      setSelectedSegmentId
    ]
  );

  const resizeSegmentLength = useCallback(
    (segmentId: string, requestedLengthMm: number): void => {
      applySegments((previous) =>
        resizeSegmentCollection(previous, segmentId, requestedLengthMm, connectivity)
      );
    },
    [applySegments, connectivity]
  );

  const applySelectedLengthEdit = useCallback((): void => {
    if (!selectedSegmentId) {
      return;
    }
    const parsedLengthMm = parseMetersInputToMm(selectedLengthInputM);
    if (parsedLengthMm === null) {
      return;
    }
    resizeSegmentLength(selectedSegmentId, parsedLengthMm);
    setIsLengthEditorOpen(false);
  }, [resizeSegmentLength, selectedLengthInputM, selectedSegmentId, setIsLengthEditorOpen]);

  const offsetSegmentPerpendicular = useCallback(
    (segmentId: string, dragDelta: PointMm): void => {
      applySegments((previous) => offsetSegmentCollection(previous, segmentId, dragDelta));
    },
    [applySegments]
  );

  const startSelectedSegmentDrag = useCallback(
    (segmentId: string): void => {
      if (interactionMode !== "SELECT") {
        return;
      }
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      setActiveSegmentDrag({
        segmentId,
        lastPointer: toWorld(pointer)
      });
      setActiveGateDrag(null);
    },
    [interactionMode, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const moveGateAlongSegment = useCallback(
    (gateId: string, deltaAlongMm: number): void => {
      if (Math.abs(deltaAlongMm) < 0.01) {
        return;
      }
      applyGatePlacements((previous) =>
        moveGatePlacementCollection(previous, gateId, deltaAlongMm, segmentsById)
      );
    },
    [applyGatePlacements, segmentsById]
  );

  const startSelectedGateDrag = useCallback(
    (gateId: string): void => {
      if (interactionMode !== "SELECT") {
        return;
      }
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      setActiveGateDrag({
        gateId,
        lastPointer: toWorld(pointer)
      });
      setActiveSegmentDrag(null);
    },
    [interactionMode, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const startOrCommitDrawing = useCallback(
    (worldPoint: PointMm): void => {
      const snappedPoint = resolveDrawPoint(worldPoint).point;

      if (!drawStart) {
        setDrawStart(snappedPoint);
        setSelectedSegmentId(null);
        setSelectedGateId(null);
        return;
      }

      if (distanceMm(drawStart, snappedPoint) < MIN_SEGMENT_MM) {
        return;
      }

      applySegments((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          start: quantize(drawStart),
          end: quantize(snappedPoint),
          spec: activeSpec
        }
      ]);
      setDrawStart(snappedPoint);
      setSelectedGateId(null);
    },
    [
      activeSpec,
      applySegments,
      drawStart,
      resolveDrawPoint,
      setDrawStart,
      setSelectedGateId,
      setSelectedSegmentId
    ]
  );

  const startOrCommitRectangle = useCallback(
    (worldPoint: PointMm): void => {
      const snappedPoint = resolveDrawPoint(worldPoint).point;

      if (!rectangleStart) {
        setRectangleStart(snappedPoint);
        setSelectedSegmentId(null);
        setSelectedGateId(null);
        return;
      }

      const widthMm = Math.abs(snappedPoint.x - rectangleStart.x);
      const heightMm = Math.abs(snappedPoint.y - rectangleStart.y);
      if (widthMm < MIN_SEGMENT_MM || heightMm < MIN_SEGMENT_MM) {
        return;
      }

      applySegments((previous) => [
        ...previous,
        ...buildRectangleSegments(rectangleStart, snappedPoint, activeSpec)
      ]);
      setRectangleStart(null);
      setSelectedSegmentId(null);
      setSelectedGateId(null);
    },
    [
      activeSpec,
      applySegments,
      rectangleStart,
      resolveDrawPoint,
      setRectangleStart,
      setSelectedGateId,
      setSelectedSegmentId
    ]
  );

  const insertRecess = useCallback(
    (preview: RecessInsertionPreview): void => {
      const replacement = buildRecessReplacementSegments(preview);
      if (replacement.length === 0) {
        return;
      }

      applyLayout((previous) => {
        const nextSegments: LayoutSegment[] = [];
        for (const segment of previous.segments) {
          if (segment.id !== preview.segment.id) {
            nextSegments.push(segment);
            continue;
          }
          nextSegments.push(...replacement);
        }
        return {
          segments: nextSegments,
          gates: remapGatePlacementsForRecess(previous.gates ?? [], preview, resolvedGateById)
        };
      });
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setDrawStart(null);
    },
    [
      applyLayout,
      resolvedGateById,
      setDrawStart,
      setSelectedGateId,
      setSelectedSegmentId
    ]
  );

  const insertGate = useCallback(
    (preview: GateInsertionPreview): void => {
      applyGatePlacements((previous) => {
        const nextGate: GatePlacement = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          startOffsetMm: preview.startOffsetMm,
          endOffsetMm: preview.endOffsetMm,
          gateType
        };
        const next = previous.filter(
          (placement) =>
            placement.segmentId !== nextGate.segmentId ||
            !rangesOverlap(
              placement.startOffsetMm,
              placement.endOffsetMm,
              nextGate.startOffsetMm,
              nextGate.endOffsetMm
            )
        );
        next.push(nextGate);
        next.sort((left, right) => left.id.localeCompare(right.id));
        return next;
      });
      setSelectedSegmentId(null);
      setDrawStart(null);
    },
    [applyGatePlacements, gateType, setDrawStart, setSelectedSegmentId]
  );

  const onStageMouseDown = useCallback(
    (event: KonvaEventObject<MouseEvent>): void => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const isMiddleButton = event.evt.button === 1;
      const isPanIntent = isMiddleButton || isSpacePressed;
      if (isPanIntent) {
        const pointer = stage.getPointerPosition();
        if (!pointer) {
          return;
        }
        beginPan(pointer);
        return;
      }

      if (event.evt.button !== 0) {
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      const world = toWorld(pointer);

      if (interactionMode === "SELECT") {
        if (event.target === stage) {
          setSelectedSegmentId(null);
          setSelectedGateId(null);
        }
        return;
      }

      if (interactionMode === "RECESS") {
        if (recessPreview) {
          insertRecess(recessPreview);
        }
        return;
      }

      if (interactionMode === "GATE") {
        if (gatePreview) {
          insertGate(gatePreview);
        }
        return;
      }

      if (interactionMode === "RECTANGLE") {
        startOrCommitRectangle(world);
        return;
      }

      startOrCommitDrawing(world);
    },
    [
      beginPan,
      gatePreview,
      insertGate,
      insertRecess,
      interactionMode,
      isSpacePressed,
      recessPreview,
      setSelectedGateId,
      setSelectedSegmentId,
      stageRef,
      startOrCommitDrawing,
      startOrCommitRectangle,
      toWorld
    ]
  );

  const onStageMouseMove = useCallback((): void => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const world = toWorld(pointer);

    if (activeGateDrag) {
      const gate = resolvedGateById.get(activeGateDrag.gateId);
      if (!gate) {
        setActiveGateDrag(null);
        setPointerWorld(world);
        return;
      }
      const pointerDelta = {
        x: world.x - activeGateDrag.lastPointer.x,
        y: world.y - activeGateDrag.lastPointer.y
      };
      moveGateAlongSegment(gate.id, dot(pointerDelta, gate.tangent));
      setActiveGateDrag((previous) =>
        previous
          ? {
              ...previous,
              lastPointer: world
            }
          : previous
      );
      setPointerWorld(world);
      return;
    }

    if (activeSegmentDrag) {
      const delta = {
        x: world.x - activeSegmentDrag.lastPointer.x,
        y: world.y - activeSegmentDrag.lastPointer.y
      };
      if (Math.abs(delta.x) >= 0.01 || Math.abs(delta.y) >= 0.01) {
        offsetSegmentPerpendicular(activeSegmentDrag.segmentId, delta);
      }
      setActiveSegmentDrag((previous) =>
        previous
          ? {
              ...previous,
              lastPointer: world
            }
          : previous
      );
      setPointerWorld(world);
      return;
    }

    if (isPanning && updatePan(pointer)) {
      return;
    }

    setPointerWorld(world);
  }, [
    activeGateDrag,
    activeSegmentDrag,
    isPanning,
    moveGateAlongSegment,
    offsetSegmentPerpendicular,
    resolvedGateById,
    setActiveGateDrag,
    setActiveSegmentDrag,
    setPointerWorld,
    stageRef,
    toWorld,
    updatePan
  ]);

  const onStageMouseUp = useCallback((): void => {
    setActiveSegmentDrag(null);
    setActiveGateDrag(null);
    endPan();
  }, [endPan, setActiveGateDrag, setActiveSegmentDrag]);

  const onStageWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>): void => {
      event.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }

      zoomAtPointer(pointer, event.evt.deltaY);
    },
    [stageRef, zoomAtPointer]
  );

  const onContextMenu = useCallback(
    (event: KonvaEventObject<PointerEvent>): void => {
      event.evt.preventDefault();
      setDrawStart(null);
      setRectangleStart(null);
    },
    [setDrawStart, setRectangleStart]
  );

  const deleteSelectedGate = useCallback((): boolean => {
    if (!selectedGateId) {
      return false;
    }
    applyGatePlacements((previous) => previous.filter((gate) => gate.id !== selectedGateId));
    setSelectedGateId(null);
    return true;
  }, [applyGatePlacements, selectedGateId, setSelectedGateId]);

  const deleteSelectedSegment = useCallback((): boolean => {
    if (!selectedSegmentId) {
      return false;
    }
    applySegments((previous) =>
      previous.filter((segment) => segment.id !== selectedSegmentId)
    );
    setSelectedSegmentId(null);
    return true;
  }, [applySegments, selectedSegmentId, setSelectedSegmentId]);

  const cancelActiveDrawing = useCallback((): void => {
    setDrawStart(null);
    setRectangleStart(null);
  }, [setDrawStart, setRectangleStart]);

  const resetWorkspaceCanvas = useCallback((): void => {
    applyLayout(() => ({ segments: [], gates: [] }));
    setDrawStart(null);
    setRectangleStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedPlanId(null);
    setIsLengthEditorOpen(false);
  }, [
    applyLayout,
    setDrawStart,
    setIsLengthEditorOpen,
    setRectangleStart,
    setSelectedGateId,
    setSelectedPlanId,
    setSelectedSegmentId
  ]);

  const handleDeleteSelection = useCallback((): void => {
    if (deleteSelectedGate()) {
      return;
    }
    void deleteSelectedSegment();
  }, [deleteSelectedGate, deleteSelectedSegment]);

  const handleClearLayout = useCallback((): void => {
    applyLayout(() => ({ segments: [], gates: [] }));
    setDrawStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
  }, [
    applyLayout,
    setDrawStart,
    setSelectedGateId,
    setSelectedSegmentId
  ]);

  return {
    applySelectedLengthEdit,
    cancelActiveDrawing,
    deleteSelectedGate,
    deleteSelectedSegment,
    handleClearLayout,
    handleDeleteSelection,
    normalizeGateInputs,
    normalizeRecessInputs,
    onContextMenu,
    onCustomGateWidthInputChange,
    onRecessDepthInputChange,
    onRecessWidthInputChange,
    onStageMouseDown,
    onStageMouseMove,
    onStageMouseUp,
    onStageWheel,
    openLengthEditor,
    resetWorkspaceCanvas,
    startSelectedGateDrag,
    startSelectedSegmentDrag,
    updateSegment
  };
}

import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  BasketballPostPlacement,
  FenceSpec,
  GatePlacement,
  GateType,
  LayoutModel,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import { formatMetersInputFromMm } from "../formatters";
import { DRAW_INCREMENT_MM, MIN_SEGMENT_MM, parseMetersInputToMm, quantize } from "./constants";
import { dot, rangesOverlap, samePointApprox } from "./editorMath";
import {
  buildRectangleSegments,
  moveBasketballPostPlacementCollection,
  moveBasketballPostPlacementCollectionToOffset,
  moveGatePlacementCollectionToOffsets,
  moveGatePlacementCollection,
  offsetSegmentCollection,
  remapBasketballPostPlacementsForRecess,
  remapGatePlacementsForRecess,
  resizeSegmentCollection
} from "./editorCommandUtils";
import { buildRecessReplacementSegments } from "./recess";
import type {
  BasketballPostInsertionPreview,
  DrawResolveResult,
  GateInsertionPreview,
  InteractionMode,
  RecessInsertionPreview,
  ResolvedBasketballPostPlacement,
  ResolvedGatePlacement,
  SegmentConnectivity
} from "./types";

function isTouchStageEvent(event: KonvaEventObject<MouseEvent | TouchEvent>): boolean {
  return typeof (event.evt as MouseEvent).button !== "number";
}

interface SegmentDragEntry {
  segmentId: string;
  lastPointer: PointMm;
}

interface GateDragEntry {
  gateId: string;
  lastPointer: PointMm;
}

interface BasketballPostDragEntry {
  basketballPostId: string;
  lastPointer: PointMm;
}

type SegmentDragState = SegmentDragEntry | null;
type GateDragState = GateDragEntry | null;
type BasketballPostDragState = BasketballPostDragEntry | null;

interface PointerScreenPoint {
  x: number;
  y: number;
}

interface UseEditorCommandsOptions {
  stageRef: RefObject<Konva.Stage | null>;
  applyLayout: (updater: (previous: LayoutModel) => LayoutModel) => void;
  applySegments: (updater: (previous: LayoutSegment[]) => LayoutSegment[]) => void;
  applyGatePlacements: (updater: (previous: GatePlacement[]) => GatePlacement[]) => void;
  applyBasketballPostPlacements: (updater: (previous: BasketballPostPlacement[]) => BasketballPostPlacement[]) => void;
  segmentsById: Map<string, LayoutSegment>;
  resolvedGateById: Map<string, ResolvedGatePlacement>;
  resolvedBasketballPostById: Map<string, ResolvedBasketballPostPlacement>;
  connectivity: SegmentConnectivity;
  activeSpec: FenceSpec;
  interactionMode: InteractionMode;
  gateType: GateType;
  drawStart: PointMm | null;
  drawChainStart: PointMm | null;
  rectangleStart: PointMm | null;
  selectedSegmentId: string | null;
  selectedGateId: string | null;
  selectedBasketballPostId: string | null;
  selectedLengthInputM: string;
  isSpacePressed: boolean;
  isPanning: boolean;
  activeSegmentDrag: SegmentDragState;
  activeGateDrag: GateDragState;
  activeBasketballPostDrag: BasketballPostDragState;
  recessWidthMm: number;
  recessDepthMm: number;
  customGateWidthMm: number;
  recessPreview: RecessInsertionPreview | null;
  gatePreview: GateInsertionPreview | null;
  basketballPostPreview: BasketballPostInsertionPreview | null;
  resolveBasketballPostPreview: (worldPoint: PointMm) => BasketballPostInsertionPreview | null;
  resolveDrawPoint: (worldPoint: PointMm) => DrawResolveResult;
  toWorld: (screenPoint: PointerScreenPoint) => PointMm;
  beginPan: (pointer: PointerScreenPoint) => void;
  updatePan: (pointer: PointerScreenPoint) => boolean;
  endPan: () => void;
  zoomAtPointer: (pointer: PointerScreenPoint, deltaY: number) => void;
  setPointerWorld: (point: PointMm | null) => void;
  setDrawStart: Dispatch<SetStateAction<PointMm | null>>;
  setDrawChainStart: Dispatch<SetStateAction<PointMm | null>>;
  setRectangleStart: Dispatch<SetStateAction<PointMm | null>>;
  setSelectedSegmentId: Dispatch<SetStateAction<string | null>>;
  setSelectedGateId: Dispatch<SetStateAction<string | null>>;
  setSelectedBasketballPostId: Dispatch<SetStateAction<string | null>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
  setSelectedLengthInputM: Dispatch<SetStateAction<string>>;
  setIsLengthEditorOpen: Dispatch<SetStateAction<boolean>>;
  setActiveSegmentDrag: Dispatch<SetStateAction<SegmentDragState>>;
  setActiveGateDrag: Dispatch<SetStateAction<GateDragState>>;
  setActiveBasketballPostDrag: Dispatch<SetStateAction<BasketballPostDragState>>;
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
  applyBasketballPostPlacements,
  segmentsById,
  resolvedGateById,
  resolvedBasketballPostById,
  connectivity,
  activeSpec,
  interactionMode,
  gateType,
  drawStart,
  drawChainStart,
  rectangleStart,
  selectedSegmentId,
  selectedGateId,
  selectedBasketballPostId,
  selectedLengthInputM,
  isSpacePressed,
  isPanning,
  activeSegmentDrag,
  activeGateDrag,
  activeBasketballPostDrag,
  recessWidthMm,
  recessDepthMm,
  customGateWidthMm,
  recessPreview,
  gatePreview,
  basketballPostPreview,
  resolveBasketballPostPreview,
  resolveDrawPoint,
  toWorld,
  beginPan,
  updatePan,
  endPan,
  zoomAtPointer,
  setPointerWorld,
  setDrawStart,
  setDrawChainStart,
  setRectangleStart,
  setSelectedSegmentId,
  setSelectedGateId,
  setSelectedBasketballPostId,
  setSelectedPlanId,
  setSelectedLengthInputM,
  setIsLengthEditorOpen,
  setActiveSegmentDrag,
  setActiveGateDrag,
  setActiveBasketballPostDrag,
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
      setActiveBasketballPostDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
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

  const moveGateToPreview = useCallback(
    (gateId: string, preview: GateInsertionPreview): void => {
      applyGatePlacements((previous) =>
        moveGatePlacementCollectionToOffsets(
          previous,
          gateId,
          preview.startOffsetMm,
          preview.endOffsetMm,
          segmentsById
        )
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
      setActiveBasketballPostDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const moveBasketballPostAlongSegment = useCallback(
    (basketballPostId: string, deltaAlongMm: number): void => {
      if (Math.abs(deltaAlongMm) < 0.01) {
        return;
      }
      applyBasketballPostPlacements((previous) =>
        moveBasketballPostPlacementCollection(previous, basketballPostId, deltaAlongMm, segmentsById)
      );
    },
    [applyBasketballPostPlacements, segmentsById]
  );

  const moveBasketballPostToPreview = useCallback(
    (basketballPostId: string, preview: BasketballPostInsertionPreview): void => {
      applyBasketballPostPlacements((previous) =>
        moveBasketballPostPlacementCollectionToOffset(
          previous.map((basketballPost) =>
            basketballPost.id === basketballPostId
              ? {
                  ...basketballPost,
                  segmentId: preview.segment.id,
                  facing: preview.facing
                }
              : basketballPost
          ),
          basketballPostId,
          preview.offsetMm,
          segmentsById
        )
      );
    },
    [applyBasketballPostPlacements, segmentsById]
  );

  const startSelectedBasketballPostDrag = useCallback(
    (basketballPostId: string): void => {
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
      setActiveBasketballPostDrag({
        basketballPostId,
        lastPointer: toWorld(pointer)
      });
      setActiveGateDrag(null);
      setActiveSegmentDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const startOrCommitDrawing = useCallback(
    (worldPoint: PointMm): void => {
      const snappedPoint = resolveDrawPoint(worldPoint).point;

      if (!drawStart) {
        setDrawStart(snappedPoint);
        setDrawChainStart((previous) => previous ?? snappedPoint);
        setSelectedSegmentId(null);
        setSelectedGateId(null);
        setSelectedBasketballPostId(null);
        return;
      }

      if (distanceMm(drawStart, snappedPoint) < MIN_SEGMENT_MM) {
        return;
      }

      const closesLoop =
        drawChainStart !== null &&
        !samePointApprox(drawStart, drawChainStart) &&
        samePointApprox(snappedPoint, drawChainStart, DRAW_INCREMENT_MM * 0.5);

      applySegments((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          start: quantize(drawStart),
          end: quantize(snappedPoint),
          spec: activeSpec
        }
      ]);
      if (closesLoop) {
        setDrawStart(null);
        setDrawChainStart(null);
      } else {
        setDrawStart(snappedPoint);
      }
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
    },
    [
      activeSpec,
      applySegments,
      drawChainStart,
      drawStart,
      resolveDrawPoint,
      setDrawChainStart,
      setDrawStart,
      setSelectedBasketballPostId,
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
        setSelectedBasketballPostId(null);
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
      setSelectedBasketballPostId(null);
    },
    [
      activeSpec,
      applySegments,
      rectangleStart,
      resolveDrawPoint,
      setRectangleStart,
      setSelectedBasketballPostId,
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
          gates: remapGatePlacementsForRecess(previous.gates ?? [], preview, resolvedGateById, replacement),
          basketballPosts: remapBasketballPostPlacementsForRecess(previous.basketballPosts ?? [], preview, replacement)
        };
      });
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [
      applyLayout,
      resolvedGateById,
      setDrawChainStart,
      setDrawStart,
      setSelectedBasketballPostId,
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
      setSelectedBasketballPostId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [applyGatePlacements, gateType, setDrawChainStart, setDrawStart, setSelectedBasketballPostId, setSelectedSegmentId]
  );

  const insertBasketballPost = useCallback(
    (preview: BasketballPostInsertionPreview): void => {
      applyBasketballPostPlacements((previous) => {
        const nextBasketballPost: BasketballPostPlacement = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          offsetMm: preview.offsetMm,
          facing: preview.facing
        };
        const next = previous.filter(
          (placement) =>
            placement.segmentId !== nextBasketballPost.segmentId ||
            Math.abs(placement.offsetMm - nextBasketballPost.offsetMm) > DRAW_INCREMENT_MM * 0.5
        );
        next.push(nextBasketballPost);
        next.sort((left, right) => left.id.localeCompare(right.id));
        return next;
      });
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [applyBasketballPostPlacements, setDrawChainStart, setDrawStart, setSelectedBasketballPostId, setSelectedGateId, setSelectedSegmentId]
  );

  const onStageMouseDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>): void => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const isTouchInput = isTouchStageEvent(event);
      const mouseButton = isTouchInput ? 0 : (event.evt as MouseEvent).button;
      const isMiddleButton = mouseButton === 1;
      const isPanIntent = isMiddleButton || isSpacePressed;
      if (isPanIntent) {
        const pointer = stage.getPointerPosition();
        if (!pointer) {
          return;
        }
        beginPan(pointer);
        return;
      }

      if (mouseButton !== 0) {
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }
      const world = toWorld(pointer);

      if (interactionMode === "SELECT") {
        if (isTouchInput && event.target === stage) {
          beginPan(pointer);
          return;
        }
        if (event.target === stage) {
          setSelectedSegmentId(null);
          setSelectedGateId(null);
          setSelectedBasketballPostId(null);
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

      if (interactionMode === "BASKETBALL_POST") {
        const resolvedPreview = basketballPostPreview ?? resolveBasketballPostPreview(world);
        if (resolvedPreview) {
          insertBasketballPost(resolvedPreview);
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
      basketballPostPreview,
      insertBasketballPost,
      gatePreview,
      insertGate,
      insertRecess,
      interactionMode,
      isSpacePressed,
      recessPreview,
      setSelectedBasketballPostId,
      setSelectedGateId,
      setSelectedSegmentId,
      resolveBasketballPostPreview,
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

    if (activeBasketballPostDrag) {
      const basketballPost = resolvedBasketballPostById.get(activeBasketballPostDrag.basketballPostId);
      if (!basketballPost) {
        setActiveBasketballPostDrag(null);
        setPointerWorld(world);
        return;
      }
      if (basketballPostPreview && basketballPostPreview.segment.id === basketballPost.segmentId) {
        moveBasketballPostToPreview(basketballPost.id, basketballPostPreview);
        setActiveBasketballPostDrag((previous) =>
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
      const pointerDelta = {
        x: world.x - activeBasketballPostDrag.lastPointer.x,
        y: world.y - activeBasketballPostDrag.lastPointer.y
      };
      moveBasketballPostAlongSegment(basketballPost.id, dot(pointerDelta, basketballPost.tangent));
      setActiveBasketballPostDrag((previous) =>
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

    if (activeGateDrag) {
      const gate = resolvedGateById.get(activeGateDrag.gateId);
      if (!gate) {
        setActiveGateDrag(null);
        setPointerWorld(world);
        return;
      }
      if (gatePreview && gatePreview.segment.id === gate.segmentId) {
        moveGateToPreview(gate.id, gatePreview);
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
    activeBasketballPostDrag,
    activeGateDrag,
    activeSegmentDrag,
    basketballPostPreview,
    gatePreview,
    isPanning,
    moveBasketballPostAlongSegment,
    moveBasketballPostToPreview,
    moveGateAlongSegment,
    moveGateToPreview,
    offsetSegmentPerpendicular,
    resolvedBasketballPostById,
    resolvedGateById,
    setActiveBasketballPostDrag,
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
    setActiveBasketballPostDrag(null);
    endPan();
  }, [endPan, setActiveBasketballPostDrag, setActiveGateDrag, setActiveSegmentDrag]);

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
      setDrawChainStart(null);
    },
    [setDrawChainStart, setDrawStart, setRectangleStart]
  );

  const deleteSelectedGate = useCallback((): boolean => {
    if (!selectedGateId) {
      return false;
    }
    applyGatePlacements((previous) => previous.filter((gate) => gate.id !== selectedGateId));
    setSelectedGateId(null);
    return true;
  }, [applyGatePlacements, selectedGateId, setSelectedGateId]);

  const deleteSelectedBasketballPost = useCallback((): boolean => {
    if (!selectedBasketballPostId) {
      return false;
    }
    applyBasketballPostPlacements((previous) =>
      previous.filter((basketballPost) => basketballPost.id !== selectedBasketballPostId)
    );
    setSelectedBasketballPostId(null);
    return true;
  }, [applyBasketballPostPlacements, selectedBasketballPostId, setSelectedBasketballPostId]);

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
    setDrawChainStart(null);
    setSelectedBasketballPostId(null);
  }, [setDrawChainStart, setDrawStart, setRectangleStart, setSelectedBasketballPostId]);

  const resetWorkspaceCanvas = useCallback((): void => {
    applyLayout(() => ({ segments: [], gates: [], basketballPosts: [] }));
    setDrawStart(null);
    setDrawChainStart(null);
    setRectangleStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedPlanId(null);
    setIsLengthEditorOpen(false);
  }, [
    applyLayout,
    setDrawChainStart,
    setDrawStart,
    setIsLengthEditorOpen,
    setRectangleStart,
    setSelectedBasketballPostId,
    setSelectedGateId,
    setSelectedPlanId,
    setSelectedSegmentId
  ]);

  const handleDeleteSelection = useCallback((): void => {
    if (deleteSelectedGate()) {
      return;
    }
    if (deleteSelectedBasketballPost()) {
      return;
    }
    void deleteSelectedSegment();
  }, [deleteSelectedBasketballPost, deleteSelectedGate, deleteSelectedSegment]);

  const handleClearLayout = useCallback((): void => {
    applyLayout(() => ({ segments: [], gates: [], basketballPosts: [] }));
    setDrawStart(null);
    setDrawChainStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
  }, [
    applyLayout,
    setDrawChainStart,
    setDrawStart,
    setSelectedBasketballPostId,
    setSelectedGateId,
    setSelectedSegmentId
  ]);

  return {
    applySelectedLengthEdit,
    cancelActiveDrawing,
    deleteSelectedGate,
    deleteSelectedBasketballPost,
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
    startSelectedBasketballPostDrag,
    startSelectedGateDrag,
    startSelectedSegmentDrag,
    updateSegment
  };
}

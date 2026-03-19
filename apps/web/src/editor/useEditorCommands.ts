import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type {
  BasketballPostPlacement,
  FenceSpec,
  FloodlightColumnPlacement,
  GatePlacement,
  GateType,
  GoalUnitPlacement,
  KickboardAttachment,
  LayoutModel,
  LayoutSegment,
  PitchDividerPlacement,
  PointMm,
  SideNettingAttachment
} from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";
import { findOppositeBasketballPairCandidate } from "@fence-estimator/rules-engine";

import { formatMetersInputFromMm } from "../formatters";
import { DRAW_INCREMENT_MM, MIN_SEGMENT_MM, parseMetersInputToMm, quantize } from "./constants";
import { dot, rangesOverlap, samePointApprox } from "./editorMath";
import {
  buildRectangleSegments,
  moveBasketballPostPlacementCollection,
  moveBasketballPostPlacementCollectionToOffset,
  moveFloodlightColumnPlacementCollection,
  moveFloodlightColumnPlacementCollectionToOffset,
  moveGatePlacementCollectionToOffsets,
  moveGatePlacementCollection,
  offsetSegmentCollection,
  remapBasketballPostPlacementsForRecess,
  remapFloodlightColumnPlacementsForRecess,
  remapGatePlacementsForRecess,
  resizeSegmentCollection
} from "./editorCommandUtils";
import { buildRecessReplacementSegments } from "./recess";
import type {
  BasketballPostInsertionPreview,
  DrawResolveResult,
  FloodlightColumnInsertionPreview,
  GateInsertionPreview,
  GoalUnitInsertionPreview,
  InteractionMode,
  PitchDividerAnchorPreview,
  PitchDividerSpanPreview,
  RecessInsertionPreview,
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement,
  SegmentAttachmentPreview,
  SegmentRangePreview,
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

interface FloodlightColumnDragEntry {
  floodlightColumnId: string;
  lastPointer: PointMm;
}

type SegmentDragState = SegmentDragEntry | null;
type GateDragState = GateDragEntry | null;
type BasketballPostDragState = BasketballPostDragEntry | null;
type FloodlightColumnDragState = FloodlightColumnDragEntry | null;

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
  applyFloodlightColumnPlacements?: (updater: (previous: FloodlightColumnPlacement[]) => FloodlightColumnPlacement[]) => void;
  segments?: LayoutSegment[];
  segmentsById: Map<string, LayoutSegment>;
  resolvedGateById: Map<string, ResolvedGatePlacement>;
  resolvedBasketballPostById: Map<string, ResolvedBasketballPostPlacement>;
  resolvedFloodlightColumnById?: Map<string, ResolvedFloodlightColumnPlacement>;
  connectivity: SegmentConnectivity;
  activeSpec: FenceSpec;
  interactionMode: InteractionMode;
  goalUnitDepthMm?: number;
  goalUnitHeightMm?: 3000 | 4000;
  gateType: GateType;
  basketballPlacementType?: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST";
  basketballArmLengthMm?: 1200 | 1800;
  kickboardSectionHeightMm?: 200 | 225 | 250;
  kickboardProfile?: "SQUARE" | "CHAMFERED";
  sideNettingHeightMm?: number;
  pendingPitchDividerStart?: PitchDividerAnchorPreview | null;
  pendingSideNettingStart?: PitchDividerAnchorPreview | null;
  drawStart: PointMm | null;
  drawChainStart: PointMm | null;
  rectangleStart: PointMm | null;
  selectedSegmentId: string | null;
  selectedGateId: string | null;
  selectedBasketballPostId: string | null;
  selectedFloodlightColumnId?: string | null;
  selectedLengthInputM: string;
  isSpacePressed: boolean;
  isPanning: boolean;
  activeSegmentDrag: SegmentDragState;
  activeGateDrag: GateDragState;
  activeBasketballPostDrag: BasketballPostDragState;
  activeFloodlightColumnDrag?: FloodlightColumnDragState;
  recessWidthMm: number;
  recessDepthMm: number;
  customGateWidthMm: number;
  recessPreview: RecessInsertionPreview | null;
  goalUnitPreview?: GoalUnitInsertionPreview | null;
  gatePreview: GateInsertionPreview | null;
  basketballPostPreview: BasketballPostInsertionPreview | null;
  floodlightColumnPreview?: FloodlightColumnInsertionPreview | null;
  kickboardPreview?: SegmentAttachmentPreview | null;
  pitchDividerAnchorPreview?: PitchDividerAnchorPreview | null;
  pitchDividerPreview?: PitchDividerSpanPreview | null;
  sideNettingAnchorPreview?: PitchDividerAnchorPreview | null;
  sideNettingPreview?: SegmentRangePreview | null;
  resolveBasketballPostPreview: (worldPoint: PointMm) => BasketballPostInsertionPreview | null;
  resolveFloodlightColumnPreview?: (worldPoint: PointMm) => FloodlightColumnInsertionPreview | null;
  resolvePitchDividerAnchorPreview?: (worldPoint: PointMm) => PitchDividerAnchorPreview | null;
  resolveSideNettingAnchorPreview?: (worldPoint: PointMm) => PitchDividerAnchorPreview | null;
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
  setSelectedFloodlightColumnId?: Dispatch<SetStateAction<string | null>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
  setSelectedLengthInputM: Dispatch<SetStateAction<string>>;
  setIsLengthEditorOpen: Dispatch<SetStateAction<boolean>>;
  setActiveSegmentDrag: Dispatch<SetStateAction<SegmentDragState>>;
  setActiveGateDrag: Dispatch<SetStateAction<GateDragState>>;
  setActiveBasketballPostDrag: Dispatch<SetStateAction<BasketballPostDragState>>;
  setActiveFloodlightColumnDrag?: Dispatch<SetStateAction<FloodlightColumnDragState>>;
  setRecessWidthMm: Dispatch<SetStateAction<number>>;
  setRecessDepthMm: Dispatch<SetStateAction<number>>;
  setRecessWidthInputM: Dispatch<SetStateAction<string>>;
  setRecessDepthInputM: Dispatch<SetStateAction<string>>;
  setCustomGateWidthMm: Dispatch<SetStateAction<number>>;
  setCustomGateWidthInputM: Dispatch<SetStateAction<string>>;
  setPendingPitchDividerStart?: Dispatch<SetStateAction<PitchDividerAnchorPreview | null>>;
  setPendingSideNettingStart?: Dispatch<SetStateAction<PitchDividerAnchorPreview | null>>;
}

export function useEditorCommands({
  stageRef,
  applyLayout,
  applySegments,
  applyGatePlacements,
  applyBasketballPostPlacements,
  applyFloodlightColumnPlacements = () => undefined,
  segments,
  segmentsById,
  resolvedGateById,
  resolvedBasketballPostById,
  resolvedFloodlightColumnById = new Map(),
  connectivity,
  activeSpec,
  interactionMode,
  goalUnitDepthMm = 1200,
  goalUnitHeightMm = 3000,
  gateType,
  basketballPlacementType = "DEDICATED_POST",
  basketballArmLengthMm = 1800,
  kickboardSectionHeightMm = 200,
  kickboardProfile = "SQUARE",
  sideNettingHeightMm = 2000,
  pendingPitchDividerStart = null,
  pendingSideNettingStart = null,
  drawStart,
  drawChainStart,
  rectangleStart,
  selectedSegmentId,
  selectedGateId,
  selectedBasketballPostId,
  selectedFloodlightColumnId = null,
  selectedLengthInputM,
  isSpacePressed,
  isPanning,
  activeSegmentDrag,
  activeGateDrag,
  activeBasketballPostDrag,
  activeFloodlightColumnDrag = null,
  recessWidthMm,
  recessDepthMm,
  customGateWidthMm,
  recessPreview,
  goalUnitPreview = null,
  gatePreview,
  basketballPostPreview,
  floodlightColumnPreview = null,
  kickboardPreview = null,
  pitchDividerAnchorPreview = null,
  pitchDividerPreview = null,
  sideNettingAnchorPreview = null,
  sideNettingPreview = null,
  resolveBasketballPostPreview,
  resolveFloodlightColumnPreview = () => null,
  resolvePitchDividerAnchorPreview = () => null,
  resolveSideNettingAnchorPreview = () => null,
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
  setSelectedFloodlightColumnId = () => null,
  setSelectedPlanId,
  setSelectedLengthInputM,
  setIsLengthEditorOpen,
  setActiveSegmentDrag,
  setActiveGateDrag,
  setActiveBasketballPostDrag,
  setActiveFloodlightColumnDrag = () => null,
  setRecessWidthMm,
  setRecessDepthMm,
  setRecessWidthInputM,
  setRecessDepthInputM,
  setCustomGateWidthMm,
  setCustomGateWidthInputM,
  setPendingPitchDividerStart = () => null,
  setPendingSideNettingStart = () => null
}: UseEditorCommandsOptions) {
  const availableSegments = segments ?? [...segmentsById.values()];
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
      setActiveFloodlightColumnDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
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
      setActiveFloodlightColumnDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
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
      setActiveFloodlightColumnDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const moveFloodlightColumnAlongSegment = useCallback(
    (floodlightColumnId: string, deltaAlongMm: number): void => {
      if (Math.abs(deltaAlongMm) < 0.01) {
        return;
      }
      applyFloodlightColumnPlacements((previous) =>
        moveFloodlightColumnPlacementCollection(previous, floodlightColumnId, deltaAlongMm, segmentsById)
      );
    },
    [applyFloodlightColumnPlacements, segmentsById]
  );

  const moveFloodlightColumnToPreview = useCallback(
    (floodlightColumnId: string, preview: FloodlightColumnInsertionPreview): void => {
      applyFloodlightColumnPlacements((previous) =>
        moveFloodlightColumnPlacementCollectionToOffset(
          previous.map((floodlightColumn) =>
            floodlightColumn.id === floodlightColumnId
              ? {
                  ...floodlightColumn,
                  segmentId: preview.segment.id,
                  facing: preview.facing
                }
              : floodlightColumn
          ),
          floodlightColumnId,
          preview.offsetMm,
          segmentsById
        )
      );
    },
    [applyFloodlightColumnPlacements, segmentsById]
  );

  const startSelectedFloodlightColumnDrag = useCallback(
    (floodlightColumnId: string): void => {
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
      setActiveFloodlightColumnDrag({
        floodlightColumnId,
        lastPointer: toWorld(pointer)
      });
      setActiveGateDrag(null);
      setActiveSegmentDrag(null);
      setActiveBasketballPostDrag(null);
    },
    [interactionMode, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
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
        setSelectedFloodlightColumnId(null);
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
      setSelectedFloodlightColumnId(null);
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
      setSelectedFloodlightColumnId,
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
        setSelectedFloodlightColumnId(null);
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
      setSelectedFloodlightColumnId(null);
    },
    [
      activeSpec,
      applySegments,
      rectangleStart,
      resolveDrawPoint,
      setRectangleStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
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
          ...previous,
          segments: nextSegments,
          gates: remapGatePlacementsForRecess(previous.gates ?? [], preview, resolvedGateById, replacement),
          basketballPosts: remapBasketballPostPlacementsForRecess(previous.basketballPosts ?? [], preview, replacement),
          floodlightColumns: remapFloodlightColumnPlacementsForRecess(previous.floodlightColumns ?? [], preview, replacement)
        };
      });
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setSelectedFloodlightColumnId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [
      applyLayout,
      resolvedGateById,
      setDrawChainStart,
      setDrawStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
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
      setSelectedFloodlightColumnId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [applyGatePlacements, gateType, setDrawChainStart, setDrawStart, setSelectedBasketballPostId, setSelectedFloodlightColumnId, setSelectedSegmentId]
  );

  const insertGoalUnit = useCallback(
    (preview: GoalUnitInsertionPreview): void => {
      applyLayout((previous) => {
        const nextGoalUnit: GoalUnitPlacement = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          centerOffsetMm: (preview.startOffsetMm + preview.endOffsetMm) / 2,
          side: preview.side,
          widthMm: preview.widthMm as GoalUnitPlacement["widthMm"],
          depthMm: goalUnitDepthMm,
          goalHeightMm: goalUnitHeightMm
        };
        const nextStartOffsetMm = nextGoalUnit.centerOffsetMm - nextGoalUnit.widthMm / 2;
        const nextEndOffsetMm = nextGoalUnit.centerOffsetMm + nextGoalUnit.widthMm / 2;
        const goalUnits = (previous.goalUnits ?? []).filter((placement) => {
          if (placement.segmentId !== nextGoalUnit.segmentId) {
            return true;
          }
          const placementStartOffsetMm = placement.centerOffsetMm - placement.widthMm / 2;
          const placementEndOffsetMm = placement.centerOffsetMm + placement.widthMm / 2;
          return !rangesOverlap(
            placementStartOffsetMm,
            placementEndOffsetMm,
            nextStartOffsetMm,
            nextEndOffsetMm
          );
        });
        goalUnits.push(nextGoalUnit);
        goalUnits.sort((left, right) => left.id.localeCompare(right.id));
        return {
          ...previous,
          goalUnits
        };
      });
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setSelectedFloodlightColumnId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [
      applyLayout,
      goalUnitDepthMm,
      goalUnitHeightMm,
      setDrawChainStart,
      setDrawStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
      setSelectedGateId,
      setSelectedSegmentId
    ]
  );

  const insertBasketballPost = useCallback(
    (preview: BasketballPostInsertionPreview): void => {
      const pairCandidate = findOppositeBasketballPairCandidate(
        availableSegments,
        preview.segment.id,
        preview.offsetMm,
        preview.facing
      );
      applyBasketballPostPlacements((previous) => {
        const nextBasketballPostId = crypto.randomUUID();
        const basePlacement: BasketballPostPlacement = {
          id: nextBasketballPostId,
          segmentId: preview.segment.id,
          offsetMm: preview.offsetMm,
          facing: preview.facing,
          type: basketballPlacementType,
          mountingMode: basketballPlacementType === "DEDICATED_POST" ? "PROJECTING_ARM" : "POST_MOUNTED",
          armLengthMm: basketballPlacementType === "DEDICATED_POST" ? basketballArmLengthMm : undefined,
          replacesIntermediatePost: basketballPlacementType === "DEDICATED_POST"
        };
        const pairedBasketballPostId = pairCandidate ? crypto.randomUUID() : null;
        const nextBasketballPost: BasketballPostPlacement = pairCandidate
          ? {
              ...basePlacement,
              pairedFeatureId: pairedBasketballPostId
            }
          : basePlacement;
        const pairedPlacement =
          pairCandidate && pairedBasketballPostId
            ? ({
                id: pairedBasketballPostId,
                segmentId: pairCandidate.segmentId,
                offsetMm: pairCandidate.offsetMm,
                facing: pairCandidate.facing,
                type: basketballPlacementType,
                mountingMode: basketballPlacementType === "DEDICATED_POST" ? "PROJECTING_ARM" : "POST_MOUNTED",
                armLengthMm: basketballPlacementType === "DEDICATED_POST" ? basketballArmLengthMm : undefined,
                pairedFeatureId: nextBasketballPostId,
                replacesIntermediatePost: basketballPlacementType === "DEDICATED_POST"
              } satisfies BasketballPostPlacement)
            : null;
        const next = previous.filter((placement) => {
          const conflictsWithSource =
            placement.segmentId === nextBasketballPost.segmentId &&
            Math.abs(placement.offsetMm - nextBasketballPost.offsetMm) <= DRAW_INCREMENT_MM * 0.5;
          const conflictsWithPair =
            pairedPlacement !== null &&
            placement.segmentId === pairedPlacement.segmentId &&
            Math.abs(placement.offsetMm - pairedPlacement.offsetMm) <= DRAW_INCREMENT_MM * 0.5;
          return !conflictsWithSource && !conflictsWithPair;
        });
        next.push(nextBasketballPost);
        if (pairedPlacement) {
          next.push(pairedPlacement);
        }
        next.sort((left, right) => left.id.localeCompare(right.id));
        return next;
      });
      if (!pairCandidate) {
        globalThis.window?.alert?.(
          "No valid opposite basketball location was found. The first set was placed; partner selection UI is still TODO."
        );
      }
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setSelectedFloodlightColumnId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [
      applyBasketballPostPlacements,
      basketballArmLengthMm,
      basketballPlacementType,
      availableSegments,
      setDrawChainStart,
      setDrawStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
      setSelectedGateId,
      setSelectedSegmentId
    ]
  );

  const insertFloodlightColumn = useCallback(
    (preview: FloodlightColumnInsertionPreview): void => {
      applyFloodlightColumnPlacements((previous) => {
        const nextFloodlightColumn: FloodlightColumnPlacement = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          offsetMm: preview.offsetMm,
          facing: preview.facing
        };
        const next = previous.filter(
          (placement) =>
            placement.segmentId !== nextFloodlightColumn.segmentId ||
            Math.abs(placement.offsetMm - nextFloodlightColumn.offsetMm) > DRAW_INCREMENT_MM * 0.5
        );
        next.push(nextFloodlightColumn);
        next.sort((left, right) => left.id.localeCompare(right.id));
        return next;
      });
      setSelectedSegmentId(null);
      setSelectedGateId(null);
      setSelectedBasketballPostId(null);
      setSelectedFloodlightColumnId(null);
      setDrawStart(null);
      setDrawChainStart(null);
    },
    [
      applyFloodlightColumnPlacements,
      setDrawChainStart,
      setDrawStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
      setSelectedGateId,
      setSelectedSegmentId
    ]
  );

  const applyKickboardAttachment = useCallback(
    (preview: SegmentAttachmentPreview): void => {
      applyLayout((previous) => {
        const nextKickboard: KickboardAttachment = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          sectionHeightMm: kickboardSectionHeightMm,
          thicknessMm: 50,
          profile: kickboardProfile,
          boardLengthMm: 2500
        };
        const kickboards = (previous.kickboards ?? []).filter((attachment) => attachment.segmentId !== nextKickboard.segmentId);
        kickboards.push(nextKickboard);
        kickboards.sort((left, right) => left.id.localeCompare(right.id));
        return {
          ...previous,
          kickboards
        };
      });
    },
    [applyLayout, kickboardProfile, kickboardSectionHeightMm]
  );

  const applySideNettingAttachment = useCallback(
    (preview: SegmentRangePreview): void => {
      applyLayout((previous) => {
        const nextSideNetting: SideNettingAttachment = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          additionalHeightMm: sideNettingHeightMm,
          startOffsetMm: preview.startOffsetMm,
          endOffsetMm: preview.endOffsetMm,
          extendedPostInterval: 3
        };
        const sideNettings = (previous.sideNettings ?? []).filter((attachment) => attachment.segmentId !== nextSideNetting.segmentId);
        sideNettings.push(nextSideNetting);
        sideNettings.sort((left, right) => left.id.localeCompare(right.id));
        return {
          ...previous,
          sideNettings
        };
      });
    },
    [applyLayout, sideNettingHeightMm]
  );

  const applyPitchDividerPlacement = useCallback(
    (preview: PitchDividerSpanPreview): void => {
      if (!preview.isValid) {
        return;
      }
      applyLayout((previous) => {
        const nextPitchDivider: PitchDividerPlacement = {
          id: crypto.randomUUID(),
          startAnchor: {
            segmentId: preview.startAnchor.segment.id,
            offsetMm: preview.startAnchor.offsetMm
          },
          endAnchor: {
            segmentId: preview.endAnchor.segment.id,
            offsetMm: preview.endAnchor.offsetMm
          }
        };
        const pitchDividers = [...(previous.pitchDividers ?? []), nextPitchDivider].sort((left, right) =>
          left.id.localeCompare(right.id)
        );
        return {
          ...previous,
          pitchDividers
        };
      });
      setPendingPitchDividerStart(null);
    },
    [applyLayout, setPendingPitchDividerStart]
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
          setSelectedFloodlightColumnId(null);
        }
        return;
      }

      if (interactionMode === "RECESS") {
        if (recessPreview) {
          insertRecess(recessPreview);
        }
        return;
      }

      if (interactionMode === "GOAL_UNIT") {
        if (goalUnitPreview) {
          insertGoalUnit(goalUnitPreview);
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

      if (interactionMode === "FLOODLIGHT_COLUMN") {
        const resolvedPreview = floodlightColumnPreview ?? resolveFloodlightColumnPreview(world);
        if (resolvedPreview) {
          insertFloodlightColumn(resolvedPreview);
        }
        return;
      }

      if (interactionMode === "KICKBOARD") {
        if (kickboardPreview) {
          applyKickboardAttachment(kickboardPreview);
        }
        return;
      }

      if (interactionMode === "SIDE_NETTING") {
        const resolvedAnchor = sideNettingAnchorPreview ?? resolveSideNettingAnchorPreview(world);
        if (!pendingSideNettingStart) {
          if (resolvedAnchor) {
            setPendingSideNettingStart(resolvedAnchor);
          }
          return;
        }
        if (sideNettingPreview) {
          applySideNettingAttachment(sideNettingPreview);
          setPendingSideNettingStart(null);
          return;
        }
        if (resolvedAnchor) {
          setPendingSideNettingStart(resolvedAnchor);
        }
        return;
      }

      if (interactionMode === "PITCH_DIVIDER") {
        const resolvedAnchor = pitchDividerAnchorPreview ?? resolvePitchDividerAnchorPreview(world);
        if (!pendingPitchDividerStart) {
          if (resolvedAnchor) {
            setPendingPitchDividerStart(resolvedAnchor);
          }
          return;
        }
        if (pitchDividerPreview?.isValid) {
          applyPitchDividerPlacement(pitchDividerPreview);
          return;
        }
        if (resolvedAnchor) {
          setPendingPitchDividerStart(resolvedAnchor);
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
      floodlightColumnPreview,
      insertBasketballPost,
      insertFloodlightColumn,
      insertGoalUnit,
      gatePreview,
      insertGate,
      goalUnitPreview,
      kickboardPreview,
      applyKickboardAttachment,
      applyPitchDividerPlacement,
      insertRecess,
      interactionMode,
      isSpacePressed,
      pendingPitchDividerStart,
      pendingSideNettingStart,
      pitchDividerAnchorPreview,
      pitchDividerPreview,
      recessPreview,
      resolvePitchDividerAnchorPreview,
      resolveSideNettingAnchorPreview,
      setPendingPitchDividerStart,
      setPendingSideNettingStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
      setSelectedGateId,
      setSelectedSegmentId,
      sideNettingAnchorPreview,
      sideNettingPreview,
      applySideNettingAttachment,
      resolveBasketballPostPreview,
      resolveFloodlightColumnPreview,
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

    if (activeFloodlightColumnDrag) {
      const floodlightColumn = resolvedFloodlightColumnById.get(activeFloodlightColumnDrag.floodlightColumnId);
      if (!floodlightColumn) {
        setActiveFloodlightColumnDrag(null);
        setPointerWorld(world);
        return;
      }
      if (floodlightColumnPreview && floodlightColumnPreview.segment.id === floodlightColumn.segmentId) {
        moveFloodlightColumnToPreview(floodlightColumn.id, floodlightColumnPreview);
        setActiveFloodlightColumnDrag((previous) =>
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
        x: world.x - activeFloodlightColumnDrag.lastPointer.x,
        y: world.y - activeFloodlightColumnDrag.lastPointer.y
      };
      moveFloodlightColumnAlongSegment(floodlightColumn.id, dot(pointerDelta, floodlightColumn.tangent));
      setActiveFloodlightColumnDrag((previous) =>
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
    activeFloodlightColumnDrag,
    activeGateDrag,
    activeSegmentDrag,
    basketballPostPreview,
    floodlightColumnPreview,
    gatePreview,
    isPanning,
    moveBasketballPostAlongSegment,
    moveBasketballPostToPreview,
    moveFloodlightColumnAlongSegment,
    moveFloodlightColumnToPreview,
    moveGateAlongSegment,
    moveGateToPreview,
    offsetSegmentPerpendicular,
    resolvedBasketballPostById,
    resolvedFloodlightColumnById,
    resolvedGateById,
    setActiveBasketballPostDrag,
    setActiveFloodlightColumnDrag,
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
    setActiveFloodlightColumnDrag(null);
    endPan();
  }, [endPan, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag]);

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
      setPendingPitchDividerStart(null);
      setPendingSideNettingStart(null);
    },
    [setDrawChainStart, setDrawStart, setPendingPitchDividerStart, setPendingSideNettingStart, setRectangleStart]
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

  const deleteSelectedFloodlightColumn = useCallback((): boolean => {
    if (!selectedFloodlightColumnId) {
      return false;
    }
    applyFloodlightColumnPlacements((previous) =>
      previous.filter((floodlightColumn) => floodlightColumn.id !== selectedFloodlightColumnId)
    );
    setSelectedFloodlightColumnId(null);
    return true;
  }, [applyFloodlightColumnPlacements, selectedFloodlightColumnId, setSelectedFloodlightColumnId]);

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
    setPendingPitchDividerStart(null);
    setPendingSideNettingStart(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
  }, [
    setDrawChainStart,
    setDrawStart,
    setPendingPitchDividerStart,
    setPendingSideNettingStart,
    setRectangleStart,
    setSelectedBasketballPostId,
    setSelectedFloodlightColumnId
  ]);

  const resetWorkspaceCanvas = useCallback((): void => {
    applyLayout(() => ({
      segments: [],
      gates: [],
      basketballPosts: [],
      floodlightColumns: [],
      goalUnits: [],
      kickboards: [],
      pitchDividers: [],
      sideNettings: []
    }));
    setDrawStart(null);
    setDrawChainStart(null);
    setRectangleStart(null);
    setPendingPitchDividerStart(null);
    setPendingSideNettingStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
    setSelectedPlanId(null);
    setIsLengthEditorOpen(false);
  }, [
    applyLayout,
    setDrawChainStart,
    setDrawStart,
    setIsLengthEditorOpen,
    setPendingPitchDividerStart,
    setPendingSideNettingStart,
    setRectangleStart,
    setSelectedBasketballPostId,
    setSelectedFloodlightColumnId,
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
    if (deleteSelectedFloodlightColumn()) {
      return;
    }
    void deleteSelectedSegment();
  }, [deleteSelectedBasketballPost, deleteSelectedFloodlightColumn, deleteSelectedGate, deleteSelectedSegment]);

  const handleClearLayout = useCallback((): void => {
    applyLayout(() => ({
      segments: [],
      gates: [],
      basketballPosts: [],
      floodlightColumns: [],
      goalUnits: [],
      kickboards: [],
      pitchDividers: [],
      sideNettings: []
    }));
    setDrawStart(null);
    setDrawChainStart(null);
    setPendingPitchDividerStart(null);
    setPendingSideNettingStart(null);
    setSelectedSegmentId(null);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
  }, [
    applyLayout,
    setDrawChainStart,
    setDrawStart,
    setPendingPitchDividerStart,
    setPendingSideNettingStart,
    setSelectedBasketballPostId,
    setSelectedFloodlightColumnId,
    setSelectedGateId,
    setSelectedSegmentId
  ]);

  return {
    applySelectedLengthEdit,
    cancelActiveDrawing,
    deleteSelectedGate,
    deleteSelectedBasketballPost,
    deleteSelectedFloodlightColumn,
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
    startSelectedFloodlightColumnDrag,
    startSelectedGateDrag,
    startSelectedSegmentDrag,
    updateSegment
  };
}

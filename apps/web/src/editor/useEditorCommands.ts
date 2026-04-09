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
import type { SegmentOpeningSpan } from "@fence-estimator/rules-engine";
import { distanceMm } from "@fence-estimator/geometry";

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
  remapGoalUnitPlacementsForRecess,
  remapKickboardAttachmentsForRecess,
  remapPitchDividerPlacementsForRecess,
  remapSideNettingAttachmentsForRecess,
  resizeSegmentCollection
} from "./editorCommandUtils";
import type {
  ActiveBasketballPostDragState,
  ActiveFloodlightColumnDragState,
  ActiveGateDragState,
  ActiveSegmentDragState,
  SegmentDragReferenceState
} from "./useEditorSelectionState";
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

type SegmentDragState = ActiveSegmentDragState | null;
type GateDragState = ActiveGateDragState | null;
type BasketballPostDragState = ActiveBasketballPostDragState | null;
type FloodlightColumnDragState = ActiveFloodlightColumnDragState | null;

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
  beginLayoutBatch?: () => void;
  commitLayoutBatch?: () => void;
  segments?: LayoutSegment[];
  segmentsById: Map<string, LayoutSegment>;
  featureHostSegmentsById?: Map<string, LayoutSegment>;
  goalUnitOpeningsBySegmentId?: ReadonlyMap<string, readonly SegmentOpeningSpan[]>;
  resolvedGateById: Map<string, ResolvedGatePlacement>;
  resolvedBasketballPostById: Map<string, ResolvedBasketballPostPlacement>;
  resolvedFloodlightColumnById?: Map<string, ResolvedFloodlightColumnPlacement>;
  connectivity: SegmentConnectivity;
  activeSpec: FenceSpec;
  isReadOnly?: boolean;
  interactionMode: InteractionMode;
  goalUnitDepthMm?: number;
  goalUnitHasBasketballPost?: boolean;
  goalUnitHeightMm?: number;
  gateType: GateType;
  basketballPlacementType?: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST";
  basketballArmLengthMm?: number;
  kickboardSectionHeightMm?: number;
  kickboardProfile?: string;
  kickboardThicknessMm?: number;
  kickboardBoardLengthMm?: number;
  floodlightColumnHeightMm?: number;
  sideNettingHeightMm?: number;
  pendingPitchDividerStart?: PitchDividerAnchorPreview | null;
  drawAnchorNodes: PointMm[];
  lineSnapSegments?: LayoutSegment[];
  drawStart: PointMm | null;
  drawChainStart: PointMm | null;
  rectangleStart: PointMm | null;
  selectedSegmentId: string | null;
  selectedSegmentIds: string[];
  selectedGateId: string | null;
  selectedBasketballPostId: string | null;
  selectedFloodlightColumnId?: string | null;
  selectedLengthInputM: string;
  disableSnap?: boolean;
  isSpacePressed: boolean;
  isPanning: boolean;
  activeSegmentDrag: SegmentDragState;
  segmentDragReference: SegmentDragReferenceState | null;
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
  pendingSideNettingStart?: PitchDividerAnchorPreview | null;
  sideNettingAnchorPreview?: PitchDividerAnchorPreview | null;
  sideNettingPreview?: SegmentRangePreview | null;
  sideNettingSegmentPreview?: SegmentAttachmentPreview | null;
  resolveBasketballPostPreview: (worldPoint: PointMm) => BasketballPostInsertionPreview | null;
  resolveFloodlightColumnPreview?: (worldPoint: PointMm) => FloodlightColumnInsertionPreview | null;
  resolvePitchDividerAnchorPreview?: (worldPoint: PointMm) => PitchDividerAnchorPreview | null;
  resolveSideNettingAnchorPreview?: (worldPoint: PointMm) => PitchDividerAnchorPreview | null;
  resolveSideNettingSegmentPreview?: (worldPoint: PointMm) => SegmentAttachmentPreview | null;
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
  setSelectedSegmentIds: Dispatch<SetStateAction<string[]>>;
  setSelectedGateId: Dispatch<SetStateAction<string | null>>;
  setSelectedBasketballPostId: Dispatch<SetStateAction<string | null>>;
  setSelectedFloodlightColumnId?: Dispatch<SetStateAction<string | null>>;
  setSuppressNextSegmentClick: Dispatch<SetStateAction<boolean>>;
  setSelectedPlanId: Dispatch<SetStateAction<string | null>>;
  setSelectedLengthInputM: Dispatch<SetStateAction<string>>;
  setIsLengthEditorOpen: Dispatch<SetStateAction<boolean>>;
  setActiveSegmentDrag: Dispatch<SetStateAction<SegmentDragState>>;
  setSegmentDragReference: Dispatch<SetStateAction<SegmentDragReferenceState | null>>;
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
  beginLayoutBatch = () => undefined,
  commitLayoutBatch = () => undefined,
  segments = [],
  segmentsById,
  featureHostSegmentsById = segmentsById,
  goalUnitOpeningsBySegmentId = new Map<string, readonly SegmentOpeningSpan[]>(),
  resolvedGateById,
  resolvedBasketballPostById,
  resolvedFloodlightColumnById = new Map(),
  connectivity,
  activeSpec,
  isReadOnly = false,
  interactionMode,
  goalUnitDepthMm = 1200,
  goalUnitHasBasketballPost = false,
  goalUnitHeightMm = 3000,
  gateType,
  basketballPlacementType = "DEDICATED_POST",
  basketballArmLengthMm = 1800,
  kickboardSectionHeightMm = 200,
  kickboardProfile = "SQUARE",
  kickboardThicknessMm = 50,
  kickboardBoardLengthMm = 2500,
  floodlightColumnHeightMm = 6000,
  sideNettingHeightMm = 2000,
  pendingPitchDividerStart = null,
  drawAnchorNodes,
  lineSnapSegments = segments,
  drawStart,
  drawChainStart,
  rectangleStart,
  selectedSegmentId,
  selectedSegmentIds,
  selectedGateId,
  selectedBasketballPostId,
  selectedFloodlightColumnId = null,
  selectedLengthInputM,
  disableSnap = false,
  isSpacePressed,
  isPanning,
  activeSegmentDrag,
  segmentDragReference,
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
  pendingSideNettingStart = null,
  sideNettingAnchorPreview = null,
  sideNettingPreview = null,
  sideNettingSegmentPreview = null,
  resolveBasketballPostPreview,
  resolveFloodlightColumnPreview = () => null,
  resolvePitchDividerAnchorPreview = () => null,
  resolveSideNettingAnchorPreview = () => null,
  resolveSideNettingSegmentPreview = () => null,
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
  setSelectedSegmentIds,
  setSelectedGateId,
  setSelectedBasketballPostId,
  setSelectedFloodlightColumnId = () => null,
  setSuppressNextSegmentClick,
  setSelectedPlanId,
  setSelectedLengthInputM,
  setIsLengthEditorOpen,
  setActiveSegmentDrag,
  setSegmentDragReference,
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
  const normalizedSelectedSegmentIds =
    selectedSegmentIds.length > 0
      ? selectedSegmentIds.filter((segmentId) => segmentsById.has(segmentId))
      : selectedSegmentId && segmentsById.has(selectedSegmentId)
        ? [selectedSegmentId]
        : [];

  const updateSegment = useCallback(
    (segmentId: string, updater: (segment: LayoutSegment) => LayoutSegment): void => {
      if (isReadOnly) {
        return;
      }
      applySegments((previous) =>
        previous.map((segment) => (segment.id === segmentId ? updater(segment) : segment))
      );
    },
    [applySegments, isReadOnly]
  );

  const resolveSegmentSelectionForDrag = useCallback(
    (segmentId: string): string[] => {
      if (normalizedSelectedSegmentIds.includes(segmentId)) {
        return [...normalizedSelectedSegmentIds].sort((left, right) => left.localeCompare(right));
      }
      return [segmentId];
    },
    [normalizedSelectedSegmentIds]
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
      if (isReadOnly) {
        return;
      }
      if (interactionMode !== "SELECT") {
        return;
      }
      const segment = segmentsById.get(segmentId);
      if (!segment) {
        return;
      }
      setSelectedSegmentId(segmentId);
      setSelectedSegmentIds([segmentId]);
      setSelectedLengthInputM((distanceMm(segment.start, segment.end) / 1000).toFixed(2));
      setIsLengthEditorOpen(true);
    },
    [
      interactionMode,
      isReadOnly,
      segmentsById,
      setIsLengthEditorOpen,
      setSelectedLengthInputM,
      setSelectedSegmentId,
      setSelectedSegmentIds
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
    if (isReadOnly) {
      return;
    }
    if (!selectedSegmentId) {
      return;
    }
    const parsedLengthMm = parseMetersInputToMm(selectedLengthInputM);
    if (parsedLengthMm === null) {
      return;
    }
    resizeSegmentLength(selectedSegmentId, parsedLengthMm);
    setIsLengthEditorOpen(false);
  }, [isReadOnly, resizeSegmentLength, selectedLengthInputM, selectedSegmentId, setIsLengthEditorOpen]);

  const offsetSegmentPerpendicular = useCallback(
    (
      segmentId: string,
      segmentIds: string[],
      baselineSegments: LayoutSegment[],
      referenceSegments: LayoutSegment[],
      dragDelta: PointMm,
      baselineSnapNodes: PointMm[],
      baselineLineSnapSegments: LayoutSegment[],
    ): void => {
      applySegments(() =>
        offsetSegmentCollection(
          baselineSegments,
          segmentId,
          dragDelta,
          disableSnap
            ? {
                segmentIds,
              }
            : {
                segmentIds,
                referenceSegments,
                snapToIncrement: true,
                snapNodes: baselineSnapNodes,
                lineSnapSegments: baselineLineSnapSegments,
              },
        ),
      );
    },
    [applySegments, disableSnap]
  );

  const startSelectedSegmentDrag = useCallback(
    (segmentId: string): void => {
      if (isReadOnly) {
        return;
      }
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
      commitLayoutBatch();
      beginLayoutBatch();
      const worldPointer = toWorld(pointer);
      const segmentIds = resolveSegmentSelectionForDrag(segmentId);
      const selectionKey = segmentIds.join("::");
      const baselineSegments =
        segmentDragReference && segmentDragReference.selectionKey === selectionKey
          ? segmentDragReference.baselineSegments
          : segments;
      setSegmentDragReference({
        segmentId,
        segmentIds,
        selectionKey,
        baselineSegments,
        baselineSnapNodes: drawAnchorNodes,
        baselineLineSnapSegments: lineSnapSegments
      });
      setActiveSegmentDrag({
        segmentId,
        segmentIds,
        selectionKey,
        lastPointer: worldPointer,
        originPointer: worldPointer,
        baselineSegments: segments,
        referenceSegments: baselineSegments,
        baselineSnapNodes: drawAnchorNodes,
        baselineLineSnapSegments: lineSnapSegments
      });
      setActiveGateDrag(null);
      setActiveBasketballPostDrag(null);
      setActiveFloodlightColumnDrag(null);
    },
    [
      beginLayoutBatch,
      commitLayoutBatch,
      drawAnchorNodes,
      interactionMode,
      isReadOnly,
      lineSnapSegments,
      resolveSegmentSelectionForDrag,
      segments,
      setActiveBasketballPostDrag,
      setActiveFloodlightColumnDrag,
      setActiveGateDrag,
      setActiveSegmentDrag,
      setSegmentDragReference,
      segmentDragReference,
      stageRef,
      toWorld,
    ]
  );

  const moveGateAlongSegment = useCallback(
    (gateId: string, deltaAlongMm: number): void => {
      if (Math.abs(deltaAlongMm) < 0.01) {
        return;
      }
      applyGatePlacements((previous) =>
        moveGatePlacementCollection(
          previous,
          gateId,
          deltaAlongMm,
          featureHostSegmentsById,
          goalUnitOpeningsBySegmentId
        )
      );
    },
    [applyGatePlacements, featureHostSegmentsById, goalUnitOpeningsBySegmentId]
  );

  const moveGateToPreview = useCallback(
    (gateId: string, preview: GateInsertionPreview): void => {
      applyGatePlacements((previous) =>
        moveGatePlacementCollectionToOffsets(
          previous,
          gateId,
          preview.startOffsetMm,
          preview.endOffsetMm,
          featureHostSegmentsById,
          goalUnitOpeningsBySegmentId
        )
      );
    },
    [applyGatePlacements, featureHostSegmentsById, goalUnitOpeningsBySegmentId]
  );

  const startSelectedGateDrag = useCallback(
    (gateId: string): void => {
      if (isReadOnly) {
        return;
      }
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
      commitLayoutBatch();
      beginLayoutBatch();
      setActiveGateDrag({
        gateId,
        lastPointer: toWorld(pointer)
      });
      setActiveSegmentDrag(null);
      setActiveBasketballPostDrag(null);
      setActiveFloodlightColumnDrag(null);
    },
    [beginLayoutBatch, commitLayoutBatch, interactionMode, isReadOnly, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const moveBasketballPostAlongSegment = useCallback(
    (basketballPostId: string, deltaAlongMm: number): void => {
      if (Math.abs(deltaAlongMm) < 0.01) {
        return;
      }
      applyBasketballPostPlacements((previous) =>
        moveBasketballPostPlacementCollection(
          previous,
          basketballPostId,
          deltaAlongMm,
          featureHostSegmentsById,
          goalUnitOpeningsBySegmentId
        )
      );
    },
    [applyBasketballPostPlacements, featureHostSegmentsById, goalUnitOpeningsBySegmentId]
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
          featureHostSegmentsById,
          goalUnitOpeningsBySegmentId
        )
      );
    },
    [applyBasketballPostPlacements, featureHostSegmentsById, goalUnitOpeningsBySegmentId]
  );

  const startSelectedBasketballPostDrag = useCallback(
    (basketballPostId: string): void => {
      if (isReadOnly) {
        return;
      }
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
      commitLayoutBatch();
      beginLayoutBatch();
      setActiveBasketballPostDrag({
        basketballPostId,
        lastPointer: toWorld(pointer)
      });
      setActiveGateDrag(null);
      setActiveSegmentDrag(null);
      setActiveFloodlightColumnDrag(null);
    },
    [beginLayoutBatch, commitLayoutBatch, interactionMode, isReadOnly, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
  );

  const moveFloodlightColumnAlongSegment = useCallback(
    (floodlightColumnId: string, deltaAlongMm: number): void => {
      if (Math.abs(deltaAlongMm) < 0.01) {
        return;
      }
      applyFloodlightColumnPlacements((previous) =>
        moveFloodlightColumnPlacementCollection(
          previous,
          floodlightColumnId,
          deltaAlongMm,
          featureHostSegmentsById,
          goalUnitOpeningsBySegmentId
        )
      );
    },
    [applyFloodlightColumnPlacements, featureHostSegmentsById, goalUnitOpeningsBySegmentId]
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
          featureHostSegmentsById,
          goalUnitOpeningsBySegmentId
        )
      );
    },
    [applyFloodlightColumnPlacements, featureHostSegmentsById, goalUnitOpeningsBySegmentId]
  );

  const startSelectedFloodlightColumnDrag = useCallback(
    (floodlightColumnId: string): void => {
      if (isReadOnly) {
        return;
      }
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
      commitLayoutBatch();
      beginLayoutBatch();
      setActiveFloodlightColumnDrag({
        floodlightColumnId,
        lastPointer: toWorld(pointer)
      });
      setActiveGateDrag(null);
      setActiveSegmentDrag(null);
      setActiveBasketballPostDrag(null);
    },
    [beginLayoutBatch, commitLayoutBatch, interactionMode, isReadOnly, setActiveBasketballPostDrag, setActiveFloodlightColumnDrag, setActiveGateDrag, setActiveSegmentDrag, stageRef, toWorld]
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
          floodlightColumns: remapFloodlightColumnPlacementsForRecess(previous.floodlightColumns ?? [], preview, replacement),
          goalUnits: remapGoalUnitPlacementsForRecess(previous.goalUnits ?? [], preview, replacement),
          kickboards: remapKickboardAttachmentsForRecess(previous.kickboards ?? [], preview, replacement),
          pitchDividers: remapPitchDividerPlacementsForRecess(previous.pitchDividers ?? [], preview, replacement),
          sideNettings: remapSideNettingAttachmentsForRecess(previous.sideNettings ?? [], preview, replacement)
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
          widthMm: preview.widthMm,
          depthMm: goalUnitDepthMm,
          goalHeightMm: goalUnitHeightMm,
          hasBasketballPost: goalUnitHasBasketballPost
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
      goalUnitHasBasketballPost,
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
      applyBasketballPostPlacements((previous) => {
        const nextBasketballPost: BasketballPostPlacement = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          offsetMm: preview.offsetMm,
          facing: preview.facing,
          type: basketballPlacementType,
          mountingMode: basketballPlacementType === "DEDICATED_POST" ? "PROJECTING_ARM" : "POST_MOUNTED",
          armLengthMm: basketballPlacementType === "DEDICATED_POST" ? basketballArmLengthMm : undefined,
          replacesIntermediatePost: basketballPlacementType === "DEDICATED_POST"
        };
        const next = previous.filter((placement) => {
          return !(
            placement.segmentId === nextBasketballPost.segmentId &&
            Math.abs(placement.offsetMm - nextBasketballPost.offsetMm) <= DRAW_INCREMENT_MM * 0.5
          );
        });
        next.push(nextBasketballPost);
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
      applyBasketballPostPlacements,
      basketballArmLengthMm,
      basketballPlacementType,
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
          facing: preview.facing,
          heightMm: floodlightColumnHeightMm
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
      floodlightColumnHeightMm,
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
          thicknessMm: kickboardThicknessMm,
          profile: kickboardProfile,
          boardLengthMm: kickboardBoardLengthMm
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
    [applyLayout, kickboardBoardLengthMm, kickboardProfile, kickboardSectionHeightMm, kickboardThicknessMm]
  );

  const applySideNettingAttachment = useCallback(
    (preview: SegmentAttachmentPreview | SegmentRangePreview): void => {
      applyLayout((previous) => {
        const segmentLengthMm = distanceMm(preview.segment.start, preview.segment.end);
        const startOffsetMm = "startOffsetMm" in preview ? preview.startOffsetMm : 0;
        const endOffsetMm = "endOffsetMm" in preview ? preview.endOffsetMm : segmentLengthMm;
        const nextSideNetting: SideNettingAttachment = {
          id: crypto.randomUUID(),
          segmentId: preview.segment.id,
          additionalHeightMm: sideNettingHeightMm,
          startOffsetMm,
          endOffsetMm,
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
      setPendingSideNettingStart(null);
    },
    [applyLayout, setPendingSideNettingStart, sideNettingHeightMm]
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
          setSelectedSegmentIds([]);
          setSelectedGateId(null);
          setSelectedBasketballPostId(null);
          setSelectedFloodlightColumnId(null);
          setSuppressNextSegmentClick(false);
        }
        return;
      }

      if (isReadOnly) {
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
            return;
          }

          const resolvedPreview = sideNettingSegmentPreview ?? resolveSideNettingSegmentPreview(world);
          if (resolvedPreview) {
            applySideNettingAttachment(resolvedPreview);
          }
          return;
        }

        if (sideNettingPreview) {
          applySideNettingAttachment(sideNettingPreview);
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
      resolveSideNettingSegmentPreview,
      setPendingPitchDividerStart,
      setPendingSideNettingStart,
      setSelectedBasketballPostId,
      setSelectedFloodlightColumnId,
      setSelectedGateId,
      setSelectedSegmentId,
      setSelectedSegmentIds,
      setSuppressNextSegmentClick,
      sideNettingSegmentPreview,
      sideNettingAnchorPreview,
      sideNettingPreview,
      applySideNettingAttachment,
      resolveBasketballPostPreview,
      resolveFloodlightColumnPreview,
      isReadOnly,
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

    if (isPanning && updatePan(pointer)) {
      return;
    }

    if (isReadOnly) {
      setPointerWorld(world);
      return;
    }

    if (activeBasketballPostDrag) {
      const basketballPost = resolvedBasketballPostById.get(activeBasketballPostDrag.basketballPostId);
      if (!basketballPost) {
        setActiveBasketballPostDrag(null);
        commitLayoutBatch();
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
        commitLayoutBatch();
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
        commitLayoutBatch();
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
        x: world.x - activeSegmentDrag.originPointer.x,
        y: world.y - activeSegmentDrag.originPointer.y
      };
      if (Math.abs(delta.x) >= 0.01 || Math.abs(delta.y) >= 0.01) {
        offsetSegmentPerpendicular(
          activeSegmentDrag.segmentId,
          activeSegmentDrag.segmentIds,
          activeSegmentDrag.baselineSegments,
          activeSegmentDrag.referenceSegments,
          delta,
          activeSegmentDrag.baselineSnapNodes,
          activeSegmentDrag.baselineLineSnapSegments
        );
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

    setPointerWorld(world);
  }, [
    activeBasketballPostDrag,
    activeFloodlightColumnDrag,
    activeGateDrag,
    activeSegmentDrag,
    basketballPostPreview,
    floodlightColumnPreview,
    gatePreview,
    commitLayoutBatch,
    isReadOnly,
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
    const hadActiveSegmentDrag = activeSegmentDrag !== null;
    const hadActiveDrag =
      hadActiveSegmentDrag ||
      activeGateDrag !== null ||
      activeBasketballPostDrag !== null ||
      activeFloodlightColumnDrag !== null;
    setActiveSegmentDrag(null);
    setActiveGateDrag(null);
    setActiveBasketballPostDrag(null);
    setActiveFloodlightColumnDrag(null);
    if (hadActiveSegmentDrag) {
      setSuppressNextSegmentClick(true);
    }
    if (hadActiveDrag) {
      commitLayoutBatch();
    }
    endPan();
  }, [
    activeBasketballPostDrag,
    activeFloodlightColumnDrag,
    activeGateDrag,
    activeSegmentDrag,
    commitLayoutBatch,
    endPan,
    setActiveBasketballPostDrag,
    setActiveFloodlightColumnDrag,
    setActiveGateDrag,
    setActiveSegmentDrag,
    setSuppressNextSegmentClick
  ]);

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
    if (isReadOnly) {
      return false;
    }
    if (!selectedGateId) {
      return false;
    }
    applyGatePlacements((previous) => previous.filter((gate) => gate.id !== selectedGateId));
    setSelectedGateId(null);
    return true;
  }, [applyGatePlacements, isReadOnly, selectedGateId, setSelectedGateId]);

  const deleteSelectedBasketballPost = useCallback((): boolean => {
    if (isReadOnly) {
      return false;
    }
    if (!selectedBasketballPostId) {
      return false;
    }
    applyBasketballPostPlacements((previous) =>
      previous.filter((basketballPost) => basketballPost.id !== selectedBasketballPostId)
    );
    setSelectedBasketballPostId(null);
    return true;
  }, [applyBasketballPostPlacements, isReadOnly, selectedBasketballPostId, setSelectedBasketballPostId]);

  const deleteSelectedFloodlightColumn = useCallback((): boolean => {
    if (isReadOnly) {
      return false;
    }
    if (!selectedFloodlightColumnId) {
      return false;
    }
    applyFloodlightColumnPlacements((previous) =>
      previous.filter((floodlightColumn) => floodlightColumn.id !== selectedFloodlightColumnId)
    );
    setSelectedFloodlightColumnId(null);
    return true;
  }, [applyFloodlightColumnPlacements, isReadOnly, selectedFloodlightColumnId, setSelectedFloodlightColumnId]);

  const deleteSelectedSegment = useCallback((): boolean => {
    if (isReadOnly) {
      return false;
    }
    const segmentIdsToDelete =
      normalizedSelectedSegmentIds.length > 0
        ? normalizedSelectedSegmentIds
        : selectedSegmentId
          ? [selectedSegmentId]
          : [];
    if (segmentIdsToDelete.length === 0) {
      return false;
    }
    const segmentIdSet = new Set(segmentIdsToDelete);
    applySegments((previous) => previous.filter((segment) => !segmentIdSet.has(segment.id)));
    setSelectedSegmentId(null);
    setSelectedSegmentIds([]);
    setSegmentDragReference(null);
    return true;
  }, [
    applySegments,
    isReadOnly,
    normalizedSelectedSegmentIds,
    selectedSegmentId,
    setSegmentDragReference,
    setSelectedSegmentId,
    setSelectedSegmentIds
  ]);

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
    setSelectedSegmentIds([]);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
    setSelectedPlanId(null);
    setIsLengthEditorOpen(false);
    setSegmentDragReference(null);
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
    setSegmentDragReference,
    setSelectedSegmentId,
    setSelectedSegmentIds
  ]);

  const handleDeleteSelection = useCallback((): void => {
    if (isReadOnly) {
      return;
    }
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
  }, [deleteSelectedBasketballPost, deleteSelectedFloodlightColumn, deleteSelectedGate, deleteSelectedSegment, isReadOnly]);

  const handleClearLayout = useCallback((): void => {
    if (isReadOnly) {
      return;
    }
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
    setSelectedSegmentIds([]);
    setSelectedGateId(null);
    setSelectedBasketballPostId(null);
    setSelectedFloodlightColumnId(null);
    setSegmentDragReference(null);
  }, [
    applyLayout,
    isReadOnly,
    setDrawChainStart,
    setDrawStart,
    setPendingPitchDividerStart,
    setPendingSideNettingStart,
    setSelectedBasketballPostId,
    setSelectedFloodlightColumnId,
    setSelectedGateId,
    setSegmentDragReference,
    setSelectedSegmentId,
    setSelectedSegmentIds
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

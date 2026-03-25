import type { RefObject } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { GateType, LayoutSegment, PointMm } from "@fence-estimator/contracts";
import type {
  ResolvedGoalUnitPlacement,
  ResolvedKickboardAttachment,
  ResolvedPitchDividerPlacement,
  ResolvedSideNettingAttachment
} from "@fence-estimator/rules-engine";

import type { GridLine, Viewport, VisibleBounds } from "../canvasViewport";
import type {
  AxisGuide,
  BasketballPostInsertionPreview,
  DrawNodeSnapPreview,
  FloodlightColumnInsertionPreview,
  GateInsertionPreview,
  GateVisual,
  GoalUnitInsertionPreview,
  InteractionMode,
  LineSnapPreview,
  PitchDividerSpanPreview,
  PitchDividerAnchorPreview,
  RecessInsertionPreview,
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement,
  ScaleBarState,
  SegmentAttachmentPreview,
  SegmentRangePreview,
  SegmentLengthLabel,
  VisualPost
} from "../types";
import type { OptimizationPlanVisual } from "../../optimizationVisual";

export interface EditorCanvasStageProps {
  stageRef: RefObject<Konva.Stage | null>;
  canvasWidth: number;
  canvasHeight: number;
  view: Viewport;
  visibleBounds: VisibleBounds;
  verticalLines: GridLine[];
  horizontalLines: GridLine[];
  interactionMode: InteractionMode;
  gateType: GateType;
  disableSnap: boolean;
  isPanning: boolean;
  drawStart: PointMm | null;
  rectangleStart: PointMm | null;
  ghostEnd: PointMm | null;
  ghostLengthMm: number;
  axisGuide: AxisGuide | null;
  activeDrawNodeSnap: DrawNodeSnapPreview | null;
  drawHoverSnap: LineSnapPreview | null;
  drawSnapLabel: string | null;
  rectanglePreviewEnd: PointMm | null;
  recessPreview: RecessInsertionPreview | null;
  goalUnitPreview?: GoalUnitInsertionPreview | null;
  gatePreview: GateInsertionPreview | null;
  basketballPostPreview: BasketballPostInsertionPreview | null;
  floodlightColumnPreview?: FloodlightColumnInsertionPreview | null;
  kickboardPreview?: SegmentAttachmentPreview | null;
  pitchDividerAnchorPreview?: PitchDividerAnchorPreview | null;
  pitchDividerPreview?: PitchDividerSpanPreview | null;
  pendingPitchDividerStart?: PitchDividerAnchorPreview | null;
  sideNettingSegmentPreview?: SegmentAttachmentPreview | null;
  sideNettingAnchorPreview?: PitchDividerAnchorPreview | null;
  sideNettingPreview?: SegmentRangePreview | null;
  pendingSideNettingStart?: PitchDividerAnchorPreview | null;
  gatePreviewVisual: GateVisual | null;
  hoveredBasketballPostId: string | null;
  hoveredFloodlightColumnId?: string | null;
  hoveredSegmentId: string | null;
  hoveredGateId: string | null;
  closeLoopPoint: PointMm | null;
  visualPosts: VisualPost[];
  segments: LayoutSegment[];
  selectedSegmentId: string | null;
  selectedGateId: string | null;
  selectedBasketballPostId: string | null;
  selectedFloodlightColumnId?: string | null;
  gatesBySegmentId: Map<string, ResolvedGatePlacement[]>;
  placedBasketballPostVisuals: ResolvedBasketballPostPlacement[];
  placedFloodlightColumnVisuals?: ResolvedFloodlightColumnPlacement[];
  goalUnitVisuals?: ResolvedGoalUnitPlacement[];
  kickboardVisuals?: ResolvedKickboardAttachment[];
  pitchDividerVisuals?: ResolvedPitchDividerPlacement[];
  sideNettingVisuals?: ResolvedSideNettingAttachment[];
  segmentLengthLabelsBySegmentId: Map<string, SegmentLengthLabel[]>;
  visibleSegmentLabelKeys: Set<string>;
  placedGateVisuals: ResolvedGatePlacement[];
  oppositeGateGuides: Array<{ key: string; start: PointMm; end: PointMm }>;
  selectedPlanVisual: OptimizationPlanVisual | null;
  scaleBar: ScaleBarState;
  onStageMouseDown: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onStageMouseMove: () => void;
  onStageMouseUp: () => void;
  onStageDoubleClick: () => void;
  onStageWheel: (event: KonvaEventObject<WheelEvent>) => void;
  onContextMenu: (event: KonvaEventObject<PointerEvent>) => void;
  onSelectSegment: (segmentId: string) => void;
  onStartSegmentDrag: (segmentId: string) => void;
  onOpenSegmentLengthEditor: (segmentId: string) => void;
  onUpdateSegmentEndpoint: (segmentId: string, endpoint: "start" | "end", point: PointMm) => void;
  onStartSegmentEndpointDrag: () => void;
  onEndSegmentEndpointDrag: () => void;
  onSelectGate: (gateId: string) => void;
  onStartGateDrag: (gateId: string) => void;
  onSelectBasketballPost: (basketballPostId: string) => void;
  onStartBasketballPostDrag: (basketballPostId: string) => void;
  onSelectFloodlightColumn?: (floodlightColumnId: string) => void;
  onStartFloodlightColumnDrag?: (floodlightColumnId: string) => void;
}

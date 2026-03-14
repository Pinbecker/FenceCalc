import type { RefObject } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { GateType, LayoutSegment, PointMm } from "@fence-estimator/contracts";

import type { GridLine, Viewport, VisibleBounds } from "../canvasViewport";
import type {
  AxisGuide,
  BasketballPostInsertionPreview,
  DrawNodeSnapPreview,
  GateInsertionPreview,
  GateVisual,
  InteractionMode,
  LineSnapPreview,
  RecessInsertionPreview,
  ResolvedBasketballPostPlacement,
  ResolvedGatePlacement,
  ScaleBarState,
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
  gatePreview: GateInsertionPreview | null;
  basketballPostPreview: BasketballPostInsertionPreview | null;
  gatePreviewVisual: GateVisual | null;
  hoveredBasketballPostId: string | null;
  hoveredSegmentId: string | null;
  hoveredGateId: string | null;
  closeLoopPoint: PointMm | null;
  visualPosts: VisualPost[];
  segments: LayoutSegment[];
  selectedSegmentId: string | null;
  selectedGateId: string | null;
  selectedBasketballPostId: string | null;
  gatesBySegmentId: Map<string, ResolvedGatePlacement[]>;
  placedBasketballPostVisuals: ResolvedBasketballPostPlacement[];
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
}

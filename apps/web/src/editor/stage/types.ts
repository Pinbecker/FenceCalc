import type { RefObject } from "react";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LayoutSegment, PointMm } from "@fence-estimator/contracts";

import type { GridLine, Viewport, VisibleBounds } from "../canvasViewport";
import type {
  AxisGuide,
  GateInsertionPreview,
  GateVisual,
  InteractionMode,
  LineSnapPreview,
  RecessInsertionPreview,
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
  disableSnap: boolean;
  drawStart: PointMm | null;
  rectangleStart: PointMm | null;
  ghostEnd: PointMm | null;
  ghostLengthMm: number;
  axisGuide: AxisGuide | null;
  drawHoverSnap: LineSnapPreview | null;
  rectanglePreviewEnd: PointMm | null;
  recessPreview: RecessInsertionPreview | null;
  gatePreview: GateInsertionPreview | null;
  gatePreviewVisual: GateVisual | null;
  visualPosts: VisualPost[];
  segments: LayoutSegment[];
  selectedSegmentId: string | null;
  selectedGateId: string | null;
  gatesBySegmentId: Map<string, ResolvedGatePlacement[]>;
  segmentLengthLabelsBySegmentId: Map<string, SegmentLengthLabel[]>;
  visibleSegmentLabelKeys: Set<string>;
  placedGateVisuals: ResolvedGatePlacement[];
  oppositeGateGuides: Array<{ key: string; start: PointMm; end: PointMm }>;
  selectedPlanVisual: OptimizationPlanVisual | null;
  scaleBar: ScaleBarState;
  onStageMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  onStageMouseMove: () => void;
  onStageMouseUp: () => void;
  onStageWheel: (event: KonvaEventObject<WheelEvent>) => void;
  onContextMenu: (event: KonvaEventObject<PointerEvent>) => void;
  onSelectSegment: (segmentId: string) => void;
  onStartSegmentDrag: (segmentId: string) => void;
  onOpenSegmentLengthEditor: (segmentId: string) => void;
  onUpdateSegmentEndpoint: (segmentId: string, endpoint: "start" | "end", point: PointMm) => void;
  onSelectGate: (gateId: string) => void;
  onStartGateDrag: (gateId: string) => void;
}

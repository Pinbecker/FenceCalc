import type { FenceSpec, GateType, LayoutSegment, PointMm } from "@fence-estimator/contracts";

export type PostKind = "END" | "INTERMEDIATE" | "CORNER" | "JUNCTION" | "INLINE_JOIN" | "GATE";

export interface VisualPost {
  key: string;
  point: PointMm;
  kind: PostKind;
  heightMm: number;
}

export interface IncidentNode {
  point: PointMm;
  vectors: Array<{ x: number; y: number }>;
  maxHeightMm: number;
}

export interface SegmentConnectivity {
  segmentComponent: Map<string, string>;
  segmentIdsByComponent: Map<string, string[]>;
  movableComponentIds: Set<string>;
  closedComponentIds: Set<string>;
  nodeDegreeByKey: Map<string, number>;
}

export interface ScaleBarState {
  lengthMm: number;
  lengthPx: number;
  label: string;
}

export interface AxisGuide {
  orientation: "VERTICAL" | "HORIZONTAL";
  coordinateMm: number;
  anchor: PointMm;
}

export interface HistoryState {
  past: LayoutSegment[][];
  present: LayoutSegment[];
  future: LayoutSegment[][];
}

export type DraggablePanel = "controls" | "itemCounts" | "postKey" | "tutorial";

export type HistoryAction =
  | { type: "APPLY"; updater: (segments: LayoutSegment[]) => LayoutSegment[] }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET"; segments: LayoutSegment[] };

export type InteractionMode = "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE";

export type RecessSide = "LEFT" | "RIGHT";

export interface RecessInsertionPreview {
  segment: LayoutSegment;
  segmentLengthMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
  depthMm: number;
  side: RecessSide;
  sourcePoint: PointMm;
  entryPoint: PointMm;
  exitPoint: PointMm;
  recessEntryPoint: PointMm;
  recessExitPoint: PointMm;
  targetPoint: PointMm;
  alignmentGuide?: {
    anchorPoint: PointMm;
    targetPoint: PointMm;
  };
}

export interface LineSnapPreview {
  segment: LayoutSegment;
  point: PointMm;
  startOffsetMm: number;
  endOffsetMm: number;
  distanceMm: number;
}

export interface GateInsertionPreview {
  segment: LayoutSegment;
  segmentLengthMm: number;
  startOffsetMm: number;
  endOffsetMm: number;
  widthMm: number;
  entryPoint: PointMm;
  exitPoint: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  targetPoint: PointMm;
}

export interface GateVisual {
  key: string;
  startPoint: PointMm;
  endPoint: PointMm;
  centerPoint: PointMm;
  widthMm: number;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  leafCount: 1 | 2;
}

export interface ResolvedGatePlacement extends GateVisual {
  id: string;
  segmentId: string;
  startOffsetMm: number;
  endOffsetMm: number;
  gateType: GateType;
  spec: FenceSpec;
}

export interface RecessAlignmentAnchor {
  sourceSegmentId: string;
  point: PointMm;
  tangent: { x: number; y: number };
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GateOppositeGuide {
  key: string;
  start: PointMm;
  end: PointMm;
}

export interface SegmentLengthLabel {
  key: string;
  segmentId: string;
  x: number;
  y: number;
  text: string;
  lengthMm: number;
  isSelected: boolean;
}

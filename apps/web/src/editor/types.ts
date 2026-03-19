import type {
  BasketballPostPlacement,
  FenceSpec,
  FloodlightColumnPlacement,
  GateType,
  InlineFeatureFacing,
  LayoutModel,
  LayoutSegment,
  PointMm
} from "@fence-estimator/contracts";

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

export interface PreviewSnapMeta {
  kind:
    | "NODE"
    | "SEGMENT"
    | "AXIS"
    | "MIDPOINT"
    | "FRACTION"
    | "ALIGNMENT"
    | "CENTERED"
    | "FREE"
    | "CLOSE_LOOP";
  label: string;
}

export interface HistoryState {
  past: LayoutModel[];
  present: LayoutModel;
  future: LayoutModel[];
}

export type DraggablePanel = "controls" | "itemCounts" | "postKey" | "tutorial";

export type HistoryAction =
  | { type: "APPLY"; updater: (layout: LayoutModel) => LayoutModel }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; layout: LayoutModel }
  | { type: "SET"; layout: LayoutModel };

export type InteractionMode =
  | "DRAW"
  | "SELECT"
  | "RECTANGLE"
  | "RECESS"
  | "GOAL_UNIT"
  | "GATE"
  | "BASKETBALL_POST"
  | "FLOODLIGHT_COLUMN"
  | "KICKBOARD"
  | "PITCH_DIVIDER"
  | "SIDE_NETTING";

export type RecessSide = "LEFT" | "RIGHT";
export type RecessSidePreference = RecessSide | "AUTO";

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
  sideSource: "AUTO" | "MANUAL";
  snapMeta: PreviewSnapMeta;
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
  snapMeta?: PreviewSnapMeta;
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
  snapMeta: PreviewSnapMeta;
  alignmentGuide?: {
    anchorPoint: PointMm;
    targetPoint: PointMm;
  };
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

export interface BasketballPostInsertionPreview {
  segment: LayoutSegment;
  segmentLengthMm: number;
  offsetMm: number;
  point: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  facing: InlineFeatureFacing;
  targetPoint: PointMm;
  snapMeta: PreviewSnapMeta;
  alignmentGuide?: {
    anchorPoint: PointMm;
    targetPoint: PointMm;
  };
}

export interface GoalUnitInsertionPreview extends RecessInsertionPreview {
  widthMm: number;
  goalHeightMm: 3000 | 4000;
}

export interface SegmentAttachmentPreview {
  segment: LayoutSegment;
  snapMeta: PreviewSnapMeta;
}

export interface SegmentRangePreview {
  segment: LayoutSegment;
  startOffsetMm: number;
  endOffsetMm: number;
  startPoint: PointMm;
  endPoint: PointMm;
  lengthMm: number;
  snapMeta: PreviewSnapMeta;
}

export interface PitchDividerAnchorPreview {
  segment: LayoutSegment;
  offsetMm: number;
  point: PointMm;
  snapMeta: PreviewSnapMeta;
}

export interface PitchDividerSpanPreview {
  startAnchor: PitchDividerAnchorPreview;
  endAnchor: PitchDividerAnchorPreview;
  spanLengthMm: number;
  supportPoints: PointMm[];
  isValid: boolean;
}

export interface BasketballPostVisual {
  key: string;
  point: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  facing: InlineFeatureFacing;
}

export interface ResolvedBasketballPostPlacement extends BasketballPostVisual {
  id: string;
  segmentId: string;
  offsetMm: number;
  type?: NonNullable<BasketballPostPlacement["type"]> | undefined;
  mountingMode?: NonNullable<BasketballPostPlacement["mountingMode"]> | undefined;
  armLengthMm?: BasketballPostPlacement["armLengthMm"] | null | undefined;
  pairedFeatureId?: string | null | undefined;
  replacesIntermediatePost?: boolean | undefined;
  hostPostIndex?: number | null | undefined;
  spec: FenceSpec;
  placement: BasketballPostPlacement;
}

export interface FloodlightColumnInsertionPreview {
  segment: LayoutSegment;
  segmentLengthMm: number;
  offsetMm: number;
  point: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  facing: InlineFeatureFacing;
  targetPoint: PointMm;
  snapMeta: PreviewSnapMeta;
  alignmentGuide?: {
    anchorPoint: PointMm;
    targetPoint: PointMm;
  };
}

export interface FloodlightColumnVisual {
  key: string;
  point: PointMm;
  tangent: { x: number; y: number };
  normal: { x: number; y: number };
  facing: InlineFeatureFacing;
}

export interface ResolvedFloodlightColumnPlacement extends FloodlightColumnVisual {
  id: string;
  segmentId: string;
  offsetMm: number;
  spec: FenceSpec;
  placement: FloodlightColumnPlacement;
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

export interface DrawResolveResult {
  point: PointMm;
  guide: AxisGuide | null;
  snapMeta: PreviewSnapMeta | null;
}

export interface DrawNodeSnapPreview {
  point: PointMm;
  segments: LayoutSegment[];
}

export interface HeightCountRow {
  heightMm: number;
  count: number;
}

export interface HeightLabelCountRow {
  height: string;
  count: number;
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

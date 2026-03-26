export { EditorFloatingPanels } from "../EditorFloatingPanels.js";
export { EditorMenuBar } from "../EditorMenuBar.js";
export { EditorToolPalette } from "../EditorToolPalette.js";
export { shouldLoadInitialDrawing } from "../initialDrawingLoad.js";
export { OptimizationPlanner } from "../OptimizationPlanner.js";
export { getVisibleOptimizationPlans } from "../optimizationDisplay.js";
export { buildOptimizationPlanVisual } from "../optimizationVisual.js";
export {
  formatDistanceLabel,
  formatHeightLabelFromMm,
  formatLengthMm,
  formatMetersInputFromMm,
  formatPointMeters
} from "../formatters.js";
export { useDraggablePanels } from "../useDraggablePanels.js";
export type { PanelOffset } from "../useDraggablePanels.js";
export {
  AXIS_GUIDE_SNAP_PX,
  DRAW_INCREMENT_MM,
  DRAW_LINE_SNAP_PX,
  GOAL_UNIT_HEIGHT_OPTIONS_MM,
  GOAL_UNIT_WIDTH_OPTIONS_MM,
  DOUBLE_GATE_WIDTH_MM,
  BASKETBALL_ARM_LENGTH_OPTIONS_MM,
  GATE_POINTER_SNAP_PX,
  GATE_WIDTH_OPTIONS_MM,
  GHOST_STROKE_PX,
  GRID_STEPS_MM,
  HANDLE_RADIUS_PX,
  INITIAL_VISIBLE_WIDTH_MM,
  KICKBOARD_SECTION_HEIGHT_OPTIONS_MM,
  LABEL_FONT_SIZE_PX,
  MAJOR_GRID_STROKE_PX,
  MAX_SCALE,
  MINOR_GRID_STROKE_PX,
  MIN_SCALE,
  MIN_SEGMENT_MM,
  NODE_SNAP_DISTANCE_PX,
  POST_SYMBOL_RADIUS_PX,
  RECESS_DEPTH_OPTIONS_MM,
  RECESS_INPUT_STEP_M,
  RECESS_POINTER_SNAP_PX,
  RECESS_WIDTH_OPTIONS_MM,
  ROLL_FORM_HEIGHT_OPTIONS,
  SEGMENT_LABEL_OFFSET_PX,
  SEGMENT_SELECTED_STROKE_PX,
  SEGMENT_STROKE_PX,
  SINGLE_GATE_WIDTH_MM,
  SIDE_NETTING_HEIGHT_OPTIONS_MM,
  TWIN_BAR_HEIGHT_OPTIONS,
  defaultFenceSpec,
  getSegmentColor,
  parseMetersInputToMm,
  quantize
} from "./constants.js";
export {
  buildCanvasGrid,
  buildVisibleBounds,
  screenToWorld,
  useEditorCanvasViewport,
  zoomViewportAtPointer
} from "./canvasViewport.js";
export type { GridLine, ScreenPoint, Viewport, VisibleBounds } from "./canvasViewport.js";
export {
  buildOppositeGateGuides,
  buildScaleBar,
  clampSegmentEndToBlockingIntersection,
  clampGatePlacementToSegment,
  classifyIncidentNode,
  collectInteriorIntersectionOffsetsMm,
  dot,
  findNearestNode,
  historyReducer,
  normalizeVector,
  pointCoordinateKey,
  rangesOverlap,
  rectanglesOverlap,
  resolveGatePreviewLeafCount,
  samePointApprox,
  sameGatePlacementList,
  snapToAxisGuide
} from "./editorMath.js";
export {
  buildGatePreview,
  findNearestSegmentSnap,
  interpolateAlongSegment,
  projectPointOntoSegment,
  resolveGateWidthMm
} from "./gateMath.js";
export { renderGateSymbol } from "./gateGeometry.js";
export {
  buildEstimateSegments,
  buildSegmentConnectivity,
  buildSegmentRuns,
  resolveBasketballPostPlacements,
  resolveFloodlightColumnPlacements,
  resolveGatePlacements
} from "./segmentTopology.js";
export { renderBasketballPostSymbol } from "./basketballPostGeometry.js";
export { renderFloodlightColumnSymbol } from "./floodlightColumnGeometry.js";
export {
  buildRecessAlignmentAnchors,
  buildRecessPreview,
  buildRecessReplacementSegments,
  chooseGridStep,
  recessAnchorSnapWindowMm,
  recessFractionSnapWindowMm,
  recessMidpointSnapWindowMm,
  recessSnapTargetsMm,
  snapOffsetToAnchorAlongSegment
} from "./recess.js";
export { buildEditorSummaryData } from "./summaryData.js";
export type {
  AxisGuide,
  BasketballPostInsertionPreview,
  BasketballPostVisual,
  DraggablePanel,
  FloodlightColumnInsertionPreview,
  FloodlightColumnVisual,
  GateInsertionPreview,
  GateVisual,
  HistoryState,
  IncidentNode,
  InteractionMode,
  LineSnapPreview,
  PostKind,
  RecessInsertionPreview,
  RecessSide,
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement,
  ScaleBarState,
  ScreenRect,
  SegmentConnectivity,
  SegmentRangePreview,
  SegmentLengthLabel,
  VisualPost
} from "./types.js";
export { useEditorKeyboardShortcuts } from "./useEditorKeyboardShortcuts.js";
export { useElementSize } from "./useElementSize.js";
export { useWindowSize } from "./useWindowSize.js";

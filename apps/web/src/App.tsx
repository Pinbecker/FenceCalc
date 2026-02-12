import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Arrow, Layer, Line, Stage, Text, Circle, Group, Rect, RegularPolygon } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  type OptimizationSummary,
  ROLL_FORM_HEIGHT_KEYS,
  TWIN_BAR_HEIGHT_KEYS,
  type FenceHeightKey,
  type FenceSpec,
  type LayoutSegment,
  type PointMm,
  type TwinBarOffcutTransfer,
  type TwinBarVariant
} from "@fence-estimator/contracts";
import { areOpposite, snapPointToAngle, distanceMm } from "@fence-estimator/geometry";
import { TWIN_BAR_PANEL_WIDTH_MM, buildOptimizationSummary, estimateLayout, getSpecConfig } from "@fence-estimator/rules-engine";

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface Size {
  width: number;
  height: number;
}

type PostKind = "END" | "INTERMEDIATE" | "CORNER" | "JUNCTION" | "INLINE_JOIN";

interface VisualPost {
  key: string;
  point: PointMm;
  kind: PostKind;
  heightMm: number;
}

interface IncidentNode {
  point: PointMm;
  vectors: Array<{ x: number; y: number }>;
  maxHeightMm: number;
}

interface SegmentConnectivity {
  segmentComponent: Map<string, string>;
  segmentIdsByComponent: Map<string, string[]>;
  movableComponentIds: Set<string>;
  nodeDegreeByKey: Map<string, number>;
}

interface ScaleBarState {
  lengthMm: number;
  lengthPx: number;
  label: string;
}

interface AxisGuide {
  orientation: "VERTICAL" | "HORIZONTAL";
  coordinateMm: number;
  anchor: PointMm;
}

interface HistoryState {
  past: LayoutSegment[][];
  present: LayoutSegment[];
  future: LayoutSegment[][];
}

type HistoryAction =
  | { type: "APPLY"; updater: (segments: LayoutSegment[]) => LayoutSegment[] }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET"; segments: LayoutSegment[] };

type InteractionMode = "DRAW" | "SELECT" | "RECESS";
type RecessSide = "LEFT" | "RIGHT";

interface RecessInsertionPreview {
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
}

const MIN_SEGMENT_MM = 50;
const DRAW_INCREMENT_MM = 50;
const GRID_STEPS_MM = [250, 500, 1000, 2500, 5000, 10000];
const MIN_GRID_PIXEL_SPACING = 40;
const MIN_SCALE = 0.003;
const MAX_SCALE = 3;
const MINOR_GRID_STROKE_PX = 0.8;
const MAJOR_GRID_STROKE_PX = 1.3;
const SEGMENT_STROKE_PX = 3.5;
const SEGMENT_SELECTED_STROKE_PX = 5;
const GHOST_STROKE_PX = 2.8;
const LABEL_FONT_SIZE_PX = 12;
const HANDLE_RADIUS_PX = 7;
const POST_SYMBOL_RADIUS_PX = 5;
const NODE_SNAP_DISTANCE_PX = 14;
const AXIS_GUIDE_SNAP_PX = 16;
const RECESS_POINTER_SNAP_PX = 20;
const RECESS_CORNER_SNAP_MM = 250;
const RECESS_WIDTH_OPTIONS_MM = [500, 1000, 1500, 2000, 2500, 3000];
const RECESS_DEPTH_OPTIONS_MM = [500, 1000, 1500, 2000];
const INITIAL_VISIBLE_WIDTH_MM = 150000;
const SCALE_BAR_TARGET_RATIO = 0.18;
const SCALE_BAR_MAX_RATIO = 0.4;
const SCALE_BAR_CANDIDATES_MM = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000
];
const TWIN_BAR_STANDARD_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#5d9bff",
  "1.8m": "#4f83ff",
  "2m": "#4474ea",
  "2.4m": "#3a65cd",
  "3m": "#3157b4",
  "4m": "#294a9c",
  "4.5m": "#213d84",
  "5m": "#1a316b",
  "6m": "#132753"
};
const TWIN_BAR_SUPER_REBOUND_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#ffb56b",
  "1.8m": "#ffa257",
  "2m": "#ff9247",
  "2.4m": "#ff8438",
  "3m": "#ff772d",
  "4m": "#ef6b28",
  "4.5m": "#de5f23",
  "5m": "#cd541f",
  "6m": "#bc4a1b"
};
const ROLL_FORM_COLORS: Record<(typeof ROLL_FORM_HEIGHT_KEYS)[number], string> = {
  "2m": "#1f9d8b",
  "3m": "#2fbf71"
};
const TWIN_BAR_HEIGHT_OPTIONS: FenceHeightKey[] = [...TWIN_BAR_HEIGHT_KEYS];
const ROLL_FORM_HEIGHT_OPTIONS: FenceHeightKey[] = [...ROLL_FORM_HEIGHT_KEYS];

function defaultFenceSpec(): FenceSpec {
  return {
    system: "TWIN_BAR",
    height: "2m",
    twinBarVariant: "STANDARD"
  };
}

function getSegmentColor(spec: FenceSpec): string {
  if (spec.system === "ROLL_FORM") {
    if (spec.height === "2m") {
      return ROLL_FORM_COLORS["2m"];
    }
    if (spec.height === "3m") {
      return ROLL_FORM_COLORS["3m"];
    }
    return "#2fbf71";
  }

  const palette = spec.twinBarVariant === "SUPER_REBOUND" ? TWIN_BAR_SUPER_REBOUND_COLORS : TWIN_BAR_STANDARD_COLORS;
  switch (spec.height) {
    case "1.2m":
      return palette["1.2m"];
    case "1.8m":
      return palette["1.8m"];
    case "2m":
      return palette["2m"];
    case "2.4m":
      return palette["2.4m"];
    case "3m":
      return palette["3m"];
    case "4m":
      return palette["4m"];
    case "4.5m":
      return palette["4.5m"];
    case "5m":
      return palette["5m"];
    case "6m":
      return palette["6m"];
    default:
      return spec.twinBarVariant === "SUPER_REBOUND" ? "#ff8438" : "#4f83ff";
  }
}

function formatLengthMm(lengthMm: number): string {
  return `${(lengthMm / 1000).toFixed(2)}m`;
}

function formatPointMeters(point: PointMm): string {
  return `${(point.x / 1000).toFixed(2)}m, ${(point.y / 1000).toFixed(2)}m`;
}

function formatHeightLabelFromMm(heightMm: number): string {
  return `${(heightMm / 1000).toFixed(heightMm % 1000 === 0 ? 0 : 1)}m`;
}

function formatDistanceLabel(lengthMm: number): string {
  if (lengthMm >= 1000000) {
    return `${(lengthMm / 1000000).toFixed(1)}km`;
  }
  return `${(lengthMm / 1000).toFixed(lengthMm >= 10000 ? 0 : 1)}m`;
}

function formatSegmentWindow(startOffsetMm: number, endOffsetMm: number): string {
  return `[${formatLengthMm(startOffsetMm)}-${formatLengthMm(endOffsetMm)}]`;
}

function sameSpec(left: FenceSpec, right: FenceSpec): boolean {
  return (
    left.system === right.system &&
    left.height === right.height &&
    (left.twinBarVariant ?? "STANDARD") === (right.twinBarVariant ?? "STANDARD")
  );
}

function sameSegment(left: LayoutSegment, right: LayoutSegment): boolean {
  return (
    left.id === right.id &&
    left.start.x === right.start.x &&
    left.start.y === right.start.y &&
    left.end.x === right.end.x &&
    left.end.y === right.end.y &&
    sameSpec(left.spec, right.spec)
  );
}

function sameSegmentList(left: LayoutSegment[], right: LayoutSegment[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (!leftSegment || !rightSegment || !sameSegment(leftSegment, rightSegment)) {
      return false;
    }
  }
  return true;
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "APPLY": {
      const next = action.updater(state.present);
      if (sameSegmentList(state.present, next)) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: next,
        future: []
      };
    }
    case "UNDO": {
      const previous = state.past[state.past.length - 1];
      if (!previous) {
        return state;
      }
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future]
      };
    }
    case "REDO": {
      const next = state.future[0];
      if (!next) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1)
      };
    }
    case "SET": {
      if (sameSegmentList(state.present, action.segments)) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: action.segments,
        future: []
      };
    }
    default:
      return state;
  }
}

function buildScaleBar(scale: number, canvasWidth: number): ScaleBarState {
  const targetPx = Math.max(100, Math.min(220, canvasWidth * SCALE_BAR_TARGET_RATIO));
  const maxPx = canvasWidth * SCALE_BAR_MAX_RATIO;
  let bestLengthMm = SCALE_BAR_CANDIDATES_MM[0] ?? 1000;
  let bestError = Number.POSITIVE_INFINITY;
  let hasCandidate = false;

  for (const candidateMm of SCALE_BAR_CANDIDATES_MM) {
    const candidatePx = candidateMm * scale;
    if (candidatePx > maxPx) {
      continue;
    }
    hasCandidate = true;
    const error = Math.abs(candidatePx - targetPx);
    if (error < bestError) {
      bestLengthMm = candidateMm;
      bestError = error;
    }
  }

  if (!hasCandidate) {
    const rawMm = Math.max(100, maxPx / Math.max(scale, 1e-6));
    const magnitude = 10 ** Math.floor(Math.log10(rawMm));
    const normalized = rawMm / magnitude;
    const base = normalized >= 10 ? 10 : normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
    bestLengthMm = base * magnitude;
  }

  return {
    lengthMm: bestLengthMm,
    lengthPx: bestLengthMm * scale,
    label: formatDistanceLabel(bestLengthMm)
  };
}

function findNearestNode(point: PointMm, nodes: PointMm[], maxDistanceMm: number): PointMm | null {
  let closest: PointMm | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const distance = distanceMm(point, node);
    if (distance > maxDistanceMm || distance >= bestDistance) {
      continue;
    }
    closest = node;
    bestDistance = distance;
  }

  return closest;
}

function snapToAxisGuide(
  start: PointMm,
  candidate: PointMm,
  anchors: PointMm[],
  maxDistanceMm: number,
): { point: PointMm; guide: AxisGuide | null } {
  const deltaX = candidate.x - start.x;
  const deltaY = candidate.y - start.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const isHorizontal = absX > 0 && absY <= absX * 0.2;
  const isVertical = absY > 0 && absX <= absY * 0.2;

  if (isHorizontal) {
    let best: PointMm | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const anchor of anchors) {
      const distance = Math.abs(anchor.x - candidate.x);
      if (distance > maxDistanceMm || distance >= bestDistance) {
        continue;
      }
      best = anchor;
      bestDistance = distance;
    }
    if (best) {
      return {
        point: quantize({ x: best.x, y: candidate.y }),
        guide: {
          orientation: "VERTICAL",
          coordinateMm: best.x,
          anchor: best
        }
      };
    }
  }

  if (isVertical) {
    let best: PointMm | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const anchor of anchors) {
      const distance = Math.abs(anchor.y - candidate.y);
      if (distance > maxDistanceMm || distance >= bestDistance) {
        continue;
      }
      best = anchor;
      bestDistance = distance;
    }
    if (best) {
      return {
        point: quantize({ x: candidate.x, y: best.y }),
        guide: {
          orientation: "HORIZONTAL",
          coordinateMm: best.y,
          anchor: best
        }
      };
    }
  }

  return { point: quantize(candidate), guide: null };
}

function pointCoordinateKey(point: PointMm): string {
  return `${point.x}:${point.y}`;
}

function classifyIncidentNode(vectors: Array<{ x: number; y: number }>): PostKind {
  if (vectors.length <= 1) {
    return "END";
  }
  if (vectors.length === 2) {
    const first = vectors[0];
    const second = vectors[1];
    if (!first || !second) {
      return "END";
    }
    return areOpposite(first, second, 1) ? "INLINE_JOIN" : "CORNER";
  }
  return "JUNCTION";
}

function buildSegmentConnectivity(segments: LayoutSegment[]): SegmentConnectivity {
  const segmentComponent = new Map<string, string>();
  const segmentIdsByComponent = new Map<string, string[]>();
  const movableComponentIds = new Set<string>();
  const nodeDegreeByKey = new Map<string, number>();
  const segmentById = new Map<string, LayoutSegment>();
  const segmentIdsByNode = new Map<string, string[]>();

  function addNodeSegment(nodeKey: string, segmentId: string): void {
    const bucket = segmentIdsByNode.get(nodeKey);
    if (bucket) {
      bucket.push(segmentId);
      return;
    }
    segmentIdsByNode.set(nodeKey, [segmentId]);
  }

  for (const segment of segments) {
    segmentById.set(segment.id, segment);
    addNodeSegment(pointCoordinateKey(segment.start), segment.id);
    addNodeSegment(pointCoordinateKey(segment.end), segment.id);
  }

  for (const [nodeKey, segmentIds] of segmentIdsByNode) {
    nodeDegreeByKey.set(nodeKey, segmentIds.length);
  }

  const visited = new Set<string>();
  let componentIndex = 0;

  for (const segment of segments) {
    if (visited.has(segment.id)) {
      continue;
    }
    const componentId = `component-${componentIndex}`;
    componentIndex += 1;
    const queue: string[] = [segment.id];
    const componentSegmentIds: string[] = [];
    const componentNodeKeys = new Set<string>();
    visited.add(segment.id);

    while (queue.length > 0) {
      const currentSegmentId = queue.shift();
      if (!currentSegmentId) {
        break;
      }
      const currentSegment = segmentById.get(currentSegmentId);
      if (!currentSegment) {
        continue;
      }

      componentSegmentIds.push(currentSegmentId);
      segmentComponent.set(currentSegmentId, componentId);

      const nodeKeys = [
        pointCoordinateKey(currentSegment.start),
        pointCoordinateKey(currentSegment.end)
      ];
      for (const nodeKey of nodeKeys) {
        componentNodeKeys.add(nodeKey);
        const neighborSegmentIds = segmentIdsByNode.get(nodeKey) ?? [];
        for (const neighborSegmentId of neighborSegmentIds) {
          if (visited.has(neighborSegmentId)) {
            continue;
          }
          visited.add(neighborSegmentId);
          queue.push(neighborSegmentId);
        }
      }
    }

    segmentIdsByComponent.set(componentId, componentSegmentIds);
    const onlyOneSegment = componentSegmentIds.length === 1;
    const firstSegment = onlyOneSegment ? segmentById.get(componentSegmentIds[0] ?? "") : undefined;
    const firstNodeDegree = firstSegment ? nodeDegreeByKey.get(pointCoordinateKey(firstSegment.start)) ?? 0 : 0;
    const secondNodeDegree = firstSegment ? nodeDegreeByKey.get(pointCoordinateKey(firstSegment.end)) ?? 0 : 0;
    const isMovable = onlyOneSegment && firstNodeDegree === 1 && secondNodeDegree === 1;
    if (isMovable) {
      movableComponentIds.add(componentId);
    }
  }

  return {
    segmentComponent,
    segmentIdsByComponent,
    movableComponentIds,
    nodeDegreeByKey
  };
}

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= 0) {
    return segment.start;
  }
  const t = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * t,
    y: segment.start.y + (segment.end.y - segment.start.y) * t
  };
}

function projectPointOntoSegment(point: PointMm, segment: LayoutSegment): { projected: PointMm; offsetMm: number; distanceMm: number } {
  const vx = segment.end.x - segment.start.x;
  const vy = segment.end.y - segment.start.y;
  const segmentLengthSquared = vx * vx + vy * vy;
  if (segmentLengthSquared <= 0) {
    return {
      projected: segment.start,
      offsetMm: 0,
      distanceMm: distanceMm(point, segment.start)
    };
  }
  const wx = point.x - segment.start.x;
  const wy = point.y - segment.start.y;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / segmentLengthSquared));
  const projected = {
    x: segment.start.x + vx * t,
    y: segment.start.y + vy * t
  };
  return {
    projected,
    offsetMm: distanceMm(segment.start, projected),
    distanceMm: distanceMm(point, projected)
  };
}

function buildRecessPreview(
  segment: LayoutSegment,
  centerOffsetMm: number,
  requestedWidthMm: number,
  requestedDepthMm: number,
  side: RecessSide,
): RecessInsertionPreview | null {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= MIN_SEGMENT_MM) {
    return null;
  }

  const widthMm = Math.max(DRAW_INCREMENT_MM, Math.min(requestedWidthMm, segmentLengthMm));
  const depthMm = Math.max(DRAW_INCREMENT_MM, requestedDepthMm);

  let startOffsetMm = centerOffsetMm - widthMm / 2;
  let endOffsetMm = centerOffsetMm + widthMm / 2;

  if (centerOffsetMm <= widthMm / 2 + RECESS_CORNER_SNAP_MM) {
    startOffsetMm = 0;
    endOffsetMm = widthMm;
  } else if (centerOffsetMm >= segmentLengthMm - widthMm / 2 - RECESS_CORNER_SNAP_MM) {
    endOffsetMm = segmentLengthMm;
    startOffsetMm = segmentLengthMm - widthMm;
  }

  startOffsetMm = Math.max(0, Math.min(segmentLengthMm - widthMm, startOffsetMm));
  endOffsetMm = Math.max(startOffsetMm, Math.min(segmentLengthMm, startOffsetMm + widthMm));

  startOffsetMm = Math.round(startOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  endOffsetMm = Math.round(endOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  if (endOffsetMm - startOffsetMm < DRAW_INCREMENT_MM) {
    return null;
  }

  const sourcePoint = segment.start;
  const entryPoint = interpolateAlongSegment(segment, startOffsetMm);
  const exitPoint = interpolateAlongSegment(segment, endOffsetMm);

  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const segmentLength = Math.sqrt(dx * dx + dy * dy);
  if (segmentLength <= 0) {
    return null;
  }
  const ux = dx / segmentLength;
  const uy = dy / segmentLength;
  const orientationFactor = side === "LEFT" ? 1 : -1;
  const nx = -uy * orientationFactor;
  const ny = ux * orientationFactor;

  const recessEntryPoint = {
    x: entryPoint.x + nx * depthMm,
    y: entryPoint.y + ny * depthMm
  };
  const recessExitPoint = {
    x: exitPoint.x + nx * depthMm,
    y: exitPoint.y + ny * depthMm
  };

  return {
    segment,
    segmentLengthMm,
    startOffsetMm,
    endOffsetMm,
    depthMm,
    side,
    sourcePoint,
    entryPoint,
    exitPoint,
    recessEntryPoint,
    recessExitPoint,
    targetPoint: interpolateAlongSegment(segment, centerOffsetMm)
  };
}

function chooseGridStep(scale: number): number {
  const step = GRID_STEPS_MM.find((candidate) => candidate * scale >= MIN_GRID_PIXEL_SPACING);
  return step ?? GRID_STEPS_MM[GRID_STEPS_MM.length - 1]!;
}

function screenToWorld(pointer: { x: number; y: number }, view: Viewport): PointMm {
  return {
    x: (pointer.x - view.x) / view.scale,
    y: (pointer.y - view.y) / view.scale
  };
}

function quantize(point: PointMm): PointMm {
  return {
    x: Math.round(point.x / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM,
    y: Math.round(point.y / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM
  };
}

function buildRecessReplacementSegments(preview: RecessInsertionPreview): LayoutSegment[] {
  const points = [
    quantize(preview.segment.start),
    quantize(preview.entryPoint),
    quantize(preview.recessEntryPoint),
    quantize(preview.recessExitPoint),
    quantize(preview.exitPoint),
    quantize(preview.segment.end)
  ];

  const built: LayoutSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end || distanceMm(start, end) < MIN_SEGMENT_MM) {
      continue;
    }
    built.push({
      id: crypto.randomUUID(),
      start,
      end,
      spec: preview.segment.spec
    });
  }
  return built;
}

function useWindowSize(): Size {
  const [size, setSize] = useState<Size>({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    function onResize(): void {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

export function App() {
  const { width, height } = useWindowSize();
  const isStackedLayout = width <= 1024;
  const canvasWidth = isStackedLayout ? width : Math.max(320, width - 360);
  const canvasHeight = isStackedLayout ? Math.max(260, height - 320) : height;
  const stageRef = useRef<Konva.Stage | null>(null);
  const [view, setView] = useState<Viewport>({ x: 120, y: 120, scale: 0.1 });
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    present: [],
    future: []
  } satisfies HistoryState);
  const segments = history.present;
  const [activeSpec, setActiveSpec] = useState<FenceSpec>(defaultFenceSpec());
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("DRAW");
  const [drawStart, setDrawStart] = useState<PointMm | null>(null);
  const [pointerWorld, setPointerWorld] = useState<PointMm | null>(null);
  const [recessWidthMm, setRecessWidthMm] = useState<number>(1500);
  const [recessDepthMm, setRecessDepthMm] = useState<number>(1000);
  const [recessSide, setRecessSide] = useState<RecessSide>("LEFT");
  const [disableSnap, setDisableSnap] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panAnchor, setPanAnchor] = useState<{ x: number; y: number } | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("");
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [optimizationRun, setOptimizationRun] = useState<{
    layoutKey: string;
    summary: OptimizationSummary;
  } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState({
    postKey: false,
    postHeights: false,
    layoutCounts: false,
    twinBarStock: false,
    twinBarFence: false,
    rollForm: false,
    optimizationTransfers: false
  });
  const initialScaleApplied = useRef(false);
  const skipNextSegmentSelection = useRef(false);
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const applySegments = useCallback((updater: (previous: LayoutSegment[]) => LayoutSegment[]) => {
    dispatchHistory({ type: "APPLY", updater });
  }, []);

  const undoSegments = useCallback(() => {
    dispatchHistory({ type: "UNDO" });
    setDrawStart(null);
    setSelectedSegmentId(null);
  }, []);

  const redoSegments = useCallback(() => {
    dispatchHistory({ type: "REDO" });
    setDrawStart(null);
    setSelectedSegmentId(null);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (isModifierPressed && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) {
          redoSegments();
        } else {
          undoSegments();
        }
        return;
      }
      if (isModifierPressed && event.code === "KeyY") {
        event.preventDefault();
        redoSegments();
        return;
      }
      if (!isModifierPressed && event.code === "KeyD") {
        setInteractionMode("DRAW");
      }
      if (!isModifierPressed && event.code === "KeyS") {
        setInteractionMode("SELECT");
      }
      if (!isModifierPressed && event.code === "KeyR") {
        setInteractionMode("RECESS");
      }
      if (event.code === "Space") {
        setIsSpacePressed(true);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setDisableSnap(true);
      }
      if ((event.code === "Delete" || event.code === "Backspace") && selectedSegmentId) {
        applySegments((previous) => previous.filter((segment) => segment.id !== selectedSegmentId));
        setSelectedSegmentId(null);
      }
      if (event.code === "Escape") {
        setDrawStart(null);
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        setDisableSnap(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [applySegments, redoSegments, selectedSegmentId, undoSegments]);

  useEffect(() => {
    if (interactionMode !== "SELECT") {
      setSelectedSegmentId(null);
    }
    if (interactionMode !== "DRAW") {
      setDrawStart(null);
    }
  }, [interactionMode]);

  useEffect(() => {
    if (initialScaleApplied.current || canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }
    const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, canvasWidth / INITIAL_VISIBLE_WIDTH_MM));
    setView({
      x: canvasWidth * 0.08,
      y: canvasHeight * 0.12,
      scale: targetScale
    });
    initialScaleApplied.current = true;
  }, [canvasHeight, canvasWidth]);

  const estimate = useMemo(() => estimateLayout({ segments }), [segments]);
  const layoutKey = useMemo(
    () =>
      JSON.stringify(
        segments.map((segment) => ({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          spec: segment.spec
        })),
      ),
    [segments],
  );
  const visualPosts = useMemo(() => {
    const postsByCoordinate = new Map<string, VisualPost>();
    const incidentNodes = new Map<string, IncidentNode>();

    function addIncident(point: PointMm, vector: { x: number; y: number }, heightMm: number): void {
      const key = pointCoordinateKey(point);
      const existing = incidentNodes.get(key);
      if (existing) {
        existing.vectors.push(vector);
        existing.maxHeightMm = Math.max(existing.maxHeightMm, heightMm);
        return;
      }
      incidentNodes.set(key, { point, vectors: [vector], maxHeightMm: heightMm });
    }

    for (const segment of segments) {
      const config = getSpecConfig(segment.spec);
      const segmentLength = distanceMm(segment.start, segment.end);
      const bays = Math.max(1, Math.ceil(segmentLength / config.bayWidthMm));

      addIncident(
        segment.start,
        { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y },
        config.assembledHeightMm,
      );
      addIncident(
        segment.end,
        { x: segment.start.x - segment.end.x, y: segment.start.y - segment.end.y },
        config.assembledHeightMm,
      );

      for (let index = 1; index < bays; index += 1) {
        const offsetMm = config.bayWidthMm * index;
        const point = quantize(interpolateAlongSegment(segment, offsetMm));
        const key = pointCoordinateKey(point);
        const existing = postsByCoordinate.get(key);
        if (existing) {
          existing.heightMm = Math.max(existing.heightMm, config.assembledHeightMm);
          continue;
        }
        postsByCoordinate.set(key, {
          key: `post-${key}`,
          point,
          kind: "INTERMEDIATE",
          heightMm: config.assembledHeightMm
        });
      }
    }

    for (const [coordinateKey, node] of incidentNodes) {
      postsByCoordinate.set(coordinateKey, {
        key: `post-${coordinateKey}`,
        point: node.point,
        kind: classifyIncidentNode(node.vectors),
        heightMm: node.maxHeightMm
      });
    }

    return [...postsByCoordinate.values()];
  }, [segments]);
  const drawAnchorNodes = useMemo(
    () =>
      visualPosts
        .filter((post) => post.kind === "END" || post.kind === "CORNER")
        .map((post) => post.point),
    [visualPosts],
  );
  const postTypeCounts = useMemo(
    () =>
      visualPosts.reduce<Record<PostKind, number>>(
        (accumulator, post) => {
          accumulator[post.kind] += 1;
          return accumulator;
        },
        {
          END: 0,
          INTERMEDIATE: 0,
          CORNER: 0,
          JUNCTION: 0,
          INLINE_JOIN: 0
        },
      ),
    [visualPosts],
  );
  const postHeightRows = useMemo(
    () =>
      Object.entries(estimate.posts.byHeightAndType)
        .map(([heightMm, counts]) => ({
          heightMm: Number(heightMm),
          ...counts
        }))
        .sort((left, right) => left.heightMm - right.heightMm),
    [estimate.posts.byHeightAndType],
  );
  const connectivity = useMemo(() => buildSegmentConnectivity(segments), [segments]);
  const selectedComponentId = useMemo(() => {
    if (!selectedSegmentId) {
      return null;
    }
    return connectivity.segmentComponent.get(selectedSegmentId) ?? null;
  }, [connectivity.segmentComponent, selectedSegmentId]);
  const selectedRunSegmentIds = useMemo(() => {
    if (!selectedComponentId) {
      return [];
    }
    return connectivity.segmentIdsByComponent.get(selectedComponentId) ?? [];
  }, [connectivity.segmentIdsByComponent, selectedComponentId]);
  const selectedRunMovable = useMemo(() => {
    if (!selectedComponentId) {
      return false;
    }
    return connectivity.movableComponentIds.has(selectedComponentId);
  }, [connectivity.movableComponentIds, selectedComponentId]);
  const activeHeightOptions = activeSpec.system === "TWIN_BAR" ? TWIN_BAR_HEIGHT_OPTIONS : ROLL_FORM_HEIGHT_OPTIONS;
  const twinBarStockRows = useMemo(
    () =>
      Object.entries(estimate.materials.twinBarPanelsByStockHeightMm)
        .map(([stockHeightMm, count]) => ({ stockHeightMm: Number(stockHeightMm), count }))
        .sort((left, right) => left.stockHeightMm - right.stockHeightMm),
    [estimate.materials.twinBarPanelsByStockHeightMm],
  );
  const twinBarFenceRows = useMemo(
    () =>
      Object.entries(estimate.materials.twinBarPanelsByFenceHeight)
        .map(([height, counts]) => ({ height, ...counts }))
        .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height)),
    [estimate.materials.twinBarPanelsByFenceHeight],
  );
  const rollFormRows = useMemo(
    () =>
      Object.entries(estimate.materials.rollsByFenceHeight)
        .map(([height, counts]) => ({ height, ...counts }))
        .sort((left, right) => Number.parseFloat(left.height) - Number.parseFloat(right.height)),
    [estimate.materials.rollsByFenceHeight],
  );
  const optimizationSummary = optimizationRun?.summary ?? null;
  const optimizationRows = useMemo(
    () => optimizationSummary?.twinBar.entries ?? [],
    [optimizationSummary],
  );
  const optimizationTransfers = useMemo(
    () => optimizationSummary?.twinBar.transfers ?? [],
    [optimizationSummary],
  );
  const optimizationDemands = useMemo(
    () => optimizationSummary?.twinBar.demands ?? [],
    [optimizationSummary],
  );
  const optimizationStats = useMemo(() => {
    const total = optimizationDemands.length;
    const reused = optimizationDemands.filter((decision) => decision.status === "REUSED_OFFCUT").length;
    const uncovered = total - reused;
    const multiOption = optimizationDemands.filter((decision) => decision.candidateSourceCount > 1).length;
    const reusableCandidatesMissed = optimizationDemands.filter(
      (decision) => decision.candidateSourceCount > 0 && decision.status !== "REUSED_OFFCUT",
    ).length;
    return {
      total,
      reused,
      uncovered,
      multiOption,
      reusableCandidatesMissed
    };
  }, [optimizationDemands]);
  const segmentsById = useMemo(() => {
    const map = new Map<string, LayoutSegment>();
    for (const segment of segments) {
      map.set(segment.id, segment);
    }
    return map;
  }, [segments]);
  const segmentOrdinalById = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((segment, index) => {
      map.set(segment.id, index + 1);
    });
    return map;
  }, [segments]);
  const transferById = useMemo(() => {
    const map = new Map<string, TwinBarOffcutTransfer>();
    optimizationTransfers.forEach((transfer) => {
      map.set(transfer.id, transfer);
    });
    return map;
  }, [optimizationTransfers]);
  const scaleBar = useMemo(() => buildScaleBar(view.scale, canvasWidth), [canvasWidth, view.scale]);
  const selectedTransfer = useMemo(() => {
    if (!selectedTransferId) {
      return null;
    }
    return transferById.get(selectedTransferId) ?? null;
  }, [selectedTransferId, transferById]);
  const selectedTransferVisual = useMemo(() => {
    if (!selectedTransfer) {
      return null;
    }
    const sourceSegment = segmentsById.get(selectedTransfer.source.segmentId);
    const destinationSegment = segmentsById.get(selectedTransfer.destination.segmentId);
    if (!sourceSegment || !destinationSegment) {
      return null;
    }
    const sourceStart = interpolateAlongSegment(sourceSegment, selectedTransfer.source.startOffsetMm);
    const sourceEnd = interpolateAlongSegment(sourceSegment, selectedTransfer.source.endOffsetMm);
    const destinationStart = interpolateAlongSegment(destinationSegment, selectedTransfer.destination.startOffsetMm);
    const destinationEnd = interpolateAlongSegment(destinationSegment, selectedTransfer.destination.endOffsetMm);
    return {
      transfer: selectedTransfer,
      sourceStart,
      sourceEnd,
      destinationStart,
      destinationEnd,
      linkStart: {
        x: (sourceStart.x + sourceEnd.x) / 2,
        y: (sourceStart.y + sourceEnd.y) / 2
      },
      linkEnd: {
        x: (destinationStart.x + destinationEnd.x) / 2,
        y: (destinationStart.y + destinationEnd.y) / 2
      }
    };
  }, [segmentsById, selectedTransfer]);
  const nodeSnapDistanceMm = NODE_SNAP_DISTANCE_PX / view.scale;
  const axisGuideSnapDistanceMm = AXIS_GUIDE_SNAP_PX / view.scale;

  const resolveDrawPoint = useCallback(
    (worldPoint: PointMm): { point: PointMm; guide: AxisGuide | null } => {
      const angleCandidate =
        disableSnap || !drawStart ? quantize(worldPoint) : snapPointToAngle(drawStart, worldPoint, 5);
      const nearestNode = findNearestNode(angleCandidate, drawAnchorNodes, nodeSnapDistanceMm);
      const basePoint = quantize(nearestNode ?? angleCandidate);

      if (!drawStart) {
        return { point: basePoint, guide: null };
      }

      return snapToAxisGuide(drawStart, basePoint, drawAnchorNodes, axisGuideSnapDistanceMm);
    },
    [axisGuideSnapDistanceMm, disableSnap, drawAnchorNodes, drawStart, nodeSnapDistanceMm],
  );

  useEffect(() => {
    if (optimizationTransfers.length === 0) {
      setSelectedTransferId(null);
      return;
    }
    if (!selectedTransferId || !optimizationTransfers.some((transfer) => transfer.id === selectedTransferId)) {
      setSelectedTransferId(optimizationTransfers[0]?.id ?? null);
    }
  }, [optimizationTransfers, selectedTransferId]);

  useEffect(() => {
    setOptimizationRun((previous) => {
      if (!previous) {
        return previous;
      }
      if (previous.layoutKey === layoutKey) {
        return previous;
      }
      return null;
    });
  }, [layoutKey]);

  const ghostSnap = useMemo(() => {
    if (!drawStart || !pointerWorld) {
      return null;
    }
    return resolveDrawPoint(pointerWorld);
  }, [drawStart, pointerWorld, resolveDrawPoint]);
  const ghostEnd = ghostSnap?.point ?? null;
  const axisGuide = ghostSnap?.guide ?? null;
  const recessPointerSnapMm = RECESS_POINTER_SNAP_PX / view.scale;
  const recessPreview = useMemo(() => {
    if (interactionMode !== "RECESS" || !pointerWorld) {
      return null;
    }

    let best: { segment: LayoutSegment; offsetMm: number; distanceMm: number } | null = null;
    for (const segment of segments) {
      const projection = projectPointOntoSegment(pointerWorld, segment);
      if (projection.distanceMm > recessPointerSnapMm) {
        continue;
      }
      if (!best || projection.distanceMm < best.distanceMm) {
        best = {
          segment,
          offsetMm: projection.offsetMm,
          distanceMm: projection.distanceMm
        };
      }
    }

    if (!best) {
      return null;
    }

    return buildRecessPreview(best.segment, best.offsetMm, recessWidthMm, recessDepthMm, recessSide);
  }, [interactionMode, pointerWorld, recessDepthMm, recessPointerSnapMm, recessSide, recessWidthMm, segments]);

  const ghostLengthMm = useMemo(() => {
    if (!drawStart || !ghostEnd) {
      return 0;
    }
    return Math.round(distanceMm(drawStart, ghostEnd));
  }, [drawStart, ghostEnd]);

  const gridStepMm = chooseGridStep(view.scale);
  const majorGridStepMm = gridStepMm * 5;

  const visibleBounds = useMemo(() => {
    const left = (-view.x) / view.scale;
    const right = (canvasWidth - view.x) / view.scale;
    const top = (-view.y) / view.scale;
    const bottom = (canvasHeight - view.y) / view.scale;
    return { left, right, top, bottom };
  }, [canvasHeight, canvasWidth, view.scale, view.x, view.y]);

  const verticalLines: { x: number; major: boolean }[] = [];
  const horizontalLines: { y: number; major: boolean }[] = [];

  const startX = Math.floor(visibleBounds.left / gridStepMm) * gridStepMm;
  for (let x = startX; x <= visibleBounds.right; x += gridStepMm) {
    verticalLines.push({ x, major: x % majorGridStepMm === 0 });
  }

  const startY = Math.floor(visibleBounds.top / gridStepMm) * gridStepMm;
  for (let y = startY; y <= visibleBounds.bottom; y += gridStepMm) {
    horizontalLines.push({ y, major: y % majorGridStepMm === 0 });
  }

  function updateSegment(segmentId: string, updater: (segment: LayoutSegment) => LayoutSegment): void {
    applySegments((previous) =>
      previous.map((segment) => (segment.id === segmentId ? updater(segment) : segment)),
    );
  }

  function toggleSection(section: keyof typeof collapsedSections): void {
    setCollapsedSections((previous) => ({
      ...previous,
      [section]: !previous[section]
    }));
  }

  function moveSegments(segmentIds: string[], delta: PointMm): void {
    if (segmentIds.length === 0) {
      return;
    }
    const segmentIdSet = new Set(segmentIds);
    applySegments((previous) =>
      previous.map((segment) => {
        if (!segmentIdSet.has(segment.id)) {
          return segment;
        }
        return {
          ...segment,
          start: quantize({ x: segment.start.x + delta.x, y: segment.start.y + delta.y }),
          end: quantize({ x: segment.end.x + delta.x, y: segment.end.y + delta.y })
        };
      }),
    );
  }

  function startOrCommitDrawing(worldPoint: PointMm): void {
    const snappedPoint = resolveDrawPoint(worldPoint).point;

    if (!drawStart) {
      setDrawStart(snappedPoint);
      setSelectedSegmentId(null);
      return;
    }

    if (distanceMm(drawStart, snappedPoint) < MIN_SEGMENT_MM) {
      return;
    }

    const segment: LayoutSegment = {
      id: crypto.randomUUID(),
      start: quantize(drawStart),
      end: quantize(snappedPoint),
      spec: activeSpec
    };

    applySegments((previous) => [...previous, segment]);
    setDrawStart(snappedPoint);
  }

  function insertRecess(preview: RecessInsertionPreview): void {
    const replacement = buildRecessReplacementSegments(preview);
    if (replacement.length === 0) {
      return;
    }
    applySegments((previous) => {
      const next: LayoutSegment[] = [];
      for (const segment of previous) {
        if (segment.id !== preview.segment.id) {
          next.push(segment);
          continue;
        }
        next.push(...replacement);
      }
      return next;
    });
    setSelectedSegmentId(null);
    setDrawStart(null);
  }

  function onStageMouseDown(event: KonvaEventObject<MouseEvent>): void {
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
      setIsPanning(true);
      setPanAnchor({ x: pointer.x - view.x, y: pointer.y - view.y });
      return;
    }

    if (event.evt.button !== 0) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const world = screenToWorld(pointer, view);

    if (interactionMode === "SELECT") {
      if (event.target === stage) {
        setSelectedSegmentId(null);
      }
      return;
    }

    if (interactionMode === "RECESS") {
      if (recessPreview) {
        insertRecess(recessPreview);
      }
      return;
    }

    skipNextSegmentSelection.current = false;
    if (!drawStart && event.target !== stage) {
      const anchor = findNearestNode(quantize(world), drawAnchorNodes, nodeSnapDistanceMm);
      if (!anchor) {
        return;
      }
      skipNextSegmentSelection.current = true;
    }

    startOrCommitDrawing(world);
  }

  function onStageMouseMove(): void {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    if (isPanning && panAnchor) {
      setView((previous) => ({
        ...previous,
        x: pointer.x - panAnchor.x,
        y: pointer.y - panAnchor.y
      }));
      return;
    }

    setPointerWorld(screenToWorld(pointer, view));
  }

  function onStageMouseUp(): void {
    setIsPanning(false);
    setPanAnchor(null);
  }

  function onStageWheel(event: KonvaEventObject<WheelEvent>): void {
    event.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const zoomFactor = 1.08;
    const oldScale = view.scale;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const candidateScale = direction > 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, candidateScale));
    const focus = {
      x: (pointer.x - view.x) / oldScale,
      y: (pointer.y - view.y) / oldScale
    };

    setView({
      scale: newScale,
      x: pointer.x - focus.x * newScale,
      y: pointer.y - focus.y * newScale
    });
  }

  function onContextMenu(event: KonvaEventObject<PointerEvent>): void {
    event.evt.preventDefault();
    setDrawStart(null);
  }

  async function createSnapshot(): Promise<void> {
    try {
      setSnapshotStatus("Saving snapshot...");
      const response = await fetch("http://localhost:3001/api/v1/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          layout: {
            segments
          }
        })
      });
      if (!response.ok) {
        setSnapshotStatus(`Snapshot failed (${response.status})`);
        return;
      }
      const body = (await response.json()) as { id: string };
      setSnapshotStatus(`Snapshot saved: ${body.id}`);
    } catch (error) {
      setSnapshotStatus(`Snapshot failed: ${(error as Error).message}`);
    }
  }

  function runOptimization(): void {
    const summary = buildOptimizationSummary({ segments });
    setOptimizationRun({
      layoutKey,
      summary
    });
    setSelectedTransferId(summary.twinBar.transfers[0]?.id ?? null);
  }

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <h1>Fence Estimator</h1>
        <p className="subtitle">2D layout editor with deterministic live counts</p>

        <section className="panel-block">
          <h2>Fence Palette</h2>
          <label>
            System
            <select
              value={activeSpec.system}
              onChange={(event) => {
                const nextSystem = event.target.value as FenceSpec["system"];
                setActiveSpec((previous) => {
                  if (nextSystem === "TWIN_BAR") {
                    const nextHeight = TWIN_BAR_HEIGHT_OPTIONS.includes(previous.height)
                      ? previous.height
                      : TWIN_BAR_HEIGHT_OPTIONS[2];
                    return {
                      system: nextSystem,
                      height: nextHeight ?? "2m",
                      twinBarVariant: previous.twinBarVariant ?? "STANDARD"
                    };
                  }
                  const nextHeight = ROLL_FORM_HEIGHT_OPTIONS.includes(previous.height)
                    ? previous.height
                    : ROLL_FORM_HEIGHT_OPTIONS[0];
                  return {
                    system: nextSystem,
                    height: nextHeight ?? "2m"
                  };
                });
              }}
            >
              <option value="TWIN_BAR">Twin Bar</option>
              <option value="ROLL_FORM">Roll Form Welded Mesh</option>
            </select>
          </label>
          <label>
            Height
            <select
              value={activeSpec.height}
              onChange={(event) => {
                const nextHeight = event.target.value as FenceHeightKey;
                setActiveSpec((previous) => ({ ...previous, height: nextHeight }));
              }}
            >
              {activeHeightOptions.map((heightOption) => (
                <option key={heightOption} value={heightOption}>
                  {heightOption}
                </option>
              ))}
            </select>
          </label>
          {activeSpec.system === "TWIN_BAR" ? (
            <label>
              Variant
              <select
                value={activeSpec.twinBarVariant ?? "STANDARD"}
                onChange={(event) => {
                  const next = event.target.value as TwinBarVariant;
                  setActiveSpec((previous) => ({ ...previous, twinBarVariant: next }));
                }}
              >
                <option value="STANDARD">Standard</option>
                <option value="SUPER_REBOUND">Super Rebound</option>
              </select>
            </label>
          ) : null}
          <div className="palette-legend">
            {(activeSpec.system === "TWIN_BAR" ? TWIN_BAR_HEIGHT_OPTIONS : ROLL_FORM_HEIGHT_OPTIONS).map(
              (heightOption) => (
                <div key={heightOption}>
                  <span
                    className="swatch"
                    style={{ background: getSegmentColor({ ...activeSpec, height: heightOption }) }}
                  />
                  {activeSpec.system === "TWIN_BAR"
                    ? `${heightOption} ${activeSpec.twinBarVariant === "SUPER_REBOUND" ? "Super Rebound" : "Standard"}`
                    : `Roll Form ${heightOption}`}
                </div>
              ),
            )}
          </div>
        </section>

        <section className="panel-block">
          <h2>Interaction</h2>
          <label>
            Mode
            <select
              value={interactionMode}
              onChange={(event) => {
                const nextMode = event.target.value as InteractionMode;
                setInteractionMode(nextMode);
              }}
            >
              <option value="DRAW">Draw</option>
              <option value="SELECT">Select</option>
              <option value="RECESS">Insert Recess</option>
            </select>
          </label>
          {interactionMode === "RECESS" ? (
            <>
              <label>
                Recess Width
                <select value={recessWidthMm} onChange={(event) => setRecessWidthMm(Number(event.target.value))}>
                  {RECESS_WIDTH_OPTIONS_MM.map((value) => (
                    <option key={value} value={value}>
                      {formatLengthMm(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Recess Depth
                <select value={recessDepthMm} onChange={(event) => setRecessDepthMm(Number(event.target.value))}>
                  {RECESS_DEPTH_OPTIONS_MM.map((value) => (
                    <option key={value} value={value}>
                      {formatLengthMm(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Recess Side
                <select value={recessSide} onChange={(event) => setRecessSide(event.target.value as RecessSide)}>
                  <option value="LEFT">Left Of Run</option>
                  <option value="RIGHT">Right Of Run</option>
                </select>
              </label>
              {recessPreview ? (
                <p className="muted-line">
                  Left run {formatLengthMm(recessPreview.startOffsetMm)} | Right run{" "}
                  {formatLengthMm(recessPreview.segmentLengthMm - recessPreview.endOffsetMm)}
                </p>
              ) : (
                <p className="muted-line">Hover near a fence line and click to place recess.</p>
              )}
            </>
          ) : null}
        </section>

        <section className="panel-block">
          <h2>Item Counts</h2>
          <div className="count-group">
            <button type="button" className="section-toggle" onClick={() => toggleSection("layoutCounts")}>
              {collapsedSections.layoutCounts ? "Show" : "Hide"} Layout
            </button>
            {!collapsedSections.layoutCounts ? (
              <dl className="dense-list">
                <div>
                  <dt>Segments</dt>
                  <dd>{segments.length}</dd>
                </div>
                <div>
                  <dt>Posts Total</dt>
                  <dd>{estimate.posts.total}</dd>
                </div>
                <div>
                  <dt>Corner Posts</dt>
                  <dd>{estimate.posts.cornerPosts}</dd>
                </div>
                <div>
                  <dt>Intermediate Posts</dt>
                  <dd>{estimate.posts.intermediate}</dd>
                </div>
                <div>
                  <dt>External Corners</dt>
                  <dd>{estimate.corners.external}</dd>
                </div>
                <div>
                  <dt>Internal Corners</dt>
                  <dd>{estimate.corners.internal}</dd>
                </div>
                <div>
                  <dt>Unclassified Corners</dt>
                  <dd>{estimate.corners.unclassified}</dd>
                </div>
              </dl>
            ) : null}
          </div>

          <div className="count-group">
            <button type="button" className="section-toggle" onClick={() => toggleSection("postHeights")}>
              {collapsedSections.postHeights ? "Show" : "Hide"} Post Heights
            </button>
            {!collapsedSections.postHeights ? (
              postHeightRows.length === 0 ? (
                <p className="muted-line">No posts placed yet.</p>
              ) : (
                <dl className="dense-list">
                  {postHeightRows.map((row) => (
                    <div key={row.heightMm}>
                      <dt>{formatHeightLabelFromMm(row.heightMm)} E/I/C/J/X (T)</dt>
                      <dd>
                        {row.end}/{row.intermediate}/{row.corner}/{row.junction}/{row.inlineJoin} ({row.total})
                      </dd>
                    </div>
                  ))}
                </dl>
              )
            ) : null}
          </div>

          <div className="count-group">
            <button type="button" className="section-toggle" onClick={() => toggleSection("twinBarStock")}>
              {collapsedSections.twinBarStock ? "Show" : "Hide"} Twin Bar Stock Panels
            </button>
            {!collapsedSections.twinBarStock ? (
              twinBarStockRows.length === 0 ? (
                <p className="muted-line">No twin bar panels in layout.</p>
              ) : (
                <dl className="dense-list">
                  {twinBarStockRows.map((row) => (
                    <div key={row.stockHeightMm}>
                      <dt>{formatHeightLabelFromMm(row.stockHeightMm)} panel</dt>
                      <dd>{row.count}</dd>
                    </div>
                  ))}
                </dl>
              )
            ) : null}
          </div>

          <div className="count-group">
            <button type="button" className="section-toggle" onClick={() => toggleSection("twinBarFence")}>
              {collapsedSections.twinBarFence ? "Show" : "Hide"} Twin Bar Fence Heights
            </button>
            {!collapsedSections.twinBarFence ? (
              twinBarFenceRows.length === 0 ? (
                <p className="muted-line">No twin bar fence runs yet.</p>
              ) : (
                <dl className="dense-list">
                  {twinBarFenceRows.map((row) => (
                    <div key={row.height}>
                      <dt>{row.height} (Std / SR)</dt>
                      <dd>
                        {row.standard} / {row.superRebound}
                      </dd>
                    </div>
                  ))}
                </dl>
              )
            ) : null}
          </div>

          <div className="count-group">
            <button type="button" className="section-toggle" onClick={() => toggleSection("rollForm")}>
              {collapsedSections.rollForm ? "Show" : "Hide"} Roll Form Rolls
            </button>
            {!collapsedSections.rollForm ? (
              rollFormRows.length === 0 ? (
                <p className="muted-line">No roll form runs in layout.</p>
              ) : (
                <dl className="dense-list">
                  {rollFormRows.map((row) => (
                    <div key={row.height}>
                      <dt>{row.height} (2100 / 900)</dt>
                      <dd>
                        {row.roll2100} / {row.roll900}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt>Total Rolls</dt>
                    <dd>{estimate.materials.totalRolls}</dd>
                  </div>
                </dl>
              )
            ) : null}
          </div>
        </section>

        <section className="panel-block">
          <h2>Optimization</h2>
          <p className="muted-line">Run this after layout drawing is finished. Results are cleared when geometry changes.</p>
          <p className="muted-line">
            5.5m example: {formatLengthMm(TWIN_BAR_PANEL_WIDTH_MM)} panels {"=>"} 2 full panels (
            {formatLengthMm(TWIN_BAR_PANEL_WIDTH_MM * 2)}), cut need {formatLengthMm(5500 - TWIN_BAR_PANEL_WIDTH_MM * 2)},
            spare offcut {formatLengthMm(TWIN_BAR_PANEL_WIDTH_MM - (5500 - TWIN_BAR_PANEL_WIDTH_MM * 2))}.
          </p>
          <button type="button" onClick={runOptimization} disabled={segments.length === 0}>
            Run Offcut Optimization
          </button>
          {!optimizationSummary ? (
            <p className="muted-line">No optimization run yet.</p>
          ) : (
            <>
              <p className="muted-line">
                Strategy: {optimizationSummary.strategy} | Baseline Panels: {optimizationSummary.twinBar.baselinePanels}
                {" | "}
                Optimized Panels: {optimizationSummary.twinBar.optimizedPanels} | Saved Panels:{" "}
                {optimizationSummary.twinBar.panelsSaved}
              </p>
              <p className="muted-line">
                Reuse Allowance: {formatLengthMm(optimizationSummary.twinBar.reuseAllowanceMm)} | Cut Demands:{" "}
                {optimizationStats.total} | Transfers Placed: {optimizationStats.reused} | Uncovered Gaps:{" "}
                {optimizationStats.uncovered}
              </p>
              <p className="muted-line">
                {optimizationStats.reusableCandidatesMissed === 0
                  ? "All eligible transfers were matched."
                  : `${optimizationStats.reusableCandidatesMissed} eligible transfers could not be matched.`}{" "}
                {optimizationStats.multiOption > 0
                  ? `Largest-offcut choices were made across ${optimizationStats.multiOption} demands with multiple options.`
                  : "No competing source choices were available."}
              </p>
              {optimizationRows.length === 0 ? (
                <p className="muted-line">No Twin Bar cut demands in this layout.</p>
              ) : (
                <dl className="dense-list">
                  {optimizationRows.map((row) => (
                    <div key={`${row.variant}-${row.stockPanelHeightMm}`}>
                      <dt>
                        {row.variant === "SUPER_REBOUND" ? "SR" : "Std"} {formatHeightLabelFromMm(row.stockPanelHeightMm)}
                      </dt>
                      <dd>
                        reuse {row.cutPiecesReused}/{row.cutPieces} | save {row.panelsSaved}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="count-group">
                <button type="button" className="section-toggle" onClick={() => toggleSection("optimizationTransfers")}>
                  {collapsedSections.optimizationTransfers ? "Show" : "Hide"} Offcut Transfers
                </button>
                {!collapsedSections.optimizationTransfers ? (
                  optimizationTransfers.length === 0 ? (
                    <p className="muted-line">No offcut transfers found for this optimization run.</p>
                  ) : (
                    <div className="transfer-list">
                      {optimizationTransfers.map((transfer) => {
                        const destinationIndex = segmentOrdinalById.get(transfer.destination.segmentId);
                        const sourceIndex = segmentOrdinalById.get(transfer.source.segmentId);
                        const isSelected = transfer.id === selectedTransferId;
                        const allowanceMm = transfer.sourceOffcutConsumedMm - transfer.destination.lengthMm;
                        const optionLabel =
                          transfer.candidateSourceCount > 1
                            ? `${transfer.candidateSourceCount} sources considered, largest offcut selected`
                            : transfer.candidateSourceCount === 1
                              ? "only eligible source"
                              : "forced selection";
                        return (
                          <button
                            key={transfer.id}
                            type="button"
                            className={`transfer-item reused${isSelected ? " active" : ""}`}
                            onClick={() => setSelectedTransferId(transfer.id)}
                          >
                            <span className="transfer-item-title">
                              Offcut {transfer.sourceOffcutId} use {transfer.sourceReuseStep}: FROM #{sourceIndex ?? "?"}{" "}
                              {formatSegmentWindow(transfer.source.startOffsetMm, transfer.source.endOffsetMm)} TO #
                              {destinationIndex ?? "?"}{" "}
                              {formatSegmentWindow(transfer.destination.startOffsetMm, transfer.destination.endOffsetMm)}
                            </span>
                            <span className="transfer-item-sub">{optionLabel}</span>
                            <span className="transfer-item-sub">
                              source {formatLengthMm(transfer.sourceOffcutLengthMm)} | used{" "}
                              {formatLengthMm(transfer.sourceOffcutConsumedMm)} ({formatLengthMm(allowanceMm)} allowance) |
                              remaining {formatLengthMm(transfer.sourceOffcutRemainingMm)}
                            </span>
                            <strong className="transfer-status">
                              TRANSFER
                            </strong>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </div>
            </>
          )}
        </section>

        <section className="panel-block">
          <h2>Post Key</h2>
          <button type="button" className="section-toggle" onClick={() => toggleSection("postKey")}>
            {collapsedSections.postKey ? "Show" : "Hide"} Post Symbols
          </button>
          {!collapsedSections.postKey ? (
            <div className="post-key">
              <div className="post-key-row">
                <span className="post-icon post-end" />
                <span>End Post</span>
                <strong>{postTypeCounts.END}</strong>
              </div>
              <div className="post-key-row">
                <span className="post-icon post-intermediate" />
                <span>Intermediate Post</span>
                <strong>{postTypeCounts.INTERMEDIATE}</strong>
              </div>
              <div className="post-key-row">
                <span className="post-icon post-corner" />
                <span>Corner Post</span>
                <strong>{postTypeCounts.CORNER}</strong>
              </div>
              <div className="post-key-row">
                <span className="post-icon post-junction" />
                <span>Junction Post</span>
                <strong>{postTypeCounts.JUNCTION}</strong>
              </div>
              <div className="post-key-row">
                <span className="post-icon post-inline-join" />
                <span>Inline Join Post</span>
                <strong>{postTypeCounts.INLINE_JOIN}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel-block">
          <h2>Controls</h2>
          <ul>
            <li>Mode Draw: left click start/commit fence line</li>
            <li>Mode Select: click line to select and edit</li>
            <li>Mode Recess: hover line and click to insert recess</li>
            <li>Right click: cancel active chain</li>
            <li>Hold Shift: disable 5 degree snapping</li>
            <li>Auto-snap to nearby existing post nodes</li>
            <li>Horizontal/vertical guide snap to end and corner nodes</li>
            <li>Mouse wheel: pointer-centered zoom</li>
            <li>Middle drag or Space + drag: pan</li>
            <li>Select mode required for run move/edit</li>
            <li>Run move is only allowed for isolated single runs</li>
            <li>Run Offcut Optimization after drawing to generate transfers</li>
            <li>Ctrl/Cmd+Z undo | Ctrl/Cmd+Y redo</li>
            <li>Delete/Backspace: remove selected segment</li>
          </ul>
          {selectedSegmentId ? (
            <p className="snapshot-status">
              {selectedRunMovable
                ? `Selected run is movable (${selectedRunSegmentIds.length} segment${selectedRunSegmentIds.length === 1 ? "" : "s"})`
                : "Selected run is connected to other runs and cannot be moved as a block"}
            </p>
          ) : null}
          <button
            type="button"
            className="ghost"
            onClick={undoSegments}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="ghost"
            onClick={redoSegments}
            disabled={!canRedo}
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedSegmentId) {
                return;
              }
              applySegments((previous) => previous.filter((segment) => segment.id !== selectedSegmentId));
              setSelectedSegmentId(null);
            }}
            disabled={interactionMode !== "SELECT" || !selectedSegmentId}
          >
            Delete Selected Segment
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              dispatchHistory({ type: "SET", segments: [] });
              setDrawStart(null);
              setSelectedSegmentId(null);
            }}
          >
            Clear Layout
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void createSnapshot();
            }}
            disabled={segments.length === 0}
          >
            Save Snapshot To API
          </button>
          {snapshotStatus ? <p className="snapshot-status">{snapshotStatus}</p> : null}
        </section>
      </aside>

      <main className="canvas-wrap">
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onWheel={onStageWheel}
          onContextMenu={onContextMenu}
        >
          <Layer listening={false}>
            {verticalLines.map((line) => (
              <Line
                key={`v-${line.x}`}
                points={[line.x, visibleBounds.top, line.x, visibleBounds.bottom]}
                stroke={line.major ? "#243543" : "#1a242d"}
                strokeWidth={(line.major ? MAJOR_GRID_STROKE_PX : MINOR_GRID_STROKE_PX) / view.scale}
              />
            ))}
            {horizontalLines.map((line) => (
              <Line
                key={`h-${line.y}`}
                points={[visibleBounds.left, line.y, visibleBounds.right, line.y]}
                stroke={line.major ? "#243543" : "#1a242d"}
                strokeWidth={(line.major ? MAJOR_GRID_STROKE_PX : MINOR_GRID_STROKE_PX) / view.scale}
              />
            ))}
          </Layer>

          <Layer>
            {selectedTransferVisual ? (
              <Group key={`transfer-${selectedTransferVisual.transfer.id}`} listening={false}>
                <Line
                  points={[
                    selectedTransferVisual.sourceStart.x,
                    selectedTransferVisual.sourceStart.y,
                    selectedTransferVisual.sourceEnd.x,
                    selectedTransferVisual.sourceEnd.y
                  ]}
                  stroke="#ffb000"
                  strokeWidth={7 / view.scale}
                  lineCap="round"
                />
                <Line
                  points={[
                    selectedTransferVisual.destinationStart.x,
                    selectedTransferVisual.destinationStart.y,
                    selectedTransferVisual.destinationEnd.x,
                    selectedTransferVisual.destinationEnd.y
                  ]}
                  stroke="#00d2ff"
                  strokeWidth={7 / view.scale}
                  lineCap="round"
                />
                <Circle
                  x={selectedTransferVisual.linkStart.x}
                  y={selectedTransferVisual.linkStart.y}
                  radius={4.2 / view.scale}
                  fill="#ffb000"
                />
                <Circle
                  x={selectedTransferVisual.linkEnd.x}
                  y={selectedTransferVisual.linkEnd.y}
                  radius={4.2 / view.scale}
                  fill="#00d2ff"
                />
                <Arrow
                  points={[
                    selectedTransferVisual.linkStart.x,
                    selectedTransferVisual.linkStart.y,
                    selectedTransferVisual.linkEnd.x,
                    selectedTransferVisual.linkEnd.y
                  ]}
                  stroke="#f7fbff"
                  fill="#f7fbff"
                  strokeWidth={2.1 / view.scale}
                  pointerLength={10 / view.scale}
                  pointerWidth={10 / view.scale}
                  dash={[8 / view.scale, 6 / view.scale]}
                  opacity={0.95}
                />
                <Text
                  x={selectedTransferVisual.linkStart.x}
                  y={selectedTransferVisual.linkStart.y - 16 / view.scale}
                  text={`FROM offcut ${formatLengthMm(selectedTransferVisual.transfer.sourceOffcutLengthMm)}`}
                  fontSize={LABEL_FONT_SIZE_PX / view.scale}
                  fill="#ffb000"
                  offsetX={(16 + `${formatLengthMm(selectedTransferVisual.transfer.sourceOffcutLengthMm)}`.length * 3.5) / view.scale}
                />
                <Text
                  x={selectedTransferVisual.linkEnd.x}
                  y={selectedTransferVisual.linkEnd.y - 16 / view.scale}
                  text={`TO ${formatLengthMm(selectedTransferVisual.transfer.destination.lengthMm)}`}
                  fontSize={LABEL_FONT_SIZE_PX / view.scale}
                  fill="#00d2ff"
                  offsetX={(4 + `${formatLengthMm(selectedTransferVisual.transfer.destination.lengthMm)}`.length * 3.5) / view.scale}
                />
                <Text
                  x={(selectedTransferVisual.linkStart.x + selectedTransferVisual.linkEnd.x) / 2}
                  y={(selectedTransferVisual.linkStart.y + selectedTransferVisual.linkEnd.y) / 2}
                  text={`${formatLengthMm(selectedTransferVisual.transfer.sourceOffcutConsumedMm)} used`}
                  fontSize={LABEL_FONT_SIZE_PX / view.scale}
                  fill="#f7fbff"
                  offsetX={(8 + `${formatLengthMm(selectedTransferVisual.transfer.sourceOffcutConsumedMm)}`.length * 3.5) / view.scale}
                  offsetY={10 / view.scale}
                />
              </Group>
            ) : null}
            {interactionMode === "RECESS" && recessPreview ? (
              <Group key={`recess-preview-${recessPreview.segment.id}`} listening={false}>
                <Line
                  points={[
                    recessPreview.segment.start.x,
                    recessPreview.segment.start.y,
                    recessPreview.entryPoint.x,
                    recessPreview.entryPoint.y
                  ]}
                  stroke="#7dd3fc"
                  strokeWidth={4 / view.scale}
                  lineCap="round"
                />
                <Line
                  points={[
                    recessPreview.entryPoint.x,
                    recessPreview.entryPoint.y,
                    recessPreview.recessEntryPoint.x,
                    recessPreview.recessEntryPoint.y,
                    recessPreview.recessExitPoint.x,
                    recessPreview.recessExitPoint.y,
                    recessPreview.exitPoint.x,
                    recessPreview.exitPoint.y
                  ]}
                  stroke="#00e0a4"
                  strokeWidth={4.5 / view.scale}
                  dash={[10 / view.scale, 7 / view.scale]}
                  lineCap="round"
                  lineJoin="round"
                />
                <Line
                  points={[
                    recessPreview.exitPoint.x,
                    recessPreview.exitPoint.y,
                    recessPreview.segment.end.x,
                    recessPreview.segment.end.y
                  ]}
                  stroke="#7dd3fc"
                  strokeWidth={4 / view.scale}
                  lineCap="round"
                />
                <Circle
                  x={recessPreview.targetPoint.x}
                  y={recessPreview.targetPoint.y}
                  radius={4 / view.scale}
                  fill="#00e0a4"
                />
                {recessPreview.startOffsetMm > MIN_SEGMENT_MM ? (
                  <Text
                    x={(recessPreview.segment.start.x + recessPreview.entryPoint.x) / 2}
                    y={(recessPreview.segment.start.y + recessPreview.entryPoint.y) / 2}
                    text={formatLengthMm(recessPreview.startOffsetMm)}
                    fontSize={LABEL_FONT_SIZE_PX / view.scale}
                    fill="#7dd3fc"
                    offsetX={24 / view.scale}
                    offsetY={10 / view.scale}
                  />
                ) : null}
                {recessPreview.segmentLengthMm - recessPreview.endOffsetMm > MIN_SEGMENT_MM ? (
                  <Text
                    x={(recessPreview.exitPoint.x + recessPreview.segment.end.x) / 2}
                    y={(recessPreview.exitPoint.y + recessPreview.segment.end.y) / 2}
                    text={formatLengthMm(recessPreview.segmentLengthMm - recessPreview.endOffsetMm)}
                    fontSize={LABEL_FONT_SIZE_PX / view.scale}
                    fill="#7dd3fc"
                    offsetX={24 / view.scale}
                    offsetY={10 / view.scale}
                  />
                ) : null}
                <Text
                  x={(recessPreview.recessEntryPoint.x + recessPreview.recessExitPoint.x) / 2}
                  y={(recessPreview.recessEntryPoint.y + recessPreview.recessExitPoint.y) / 2}
                  text={`Recess ${formatLengthMm(recessPreview.endOffsetMm - recessPreview.startOffsetMm)} x ${formatLengthMm(recessPreview.depthMm)}`}
                  fontSize={LABEL_FONT_SIZE_PX / view.scale}
                  fill="#00e0a4"
                  offsetX={48 / view.scale}
                  offsetY={12 / view.scale}
                />
              </Group>
            ) : null}
            {visualPosts.map((post) => {
              const size = POST_SYMBOL_RADIUS_PX / view.scale;
              const strokeWidth = 1.2 / view.scale;

              if (post.kind === "INTERMEDIATE") {
                return (
                  <Rect
                    key={post.key}
                    x={post.point.x - size}
                    y={post.point.y - size}
                    width={size * 2}
                    height={size * 2}
                    fill="#6dd3ff"
                    stroke="#0b1117"
                    strokeWidth={strokeWidth}
                    listening={false}
                  />
                );
              }

              if (post.kind === "CORNER") {
                return (
                  <RegularPolygon
                    key={post.key}
                    x={post.point.x}
                    y={post.point.y}
                    sides={4}
                    radius={size * 1.2}
                    rotation={45}
                    fill="#ffb703"
                    stroke="#0b1117"
                    strokeWidth={strokeWidth}
                    listening={false}
                  />
                );
              }

              if (post.kind === "JUNCTION") {
                return (
                  <RegularPolygon
                    key={post.key}
                    x={post.point.x}
                    y={post.point.y}
                    sides={3}
                    radius={size * 1.35}
                    rotation={180}
                    fill="#ff5d8f"
                    stroke="#0b1117"
                    strokeWidth={strokeWidth}
                    listening={false}
                  />
                );
              }

              if (post.kind === "INLINE_JOIN") {
                return (
                  <RegularPolygon
                    key={post.key}
                    x={post.point.x}
                    y={post.point.y}
                    sides={6}
                    radius={size * 1.1}
                    fill="#c3ccde"
                    stroke="#0b1117"
                    strokeWidth={strokeWidth}
                    listening={false}
                  />
                );
              }

              return (
                <Circle
                  key={post.key}
                  x={post.point.x}
                  y={post.point.y}
                  radius={size * 1.1}
                  fill="#ffd166"
                  stroke="#0b1117"
                  strokeWidth={strokeWidth}
                  listening={false}
                />
              );
            })}
            {segments.map((segment) => {
              const isSelected = segment.id === selectedSegmentId;
              const labelPosition = {
                x: (segment.start.x + segment.end.x) / 2,
                y: (segment.start.y + segment.end.y) / 2
              };
              const lengthLabel = formatLengthMm(distanceMm(segment.start, segment.end));
              const color = getSegmentColor(segment.spec);

              return (
                <Group key={segment.id}>
                  <Line
                    points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
                    stroke={color}
                    strokeWidth={(isSelected ? SEGMENT_SELECTED_STROKE_PX : SEGMENT_STROKE_PX) / view.scale}
                    {...(segment.spec.system === "ROLL_FORM"
                      ? { dash: [12 / view.scale, 8 / view.scale] }
                      : {})}
                    lineCap="round"
                    lineJoin="round"
                    draggable={interactionMode === "SELECT" && isSelected && selectedRunMovable}
                    onClick={(event) => {
                      event.cancelBubble = true;
                      if (interactionMode !== "SELECT") {
                        return;
                      }
                      if (skipNextSegmentSelection.current) {
                        skipNextSegmentSelection.current = false;
                        return;
                      }
                      setSelectedSegmentId(segment.id);
                      setDrawStart(null);
                    }}
                    onTap={() => {
                      if (interactionMode !== "SELECT") {
                        return;
                      }
                      if (skipNextSegmentSelection.current) {
                        skipNextSegmentSelection.current = false;
                        return;
                      }
                      setSelectedSegmentId(segment.id);
                      setDrawStart(null);
                    }}
                    onDragEnd={(event) => {
                      if (!selectedRunMovable) {
                        event.target.position({ x: 0, y: 0 });
                        return;
                      }
                      const deltaX = event.target.x();
                      const deltaY = event.target.y();
                      moveSegments(selectedRunSegmentIds, { x: deltaX, y: deltaY });
                      event.target.position({ x: 0, y: 0 });
                    }}
                  />
                  <Text
                    x={labelPosition.x}
                    y={labelPosition.y}
                    text={lengthLabel}
                    fontSize={LABEL_FONT_SIZE_PX / view.scale}
                    fill="#f5f7fa"
                    offsetX={(lengthLabel.length * 3.6) / view.scale}
                    offsetY={8 / view.scale}
                  />
                  {interactionMode === "SELECT" && isSelected ? (
                    <>
                      <Circle
                        x={segment.start.x}
                        y={segment.start.y}
                        radius={HANDLE_RADIUS_PX / view.scale}
                        fill="#ffbe0b"
                        draggable
                        onDragMove={(event) => {
                          const position = quantize({ x: event.target.x(), y: event.target.y() });
                          updateSegment(segment.id, (current) => ({ ...current, start: position }));
                        }}
                      />
                      <Circle
                        x={segment.end.x}
                        y={segment.end.y}
                        radius={HANDLE_RADIUS_PX / view.scale}
                        fill="#ffbe0b"
                        draggable
                        onDragMove={(event) => {
                          const position = quantize({ x: event.target.x(), y: event.target.y() });
                          updateSegment(segment.id, (current) => ({ ...current, end: position }));
                        }}
                      />
                    </>
                  ) : null}
                </Group>
              );
            })}

            {drawStart && ghostEnd ? (
              <>
                {axisGuide ? (
                  <>
                    <Line
                      listening={false}
                      points={
                        axisGuide.orientation === "VERTICAL"
                          ? [axisGuide.coordinateMm, visibleBounds.top, axisGuide.coordinateMm, visibleBounds.bottom]
                          : [visibleBounds.left, axisGuide.coordinateMm, visibleBounds.right, axisGuide.coordinateMm]
                      }
                      stroke="#8fd9ff"
                      strokeWidth={1.6 / view.scale}
                      dash={[7 / view.scale, 5 / view.scale]}
                      opacity={0.8}
                    />
                    <Circle
                      listening={false}
                      x={axisGuide.anchor.x}
                      y={axisGuide.anchor.y}
                      radius={4.5 / view.scale}
                      fill="#8fd9ff"
                    />
                  </>
                ) : null}
                <Line
                  listening={false}
                  points={[drawStart.x, drawStart.y, ghostEnd.x, ghostEnd.y]}
                  stroke="#ff6b35"
                  strokeWidth={GHOST_STROKE_PX / view.scale}
                  dash={[10 / view.scale, 7 / view.scale]}
                  lineCap="round"
                />
                <Text
                  listening={false}
                  x={(drawStart.x + ghostEnd.x) / 2}
                  y={(drawStart.y + ghostEnd.y) / 2}
                  text={formatLengthMm(ghostLengthMm)}
                  fontSize={LABEL_FONT_SIZE_PX / view.scale}
                  fill="#ffd166"
                  offsetX={42 / view.scale}
                  offsetY={10 / view.scale}
                />
              </>
            ) : null}
          </Layer>
        </Stage>

        <div className="scale-bar" aria-label="Canvas scale bar">
          <div className="scale-bar-line" style={{ width: `${scaleBar.lengthPx}px` }}>
            <span className="tick left" />
            <span className="tick right" />
          </div>
          <div className="scale-bar-labels">
            <span>0</span>
            <span>{scaleBar.label}</span>
          </div>
        </div>

        <div className="statusbar">
          <span>Mode: {interactionMode}</span>
          <span>Snap: {disableSnap ? "OFF" : "5 deg"}</span>
          <span>Point Step: 0.1m</span>
          <span>Active Start: {drawStart ? formatPointMeters(drawStart) : "None"}</span>
          <span>Cursor: {pointerWorld ? formatPointMeters(quantize(pointerWorld)) : "N/A"}</span>
        </div>
      </main>
    </div>
  );
}


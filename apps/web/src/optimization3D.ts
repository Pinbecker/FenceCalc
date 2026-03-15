import type { LayoutSegment, PointMm, TwinBarOptimizationPlan, TwinBarVariant } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";
import { getSpecConfig } from "@fence-estimator/rules-engine";
import type {
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement
} from "./editor/types.js";

export interface Optimization3DPanelSlice {
  key: string;
  segmentId: string;
  start: PointMm;
  end: PointMm;
  baseHeightMm: number;
  heightMm: number;
  apertureWidthMm: number;
  apertureHeightMm: number;
  variant: TwinBarVariant;
  tone: "PRIMARY" | "SECOND_LIFT" | "REBOUND";
}

export interface Optimization3DPost {
  key: string;
  point: PointMm;
  heightMm: number;
}

export interface Optimization3DRail {
  key: string;
  start: PointMm;
  end: PointMm;
  centerHeightMm: number;
  diameterMm: number;
}

export interface Optimization3DGate {
  key: string;
  start: PointMm;
  end: PointMm;
  center: PointMm;
  normal: { x: number; y: number };
  heightMm: number;
  leafCount: 1 | 2;
}

export interface Optimization3DBasketballPost {
  key: string;
  point: PointMm;
  normal: { x: number; y: number };
  heightMm: number;
  armLengthMm: number;
  hoopRadiusMm: number;
}

export interface Optimization3DFloodlightColumn {
  key: string;
  point: PointMm;
  normal: { x: number; y: number };
  heightMm: number;
  barWidthMm: number;
}

export interface Optimization3DCutOverlay {
  key: string;
  cutId: string;
  planId: string;
  planIndex: number;
  step: number;
  mode: "OPEN_STOCK_PANEL" | "REUSE_OFFCUT";
  segmentId: string;
  segmentOrdinal: number | null;
  start: PointMm;
  end: PointMm;
  center: PointMm;
  baseHeightMm: number;
  heightMm: number;
  lengthMm: number;
}

export interface Optimization3DReuseLink {
  key: string;
  planId: string;
  planIndex: number;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
}

export interface Optimization3DScene {
  panelSlices: Optimization3DPanelSlice[];
  posts: Optimization3DPost[];
  rails: Optimization3DRail[];
  gates: Optimization3DGate[];
  basketballPosts: Optimization3DBasketballPost[];
  floodlightColumns: Optimization3DFloodlightColumn[];
  cutOverlays: Optimization3DCutOverlay[];
  reuseLinks: Optimization3DReuseLink[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    maxHeightMm: number;
  };
}

interface VisualLayer {
  baseHeightMm: number;
  visualHeightMm: number;
  stockHeightMm: number;
  tone: "PRIMARY" | "SECOND_LIFT";
}

const BASKETBALL_POST_HEIGHT_MM = 3250;
const BASKETBALL_POST_ARM_LENGTH_MM = 1800;
const BASKETBALL_POST_HOOP_RADIUS_MM = 180;
const FLOODLIGHT_COLUMN_HEIGHT_MM = 6000;
const FLOODLIGHT_BAR_WIDTH_MM = 840;
const TWIN_BAR_LOW_PANEL_TOP_RAIL_DIAMETER_MM = 60;
const TWIN_BAR_LOW_PANEL_TOP_RAIL_CENTER_HEIGHT_MM = 1170;

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= 0.001) {
    return segment.start;
  }
  const ratio = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
    y: segment.start.y + (segment.end.y - segment.start.y) * ratio
  };
}

function buildVisualLayers(segment: LayoutSegment): VisualLayer[] {
  const config = getSpecConfig(segment.spec);
  const rawLayers = config.layers.map((layer) => layer.heightMm);
  const remainingDeltaMm =
    segment.spec.system === "TWIN_BAR" && segment.spec.height === "1.2m"
      ? 0
      : config.assembledHeightMm - rawLayers.reduce((sum, value) => sum + value, 0);
  if (remainingDeltaMm > 0 && rawLayers.length > 0) {
    rawLayers[rawLayers.length - 1] = (rawLayers[rawLayers.length - 1] ?? 0) + remainingDeltaMm;
  }

  let cursorMm = 0;
  return rawLayers.map((heightMm, index) => {
    const layer = {
      baseHeightMm: cursorMm,
      visualHeightMm: heightMm,
      stockHeightMm: config.layers[index]?.heightMm ?? heightMm,
      tone: index === 0 ? "PRIMARY" as const : "SECOND_LIFT" as const
    };
    cursorMm += heightMm;
    return layer;
  });
}

function buildPanelSlicesForLayer(
  segment: LayoutSegment,
  panelStart: PointMm,
  panelEnd: PointMm,
  layer: VisualLayer
): Optimization3DPanelSlice[] {
  if (segment.spec.system !== "TWIN_BAR") {
    return [];
  }

  if (segment.spec.twinBarVariant === "SUPER_REBOUND" && layer.baseHeightMm < 1200) {
    const reboundHeightMm = Math.max(0, Math.min(layer.visualHeightMm, 1200 - layer.baseHeightMm));
    const slices: Optimization3DPanelSlice[] = [];
    if (reboundHeightMm > 0) {
      slices.push({
        key: `${segment.id}-${panelStart.x}-${panelStart.y}-${layer.baseHeightMm}-rebound`,
        segmentId: segment.id,
        start: panelStart,
        end: panelEnd,
        baseHeightMm: layer.baseHeightMm,
        heightMm: reboundHeightMm,
        apertureWidthMm: 50,
        apertureHeightMm: 66,
        variant: "SUPER_REBOUND",
        tone: "REBOUND"
      });
    }
    const upperHeightMm = layer.visualHeightMm - reboundHeightMm;
    if (upperHeightMm > 0) {
      slices.push({
        key: `${segment.id}-${panelStart.x}-${panelStart.y}-${layer.baseHeightMm}-standard`,
        segmentId: segment.id,
        start: panelStart,
        end: panelEnd,
        baseHeightMm: layer.baseHeightMm + reboundHeightMm,
        heightMm: upperHeightMm,
        apertureWidthMm: 50,
        apertureHeightMm: 200,
        variant: "SUPER_REBOUND",
        tone: layer.tone
      });
    }
    return slices;
  }

  return [
    {
      key: `${segment.id}-${panelStart.x}-${panelStart.y}-${layer.baseHeightMm}-${layer.stockHeightMm}`,
      segmentId: segment.id,
      start: panelStart,
      end: panelEnd,
      baseHeightMm: layer.baseHeightMm,
      heightMm: layer.visualHeightMm,
      apertureWidthMm: 50,
      apertureHeightMm: 200,
      variant: segment.spec.twinBarVariant === "SUPER_REBOUND" ? "SUPER_REBOUND" : "STANDARD",
      tone: layer.tone
    }
  ];
}

function buildPanelSlices(estimateSegments: LayoutSegment[]): Optimization3DPanelSlice[] {
  const slices: Optimization3DPanelSlice[] = [];

  for (const segment of estimateSegments) {
    if (segment.spec.system !== "TWIN_BAR") {
      continue;
    }
    const config = getSpecConfig(segment.spec);
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0.001) {
      continue;
    }
    const panelCount = Math.max(1, Math.ceil(segmentLengthMm / config.bayWidthMm));
    const layers = buildVisualLayers(segment);

    for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
      const startOffsetMm = Math.min(segmentLengthMm, panelIndex * config.bayWidthMm);
      const endOffsetMm = Math.min(segmentLengthMm, (panelIndex + 1) * config.bayWidthMm);
      const panelStart = interpolateAlongSegment(segment, startOffsetMm);
      const panelEnd = interpolateAlongSegment(segment, endOffsetMm);
      for (const layer of layers) {
        slices.push(...buildPanelSlicesForLayer(segment, panelStart, panelEnd, layer));
      }
    }
  }

  return slices;
}

function buildPosts(estimateSegments: LayoutSegment[]): Optimization3DPost[] {
  const postsByKey = new Map<string, Optimization3DPost>();

  for (const segment of estimateSegments) {
    const config = getSpecConfig(segment.spec);
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0.001) {
      continue;
    }
    const postCount = Math.max(1, Math.ceil(segmentLengthMm / config.bayWidthMm));
    for (let index = 0; index <= postCount; index += 1) {
      const offsetMm = Math.min(segmentLengthMm, index * config.bayWidthMm);
      const point = interpolateAlongSegment(segment, offsetMm);
      const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
      const existing = postsByKey.get(key);
      if (existing) {
        existing.heightMm = Math.max(existing.heightMm, config.assembledHeightMm);
        continue;
      }
      postsByKey.set(key, {
        key: `post-${key}`,
        point,
        heightMm: config.assembledHeightMm
      });
    }
  }

  return [...postsByKey.values()];
}

function buildRails(estimateSegments: LayoutSegment[]): Optimization3DRail[] {
  return estimateSegments
    .filter((segment) => segment.spec.system === "TWIN_BAR" && segment.spec.height === "1.2m")
    .map((segment) => ({
      key: `rail-${segment.id}`,
      start: segment.start,
      end: segment.end,
      centerHeightMm: TWIN_BAR_LOW_PANEL_TOP_RAIL_CENTER_HEIGHT_MM,
      diameterMm: TWIN_BAR_LOW_PANEL_TOP_RAIL_DIAMETER_MM
    }));
}

function buildGates(placements: ResolvedGatePlacement[]): Optimization3DGate[] {
  return placements.map((placement) => ({
    key: placement.key,
    start: placement.startPoint,
    end: placement.endPoint,
    center: placement.centerPoint,
    normal: placement.normal,
    heightMm: getSpecConfig(placement.spec).assembledHeightMm,
    leafCount: placement.leafCount
  }));
}

function buildBasketballPosts(
  placements: ResolvedBasketballPostPlacement[]
): Optimization3DBasketballPost[] {
  return placements.map((placement) => ({
    key: placement.key,
    point: placement.point,
    normal: placement.normal,
    heightMm: BASKETBALL_POST_HEIGHT_MM,
    armLengthMm: BASKETBALL_POST_ARM_LENGTH_MM,
    hoopRadiusMm: BASKETBALL_POST_HOOP_RADIUS_MM
  }));
}

function buildFloodlightColumns(
  placements: ResolvedFloodlightColumnPlacement[]
): Optimization3DFloodlightColumn[] {
  return placements.map((placement) => ({
    key: placement.key,
    point: placement.point,
    normal: placement.normal,
    heightMm: FLOODLIGHT_COLUMN_HEIGHT_MM,
    barWidthMm: FLOODLIGHT_BAR_WIDTH_MM
  }));
}

function resolveOverlayLayer(segment: LayoutSegment, stockPanelHeightMm: number) {
  const layers = buildVisualLayers(segment);
  return (
    layers.find((layer) => layer.stockHeightMm === stockPanelHeightMm) ??
    layers[0] ?? {
      baseHeightMm: 0,
      visualHeightMm: getSpecConfig(segment.spec).assembledHeightMm,
      stockHeightMm: stockPanelHeightMm,
      tone: "PRIMARY" as const
    }
  );
}

function buildCutOverlays(
  plans: TwinBarOptimizationPlan[],
  estimateSegmentsById: Map<string, LayoutSegment>,
  segmentOrdinalById: Map<string, number>
): Optimization3DCutOverlay[] {
  return plans.flatMap((plan, planIndex) =>
    plan.cuts
      .map((cut) => {
        const segment = estimateSegmentsById.get(cut.demand.segmentId);
        if (!segment) {
          return null;
        }
        const start = interpolateAlongSegment(segment, cut.demand.startOffsetMm);
        const end = interpolateAlongSegment(segment, cut.demand.endOffsetMm);
        const layer = resolveOverlayLayer(segment, plan.stockPanelHeightMm);
        return {
          key: `${plan.id}-${cut.id}`,
          cutId: cut.id,
          planId: plan.id,
          planIndex,
          step: cut.step,
          mode: cut.mode,
          segmentId: segment.id,
          segmentOrdinal: segmentOrdinalById.get(segment.id) ?? null,
          start,
          end,
          center: {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2
          },
          baseHeightMm: layer.baseHeightMm,
          heightMm: layer.visualHeightMm,
          lengthMm: cut.demand.lengthMm
        } satisfies Optimization3DCutOverlay;
      })
      .filter((overlay): overlay is Optimization3DCutOverlay => overlay !== null)
  );
}

function buildReuseLinks(cutOverlays: Optimization3DCutOverlay[]): Optimization3DReuseLink[] {
  const overlaysByPlan = new Map<string, Optimization3DCutOverlay[]>();
  cutOverlays.forEach((overlay) => {
    const existing = overlaysByPlan.get(overlay.planId);
    if (existing) {
      existing.push(overlay);
      return;
    }
    overlaysByPlan.set(overlay.planId, [overlay]);
  });

  return [...overlaysByPlan.values()].flatMap((planOverlays) =>
    planOverlays.slice(1).map((overlay, index) => {
      const previous = planOverlays[index];
      return {
        key: `${previous?.key ?? "start"}-${overlay.key}`,
        planId: overlay.planId,
        planIndex: overlay.planIndex,
        start: {
          x: previous?.center.x ?? overlay.center.x,
          y: (previous?.baseHeightMm ?? overlay.baseHeightMm) + (previous?.heightMm ?? overlay.heightMm) + 520,
          z: -(previous?.center.y ?? overlay.center.y)
        },
        end: {
          x: overlay.center.x,
          y: overlay.baseHeightMm + overlay.heightMm + 520,
          z: -overlay.center.y
        }
      };
    })
  );
}

export function buildOptimization3DScene(
  estimateSegments: LayoutSegment[],
  plans: TwinBarOptimizationPlan[],
  segmentOrdinalById: Map<string, number>,
  gatePlacements: ResolvedGatePlacement[] = [],
  basketballPostPlacements: ResolvedBasketballPostPlacement[] = [],
  floodlightColumnPlacements: ResolvedFloodlightColumnPlacement[] = []
): Optimization3DScene {
  const panelSlices = buildPanelSlices(estimateSegments);
  const posts = buildPosts(estimateSegments);
  const rails = buildRails(estimateSegments);
  const gates = buildGates(gatePlacements);
  const basketballPosts = buildBasketballPosts(basketballPostPlacements);
  const floodlightColumns = buildFloodlightColumns(floodlightColumnPlacements);
  const estimateSegmentsById = new Map(estimateSegments.map((segment) => [segment.id, segment] as const));
  const cutOverlays = buildCutOverlays(plans, estimateSegmentsById, segmentOrdinalById);
  const reuseLinks = buildReuseLinks(cutOverlays);

  const allGroundPoints = [
    ...estimateSegments.flatMap((segment) => [segment.start, segment.end]),
    ...posts.map((post) => post.point),
    ...rails.flatMap((rail) => [rail.start, rail.end]),
    ...gates.flatMap((gate) => [gate.start, gate.end, gate.center]),
    ...basketballPosts.map((post) => post.point),
    ...floodlightColumns.map((column) => column.point)
  ];
  const bounds = {
    minX: allGroundPoints.length > 0 ? Math.min(...allGroundPoints.map((point) => point.x)) : -2000,
    maxX: allGroundPoints.length > 0 ? Math.max(...allGroundPoints.map((point) => point.x)) : 2000,
    minZ: allGroundPoints.length > 0 ? Math.min(...allGroundPoints.map((point) => -point.y)) : -2000,
    maxZ: allGroundPoints.length > 0 ? Math.max(...allGroundPoints.map((point) => -point.y)) : 2000,
    maxHeightMm: Math.max(
      2200,
      ...posts.map((post) => post.heightMm),
      ...rails.map((rail) => rail.centerHeightMm + rail.diameterMm / 2),
      ...gates.map((gate) => gate.heightMm),
      ...basketballPosts.map((post) => post.heightMm),
      ...floodlightColumns.map((column) => column.heightMm),
      ...panelSlices.map((slice) => slice.baseHeightMm + slice.heightMm),
      ...cutOverlays.map((overlay) => overlay.baseHeightMm + overlay.heightMm + 520)
    )
  };

  return {
    panelSlices,
    posts,
    rails,
    gates,
    basketballPosts,
    floodlightColumns,
    cutOverlays,
    reuseLinks,
    bounds
  };
}

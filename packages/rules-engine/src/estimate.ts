import type {
  EstimateResult,
  LayoutModel,
  LayoutSegment,
  PointMm,
  SegmentEstimate
} from "@fence-estimator/contracts";
import {
  angleBetweenDegrees,
  areOpposite,
  cross,
  distanceMm,
  pointKey,
  subtract
} from "@fence-estimator/geometry";

import { ROLL_LENGTH_MM, getSpecConfig } from "./constants.js";
import { buildOptimizationSummary } from "./optimize.js";

interface IncidentSegment {
  segment: LayoutSegment;
  vectorAway: { x: number; y: number };
  neighborKey: string;
}

interface NodeRecord {
  key: string;
  point: PointMm;
  incidents: IncidentSegment[];
  maxHeightMm: number;
}

interface Component {
  nodeKeys: string[];
}

const CORNER_STRAIGHT_TOLERANCE_DEGREES = 1;
type TerminalPostType = "end" | "inlineJoin" | "corner" | "junction";

interface EstimateLayoutOptions {
  excludedNodeKeys?: Set<string>;
  externalCornersEnabled?: boolean;
}

export interface EstimatedPostInstance {
  key: string;
  heightMm: number;
  type: "end" | "intermediate" | "corner" | "junction" | "inlineJoin";
}

function buildNodes(segments: LayoutSegment[]): Map<string, NodeRecord> {
  const nodes = new Map<string, NodeRecord>();

  function ensure(point: PointMm): NodeRecord {
    const key = pointKey(point);
    const existing = nodes.get(key);
    if (existing) {
      return existing;
    }
    const created: NodeRecord = {
      key,
      point,
      incidents: [],
      maxHeightMm: 0
    };
    nodes.set(key, created);
    return created;
  }

  for (const segment of segments) {
    const config = getSpecConfig(segment.spec);
    const startNode = ensure(segment.start);
    const endNode = ensure(segment.end);

    startNode.maxHeightMm = Math.max(startNode.maxHeightMm, config.assembledHeightMm);
    endNode.maxHeightMm = Math.max(endNode.maxHeightMm, config.assembledHeightMm);

    startNode.incidents.push({
      segment,
      vectorAway: subtract(segment.end, segment.start),
      neighborKey: endNode.key
    });

    endNode.incidents.push({
      segment,
      vectorAway: subtract(segment.start, segment.end),
      neighborKey: startNode.key
    });
  }

  return nodes;
}

function computeConnectedComponents(nodes: Map<string, NodeRecord>): Component[] {
  const components: Component[] = [];
  const visited = new Set<string>();

  for (const nodeKey of nodes.keys()) {
    if (visited.has(nodeKey)) {
      continue;
    }
    const queue: string[] = [nodeKey];
    const componentKeys: string[] = [];
    visited.add(nodeKey);

    while (queue.length > 0) {
      const key = queue.shift();
      if (!key) {
        break;
      }
      componentKeys.push(key);
      const node = nodes.get(key);
      if (!node) {
        continue;
      }

      for (const incident of node.incidents) {
        if (!visited.has(incident.neighborKey)) {
          visited.add(incident.neighborKey);
          queue.push(incident.neighborKey);
        }
      }
    }

    components.push({ nodeKeys: componentKeys });
  }

  return components;
}

function orderClosedCycle(component: Component, nodes: Map<string, NodeRecord>): string[] | null {
  const allDegreeTwo = component.nodeKeys.every((key) => (nodes.get(key)?.incidents.length ?? 0) === 2);
  if (!allDegreeTwo) {
    return null;
  }

  const start = component.nodeKeys[0];
  if (!start) {
    return null;
  }

  const path: string[] = [start];
  const startNode = nodes.get(start);
  if (!startNode) {
    return null;
  }

  let previous = start;
  let current = startNode.incidents[0]?.neighborKey;
  if (!current) {
    return null;
  }

  while (current !== start) {
    if (path.includes(current)) {
      return null;
    }
    path.push(current);
    const currentNode = nodes.get(current);
    if (!currentNode) {
      return null;
    }
    const nextIncident = currentNode.incidents.find((incident) => incident.neighborKey !== previous);
    if (!nextIncident) {
      return null;
    }
    previous = current;
    current = nextIncident.neighborKey;
  }

  return path;
}

function polygonSignedArea(points: PointMm[]): number {
  if (points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) {
      continue;
    }
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function classifyTerminalPostType(node: NodeRecord): TerminalPostType {
  if (node.incidents.length <= 1) {
    return "end";
  }
  if (node.incidents.length > 2) {
    return "junction";
  }

  const first = node.incidents[0];
  const second = node.incidents[1];
  if (!first || !second) {
    return "end";
  }
  if (areOpposite(first.vectorAway, second.vectorAway, CORNER_STRAIGHT_TOLERANCE_DEGREES)) {
    return "inlineJoin";
  }

  return angleBetweenDegrees(first.vectorAway, second.vectorAway) > CORNER_STRAIGHT_TOLERANCE_DEGREES ? "corner" : "inlineJoin";
}

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= 0) {
    return segment.start;
  }
  const ratio = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
    y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
  };
}

export function resolveEstimatedPosts(
  layout: LayoutModel,
  options: EstimateLayoutOptions = {},
): EstimatedPostInstance[] {
  const segments = layout.segments.filter((segment) => distanceMm(segment.start, segment.end) > 0);
  const nodes = buildNodes(segments);
  const excludedNodeKeys = options.excludedNodeKeys ?? new Set<string>();
  const posts: EstimatedPostInstance[] = [];

  for (const node of nodes.values()) {
    if (excludedNodeKeys.has(node.key)) {
      continue;
    }
    posts.push({
      key: node.key,
      heightMm: node.maxHeightMm,
      type: classifyTerminalPostType(node),
    });
  }

  for (const segment of segments) {
    const config = getSpecConfig(segment.spec);
    const lengthMm = Math.round(distanceMm(segment.start, segment.end));
    const bays = Math.max(1, Math.ceil(lengthMm / config.bayWidthMm));

    for (let index = 1; index < bays; index += 1) {
      const point = interpolateAlongSegment(segment, Math.min(lengthMm, config.bayWidthMm * index));
      posts.push({
        key: pointKey(point),
        heightMm: config.assembledHeightMm,
        type: "intermediate",
      });
    }
  }

  return posts;
}

export function estimateLayout(layout: LayoutModel, options: EstimateLayoutOptions = {}): EstimateResult {
  const segments = layout.segments.filter((segment) => distanceMm(segment.start, segment.end) > 0);
  const nodes = buildNodes(segments);
  const excludedNodeKeys = options.excludedNodeKeys ?? new Set<string>();
  const intermediateByHeightMm: Record<string, number> = {};

  const segmentEstimates: SegmentEstimate[] = [];
  let intermediatePosts = 0;
  let twinBarPanels = 0;
  let twinBarPanelsSuperRebound = 0;
  const twinBarPanelsByStockHeightMm: Record<string, number> = {};
  const twinBarPanelsByFenceHeight: Record<string, { standard: number; superRebound: number; total: number }> = {};
  let roll2100 = 0;
  let roll900 = 0;
  const rollsByFenceHeight: Record<string, { roll2100: number; roll900: number; total: number }> = {};

  for (const segment of segments) {
    const lengthMm = Math.round(distanceMm(segment.start, segment.end));
    const config = getSpecConfig(segment.spec);
    const bays = Math.max(1, Math.ceil(lengthMm / config.bayWidthMm));
    const segmentIntermediatePosts = Math.max(0, bays - 1);
    intermediatePosts += segmentIntermediatePosts;
    const heightKey = String(config.assembledHeightMm);
    intermediateByHeightMm[heightKey] = (intermediateByHeightMm[heightKey] ?? 0) + segmentIntermediatePosts;

    let panels = 0;
    let segmentRoll2100 = 0;
    let segmentRoll900 = 0;

    if (segment.spec.system === "TWIN_BAR") {
      const variant = segment.spec.twinBarVariant ?? "STANDARD";
      for (const layer of config.layers) {
        panels += bays;
        const stockKey = String(layer.heightMm);
        twinBarPanelsByStockHeightMm[stockKey] = (twinBarPanelsByStockHeightMm[stockKey] ?? 0) + bays;
      }

      const fenceHeightKey = segment.spec.height;
      const byFence = twinBarPanelsByFenceHeight[fenceHeightKey] ?? {
        standard: 0,
        superRebound: 0,
        total: 0
      };
      if (variant === "SUPER_REBOUND") {
        byFence.superRebound += panels;
        twinBarPanelsSuperRebound += panels;
      } else {
        byFence.standard += panels;
        twinBarPanels += panels;
      }
      byFence.total += panels;
      twinBarPanelsByFenceHeight[fenceHeightKey] = byFence;
    } else {
      const byFence = rollsByFenceHeight[segment.spec.height] ?? {
        roll2100: 0,
        roll900: 0,
        total: 0
      };
      for (const layer of config.layers) {
        const layerRolls = Math.max(1, Math.ceil(lengthMm / ROLL_LENGTH_MM));
        if (layer.heightMm === 900) {
          segmentRoll900 += layerRolls;
          roll900 += layerRolls;
          byFence.roll900 += layerRolls;
        } else {
          segmentRoll2100 += layerRolls;
          roll2100 += layerRolls;
          byFence.roll2100 += layerRolls;
        }
      }
      byFence.total += segmentRoll2100 + segmentRoll900;
      rollsByFenceHeight[segment.spec.height] = byFence;
    }

    segmentEstimates.push({
      segmentId: segment.id,
      lengthMm,
      bays,
      intermediatePosts: segmentIntermediatePosts,
      panels,
      roll2100: segmentRoll2100,
      roll900: segmentRoll900
    });
  }

  const cornerNodeKeys = new Set<string>();
  const byHeightAndType: Record<
    string,
    {
      end: number;
      intermediate: number;
      corner: number;
      junction: number;
      inlineJoin: number;
      total: number;
    }
  > = {};

  function ensureHeightBucket(heightKey: string): {
    end: number;
    intermediate: number;
    corner: number;
    junction: number;
    inlineJoin: number;
    total: number;
  } {
    const existing = byHeightAndType[heightKey];
    if (existing) {
      return existing;
    }
    const created = {
      end: 0,
      intermediate: 0,
      corner: 0,
      junction: 0,
      inlineJoin: 0,
      total: 0
    };
    byHeightAndType[heightKey] = created;
    return created;
  }

  for (const node of nodes.values()) {
    if (excludedNodeKeys.has(node.key)) {
      continue;
    }
    const nodeType = classifyTerminalPostType(node);
    if (nodeType === "corner" || nodeType === "junction") {
      cornerNodeKeys.add(node.key);
    }
    const heightKey = String(node.maxHeightMm);
    const bucket = ensureHeightBucket(heightKey);
    bucket[nodeType] += 1;
    bucket.total += 1;
  }

  let internalCorners = 0;
  let externalCorners = 0;
  let unclassifiedCorners = 0;
  const cornerBreakdownByHeightMm: Record<
    string,
    { total: number; internal: number; external: number; unclassified: number }
  > = {};

  function ensureCornerHeightBucket(heightKey: string): {
    total: number;
    internal: number;
    external: number;
    unclassified: number;
  } {
    const existing = cornerBreakdownByHeightMm[heightKey];
    if (existing) {
      return existing;
    }
    const created = {
      total: 0,
      internal: 0,
      external: 0,
      unclassified: 0
    };
    cornerBreakdownByHeightMm[heightKey] = created;
    return created;
  }

  const components = computeConnectedComponents(nodes);
  const classifiedCornerNodes = new Set<string>();

  for (const component of components) {
    const cycle = orderClosedCycle(component, nodes);
    if (!cycle || cycle.length < 3) {
      continue;
    }

    const points = cycle.map((key) => nodes.get(key)?.point).filter(Boolean) as PointMm[];
    if (points.length < 3) {
      continue;
    }
    const signedArea = polygonSignedArea(points);
    if (Math.abs(signedArea) < 1e-6) {
      continue;
    }
    const isCcw = signedArea > 0;

    for (let i = 0; i < cycle.length; i += 1) {
      const currentKey = cycle[i];
      if (!currentKey || !cornerNodeKeys.has(currentKey)) {
        continue;
      }
      const prevKey = cycle[(i - 1 + cycle.length) % cycle.length];
      const nextKey = cycle[(i + 1) % cycle.length];
      if (!prevKey || !nextKey) {
        continue;
      }

      const prev = nodes.get(prevKey)?.point;
      const current = nodes.get(currentKey)?.point;
      const next = nodes.get(nextKey)?.point;
      if (!prev || !current || !next) {
        continue;
      }

      const incoming = subtract(current, prev);
      const outgoing = subtract(next, current);
      const turn = cross(incoming, outgoing);

      if (Math.abs(turn) <= 1e-9) {
        continue;
      }

      const isGeometryExternal = isCcw ? turn < 0 : turn > 0;
      const isInternal = options.externalCornersEnabled === false || !isGeometryExternal;
      const heightKey = String(nodes.get(currentKey)?.maxHeightMm ?? 0);
      const bucket = ensureCornerHeightBucket(heightKey);
      bucket.total += 1;
      if (isInternal) {
        internalCorners += 1;
        bucket.internal += 1;
      } else {
        externalCorners += 1;
        bucket.external += 1;
      }
      classifiedCornerNodes.add(currentKey);
    }
  }

  for (const cornerKey of cornerNodeKeys) {
    if (!classifiedCornerNodes.has(cornerKey)) {
      unclassifiedCorners += 1;
      const heightKey = String(nodes.get(cornerKey)?.maxHeightMm ?? 0);
      const bucket = ensureCornerHeightBucket(heightKey);
      bucket.total += 1;
      bucket.unclassified += 1;
    }
  }

  const terminalPosts = [...nodes.keys()].filter((key) => !excludedNodeKeys.has(key)).length;
  const byHeightMm: Record<string, number> = {};
  for (const [heightKey, count] of Object.entries(intermediateByHeightMm)) {
    const bucket = ensureHeightBucket(heightKey);
    bucket.intermediate += count;
    bucket.total += count;
  }

  for (const [heightKey, breakdown] of Object.entries(byHeightAndType)) {
    byHeightMm[heightKey] = breakdown.total;
  }

  const optimization = buildOptimizationSummary({ segments });

  return {
    posts: {
      terminal: terminalPosts,
      intermediate: intermediatePosts,
      total: terminalPosts + intermediatePosts,
      cornerPosts: cornerNodeKeys.size,
      byHeightAndType,
      byHeightMm
    },
    corners: {
      total: cornerNodeKeys.size,
      internal: internalCorners,
      external: externalCorners,
      unclassified: unclassifiedCorners,
      byHeightMm: cornerBreakdownByHeightMm
    },
    materials: {
      twinBarPanels,
      twinBarPanelsSuperRebound,
      twinBarPanelsByStockHeightMm,
      twinBarPanelsByFenceHeight,
      roll2100,
      roll900,
      totalRolls: roll2100 + roll900,
      rollsByFenceHeight
    },
    featureQuantities: [],
    optimization,
    segments: segmentEstimates
  };
}

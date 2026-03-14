import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutSegment, TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import { formatHeightLabelFromMm, formatLengthMm } from "./formatters";
import { useElementSize } from "./editor/useElementSize.js";
import type { ResolvedBasketballPostPlacement, ResolvedFloodlightColumnPlacement } from "./editor/types.js";
import type { Optimization3DCutOverlay, Optimization3DPanelSlice } from "./optimization3D.js";
import { buildOptimization3DScene } from "./optimization3D.js";

interface Optimization3DViewProps {
  estimateSegments: LayoutSegment[];
  activePlan: TwinBarOptimizationPlan | null;
  segmentOrdinalById: Map<string, number>;
  basketballPosts: ResolvedBasketballPostPlacement[];
  floodlightColumns: ResolvedFloodlightColumnPlacement[];
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface GroundPoint3D {
  x: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

interface OrbitState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

interface PointerDragState {
  pointerId: number;
  x: number;
  y: number;
  mode: "rotate" | "pan";
}

type OrbitUpdater = OrbitState | ((current: OrbitState) => OrbitState);

interface RenderFace {
  key: string;
  points: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  depth: number;
}

interface RenderStroke {
  key: string;
  kind: "path" | "polyline";
  value: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dashArray?: string;
  pathPoints?: [ProjectedPoint, ProjectedPoint, ProjectedPoint];
  depth: number;
}

interface RenderBadge {
  key: string;
  cx: number;
  cy: number;
  step: string;
  segmentLabel: string | null;
  fill: string;
  stroke: string;
  depth: number;
}

const DEFAULT_ORBIT: OrbitState = {
  yaw: -0.82,
  pitch: 0.62,
  zoom: 0.98,
  panX: 0,
  panY: 0
};

const PANEL_PALETTE = {
  PRIMARY: {
    frontFill: "rgba(113, 129, 145, 0.74)",
    sideFill: "rgba(82, 97, 112, 0.84)",
    topFill: "rgba(188, 200, 211, 0.92)",
    stroke: "rgba(49, 60, 72, 0.7)",
    mesh: "rgba(243, 249, 255, 0.28)"
  },
  SECOND_LIFT: {
    frontFill: "rgba(189, 201, 214, 0.78)",
    sideFill: "rgba(156, 170, 184, 0.86)",
    topFill: "rgba(233, 239, 245, 0.94)",
    stroke: "rgba(100, 114, 128, 0.62)",
    mesh: "rgba(255, 255, 255, 0.3)"
  },
  REBOUND: {
    frontFill: "rgba(96, 150, 103, 0.82)",
    sideFill: "rgba(70, 121, 79, 0.88)",
    topFill: "rgba(164, 205, 170, 0.94)",
    stroke: "rgba(49, 90, 57, 0.68)",
    mesh: "rgba(240, 255, 241, 0.28)"
  }
} as const;

const OVERLAY_PALETTE = {
  OPEN_STOCK_PANEL: {
    frontFill: "rgba(255, 161, 72, 0.84)",
    sideFill: "rgba(225, 112, 40, 0.9)",
    topFill: "rgba(255, 218, 172, 0.96)",
    stroke: "rgba(198, 94, 24, 0.96)",
    badgeFill: "#f48e3b",
    badgeStroke: "#fff0dd"
  },
  REUSE_OFFCUT: {
    frontFill: "rgba(30, 210, 197, 0.78)",
    sideFill: "rgba(9, 156, 147, 0.9)",
    topFill: "rgba(187, 255, 249, 0.96)",
    stroke: "rgba(3, 140, 132, 0.98)",
    badgeFill: "#10b8ad",
    badgeStroke: "#dbfffb"
  }
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatVariantLabel(variant: TwinBarOptimizationPlan["variant"]): string {
  return variant === "SUPER_REBOUND" ? "Super Rebound" : "Standard";
}

function toWorldPoint(point: { x: number; y: number }, heightMm: number): Point3D {
  return {
    x: point.x,
    y: heightMm,
    z: -point.y
  };
}

function toGroundPoint(point: { x: number; y: number }): GroundPoint3D {
  return {
    x: point.x,
    z: -point.y
  };
}

function offsetEdge(start: GroundPoint3D, end: GroundPoint3D, offsetMm: number) {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const length = Math.hypot(deltaX, deltaZ) || 1;
  const normalX = (-deltaZ / length) * offsetMm;
  const normalZ = (deltaX / length) * offsetMm;
  return {
    start: {
      x: start.x + normalX,
      z: start.z + normalZ
    },
    end: {
      x: end.x + normalX,
      z: end.z + normalZ
    }
  };
}

function formatPolygonPoints(points: ReadonlyArray<ProjectedPoint>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function getFaceDepth(points: ReadonlyArray<ProjectedPoint>): number {
  return points.reduce((sum, point) => sum + point.depth, 0) / Math.max(points.length, 1);
}

function buildMeshStrokes(
  slice: Optimization3DPanelSlice,
  project: (point: Point3D) => ProjectedPoint
): RenderStroke[] {
  const strokes: RenderStroke[] = [];
  const palette = PANEL_PALETTE[slice.tone];
  const sliceWidthMm = Math.hypot(slice.end.x - slice.start.x, slice.end.y - slice.start.y);
  const acrossStepMm = Math.max(slice.apertureWidthMm * 2, 100);
  const verticalCount = Math.floor(sliceWidthMm / acrossStepMm);
  const horizontalCount = Math.floor(slice.heightMm / slice.apertureHeightMm);
  const verticalSkip = Math.max(1, Math.ceil(verticalCount / 14));
  const horizontalSkip = Math.max(1, Math.ceil(horizontalCount / 12));

  for (let lineIndex = verticalSkip; lineIndex < verticalCount; lineIndex += verticalSkip) {
    const ratio = (acrossStepMm * lineIndex) / Math.max(sliceWidthMm, 1);
    const groundPoint = {
      x: slice.start.x + (slice.end.x - slice.start.x) * ratio,
      y: slice.start.y + (slice.end.y - slice.start.y) * ratio
    };
    const lineStart = project(toWorldPoint(groundPoint, slice.baseHeightMm));
    const lineEnd = project(toWorldPoint(groundPoint, slice.baseHeightMm + slice.heightMm));
    strokes.push({
      key: `${slice.key}-mesh-v-${lineIndex}`,
      kind: "polyline",
      value: `${lineStart.x},${lineStart.y} ${lineEnd.x},${lineEnd.y}`,
      stroke: palette.mesh,
      strokeWidth: 0.7,
      opacity: 1,
      depth: (lineStart.depth + lineEnd.depth) / 2 + 0.1
    });
  }

  for (let lineIndex = horizontalSkip; lineIndex < horizontalCount; lineIndex += horizontalSkip) {
    const heightMm = slice.baseHeightMm + slice.apertureHeightMm * lineIndex;
    if (heightMm >= slice.baseHeightMm + slice.heightMm - 1) {
      continue;
    }
    const lineStart = project(toWorldPoint(slice.start, heightMm));
    const lineEnd = project(toWorldPoint(slice.end, heightMm));
    strokes.push({
      key: `${slice.key}-mesh-h-${lineIndex}`,
      kind: "polyline",
      value: `${lineStart.x},${lineStart.y} ${lineEnd.x},${lineEnd.y}`,
      stroke: palette.mesh,
      strokeWidth: 0.66,
      opacity: 1,
      depth: (lineStart.depth + lineEnd.depth) / 2 + 0.1
    });
  }

  return strokes;
}

function createOverlayBadge(
  overlay: Optimization3DCutOverlay,
  project: (point: Point3D) => ProjectedPoint
): RenderBadge {
  const palette = OVERLAY_PALETTE[overlay.mode];
  const projected = project(toWorldPoint(overlay.center, overlay.baseHeightMm + overlay.heightMm + 280));
  return {
    key: `${overlay.key}-badge`,
    cx: projected.x,
    cy: projected.y,
    step: String(overlay.step),
    segmentLabel: overlay.segmentOrdinal === null ? null : `S${overlay.segmentOrdinal}`,
    fill: palette.badgeFill,
    stroke: palette.badgeStroke,
    depth: projected.depth + 0.2
  };
}

export function Optimization3DView({
  estimateSegments,
  activePlan,
  segmentOrdinalById,
  basketballPosts,
  floodlightColumns
}: Optimization3DViewProps) {
  const { ref, size } = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [orbit, setOrbitState] = useState<OrbitState>(DEFAULT_ORBIT);
  const dragStateRef = useRef<PointerDragState | null>(null);
  const orbitRef = useRef<OrbitState>(DEFAULT_ORBIT);
  const pendingOrbitRef = useRef<OrbitState | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scene = useMemo(
    () => buildOptimization3DScene(estimateSegments, activePlan, segmentOrdinalById, basketballPosts, floodlightColumns),
    [activePlan, basketballPosts, estimateSegments, floodlightColumns, segmentOrdinalById]
  );

  const setOrbit = (updater: OrbitUpdater) => {
    const nextOrbit = typeof updater === "function" ? updater(orbitRef.current) : updater;
    orbitRef.current = nextOrbit;
    pendingOrbitRef.current = nextOrbit;

    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const pendingOrbit = pendingOrbitRef.current;
      if (pendingOrbit) {
        setOrbitState(pendingOrbit);
      }
    });
  };

  useEffect(() => {
    orbitRef.current = orbit;
  }, [orbit]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const viewportWidth = size.width > 0 ? size.width : 920;
  const viewportHeight = size.height > 0 ? size.height : 320;
  const groundPaddingMm = 1600;
  const center = {
    x: (scene.bounds.minX + scene.bounds.maxX) / 2,
    y: scene.bounds.maxHeightMm * 0.34,
    z: (scene.bounds.minZ + scene.bounds.maxZ) / 2
  };
  const spanMm = Math.max(
    3600,
    scene.bounds.maxX - scene.bounds.minX + groundPaddingMm * 2,
    scene.bounds.maxZ - scene.bounds.minZ + groundPaddingMm * 2,
    scene.bounds.maxHeightMm * 2.1
  );
  const scale = (Math.min(viewportWidth, viewportHeight) * 0.8 * orbit.zoom) / spanMm;

  const project = useMemo(() => {
    return (point: Point3D): ProjectedPoint => {
      const translatedX = point.x - center.x;
      const translatedY = point.y - center.y;
      const translatedZ = point.z - center.z;

      const yawCos = Math.cos(orbit.yaw);
      const yawSin = Math.sin(orbit.yaw);
      const pitchCos = Math.cos(orbit.pitch);
      const pitchSin = Math.sin(orbit.pitch);

      const yawX = translatedX * yawCos - translatedZ * yawSin;
      const yawZ = translatedX * yawSin + translatedZ * yawCos;
      const pitchY = translatedY * pitchCos - yawZ * pitchSin;
      const pitchZ = translatedY * pitchSin + yawZ * pitchCos;

      return {
        x: viewportWidth / 2 + yawX * scale + orbit.panX,
        y: viewportHeight * 0.68 - pitchY * scale + orbit.panY,
        depth: pitchZ
      };
    };
  }, [center.x, center.y, center.z, orbit.panX, orbit.panY, orbit.pitch, orbit.yaw, scale, viewportHeight, viewportWidth]);

  const renderData = useMemo(() => {
    const faces: RenderFace[] = [];
    const strokes: RenderStroke[] = [];
    const badges: RenderBadge[] = [];

    const groundMinX = scene.bounds.minX - groundPaddingMm;
    const groundMaxX = scene.bounds.maxX + groundPaddingMm;
    const groundMinZ = scene.bounds.minZ - groundPaddingMm;
    const groundMaxZ = scene.bounds.maxZ + groundPaddingMm;
    const groundPoints = [
      project({ x: groundMinX, y: 0, z: groundMinZ }),
      project({ x: groundMaxX, y: 0, z: groundMinZ }),
      project({ x: groundMaxX, y: 0, z: groundMaxZ }),
      project({ x: groundMinX, y: 0, z: groundMaxZ })
    ];
    faces.push({
      key: "ground",
      points: formatPolygonPoints(groundPoints),
      fill: "rgba(204, 219, 205, 0.52)",
      stroke: "rgba(118, 136, 119, 0.2)",
      strokeWidth: 1,
      opacity: 1,
      depth: getFaceDepth(groundPoints)
    });

    for (let gridX = groundMinX; gridX <= groundMaxX; gridX += 2500) {
      const start = project({ x: gridX, y: 0, z: groundMinZ });
      const end = project({ x: gridX, y: 0, z: groundMaxZ });
      strokes.push({
        key: `grid-x-${gridX}`,
        kind: "polyline",
        value: `${start.x},${start.y} ${end.x},${end.y}`,
        stroke: "rgba(91, 110, 98, 0.13)",
        strokeWidth: 0.9,
        opacity: 1,
        depth: (start.depth + end.depth) / 2
      });
    }

    for (let gridZ = groundMinZ; gridZ <= groundMaxZ; gridZ += 2500) {
      const start = project({ x: groundMinX, y: 0, z: gridZ });
      const end = project({ x: groundMaxX, y: 0, z: gridZ });
      strokes.push({
        key: `grid-z-${gridZ}`,
        kind: "polyline",
        value: `${start.x},${start.y} ${end.x},${end.y}`,
        stroke: "rgba(91, 110, 98, 0.13)",
        strokeWidth: 0.9,
        opacity: 1,
        depth: (start.depth + end.depth) / 2
      });
    }

    for (const slice of scene.panelSlices) {
      const palette = PANEL_PALETTE[slice.tone];
      const frontEdge = {
        start: toGroundPoint(slice.start),
        end: toGroundPoint(slice.end)
      };
      const thicknessMm = slice.tone === "REBOUND" ? 18 : slice.tone === "SECOND_LIFT" ? 22 : 28;
      const backEdge = offsetEdge(frontEdge.start, frontEdge.end, thicknessMm);
      const shadowEdge = offsetEdge(frontEdge.start, frontEdge.end, 130);
      const shadowDriftX = -140;
      const shadowDriftZ = 100;
      const shadowPoints = [
        project({ x: frontEdge.start.x + shadowDriftX, y: 0, z: frontEdge.start.z + shadowDriftZ }),
        project({ x: frontEdge.end.x + shadowDriftX, y: 0, z: frontEdge.end.z + shadowDriftZ }),
        project({ x: shadowEdge.end.x + shadowDriftX, y: 0, z: shadowEdge.end.z + shadowDriftZ }),
        project({ x: shadowEdge.start.x + shadowDriftX, y: 0, z: shadowEdge.start.z + shadowDriftZ })
      ];
      faces.push({
        key: `${slice.key}-shadow`,
        points: formatPolygonPoints(shadowPoints),
        fill: "rgba(36, 46, 41, 0.09)",
        stroke: "transparent",
        strokeWidth: 0,
        opacity: 1,
        depth: getFaceDepth(shadowPoints) - 12
      });

      const frontBottomStart = project({ x: frontEdge.start.x, y: slice.baseHeightMm, z: frontEdge.start.z });
      const frontBottomEnd = project({ x: frontEdge.end.x, y: slice.baseHeightMm, z: frontEdge.end.z });
      const frontTopEnd = project({ x: frontEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: frontEdge.end.z });
      const frontTopStart = project({
        x: frontEdge.start.x,
        y: slice.baseHeightMm + slice.heightMm,
        z: frontEdge.start.z
      });
      const backBottomEnd = project({ x: backEdge.end.x, y: slice.baseHeightMm, z: backEdge.end.z });
      const backTopEnd = project({ x: backEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: backEdge.end.z });
      const backTopStart = project({ x: backEdge.start.x, y: slice.baseHeightMm + slice.heightMm, z: backEdge.start.z });

      const sliceFaces = [
        {
          key: `${slice.key}-front`,
          points: [frontBottomStart, frontBottomEnd, frontTopEnd, frontTopStart],
          fill: palette.frontFill
        },
        {
          key: `${slice.key}-top`,
          points: [frontTopStart, frontTopEnd, backTopEnd, backTopStart],
          fill: palette.topFill
        },
        {
          key: `${slice.key}-side`,
          points: [frontBottomEnd, backBottomEnd, backTopEnd, frontTopEnd],
          fill: palette.sideFill
        }
      ];

      sliceFaces.forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: face.fill,
          stroke: palette.stroke,
          strokeWidth: 0.92,
          opacity: 1,
          depth: getFaceDepth(face.points)
        });
      });

      buildMeshStrokes(slice, project).forEach((stroke) => {
        strokes.push(stroke);
      });
    }

    for (const post of scene.posts) {
      const halfWidthMm = 42;
      const groundX = post.point.x;
      const groundZ = -post.point.y;
      const northWestBottom = project({ x: groundX - halfWidthMm, y: 0, z: groundZ - halfWidthMm });
      const northEastBottom = project({ x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm });
      const southEastBottom = project({ x: groundX + halfWidthMm, y: 0, z: groundZ + halfWidthMm });
      const northWestTop = project({ x: groundX - halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm });
      const northEastTop = project({ x: groundX + halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm });
      const southEastTop = project({ x: groundX + halfWidthMm, y: post.heightMm, z: groundZ + halfWidthMm });
      const southWestTop = project({ x: groundX - halfWidthMm, y: post.heightMm, z: groundZ + halfWidthMm });

      const postFaces = [
        {
          key: `${post.key}-front`,
          points: [northWestBottom, northEastBottom, northEastTop, northWestTop],
          fill: "rgba(34, 42, 51, 0.88)"
        },
        {
          key: `${post.key}-side`,
          points: [northEastBottom, southEastBottom, southEastTop, northEastTop],
          fill: "rgba(22, 30, 38, 0.92)"
        },
        {
          key: `${post.key}-top`,
          points: [northWestTop, northEastTop, southEastTop, southWestTop],
          fill: "rgba(96, 109, 121, 0.96)"
        }
      ];

      postFaces.forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: face.fill,
          stroke: "rgba(14, 20, 27, 0.84)",
          strokeWidth: 0.82,
          opacity: 1,
          depth: getFaceDepth(face.points)
        });
      });
    }

    for (const basketballPost of scene.basketballPosts) {
      const halfWidthMm = 36;
      const groundX = basketballPost.point.x;
      const groundZ = -basketballPost.point.y;
      const topY = basketballPost.heightMm;
      const frontBottomLeft = project({ x: groundX - halfWidthMm, y: 0, z: groundZ - halfWidthMm });
      const frontBottomRight = project({ x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm });
      const frontTopRight = project({ x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm });
      const frontTopLeft = project({ x: groundX - halfWidthMm, y: topY, z: groundZ - halfWidthMm });
      const sideBottomRight = project({ x: groundX + halfWidthMm, y: 0, z: groundZ + halfWidthMm });
      const sideTopRight = project({ x: groundX + halfWidthMm, y: topY, z: groundZ + halfWidthMm });
      const sideTopLeft = project({ x: groundX - halfWidthMm, y: topY, z: groundZ + halfWidthMm });
      const columnFaces = [
        {
          key: `${basketballPost.key}-front`,
          points: [frontBottomLeft, frontBottomRight, frontTopRight, frontTopLeft],
          fill: "rgba(42, 70, 154, 0.88)"
        },
        {
          key: `${basketballPost.key}-side`,
          points: [frontBottomRight, sideBottomRight, sideTopRight, frontTopRight],
          fill: "rgba(29, 53, 127, 0.92)"
        },
        {
          key: `${basketballPost.key}-top`,
          points: [frontTopLeft, frontTopRight, sideTopRight, sideTopLeft],
          fill: "rgba(132, 165, 255, 0.96)"
        }
      ];
      columnFaces.forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: face.fill,
          stroke: "rgba(16, 29, 75, 0.84)",
          strokeWidth: 0.84,
          opacity: 1,
          depth: getFaceDepth(face.points)
        });
      });

      const armEnd = {
        x: basketballPost.point.x + basketballPost.normal.x * basketballPost.armLengthMm,
        y: basketballPost.point.y + basketballPost.normal.y * basketballPost.armLengthMm
      };
      const armStartProjected = project({ x: basketballPost.point.x, y: topY - 180, z: -basketballPost.point.y });
      const armEndProjected = project({ x: armEnd.x, y: topY - 180, z: -armEnd.y });
      strokes.push({
        key: `${basketballPost.key}-arm`,
        kind: "polyline",
        value: `${armStartProjected.x},${armStartProjected.y} ${armEndProjected.x},${armEndProjected.y}`,
        stroke: "rgba(255, 156, 79, 0.94)",
        strokeWidth: 2.2,
        opacity: 1,
        depth: (armStartProjected.depth + armEndProjected.depth) / 2 + 0.2
      });

      const hoopCenter = armEndProjected;
      const hoopRadius = Math.max(4, basketballPost.hoopRadiusMm * scale);
      const ringPoints = Array.from({ length: 18 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 18;
        return `${hoopCenter.x + Math.cos(angle) * hoopRadius},${hoopCenter.y + Math.sin(angle) * hoopRadius}`;
      }).join(" ");
      strokes.push({
        key: `${basketballPost.key}-hoop`,
        kind: "polyline",
        value: `${ringPoints} ${ringPoints.split(" ")[0] ?? ""}`.trim(),
        stroke: "rgba(255, 113, 41, 0.98)",
        strokeWidth: 1.8,
        opacity: 1,
        depth: hoopCenter.depth + 0.22
      });
    }

    for (const floodlightColumn of scene.floodlightColumns) {
      const halfWidthMm = 54;
      const groundX = floodlightColumn.point.x;
      const groundZ = -floodlightColumn.point.y;
      const topY = floodlightColumn.heightMm;
      const frontBottomLeft = project({ x: groundX - halfWidthMm, y: 0, z: groundZ - halfWidthMm });
      const frontBottomRight = project({ x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm });
      const frontTopRight = project({ x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm });
      const frontTopLeft = project({ x: groundX - halfWidthMm, y: topY, z: groundZ - halfWidthMm });
      const sideBottomRight = project({ x: groundX + halfWidthMm, y: 0, z: groundZ + halfWidthMm });
      const sideTopRight = project({ x: groundX + halfWidthMm, y: topY, z: groundZ + halfWidthMm });
      const sideTopLeft = project({ x: groundX - halfWidthMm, y: topY, z: groundZ + halfWidthMm });
      const columnFaces = [
        {
          key: `${floodlightColumn.key}-front`,
          points: [frontBottomLeft, frontBottomRight, frontTopRight, frontTopLeft],
          fill: "rgba(147, 147, 157, 0.9)"
        },
        {
          key: `${floodlightColumn.key}-side`,
          points: [frontBottomRight, sideBottomRight, sideTopRight, frontTopRight],
          fill: "rgba(104, 106, 117, 0.94)"
        },
        {
          key: `${floodlightColumn.key}-top`,
          points: [frontTopLeft, frontTopRight, sideTopRight, sideTopLeft],
          fill: "rgba(220, 223, 232, 0.98)"
        }
      ];
      columnFaces.forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: face.fill,
          stroke: "rgba(56, 60, 72, 0.82)",
          strokeWidth: 0.9,
          opacity: 1,
          depth: getFaceDepth(face.points)
        });
      });

      const forward = floodlightColumn.normal;
      const across = { x: -forward.y, y: forward.x };
      const barHalfWidth = floodlightColumn.barWidthMm / 2;
      const barCenterHeightMm = topY - 220;
      const barStart = project({
        x: floodlightColumn.point.x - across.x * barHalfWidth,
        y: barCenterHeightMm,
        z: -(floodlightColumn.point.y - across.y * barHalfWidth)
      });
      const barEnd = project({
        x: floodlightColumn.point.x + across.x * barHalfWidth,
        y: barCenterHeightMm,
        z: -(floodlightColumn.point.y + across.y * barHalfWidth)
      });
      strokes.push({
        key: `${floodlightColumn.key}-bar`,
        kind: "polyline",
        value: `${barStart.x},${barStart.y} ${barEnd.x},${barEnd.y}`,
        stroke: "rgba(255, 243, 177, 0.96)",
        strokeWidth: 2.4,
        opacity: 1,
        depth: (barStart.depth + barEnd.depth) / 2 + 0.2
      });
    }

    for (const overlay of scene.cutOverlays) {
      const palette = OVERLAY_PALETTE[overlay.mode];
      const frontEdge = {
        start: toGroundPoint(overlay.start),
        end: toGroundPoint(overlay.end)
      };
      const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, 74);
      const liftMm = 22;
      const frontBottomStart = project({ x: frontEdge.start.x, y: overlay.baseHeightMm + liftMm, z: frontEdge.start.z });
      const frontBottomEnd = project({ x: frontEdge.end.x, y: overlay.baseHeightMm + liftMm, z: frontEdge.end.z });
      const frontTopEnd = project({
        x: frontEdge.end.x,
        y: overlay.baseHeightMm + overlay.heightMm + liftMm,
        z: frontEdge.end.z
      });
      const frontTopStart = project({
        x: frontEdge.start.x,
        y: overlay.baseHeightMm + overlay.heightMm + liftMm,
        z: frontEdge.start.z
      });
      const outerBottomEnd = project({ x: outerEdge.end.x, y: overlay.baseHeightMm + liftMm, z: outerEdge.end.z });
      const outerTopEnd = project({
        x: outerEdge.end.x,
        y: overlay.baseHeightMm + overlay.heightMm + liftMm,
        z: outerEdge.end.z
      });
      const outerTopStart = project({
        x: outerEdge.start.x,
        y: overlay.baseHeightMm + overlay.heightMm + liftMm,
        z: outerEdge.start.z
      });

      const overlayFaces = [
        {
          key: `${overlay.key}-front`,
          points: [frontBottomStart, frontBottomEnd, frontTopEnd, frontTopStart],
          fill: palette.frontFill
        },
        {
          key: `${overlay.key}-top`,
          points: [frontTopStart, frontTopEnd, outerTopEnd, outerTopStart],
          fill: palette.topFill
        },
        {
          key: `${overlay.key}-side`,
          points: [frontBottomEnd, outerBottomEnd, outerTopEnd, frontTopEnd],
          fill: palette.sideFill
        }
      ];

      overlayFaces.forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: face.fill,
          stroke: palette.stroke,
          strokeWidth: 1.16,
          opacity: 1,
          depth: getFaceDepth(face.points) + 0.08
        });
      });

      badges.push(createOverlayBadge(overlay, project));
    }

    for (const link of scene.reuseLinks) {
      const start = project(link.start);
      const end = project(link.end);
      const control = project({
        x: (link.start.x + link.end.x) / 2,
        y: Math.max(link.start.y, link.end.y) + 440,
        z: (link.start.z + link.end.z) / 2
      });
      strokes.push({
        key: link.key,
        kind: "path",
        value: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
        stroke: "rgba(243, 247, 252, 0.94)",
        strokeWidth: 1.5,
        opacity: 1,
        dashArray: "8 7",
        pathPoints: [start, control, end],
        depth: (start.depth + control.depth + end.depth) / 3 + 0.16
      });
    }

    faces.sort((left, right) => right.depth - left.depth);
    strokes.sort((left, right) => right.depth - left.depth);
    badges.sort((left, right) => right.depth - left.depth);

    return {
      faces,
      strokes,
      badges
    };
  }, [groundPaddingMm, project, scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(viewportWidth * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(viewportHeight * devicePixelRatio));
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);

    const background = context.createLinearGradient(0, 0, 0, viewportHeight);
    background.addColorStop(0, "#f5f8fb");
    background.addColorStop(1, "#dde4e4");
    context.fillStyle = background;
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    const parsePoints = (value: string): Array<[number, number]> =>
      value
        .trim()
        .split(/\s+/)
        .map((token) => token.split(",").map(Number) as [number, number])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

    for (const face of renderData.faces) {
      const points = parsePoints(face.points);
      if (points.length < 3) {
        continue;
      }
      context.save();
      context.globalAlpha = face.opacity;
      context.beginPath();
      const firstFacePoint = points[0]!;
      context.moveTo(firstFacePoint[0], firstFacePoint[1]);
      for (let index = 1; index < points.length; index += 1) {
        const facePoint = points[index]!;
        context.lineTo(facePoint[0], facePoint[1]);
      }
      context.closePath();
      context.fillStyle = face.fill;
      context.fill();
      if (face.stroke !== "transparent" && face.strokeWidth > 0) {
        context.strokeStyle = face.stroke;
        context.lineWidth = face.strokeWidth;
        context.stroke();
      }
      context.restore();
    }

    for (const stroke of renderData.strokes) {
      context.save();
      context.globalAlpha = stroke.opacity;
      context.strokeStyle = stroke.stroke;
      context.lineWidth = stroke.strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.setLineDash(stroke.dashArray ? stroke.dashArray.split(" ").map(Number) : []);

      if (stroke.kind === "path" && stroke.pathPoints) {
        const [start, control, end] = stroke.pathPoints;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.quadraticCurveTo(control.x, control.y, end.x, end.y);
        context.stroke();

        const angle = Math.atan2(end.y - control.y, end.x - control.x);
        const arrowLength = 8;
        context.fillStyle = stroke.stroke;
        context.beginPath();
        context.moveTo(end.x, end.y);
        context.lineTo(
          end.x - arrowLength * Math.cos(angle - Math.PI / 6),
          end.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        context.lineTo(
          end.x - arrowLength * Math.cos(angle + Math.PI / 6),
          end.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        context.closePath();
        context.fill();
      } else {
        const points = parsePoints(stroke.value);
        if (points.length >= 2) {
          context.beginPath();
          const firstStrokePoint = points[0]!;
          context.moveTo(firstStrokePoint[0], firstStrokePoint[1]);
          for (let index = 1; index < points.length; index += 1) {
            const strokePoint = points[index]!;
            context.lineTo(strokePoint[0], strokePoint[1]);
          }
          context.stroke();
        }
      }

      context.restore();
    }

    for (const badge of renderData.badges) {
      context.save();
      context.beginPath();
      context.arc(badge.cx, badge.cy, 15, 0, Math.PI * 2);
      context.fillStyle = badge.fill;
      context.fill();
      context.lineWidth = 1.4;
      context.strokeStyle = badge.stroke;
      context.stroke();

      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "700 11px sans-serif";
      context.fillText(badge.step, badge.cx, badge.cy + 0.5);

      if (badge.segmentLabel) {
        context.fillStyle = "rgba(17, 30, 36, 0.78)";
        context.font = "700 9px sans-serif";
        context.textBaseline = "alphabetic";
        context.fillText(badge.segmentLabel, badge.cx, badge.cy + 24);
      }
      context.restore();
    }
  }, [renderData, viewportHeight, viewportWidth]);

  const freshCutCount = activePlan?.cuts.filter((cut) => cut.mode === "OPEN_STOCK_PANEL").length ?? 0;
  const reuseCutCount = activePlan?.cuts.filter((cut) => cut.mode === "REUSE_OFFCUT").length ?? 0;

  return (
    <section className="optimization-3d-view" aria-label="3D reuse view">
      <div className="optimization-3d-copy">
        <div>
          <h3>3D Reuse View</h3>
          <p className="muted-line">
            Drag to orbit, hold Shift and drag to pan, and scroll to zoom. Orange opens a fresh panel, teal shows where the offcut is reused next.
          </p>
        </div>
        <button type="button" className="optimization-3d-reset" onClick={() => setOrbit(DEFAULT_ORBIT)}>
          Reset view
        </button>
      </div>

      {activePlan ? (
        <div className="optimization-3d-meta">
          <span>{formatVariantLabel(activePlan.variant)}</span>
          <span>{formatHeightLabelFromMm(activePlan.stockPanelHeightMm)} stock</span>
          <span>{freshCutCount} fresh</span>
          <span>{reuseCutCount} reused</span>
          <span>{formatLengthMm(activePlan.leftoverMm)} left</span>
        </div>
      ) : null}

      <div
        ref={ref}
        className="optimization-3d-stage"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          dragStateRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            mode: event.shiftKey || event.button === 1 || event.button === 2 ? "pan" : "rotate"
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const dragState = dragStateRef.current;
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
          }

          const deltaX = event.clientX - dragState.x;
          const deltaY = event.clientY - dragState.y;
          dragStateRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            mode: dragState.mode
          };
          if (dragState.mode === "pan") {
            setOrbit((current) => ({
              ...current,
              panX: current.panX + deltaX,
              panY: current.panY + deltaY
            }));
            return;
          }

          setOrbit((current) => ({
            ...current,
            yaw: current.yaw + deltaX * 0.0052,
            pitch: clamp(current.pitch + deltaY * 0.0042, 0.2, 1.1)
          }));
        }}
        onPointerUp={(event) => {
          if (dragStateRef.current?.pointerId === event.pointerId) {
            dragStateRef.current = null;
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => {
          if (dragStateRef.current?.pointerId === event.pointerId) {
            dragStateRef.current = null;
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOrbit((current) => ({
            ...current,
            zoom: clamp(current.zoom * Math.exp(-event.deltaY * 0.0028), 0.1, 8.5)
          }));
        }}
        onDoubleClick={() => setOrbit(DEFAULT_ORBIT)}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, yaw: current.yaw - 0.08 }));
            return;
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, yaw: current.yaw + 0.08 }));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, pitch: clamp(current.pitch - 0.06, 0.2, 1.1) }));
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, pitch: clamp(current.pitch + 0.06, 0.2, 1.1) }));
            return;
          }
          if (event.key === "0") {
            event.preventDefault();
            setOrbit(DEFAULT_ORBIT);
            return;
          }
          if (event.key === "w" || event.key === "W") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, panY: current.panY - 24 }));
            return;
          }
          if (event.key === "s" || event.key === "S") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, panY: current.panY + 24 }));
            return;
          }
          if (event.key === "a" || event.key === "A") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, panX: current.panX - 24 }));
            return;
          }
          if (event.key === "d" || event.key === "D") {
            event.preventDefault();
            setOrbit((current) => ({ ...current, panX: current.panX + 24 }));
          }
        }}
      >
        <canvas ref={canvasRef} className="optimization-3d-canvas" role="img" aria-label="3D twin-bar fence reuse plan" />
      </div>

      <div className="optimization-3d-legend">
        <span>
          <i className="is-open" />
          Fresh stock cut
        </span>
        <span>
          <i className="is-reuse" />
          Reused offcut
        </span>
        <span>
          <i className="is-link" />
          Offcut path
        </span>
        <span>
          <i className="is-basketball-post" />
          Basketball post
        </span>
        <span>
          <i className="is-floodlight" />
          Floodlight column
        </span>
      </div>

      {activePlan ? (
        <div className="optimization-3d-steps" aria-label="Active plan cut steps">
          {activePlan.cuts.map((cut) => {
            const segmentIndex = segmentOrdinalById.get(cut.demand.segmentId);
            const actionLabel = cut.mode === "OPEN_STOCK_PANEL" ? "Open panel" : "Reuse offcut";
            return (
              <article key={cut.id} className="optimization-3d-step-card">
                <span className={`optimization-3d-step-badge ${cut.mode === "OPEN_STOCK_PANEL" ? "is-open" : "is-reuse"}`}>
                  {cut.step}
                </span>
                <div className="optimization-3d-step-copy">
                  <strong>
                    {actionLabel} on segment #{segmentIndex ?? "?"}
                  </strong>
                  <span>
                    [{formatLengthMm(cut.demand.startOffsetMm)}-{formatLengthMm(cut.demand.endOffsetMm)}] | cut{" "}
                    {formatLengthMm(cut.lengthMm)} | offcut {formatLengthMm(cut.offcutBeforeMm)} to{" "}
                    {formatLengthMm(cut.offcutAfterMm)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

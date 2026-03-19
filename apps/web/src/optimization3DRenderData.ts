import type { TwinBarOptimizationPlan } from "@fence-estimator/contracts";

import type { Optimization3DCutOverlay, Optimization3DPanelSlice, Optimization3DScene } from "./optimization3D.js";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface GroundPoint3D {
  x: number;
  z: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

export interface OrbitState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface RenderFace {
  key: string;
  points: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  depth: number;
}

export interface RenderStroke {
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

export interface RenderBadge {
  key: string;
  cx: number;
  cy: number;
  step: string;
  segmentLabel: string | null;
  fill: string;
  stroke: string;
  depth: number;
}

export interface Optimization3DRenderData {
  faces: RenderFace[];
  strokes: RenderStroke[];
  badges: RenderBadge[];
}

export const DEFAULT_ORBIT: OrbitState = {
  yaw: -0.82,
  pitch: 0.62,
  zoom: 1.22,
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

const GATE_PALETTE = {
  frontFill: "rgba(67, 112, 189, 0.72)",
  sideFill: "rgba(41, 79, 149, 0.84)",
  topFill: "rgba(194, 218, 255, 0.92)",
  stroke: "rgba(28, 57, 112, 0.9)",
  brace: "rgba(240, 247, 255, 0.88)"
} as const;

const GROUND_PADDING_MM = 1600;
const OVERLAY_TRACK_BASE_OFFSET_MM = 74;
const OVERLAY_TRACK_LIFT_MM = 18;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatVariantLabel(variant: TwinBarOptimizationPlan["variant"]): string {
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
  const badgeHeightMm = overlay.baseHeightMm + overlay.heightMm + 280;
  const projected = project(toWorldPoint(overlay.center, badgeHeightMm));
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

function buildProjector(scene: Optimization3DScene, orbit: OrbitState, viewportWidth: number, viewportHeight: number) {
  const center = {
    x: (scene.bounds.minX + scene.bounds.maxX) / 2,
    y: scene.bounds.maxHeightMm * 0.34,
    z: (scene.bounds.minZ + scene.bounds.maxZ) / 2
  };
  const spanMm = Math.max(
    3600,
    scene.bounds.maxX - scene.bounds.minX + GROUND_PADDING_MM * 2,
    scene.bounds.maxZ - scene.bounds.minZ + GROUND_PADDING_MM * 2,
    scene.bounds.maxHeightMm * 2.1
  );
  const scale = (Math.min(viewportWidth, viewportHeight) * 0.8 * orbit.zoom) / spanMm;

  return {
    scale,
    project: (point: Point3D): ProjectedPoint => {
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
    }
  };
}

export function buildOptimization3DRenderData(
  scene: Optimization3DScene,
  orbit: OrbitState,
  viewportWidth: number,
  viewportHeight: number
): Optimization3DRenderData {
  const { project, scale } = buildProjector(scene, orbit, viewportWidth, viewportHeight);
  const faces: RenderFace[] = [];
  const strokes: RenderStroke[] = [];
  const badges: RenderBadge[] = [];

  const groundMinX = scene.bounds.minX - GROUND_PADDING_MM;
  const groundMaxX = scene.bounds.maxX + GROUND_PADDING_MM;
  const groundMinZ = scene.bounds.minZ - GROUND_PADDING_MM;
  const groundMaxZ = scene.bounds.maxZ + GROUND_PADDING_MM;
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

    strokes.push(...buildMeshStrokes(slice, project));
  }

  for (const kickboard of scene.kickboards ?? []) {
    const frontEdge = {
      start: toGroundPoint(kickboard.start),
      end: toGroundPoint(kickboard.end)
    };
    const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, kickboard.thicknessMm);
    const frontBottomStart = project({ x: frontEdge.start.x, y: 0, z: frontEdge.start.z });
    const frontBottomEnd = project({ x: frontEdge.end.x, y: 0, z: frontEdge.end.z });
    const frontTopEnd = project({ x: frontEdge.end.x, y: kickboard.heightMm, z: frontEdge.end.z });
    const frontTopStart = project({ x: frontEdge.start.x, y: kickboard.heightMm, z: frontEdge.start.z });
    const outerBottomEnd = project({ x: outerEdge.end.x, y: 0, z: outerEdge.end.z });
    const outerTopEnd = project({ x: outerEdge.end.x, y: kickboard.heightMm, z: outerEdge.end.z });
    const outerTopStart = project({ x: outerEdge.start.x, y: kickboard.heightMm, z: outerEdge.start.z });
    const fill = kickboard.profile === "CHAMFERED" ? "rgba(151, 99, 56, 0.9)" : "rgba(122, 82, 50, 0.92)";

    [
      {
        key: `${kickboard.key}-front`,
        points: [frontBottomStart, frontBottomEnd, frontTopEnd, frontTopStart]
      },
      {
        key: `${kickboard.key}-top`,
        points: [frontTopStart, frontTopEnd, outerTopEnd, outerTopStart]
      },
      {
        key: `${kickboard.key}-side`,
        points: [frontBottomEnd, outerBottomEnd, outerTopEnd, frontTopEnd]
      }
    ].forEach((face) => {
      faces.push({
        key: face.key,
        points: formatPolygonPoints(face.points),
        fill,
        stroke: "rgba(70, 44, 23, 0.84)",
        strokeWidth: 0.9,
        opacity: 1,
        depth: getFaceDepth(face.points) + 0.04
      });
    });
  }

  for (const goalUnit of scene.goalUnits ?? []) {
    const wallPaths = [
      { key: `${goalUnit.key}-side-start`, start: goalUnit.entryPoint, end: goalUnit.recessEntryPoint },
      { key: `${goalUnit.key}-rear`, start: goalUnit.recessEntryPoint, end: goalUnit.recessExitPoint },
      { key: `${goalUnit.key}-side-end`, start: goalUnit.recessExitPoint, end: goalUnit.exitPoint }
    ];

    for (const wall of wallPaths) {
      const frontEdge = {
        start: toGroundPoint(wall.start),
        end: toGroundPoint(wall.end)
      };
      const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, 34);
      const bottomStart = project({ x: frontEdge.start.x, y: 0, z: frontEdge.start.z });
      const bottomEnd = project({ x: frontEdge.end.x, y: 0, z: frontEdge.end.z });
      const topEnd = project({ x: frontEdge.end.x, y: goalUnit.enclosureHeightMm, z: frontEdge.end.z });
      const topStart = project({ x: frontEdge.start.x, y: goalUnit.enclosureHeightMm, z: frontEdge.start.z });
      const outerBottomEnd = project({ x: outerEdge.end.x, y: 0, z: outerEdge.end.z });
      const outerTopEnd = project({ x: outerEdge.end.x, y: goalUnit.enclosureHeightMm, z: outerEdge.end.z });
      const outerTopStart = project({ x: outerEdge.start.x, y: goalUnit.enclosureHeightMm, z: outerEdge.start.z });

      [
        {
          key: `${wall.key}-front`,
          points: [bottomStart, bottomEnd, topEnd, topStart]
        },
        {
          key: `${wall.key}-top`,
          points: [topStart, topEnd, outerTopEnd, outerTopStart]
        },
        {
          key: `${wall.key}-side`,
          points: [bottomEnd, outerBottomEnd, outerTopEnd, topEnd]
        }
      ].forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: "rgba(121, 154, 173, 0.84)",
          stroke: "rgba(50, 76, 92, 0.86)",
          strokeWidth: 0.96,
          opacity: 1,
          depth: getFaceDepth(face.points) + 0.06
        });
      });
    }

    const lintelStart = project(toWorldPoint(goalUnit.entryPoint, goalUnit.enclosureHeightMm - 180));
    const lintelEnd = project(toWorldPoint(goalUnit.exitPoint, goalUnit.enclosureHeightMm - 180));
    strokes.push({
      key: `${goalUnit.key}-lintel`,
      kind: "polyline",
      value: `${lintelStart.x},${lintelStart.y} ${lintelEnd.x},${lintelEnd.y}`,
      stroke: "rgba(255, 215, 166, 0.94)",
      strokeWidth: 2,
      opacity: 1,
      depth: (lintelStart.depth + lintelEnd.depth) / 2 + 0.1
    });

    const postTop = project(toWorldPoint(goalUnit.rearCenterPoint, goalUnit.enclosureHeightMm + 400));
    const postBottom = project(toWorldPoint(goalUnit.rearCenterPoint, 0));
    strokes.push({
      key: `${goalUnit.key}-basketball-post`,
      kind: "polyline",
      value: `${postBottom.x},${postBottom.y} ${postTop.x},${postTop.y}`,
      stroke: "rgba(38, 84, 183, 0.94)",
      strokeWidth: 2.1,
      opacity: 1,
      depth: (postBottom.depth + postTop.depth) / 2 + 0.1
    });
  }

  for (const rail of scene.rails) {
    const frontEdge = {
      start: toGroundPoint(rail.start),
      end: toGroundPoint(rail.end)
    };
    const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, rail.diameterMm);
    const bottomHeightMm = rail.centerHeightMm - rail.diameterMm / 2;
    const topHeightMm = rail.centerHeightMm + rail.diameterMm / 2;
    const frontBottomStart = project({ x: frontEdge.start.x, y: bottomHeightMm, z: frontEdge.start.z });
    const frontBottomEnd = project({ x: frontEdge.end.x, y: bottomHeightMm, z: frontEdge.end.z });
    const frontTopEnd = project({ x: frontEdge.end.x, y: topHeightMm, z: frontEdge.end.z });
    const frontTopStart = project({ x: frontEdge.start.x, y: topHeightMm, z: frontEdge.start.z });
    const outerBottomEnd = project({ x: outerEdge.end.x, y: bottomHeightMm, z: outerEdge.end.z });
    const outerTopEnd = project({ x: outerEdge.end.x, y: topHeightMm, z: outerEdge.end.z });
    const outerTopStart = project({ x: outerEdge.start.x, y: topHeightMm, z: outerEdge.start.z });

    const railFaces = [
      {
        key: `${rail.key}-front`,
        points: [frontBottomStart, frontBottomEnd, frontTopEnd, frontTopStart],
        fill: "rgba(196, 203, 212, 0.92)"
      },
      {
        key: `${rail.key}-top`,
        points: [frontTopStart, frontTopEnd, outerTopEnd, outerTopStart],
        fill: "rgba(246, 249, 252, 0.98)"
      },
      {
        key: `${rail.key}-side`,
        points: [frontBottomEnd, outerBottomEnd, outerTopEnd, frontTopEnd],
        fill: "rgba(132, 143, 154, 0.94)"
      }
    ];

    railFaces.forEach((face) => {
      faces.push({
        key: face.key,
        points: formatPolygonPoints(face.points),
        fill: face.fill,
        stroke: "rgba(94, 106, 118, 0.82)",
        strokeWidth: 0.86,
        opacity: 1,
        depth: getFaceDepth(face.points) + 0.06
      });
    });
  }

  for (const sideNetting of scene.sideNettings ?? []) {
    const frontEdge = {
      start: toGroundPoint(sideNetting.start),
      end: toGroundPoint(sideNetting.end)
    };
    const topStart = project({ x: frontEdge.start.x, y: sideNetting.totalHeightMm, z: frontEdge.start.z });
    const topEnd = project({ x: frontEdge.end.x, y: sideNetting.totalHeightMm, z: frontEdge.end.z });
    const bottomEnd = project({ x: frontEdge.end.x, y: sideNetting.baseHeightMm, z: frontEdge.end.z });
    const bottomStart = project({ x: frontEdge.start.x, y: sideNetting.baseHeightMm, z: frontEdge.start.z });
    const netFace = [bottomStart, bottomEnd, topEnd, topStart];

    faces.push({
      key: `${sideNetting.key}-net`,
      points: formatPolygonPoints(netFace),
      fill: "rgba(111, 214, 230, 0.18)",
      stroke: "rgba(92, 196, 215, 0.72)",
      strokeWidth: 0.9,
      opacity: 1,
      depth: getFaceDepth(netFace) + 0.05
    });

    for (const point of sideNetting.extendedPostPoints) {
      const bottom = project(toWorldPoint(point, 0));
      const top = project(toWorldPoint(point, sideNetting.totalHeightMm));
      strokes.push({
        key: `${sideNetting.key}-post-${point.x}-${point.y}`,
        kind: "polyline",
        value: `${bottom.x},${bottom.y} ${top.x},${top.y}`,
        stroke: "rgba(30, 40, 47, 0.9)",
        strokeWidth: 2,
        opacity: 1,
        depth: (bottom.depth + top.depth) / 2 + 0.06
      });
    }
  }

  for (const pitchDivider of scene.pitchDividers ?? []) {
    const bottomStart = project(toWorldPoint(pitchDivider.startPoint, 0));
    const bottomEnd = project(toWorldPoint(pitchDivider.endPoint, 0));
    const topEnd = project(toWorldPoint(pitchDivider.endPoint, pitchDivider.heightMm));
    const topStart = project(toWorldPoint(pitchDivider.startPoint, pitchDivider.heightMm));
    const dividerFace = [bottomStart, bottomEnd, topEnd, topStart];

    faces.push({
      key: `${pitchDivider.key}-net`,
      points: formatPolygonPoints(dividerFace),
      fill: "rgba(236, 245, 255, 0.12)",
      stroke: "rgba(225, 241, 255, 0.64)",
      strokeWidth: 0.92,
      opacity: 1,
      depth: getFaceDepth(dividerFace) + 0.05
    });

    [pitchDivider.startPoint, pitchDivider.endPoint, ...pitchDivider.supportPoints].forEach((point, index) => {
      const bottom = project(toWorldPoint(point, 0));
      const top = project(toWorldPoint(point, pitchDivider.heightMm));
      strokes.push({
        key: `${pitchDivider.key}-support-${index}`,
        kind: "polyline",
        value: `${bottom.x},${bottom.y} ${top.x},${top.y}`,
        stroke: "rgba(220, 232, 244, 0.94)",
        strokeWidth: 2,
        opacity: 1,
        depth: (bottom.depth + top.depth) / 2 + 0.08
      });
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

  for (const gate of scene.gates) {
    const gateWidthMm = Math.hypot(gate.end.x - gate.start.x, gate.end.y - gate.start.y);
    const leafSpanMm = gate.leafCount === 2 ? gateWidthMm / 2 : gateWidthMm;
    const leafCount = gate.leafCount === 2 ? 2 : 1;
    const tangent = {
      x: gateWidthMm <= 0.001 ? 1 : (gate.end.x - gate.start.x) / gateWidthMm,
      y: gateWidthMm <= 0.001 ? 0 : (gate.end.y - gate.start.y) / gateWidthMm
    };
    for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
      const startOffset = leafIndex * leafSpanMm;
      const endOffset = (leafIndex + 1) * leafSpanMm;
      const leafStart = {
        x: gate.start.x + tangent.x * startOffset,
        y: gate.start.y + tangent.y * startOffset
      };
      const leafEnd = {
        x: gate.start.x + tangent.x * endOffset,
        y: gate.start.y + tangent.y * endOffset
      };
      const frontEdge = {
        start: toGroundPoint(leafStart),
        end: toGroundPoint(leafEnd)
      };
      const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, 48);
      const bottomStart = project({ x: frontEdge.start.x, y: 0, z: frontEdge.start.z });
      const bottomEnd = project({ x: frontEdge.end.x, y: 0, z: frontEdge.end.z });
      const topEnd = project({ x: frontEdge.end.x, y: gate.heightMm, z: frontEdge.end.z });
      const topStart = project({ x: frontEdge.start.x, y: gate.heightMm, z: frontEdge.start.z });
      const outerBottomEnd = project({ x: outerEdge.end.x, y: 0, z: outerEdge.end.z });
      const outerTopEnd = project({ x: outerEdge.end.x, y: gate.heightMm, z: outerEdge.end.z });
      const outerTopStart = project({ x: outerEdge.start.x, y: gate.heightMm, z: outerEdge.start.z });

      const gateFaces = [
        {
          key: `${gate.key}-leaf-${leafIndex}-front`,
          points: [bottomStart, bottomEnd, topEnd, topStart],
          fill: GATE_PALETTE.frontFill
        },
        {
          key: `${gate.key}-leaf-${leafIndex}-top`,
          points: [topStart, topEnd, outerTopEnd, outerTopStart],
          fill: GATE_PALETTE.topFill
        },
        {
          key: `${gate.key}-leaf-${leafIndex}-side`,
          points: [bottomEnd, outerBottomEnd, outerTopEnd, topEnd],
          fill: GATE_PALETTE.sideFill
        }
      ];
      gateFaces.forEach((face) => {
        faces.push({
          key: face.key,
          points: formatPolygonPoints(face.points),
          fill: face.fill,
          stroke: GATE_PALETTE.stroke,
          strokeWidth: 1,
          opacity: 1,
          depth: getFaceDepth(face.points) + 0.12
        });
      });

      strokes.push({
        key: `${gate.key}-leaf-${leafIndex}-brace`,
        kind: "polyline",
        value: `${bottomStart.x},${bottomStart.y} ${topEnd.x},${topEnd.y}`,
        stroke: GATE_PALETTE.brace,
        strokeWidth: 1.3,
        opacity: 1,
        depth: (bottomStart.depth + topEnd.depth) / 2 + 0.2
      });
    }
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
    const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, OVERLAY_TRACK_BASE_OFFSET_MM);
    const frontBottomStart = project({ x: frontEdge.start.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.start.z });
    const frontBottomEnd = project({ x: frontEdge.end.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.end.z });
    const frontTopEnd = project({
      x: frontEdge.end.x,
      y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM,
      z: frontEdge.end.z
    });
    const frontTopStart = project({
      x: frontEdge.start.x,
      y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM,
      z: frontEdge.start.z
    });
    const outerBottomEnd = project({ x: outerEdge.end.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: outerEdge.end.z });
    const outerTopEnd = project({
      x: outerEdge.end.x,
      y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM,
      z: outerEdge.end.z
    });
    const outerTopStart = project({
      x: outerEdge.start.x,
      y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM,
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
        opacity: 0.98,
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
}

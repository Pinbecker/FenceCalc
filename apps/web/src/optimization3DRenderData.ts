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

interface CameraSpacePoint {
  x: number;
  y: number;
  z: number;
}

export interface OrbitState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface WalkState {
  x: number;
  z: number;
  eyeHeightMm: number;
  yaw: number;
  pitch: number;
}

export type Optimization3DCameraState = OrbitState | WalkState;

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
    z: point.y
  };
}

function toGroundPoint(point: { x: number; y: number }): GroundPoint3D {
  return {
    x: point.x,
    z: point.y
  };
}

function isWalkState(camera: Optimization3DCameraState): camera is WalkState {
  return "eyeHeightMm" in camera;
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
  projectSegment: (start: Point3D, end: Point3D) => [ProjectedPoint, ProjectedPoint] | null
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
    const projectedLine = projectSegment(
      toWorldPoint(groundPoint, slice.baseHeightMm),
      toWorldPoint(groundPoint, slice.baseHeightMm + slice.heightMm)
    );
    if (!projectedLine) {
      continue;
    }
    const [lineStart, lineEnd] = projectedLine;
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
    const projectedLine = projectSegment(toWorldPoint(slice.start, heightMm), toWorldPoint(slice.end, heightMm));
    if (!projectedLine) {
      continue;
    }
    const [lineStart, lineEnd] = projectedLine;
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
  projectVisiblePoint: (point: Point3D) => ProjectedPoint | null
): RenderBadge | null {
  const palette = OVERLAY_PALETTE[overlay.mode];
  const badgeHeightMm = overlay.baseHeightMm + overlay.heightMm + 280;
  const projected = projectVisiblePoint(toWorldPoint(overlay.center, badgeHeightMm));
  if (!projected) {
    return null;
  }
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

function buildProjector(
  scene: Optimization3DScene,
  camera: Optimization3DCameraState,
  viewportWidth: number,
  viewportHeight: number
) {
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
  if (isWalkState(camera)) {
    const focalLength = Math.min(viewportWidth, viewportHeight) * 1.04;
    const nearPlaneMm = 140;
    const yawCos = Math.cos(camera.yaw);
    const yawSin = Math.sin(camera.yaw);
    const pitchCos = Math.cos(camera.pitch);
    const pitchSin = Math.sin(camera.pitch);
    const toCameraSpace = (point: Point3D): CameraSpacePoint => {
      const translatedX = point.x - camera.x;
      const translatedY = point.y - camera.eyeHeightMm;
      const translatedZ = point.z - camera.z;

      const yawX = translatedX * yawCos - translatedZ * yawSin;
      const yawZ = translatedX * yawSin + translatedZ * yawCos;
      const pitchY = translatedY * pitchCos - yawZ * pitchSin;
      const pitchZ = translatedY * pitchSin + yawZ * pitchCos;

      return {
        x: yawX,
        y: pitchY,
        z: pitchZ
      };
    };
    const projectCameraPoint = (point: CameraSpacePoint): ProjectedPoint => {
      const perspective = focalLength / point.z;
      return {
        x: viewportWidth / 2 + point.x * perspective,
        y: viewportHeight * 0.62 - point.y * perspective,
        depth: point.z
      };
    };
    const interpolateToNearPlane = (start: CameraSpacePoint, end: CameraSpacePoint): CameraSpacePoint => {
      const deltaZ = end.z - start.z;
      const safeDeltaZ = Math.abs(deltaZ) < 0.0001 ? (deltaZ < 0 ? -0.0001 : 0.0001) : deltaZ;
      const ratio = (nearPlaneMm - start.z) / safeDeltaZ;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        z: nearPlaneMm
      };
    };
    const clipSegmentToNearPlane = (
      start: CameraSpacePoint,
      end: CameraSpacePoint
    ): [CameraSpacePoint, CameraSpacePoint] | null => {
      const startVisible = start.z >= nearPlaneMm;
      const endVisible = end.z >= nearPlaneMm;
      if (!startVisible && !endVisible) {
        return null;
      }
      if (startVisible && endVisible) {
        return [start, end];
      }
      const clippedPoint = interpolateToNearPlane(start, end);
      return startVisible ? [start, clippedPoint] : [clippedPoint, end];
    };
    const clipPolygonToNearPlane = (points: ReadonlyArray<CameraSpacePoint>): CameraSpacePoint[] => {
      if (points.length === 0) {
        return [];
      }
      const clipped: CameraSpacePoint[] = [];
      let previous = points[points.length - 1]!;
      let previousVisible = previous.z >= nearPlaneMm;

      for (const current of points) {
        const currentVisible = current.z >= nearPlaneMm;
        if (currentVisible !== previousVisible) {
          clipped.push(interpolateToNearPlane(previous, current));
        }
        if (currentVisible) {
          clipped.push(current);
        }
        previous = current;
        previousVisible = currentVisible;
      }

      return clipped;
    };
    return {
      scale: focalLength / 1000,
      project: (point: Point3D): ProjectedPoint => {
        const cameraPoint = toCameraSpace(point);
        return projectCameraPoint({
          ...cameraPoint,
          z: Math.max(nearPlaneMm, cameraPoint.z)
        });
      },
      projectVisiblePoint: (point: Point3D): ProjectedPoint | null => {
        const cameraPoint = toCameraSpace(point);
        return cameraPoint.z >= nearPlaneMm ? projectCameraPoint(cameraPoint) : null;
      },
      projectFace: (points: ReadonlyArray<Point3D>): ProjectedPoint[] | null => {
        const clippedPoints = clipPolygonToNearPlane(points.map(toCameraSpace));
        return clippedPoints.length >= 3 ? clippedPoints.map(projectCameraPoint) : null;
      },
      projectSegment: (start: Point3D, end: Point3D): [ProjectedPoint, ProjectedPoint] | null => {
        const clippedSegment = clipSegmentToNearPlane(toCameraSpace(start), toCameraSpace(end));
        return clippedSegment ? [projectCameraPoint(clippedSegment[0]), projectCameraPoint(clippedSegment[1])] : null;
      },
      projectPolyline: (points: ReadonlyArray<Point3D>): ProjectedPoint[] | null => {
        const cameraPoints = points.map(toCameraSpace);
        return cameraPoints.every((point) => point.z >= nearPlaneMm) ? cameraPoints.map(projectCameraPoint) : null;
      }
    };
  }

  const scale = (Math.min(viewportWidth, viewportHeight) * 0.8 * camera.zoom) / spanMm;
  const orbitProjectPoint = (point: Point3D): ProjectedPoint => {
    const translatedX = point.x - center.x;
    const translatedY = point.y - center.y;
    const translatedZ = point.z - center.z;

    const yawCos = Math.cos(camera.yaw);
    const yawSin = Math.sin(camera.yaw);
    const pitchCos = Math.cos(camera.pitch);
    const pitchSin = Math.sin(camera.pitch);

    const yawX = translatedX * yawCos - translatedZ * yawSin;
    const yawZ = translatedX * yawSin + translatedZ * yawCos;
    const pitchY = translatedY * pitchCos - yawZ * pitchSin;
    const pitchZ = translatedY * pitchSin + yawZ * pitchCos;

    return {
      x: viewportWidth / 2 + yawX * scale + camera.panX,
      y: viewportHeight * 0.68 - pitchY * scale + camera.panY,
      depth: pitchZ
    };
  };

  return {
    scale,
    project: orbitProjectPoint,
    projectVisiblePoint: (point: Point3D): ProjectedPoint => orbitProjectPoint(point),
    projectFace: (points: ReadonlyArray<Point3D>): ProjectedPoint[] => points.map(orbitProjectPoint),
    projectSegment: (start: Point3D, end: Point3D): [ProjectedPoint, ProjectedPoint] => [orbitProjectPoint(start), orbitProjectPoint(end)],
    projectPolyline: (points: ReadonlyArray<Point3D>): ProjectedPoint[] => points.map(orbitProjectPoint)
  };
}

export function buildOptimization3DRenderData(
  scene: Optimization3DScene,
  camera: Optimization3DCameraState,
  viewportWidth: number,
  viewportHeight: number
): Optimization3DRenderData {
  const { projectVisiblePoint, projectFace, projectSegment, projectPolyline } = buildProjector(
    scene,
    camera,
    viewportWidth,
    viewportHeight
  );
  const faces: RenderFace[] = [];
  const strokes: RenderStroke[] = [];
  const badges: RenderBadge[] = [];

  const pushFace = (
    key: string,
    points: ReadonlyArray<Point3D>,
    fill: string,
    stroke: string,
    strokeWidth: number,
    opacity: number,
    depthOffset: number = 0
  ) => {
    const projected = projectFace(points);
    if (!projected || projected.length < 3) {
      return;
    }
    faces.push({
      key,
      points: formatPolygonPoints(projected),
      fill,
      stroke,
      strokeWidth,
      opacity,
      depth: getFaceDepth(projected) + depthOffset
    });
  };

  const pushSegmentStroke = (
    key: string,
    start: Point3D,
    end: Point3D,
    stroke: string,
    strokeWidth: number,
    opacity: number,
    depthOffset: number = 0,
    dashArray?: string
  ) => {
    const projected = projectSegment(start, end);
    if (!projected) {
      return;
    }
    const [from, to] = projected;
    const strokeRecord: RenderStroke = {
      key,
      kind: "polyline",
      value: `${from.x},${from.y} ${to.x},${to.y}`,
      stroke,
      strokeWidth,
      opacity,
      depth: (from.depth + to.depth) / 2 + depthOffset
    };
    if (dashArray) {
      strokeRecord.dashArray = dashArray;
    }
    strokes.push(strokeRecord);
  };

  const groundMinX = scene.bounds.minX - GROUND_PADDING_MM;
  const groundMaxX = scene.bounds.maxX + GROUND_PADDING_MM;
  const groundMinZ = scene.bounds.minZ - GROUND_PADDING_MM;
  const groundMaxZ = scene.bounds.maxZ + GROUND_PADDING_MM;
  pushFace(
    "ground",
    [
      { x: groundMinX, y: 0, z: groundMinZ },
      { x: groundMaxX, y: 0, z: groundMinZ },
      { x: groundMaxX, y: 0, z: groundMaxZ },
      { x: groundMinX, y: 0, z: groundMaxZ }
    ],
    "rgba(204, 219, 205, 0.52)",
    "rgba(118, 136, 119, 0.2)",
    1,
    1
  );

  for (let gridX = groundMinX; gridX <= groundMaxX; gridX += 2500) {
    pushSegmentStroke(`grid-x-${gridX}`, { x: gridX, y: 0, z: groundMinZ }, { x: gridX, y: 0, z: groundMaxZ }, "rgba(91, 110, 98, 0.13)", 0.9, 1);
  }

  for (let gridZ = groundMinZ; gridZ <= groundMaxZ; gridZ += 2500) {
    pushSegmentStroke(`grid-z-${gridZ}`, { x: groundMinX, y: 0, z: gridZ }, { x: groundMaxX, y: 0, z: gridZ }, "rgba(91, 110, 98, 0.13)", 0.9, 1);
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
    pushFace(
      `${slice.key}-shadow`,
      [
        { x: frontEdge.start.x + shadowDriftX, y: 0, z: frontEdge.start.z + shadowDriftZ },
        { x: frontEdge.end.x + shadowDriftX, y: 0, z: frontEdge.end.z + shadowDriftZ },
        { x: shadowEdge.end.x + shadowDriftX, y: 0, z: shadowEdge.end.z + shadowDriftZ },
        { x: shadowEdge.start.x + shadowDriftX, y: 0, z: shadowEdge.start.z + shadowDriftZ }
      ],
      "rgba(36, 46, 41, 0.09)",
      "transparent",
      0,
      1,
      -12
    );

    [
      {
        key: `${slice.key}-front`,
        points: [
          { x: frontEdge.start.x, y: slice.baseHeightMm, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: slice.baseHeightMm, z: frontEdge.end.z },
          { x: frontEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: frontEdge.end.z },
          { x: frontEdge.start.x, y: slice.baseHeightMm + slice.heightMm, z: frontEdge.start.z }
        ],
        fill: palette.frontFill
      },
      {
        key: `${slice.key}-top`,
        points: [
          { x: frontEdge.start.x, y: slice.baseHeightMm + slice.heightMm, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: frontEdge.end.z },
          { x: backEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: backEdge.end.z },
          { x: backEdge.start.x, y: slice.baseHeightMm + slice.heightMm, z: backEdge.start.z }
        ],
        fill: palette.topFill
      },
      {
        key: `${slice.key}-side`,
        points: [
          { x: frontEdge.end.x, y: slice.baseHeightMm, z: frontEdge.end.z },
          { x: backEdge.end.x, y: slice.baseHeightMm, z: backEdge.end.z },
          { x: backEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: backEdge.end.z },
          { x: frontEdge.end.x, y: slice.baseHeightMm + slice.heightMm, z: frontEdge.end.z }
        ],
        fill: palette.sideFill
      }
    ].forEach((face) => {
      pushFace(face.key, face.points, face.fill, palette.stroke, 0.92, 1);
    });

    strokes.push(...buildMeshStrokes(slice, projectSegment));
  }

  for (const kickboard of scene.kickboards ?? []) {
    const frontEdge = {
      start: toGroundPoint(kickboard.start),
      end: toGroundPoint(kickboard.end)
    };
    const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, kickboard.thicknessMm);
    const fill = kickboard.profile === "CHAMFERED" ? "rgba(151, 99, 56, 0.9)" : "rgba(122, 82, 50, 0.92)";

    [
      {
        key: `${kickboard.key}-front`,
        points: [
          { x: frontEdge.start.x, y: 0, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: 0, z: frontEdge.end.z },
          { x: frontEdge.end.x, y: kickboard.heightMm, z: frontEdge.end.z },
          { x: frontEdge.start.x, y: kickboard.heightMm, z: frontEdge.start.z }
        ]
      },
      {
        key: `${kickboard.key}-top`,
        points: [
          { x: frontEdge.start.x, y: kickboard.heightMm, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: kickboard.heightMm, z: frontEdge.end.z },
          { x: outerEdge.end.x, y: kickboard.heightMm, z: outerEdge.end.z },
          { x: outerEdge.start.x, y: kickboard.heightMm, z: outerEdge.start.z }
        ]
      },
      {
        key: `${kickboard.key}-side`,
        points: [
          { x: frontEdge.end.x, y: 0, z: frontEdge.end.z },
          { x: outerEdge.end.x, y: 0, z: outerEdge.end.z },
          { x: outerEdge.end.x, y: kickboard.heightMm, z: outerEdge.end.z },
          { x: frontEdge.end.x, y: kickboard.heightMm, z: frontEdge.end.z }
        ]
      }
    ].forEach((face) => {
      pushFace(face.key, face.points, fill, "rgba(70, 44, 23, 0.84)", 0.9, 1, 0.04);
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

      [
        {
          key: `${wall.key}-front`,
          points: [
            { x: frontEdge.start.x, y: 0, z: frontEdge.start.z },
            { x: frontEdge.end.x, y: 0, z: frontEdge.end.z },
            { x: frontEdge.end.x, y: goalUnit.enclosureHeightMm, z: frontEdge.end.z },
            { x: frontEdge.start.x, y: goalUnit.enclosureHeightMm, z: frontEdge.start.z }
          ]
        },
        {
          key: `${wall.key}-top`,
          points: [
            { x: frontEdge.start.x, y: goalUnit.enclosureHeightMm, z: frontEdge.start.z },
            { x: frontEdge.end.x, y: goalUnit.enclosureHeightMm, z: frontEdge.end.z },
            { x: outerEdge.end.x, y: goalUnit.enclosureHeightMm, z: outerEdge.end.z },
            { x: outerEdge.start.x, y: goalUnit.enclosureHeightMm, z: outerEdge.start.z }
          ]
        },
        {
          key: `${wall.key}-side`,
          points: [
            { x: frontEdge.end.x, y: 0, z: frontEdge.end.z },
            { x: outerEdge.end.x, y: 0, z: outerEdge.end.z },
            { x: outerEdge.end.x, y: goalUnit.enclosureHeightMm, z: outerEdge.end.z },
            { x: frontEdge.end.x, y: goalUnit.enclosureHeightMm, z: frontEdge.end.z }
          ]
        }
      ].forEach((face) => {
        pushFace(face.key, face.points, "rgba(121, 154, 173, 0.84)", "rgba(50, 76, 92, 0.86)", 0.96, 1, 0.06);
      });
    }

    const frontEdge = {
      start: toGroundPoint(goalUnit.entryPoint),
      end: toGroundPoint(goalUnit.exitPoint)
    };
    const frontMidpoint = {
      x: (goalUnit.entryPoint.x + goalUnit.exitPoint.x) / 2,
      y: (goalUnit.entryPoint.y + goalUnit.exitPoint.y) / 2
    };
    const goalMouthHeightMm = 1800;
    const lintelSlotWidthMm = 240;
    const frontWidthMm = Math.hypot(frontEdge.end.x - frontEdge.start.x, frontEdge.end.z - frontEdge.start.z) || 1;
    const frontTangent = {
      x: (goalUnit.exitPoint.x - goalUnit.entryPoint.x) / frontWidthMm,
      y: (goalUnit.exitPoint.y - goalUnit.entryPoint.y) / frontWidthMm
    };
    const leftSlotPoint = {
      x: frontMidpoint.x - frontTangent.x * (lintelSlotWidthMm / 2),
      y: frontMidpoint.y - frontTangent.y * (lintelSlotWidthMm / 2)
    };
    const rightSlotPoint = {
      x: frontMidpoint.x + frontTangent.x * (lintelSlotWidthMm / 2),
      y: frontMidpoint.y + frontTangent.y * (lintelSlotWidthMm / 2)
    };

    const frontPanelFaces = [
      { key: `${goalUnit.key}-front-panel-left`, start: goalUnit.entryPoint, end: leftSlotPoint },
      { key: `${goalUnit.key}-front-panel-right`, start: rightSlotPoint, end: goalUnit.exitPoint }
    ];
    for (const face of frontPanelFaces) {
      pushFace(
        face.key,
        [
          toWorldPoint(face.start, goalMouthHeightMm),
          toWorldPoint(face.end, goalMouthHeightMm),
          toWorldPoint(face.end, goalUnit.enclosureHeightMm),
          toWorldPoint(face.start, goalUnit.enclosureHeightMm)
        ],
        "rgba(197, 205, 212, 0.82)",
        "rgba(92, 104, 118, 0.88)",
        0.94,
        1,
        0.08
      );
    }

    pushSegmentStroke(
      `${goalUnit.key}-lintel`,
      toWorldPoint(goalUnit.entryPoint, goalMouthHeightMm),
      toWorldPoint(goalUnit.exitPoint, goalMouthHeightMm),
      "rgba(255, 215, 166, 0.94)",
      2,
      1,
      0.1
    );

    const armHeightMm = Math.max(goalMouthHeightMm + 350, goalUnit.enclosureHeightMm - 260);
    pushSegmentStroke(
      `${goalUnit.key}-basketball-post`,
      toWorldPoint(goalUnit.rearCenterPoint, 0),
      toWorldPoint(goalUnit.rearCenterPoint, goalUnit.enclosureHeightMm + 400),
      "rgba(38, 84, 183, 0.94)",
      2.1,
      1,
      0.1
    );

    const armExitPoint = {
      x: frontMidpoint.x - goalUnit.normal.x * 420,
      y: frontMidpoint.y - goalUnit.normal.y * 420
    };
    pushSegmentStroke(
      `${goalUnit.key}-basketball-arm`,
      toWorldPoint(goalUnit.rearCenterPoint, armHeightMm),
      toWorldPoint(armExitPoint, armHeightMm),
      "rgba(255, 183, 89, 0.96)",
      2.1,
      1,
      0.11
    );

    const boardCenter = {
      x: armExitPoint.x - goalUnit.normal.x * 140,
      y: armExitPoint.y - goalUnit.normal.y * 140
    };
    const boardHalfWidthMm = 420;
    const boardHalfHeightMm = 300;
    pushFace(
      `${goalUnit.key}-backboard`,
      [
        toWorldPoint(
          {
            x: boardCenter.x - frontTangent.x * boardHalfWidthMm,
            y: boardCenter.y - frontTangent.y * boardHalfWidthMm
          },
          armHeightMm - boardHalfHeightMm
        ),
        toWorldPoint(
          {
            x: boardCenter.x + frontTangent.x * boardHalfWidthMm,
            y: boardCenter.y + frontTangent.y * boardHalfWidthMm
          },
          armHeightMm - boardHalfHeightMm
        ),
        toWorldPoint(
          {
            x: boardCenter.x + frontTangent.x * boardHalfWidthMm,
            y: boardCenter.y + frontTangent.y * boardHalfWidthMm
          },
          armHeightMm + boardHalfHeightMm
        ),
        toWorldPoint(
          {
            x: boardCenter.x - frontTangent.x * boardHalfWidthMm,
            y: boardCenter.y - frontTangent.y * boardHalfWidthMm
          },
          armHeightMm + boardHalfHeightMm
        )
      ],
      "rgba(244, 250, 255, 0.88)",
      "rgba(87, 104, 121, 0.9)",
      0.9,
      1,
      0.12
    );

    const hoopAnchor = projectVisiblePoint(
      toWorldPoint(
        {
          x: boardCenter.x - goalUnit.normal.x * 110,
          y: boardCenter.y - goalUnit.normal.y * 110
        },
        armHeightMm - 40
      )
    );
    if (hoopAnchor) {
      faces.push({
        key: `${goalUnit.key}-hoop`,
        points: formatPolygonPoints([
          { x: hoopAnchor.x - 8, y: hoopAnchor.y - 3, depth: hoopAnchor.depth },
          { x: hoopAnchor.x + 8, y: hoopAnchor.y - 3, depth: hoopAnchor.depth },
          { x: hoopAnchor.x + 8, y: hoopAnchor.y + 3, depth: hoopAnchor.depth },
          { x: hoopAnchor.x - 8, y: hoopAnchor.y + 3, depth: hoopAnchor.depth }
        ]),
        fill: "rgba(255, 151, 70, 0.98)",
        stroke: "rgba(168, 92, 33, 0.92)",
        strokeWidth: 0.8,
        opacity: 1,
        depth: hoopAnchor.depth + 0.13
      });
    }
  }

  for (const rail of scene.rails) {
    const frontEdge = {
      start: toGroundPoint(rail.start),
      end: toGroundPoint(rail.end)
    };
    const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, rail.diameterMm);
    const bottomHeightMm = rail.centerHeightMm - rail.diameterMm / 2;
    const topHeightMm = rail.centerHeightMm + rail.diameterMm / 2;
    const railFaces = [
      {
        key: `${rail.key}-front`,
        points: [
          { x: frontEdge.start.x, y: bottomHeightMm, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: bottomHeightMm, z: frontEdge.end.z },
          { x: frontEdge.end.x, y: topHeightMm, z: frontEdge.end.z },
          { x: frontEdge.start.x, y: topHeightMm, z: frontEdge.start.z }
        ],
        fill: "rgba(196, 203, 212, 0.92)"
      },
      {
        key: `${rail.key}-top`,
        points: [
          { x: frontEdge.start.x, y: topHeightMm, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: topHeightMm, z: frontEdge.end.z },
          { x: outerEdge.end.x, y: topHeightMm, z: outerEdge.end.z },
          { x: outerEdge.start.x, y: topHeightMm, z: outerEdge.start.z }
        ],
        fill: "rgba(246, 249, 252, 0.98)"
      },
      {
        key: `${rail.key}-side`,
        points: [
          { x: frontEdge.end.x, y: bottomHeightMm, z: frontEdge.end.z },
          { x: outerEdge.end.x, y: bottomHeightMm, z: outerEdge.end.z },
          { x: outerEdge.end.x, y: topHeightMm, z: outerEdge.end.z },
          { x: frontEdge.end.x, y: topHeightMm, z: frontEdge.end.z }
        ],
        fill: "rgba(132, 143, 154, 0.94)"
      }
    ];

    railFaces.forEach((face) => {
      pushFace(face.key, face.points, face.fill, "rgba(94, 106, 118, 0.82)", 0.86, 1, 0.06);
    });
  }

  for (const sideNetting of scene.sideNettings ?? []) {
    const frontEdge = {
      start: toGroundPoint(sideNetting.start),
      end: toGroundPoint(sideNetting.end)
    };
    pushFace(
      `${sideNetting.key}-net`,
      [
        { x: frontEdge.start.x, y: sideNetting.baseHeightMm, z: frontEdge.start.z },
        { x: frontEdge.end.x, y: sideNetting.baseHeightMm, z: frontEdge.end.z },
        { x: frontEdge.end.x, y: sideNetting.totalHeightMm, z: frontEdge.end.z },
        { x: frontEdge.start.x, y: sideNetting.totalHeightMm, z: frontEdge.start.z }
      ],
      "rgba(111, 214, 230, 0.18)",
      "rgba(92, 196, 215, 0.72)",
      0.9,
      1,
      0.05
    );

    for (const point of sideNetting.extendedPostPoints) {
      pushSegmentStroke(
        `${sideNetting.key}-post-${point.x}-${point.y}`,
        toWorldPoint(point, 0),
        toWorldPoint(point, sideNetting.totalHeightMm),
        "rgba(30, 40, 47, 0.9)",
        2,
        1,
        0.06
      );
    }
  }

  for (const pitchDivider of scene.pitchDividers ?? []) {
    pushFace(
      `${pitchDivider.key}-net`,
      [
        toWorldPoint(pitchDivider.startPoint, 0),
        toWorldPoint(pitchDivider.endPoint, 0),
        toWorldPoint(pitchDivider.endPoint, pitchDivider.heightMm),
        toWorldPoint(pitchDivider.startPoint, pitchDivider.heightMm)
      ],
      "rgba(64, 199, 255, 0.22)",
      "rgba(82, 221, 255, 0.92)",
      1.1,
      1,
      0.05
    );

    [pitchDivider.startPoint, pitchDivider.endPoint, ...pitchDivider.supportPoints].forEach((point, index) => {
      pushSegmentStroke(
        `${pitchDivider.key}-support-${index}`,
        toWorldPoint(point, 0),
        toWorldPoint(point, pitchDivider.heightMm),
        "rgba(123, 228, 255, 0.98)",
        2.25,
        1,
        0.08
      );
    });
  }

  for (const post of scene.posts) {
    const halfWidthMm = 42;
    const groundX = post.point.x;
    const groundZ = post.point.y;
    const postFaces = [
      {
        key: `${post.key}-front`,
        points: [
          { x: groundX - halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm },
          { x: groundX - halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm }
        ],
        fill: "rgba(34, 42, 51, 0.88)"
      },
      {
        key: `${post.key}-side`,
        points: [
          { x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: 0, z: groundZ + halfWidthMm },
          { x: groundX + halfWidthMm, y: post.heightMm, z: groundZ + halfWidthMm },
          { x: groundX + halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm }
        ],
        fill: "rgba(22, 30, 38, 0.92)"
      },
      {
        key: `${post.key}-top`,
        points: [
          { x: groundX - halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: post.heightMm, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: post.heightMm, z: groundZ + halfWidthMm },
          { x: groundX - halfWidthMm, y: post.heightMm, z: groundZ + halfWidthMm }
        ],
        fill: "rgba(96, 109, 121, 0.96)"
      }
    ];

    postFaces.forEach((face) => {
      pushFace(face.key, face.points, face.fill, "rgba(14, 20, 27, 0.84)", 0.82, 1);
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

      const gateFaces = [
        {
          key: `${gate.key}-leaf-${leafIndex}-front`,
          points: [
            { x: frontEdge.start.x, y: 0, z: frontEdge.start.z },
            { x: frontEdge.end.x, y: 0, z: frontEdge.end.z },
            { x: frontEdge.end.x, y: gate.heightMm, z: frontEdge.end.z },
            { x: frontEdge.start.x, y: gate.heightMm, z: frontEdge.start.z }
          ],
          fill: GATE_PALETTE.frontFill
        },
        {
          key: `${gate.key}-leaf-${leafIndex}-top`,
          points: [
            { x: frontEdge.start.x, y: gate.heightMm, z: frontEdge.start.z },
            { x: frontEdge.end.x, y: gate.heightMm, z: frontEdge.end.z },
            { x: outerEdge.end.x, y: gate.heightMm, z: outerEdge.end.z },
            { x: outerEdge.start.x, y: gate.heightMm, z: outerEdge.start.z }
          ],
          fill: GATE_PALETTE.topFill
        },
        {
          key: `${gate.key}-leaf-${leafIndex}-side`,
          points: [
            { x: frontEdge.end.x, y: 0, z: frontEdge.end.z },
            { x: outerEdge.end.x, y: 0, z: outerEdge.end.z },
            { x: outerEdge.end.x, y: gate.heightMm, z: outerEdge.end.z },
            { x: frontEdge.end.x, y: gate.heightMm, z: frontEdge.end.z }
          ],
          fill: GATE_PALETTE.sideFill
        }
      ];
      gateFaces.forEach((face) => {
        pushFace(face.key, face.points, face.fill, GATE_PALETTE.stroke, 1, 1, 0.12);
      });

      pushSegmentStroke(
        `${gate.key}-leaf-${leafIndex}-brace`,
        { x: frontEdge.start.x, y: 0, z: frontEdge.start.z },
        { x: frontEdge.end.x, y: gate.heightMm, z: frontEdge.end.z },
        GATE_PALETTE.brace,
        1.3,
        1,
        0.2
      );
    }
  }

  for (const basketballPost of scene.basketballPosts) {
    const halfWidthMm = 36;
    const groundX = basketballPost.point.x;
    const groundZ = basketballPost.point.y;
    const topY = basketballPost.heightMm;
    const armHeightMm = topY - 180;
    const columnFaces = [
      {
        key: `${basketballPost.key}-front`,
        points: [
          { x: groundX - halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm },
          { x: groundX - halfWidthMm, y: topY, z: groundZ - halfWidthMm }
        ],
        fill: "rgba(42, 70, 154, 0.88)"
      },
      {
        key: `${basketballPost.key}-side`,
        points: [
          { x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: 0, z: groundZ + halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ + halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm }
        ],
        fill: "rgba(29, 53, 127, 0.92)"
      },
      {
        key: `${basketballPost.key}-top`,
        points: [
          { x: groundX - halfWidthMm, y: topY, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ + halfWidthMm },
          { x: groundX - halfWidthMm, y: topY, z: groundZ + halfWidthMm }
        ],
        fill: "rgba(132, 165, 255, 0.96)"
      }
    ];
    columnFaces.forEach((face) => {
      pushFace(face.key, face.points, face.fill, "rgba(16, 29, 75, 0.84)", 0.84, 1);
    });

    const armEnd = {
      x: basketballPost.point.x + basketballPost.normal.x * basketballPost.armLengthMm,
      y: basketballPost.point.y + basketballPost.normal.y * basketballPost.armLengthMm
    };
    pushSegmentStroke(
      `${basketballPost.key}-arm`,
      { x: basketballPost.point.x, y: armHeightMm, z: basketballPost.point.y },
      { x: armEnd.x, y: armHeightMm, z: armEnd.y },
      "rgba(255, 156, 79, 0.94)",
      2.2,
      1,
      0.2
    );

    const tangentLength = Math.hypot(basketballPost.normal.x, basketballPost.normal.y) || 1;
    const screenTangent = {
      x: -basketballPost.normal.y / tangentLength,
      y: basketballPost.normal.x / tangentLength
    };
    const boardCenter = {
      x: armEnd.x - basketballPost.normal.x * 140,
      y: armEnd.y - basketballPost.normal.y * 140
    };
    const boardHalfWidthMm = 420;
    const boardHalfHeightMm = 300;
    pushFace(
      `${basketballPost.key}-backboard`,
      [
        toWorldPoint(
          {
            x: boardCenter.x - screenTangent.x * boardHalfWidthMm,
            y: boardCenter.y - screenTangent.y * boardHalfWidthMm
          },
          armHeightMm - boardHalfHeightMm
        ),
        toWorldPoint(
          {
            x: boardCenter.x + screenTangent.x * boardHalfWidthMm,
            y: boardCenter.y + screenTangent.y * boardHalfWidthMm
          },
          armHeightMm - boardHalfHeightMm
        ),
        toWorldPoint(
          {
            x: boardCenter.x + screenTangent.x * boardHalfWidthMm,
            y: boardCenter.y + screenTangent.y * boardHalfWidthMm
          },
          armHeightMm + boardHalfHeightMm
        ),
        toWorldPoint(
          {
            x: boardCenter.x - screenTangent.x * boardHalfWidthMm,
            y: boardCenter.y - screenTangent.y * boardHalfWidthMm
          },
          armHeightMm + boardHalfHeightMm
        )
      ],
      "rgba(244, 250, 255, 0.88)",
      "rgba(87, 104, 121, 0.9)",
      0.9,
      1,
      0.12
    );

    const hoopAnchor = projectVisiblePoint({
      x: boardCenter.x - basketballPost.normal.x * 110,
      y: armHeightMm - 40,
      z: boardCenter.y - basketballPost.normal.y * 110
    });
    if (!hoopAnchor) {
      continue;
    }

    faces.push({
      key: `${basketballPost.key}-hoop`,
      points: formatPolygonPoints([
        { x: hoopAnchor.x - 8, y: hoopAnchor.y - 3, depth: hoopAnchor.depth },
        { x: hoopAnchor.x + 8, y: hoopAnchor.y - 3, depth: hoopAnchor.depth },
        { x: hoopAnchor.x + 8, y: hoopAnchor.y + 3, depth: hoopAnchor.depth },
        { x: hoopAnchor.x - 8, y: hoopAnchor.y + 3, depth: hoopAnchor.depth }
      ]),
      fill: "rgba(255, 151, 70, 0.98)",
      stroke: "rgba(168, 92, 33, 0.92)",
      strokeWidth: 0.8,
      opacity: 1,
      depth: hoopAnchor.depth + 0.22
    });
  }

  for (const floodlightColumn of scene.floodlightColumns) {
    const halfWidthMm = 54;
    const groundX = floodlightColumn.point.x;
    const groundZ = floodlightColumn.point.y;
    const topY = floodlightColumn.heightMm;
    const columnFaces = [
      {
        key: `${floodlightColumn.key}-front`,
        points: [
          { x: groundX - halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm },
          { x: groundX - halfWidthMm, y: topY, z: groundZ - halfWidthMm }
        ],
        fill: "rgba(147, 147, 157, 0.9)"
      },
      {
        key: `${floodlightColumn.key}-side`,
        points: [
          { x: groundX + halfWidthMm, y: 0, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: 0, z: groundZ + halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ + halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm }
        ],
        fill: "rgba(104, 106, 117, 0.94)"
      },
      {
        key: `${floodlightColumn.key}-top`,
        points: [
          { x: groundX - halfWidthMm, y: topY, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ - halfWidthMm },
          { x: groundX + halfWidthMm, y: topY, z: groundZ + halfWidthMm },
          { x: groundX - halfWidthMm, y: topY, z: groundZ + halfWidthMm }
        ],
        fill: "rgba(220, 223, 232, 0.98)"
      }
    ];
    columnFaces.forEach((face) => {
      pushFace(face.key, face.points, face.fill, "rgba(56, 60, 72, 0.82)", 0.9, 1);
    });

    const forward = floodlightColumn.normal;
    const across = { x: -forward.y, y: forward.x };
    const barHalfWidth = floodlightColumn.barWidthMm / 2;
    const barCenterHeightMm = topY - 220;
    pushSegmentStroke(
      `${floodlightColumn.key}-bar`,
      {
        x: floodlightColumn.point.x - across.x * barHalfWidth,
        y: barCenterHeightMm,
        z: floodlightColumn.point.y - across.y * barHalfWidth
      },
      {
        x: floodlightColumn.point.x + across.x * barHalfWidth,
        y: barCenterHeightMm,
        z: floodlightColumn.point.y + across.y * barHalfWidth
      },
      "rgba(255, 243, 177, 0.96)",
      2.4,
      1,
      0.2
    );
  }

  for (const overlay of scene.cutOverlays) {
    const palette = OVERLAY_PALETTE[overlay.mode];
    const frontEdge = {
      start: toGroundPoint(overlay.start),
      end: toGroundPoint(overlay.end)
    };
    const outerEdge = offsetEdge(frontEdge.start, frontEdge.end, OVERLAY_TRACK_BASE_OFFSET_MM);

    const overlayFaces = [
      {
        key: `${overlay.key}-front`,
        points: [
          { x: frontEdge.start.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.end.z },
          { x: frontEdge.end.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.end.z },
          { x: frontEdge.start.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.start.z }
        ],
        fill: palette.frontFill
      },
      {
        key: `${overlay.key}-top`,
        points: [
          { x: frontEdge.start.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.start.z },
          { x: frontEdge.end.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.end.z },
          { x: outerEdge.end.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: outerEdge.end.z },
          { x: outerEdge.start.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: outerEdge.start.z }
        ],
        fill: palette.topFill
      },
      {
        key: `${overlay.key}-side`,
        points: [
          { x: frontEdge.end.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.end.z },
          { x: outerEdge.end.x, y: overlay.baseHeightMm + OVERLAY_TRACK_LIFT_MM, z: outerEdge.end.z },
          { x: outerEdge.end.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: outerEdge.end.z },
          { x: frontEdge.end.x, y: overlay.baseHeightMm + overlay.heightMm + OVERLAY_TRACK_LIFT_MM, z: frontEdge.end.z }
        ],
        fill: palette.sideFill
      }
    ];

    overlayFaces.forEach((face) => {
      pushFace(face.key, face.points, face.fill, palette.stroke, 1.16, 0.98, 0.08);
    });

    const badge = createOverlayBadge(overlay, projectVisiblePoint);
    if (badge) {
      badges.push(badge);
    }
  }

  for (const link of scene.reuseLinks) {
    const projectedLink = projectPolyline([
      link.start,
      {
        x: (link.start.x + link.end.x) / 2,
        y: Math.max(link.start.y, link.end.y) + 440,
        z: (link.start.z + link.end.z) / 2
      },
      link.end
    ]);
    if (!projectedLink || projectedLink.length !== 3) {
      continue;
    }
    const start = projectedLink[0]!;
    const control = projectedLink[1]!;
    const end = projectedLink[2]!;
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

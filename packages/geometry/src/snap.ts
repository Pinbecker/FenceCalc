import type { PointMm } from "@fence-estimator/contracts";

export const DEFAULT_SNAP_INCREMENT_DEGREES = 5;

export function distanceMm(a: PointMm, b: PointMm): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapPointToAngle(
  start: PointMm,
  rawEnd: PointMm,
  incrementDegrees = DEFAULT_SNAP_INCREMENT_DEGREES,
): PointMm {
  const dx = rawEnd.x - start.x;
  const dy = rawEnd.y - start.y;
  const radius = Math.hypot(dx, dy);
  if (radius === 0) {
    return rawEnd;
  }

  const angle = Math.atan2(dy, dx);
  const increment = (incrementDegrees * Math.PI) / 180;
  const snapped = Math.round(angle / increment) * increment;

  return {
    x: Math.round(start.x + Math.cos(snapped) * radius),
    y: Math.round(start.y + Math.sin(snapped) * radius)
  };
}

export function quantizePoint(point: PointMm, precisionMm = 1): PointMm {
  return {
    x: Math.round(point.x / precisionMm) * precisionMm,
    y: Math.round(point.y / precisionMm) * precisionMm
  };
}

export function pointKey(point: PointMm): string {
  return `${point.x}:${point.y}`;
}


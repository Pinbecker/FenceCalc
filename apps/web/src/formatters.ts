import type { PointMm } from "@fence-estimator/contracts";

export function formatLengthMm(lengthMm: number): string {
  return `${(lengthMm / 1000).toFixed(2)}m`;
}

export function formatMetersInputFromMm(mm: number): string {
  return (mm / 1000).toFixed(2);
}

export function formatPointMeters(point: PointMm): string {
  return `${(point.x / 1000).toFixed(2)}m, ${(point.y / 1000).toFixed(2)}m`;
}

export function formatHeightLabelFromMm(heightMm: number): string {
  return `${(heightMm / 1000).toFixed(heightMm % 1000 === 0 ? 0 : 1)}m`;
}

export function formatDistanceLabel(lengthMm: number): string {
  if (lengthMm >= 1000000) {
    return `${(lengthMm / 1000000).toFixed(1)}km`;
  }
  return `${(lengthMm / 1000).toFixed(lengthMm >= 10000 ? 0 : 1)}m`;
}

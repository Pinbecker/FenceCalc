import type { PointMm } from "@fence-estimator/contracts";

export interface Vector2 {
  x: number;
  y: number;
}

export const EPSILON = 1e-9;

export function subtract(a: PointMm, b: PointMm): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

export function magnitude(v: Vector2): number {
  return Math.hypot(v.x, v.y);
}

export function normalize(v: Vector2): Vector2 {
  const len = magnitude(v);
  if (len < EPSILON) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

export function angleBetweenDegrees(a: Vector2, b: Vector2): number {
  const denominator = magnitude(a) * magnitude(b);
  if (denominator < EPSILON) {
    return 0;
  }
  const cosTheta = Math.min(1, Math.max(-1, dot(a, b) / denominator));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

export function areOpposite(a: Vector2, b: Vector2, toleranceDegrees = 0.5): boolean {
  const angle = angleBetweenDegrees(a, b);
  return Math.abs(180 - angle) <= toleranceDegrees;
}


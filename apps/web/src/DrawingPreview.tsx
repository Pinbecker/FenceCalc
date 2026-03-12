import type { LayoutModel, PointMm } from "@fence-estimator/contracts";

import { getSegmentColor } from "./editor/constants";

interface DrawingPreviewProps {
  layout: LayoutModel;
  label?: string;
  variant?: "card" | "inline";
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

function getBounds(layout: LayoutModel): Bounds | null {
  const points = layout.segments.flatMap((segment) => [segment.start, segment.end]);
  const firstPoint = points[0];
  if (!firstPoint) {
    return null;
  }

  return points.reduce<Bounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }),
    {
      minX: firstPoint.x,
      minY: firstPoint.y,
      maxX: firstPoint.x,
      maxY: firstPoint.y
    },
  );
}

function buildProjector(bounds: Bounds, viewportWidth: number, viewportHeight: number, padding: number) {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((viewportWidth - padding * 2) / width, (viewportHeight - padding * 2) / height);
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const offsetX = (viewportWidth - contentWidth) / 2;
  const offsetY = (viewportHeight - contentHeight) / 2;

  return (point: PointMm): ProjectedPoint => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: offsetY + (point.y - bounds.minY) * scale
  });
}

function buildNodeKey(point: PointMm): string {
  return `${point.x}:${point.y}`;
}

export function DrawingPreview({ layout, label = "Drawing", variant = "card" }: DrawingPreviewProps) {
  const bounds = getBounds(layout);
  const width = variant === "inline" ? 132 : 240;
  const height = variant === "inline" ? 92 : 156;
  const padding = variant === "inline" ? 12 : 18;

  if (!bounds) {
    return (
      <div className={`drawing-preview drawing-preview-${variant} drawing-preview-empty`}>
        <span>Blank drawing</span>
      </div>
    );
  }

  const projectPoint = buildProjector(bounds, width, height, padding);
  const nodes = new Map<string, ProjectedPoint>();

  for (const segment of layout.segments) {
    nodes.set(buildNodeKey(segment.start), projectPoint(segment.start));
    nodes.set(buildNodeKey(segment.end), projectPoint(segment.end));
  }

  return (
    <svg
      className={`drawing-preview drawing-preview-${variant}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Drawing preview for ${label}`}
    >
      <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx="20" fill="#f2ebe0" stroke="rgba(32, 47, 43, 0.08)" />
      <rect x="10" y="10" width={width - 20} height={height - 20} rx="16" fill="#fcf7f0" />
      <g opacity="0.6" stroke="#e4d7c5" strokeWidth="1">
        {Array.from({ length: 5 }, (_, index) => {
          const y = 20 + index * ((height - 40) / 4);
          return <line key={`h-${index}`} x1="16" y1={y} x2={width - 16} y2={y} />;
        })}
        {Array.from({ length: 6 }, (_, index) => {
          const x = 18 + index * ((width - 36) / 5);
          return <line key={`v-${index}`} x1={x} y1="16" x2={x} y2={height - 16} />;
        })}
      </g>
      <g strokeLinecap="round" strokeLinejoin="round">
        {layout.segments.map((segment) => {
          const start = projectPoint(segment.start);
          const end = projectPoint(segment.end);
          return (
            <g key={segment.id}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="rgba(39, 54, 50, 0.12)" strokeWidth="8" />
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={getSegmentColor(segment.spec)} strokeWidth="5" />
            </g>
          );
        })}
        {layout.gates?.map((gate) => {
          const segment = layout.segments.find((entry) => entry.id === gate.segmentId);
          if (!segment) {
            return null;
          }

          const segmentLengthMm = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) || 1;
          const startRatio = gate.startOffsetMm / segmentLengthMm;
          const endRatio = gate.endOffsetMm / segmentLengthMm;
          const gateStart = projectPoint({
            x: segment.start.x + (segment.end.x - segment.start.x) * startRatio,
            y: segment.start.y + (segment.end.y - segment.start.y) * startRatio
          });
          const gateEnd = projectPoint({
            x: segment.start.x + (segment.end.x - segment.start.x) * endRatio,
            y: segment.start.y + (segment.end.y - segment.start.y) * endRatio
          });

          return (
            <g key={gate.id}>
              <line x1={gateStart.x} y1={gateStart.y} x2={gateEnd.x} y2={gateEnd.y} stroke="#fffaf3" strokeWidth="8" />
              <line x1={gateStart.x} y1={gateStart.y} x2={gateEnd.x} y2={gateEnd.y} stroke="#b35c3c" strokeWidth="4" />
            </g>
          );
        })}
      </g>
      <g>
        {Array.from(nodes.entries()).map(([key, point]) => (
          <g key={key}>
            <circle cx={point.x} cy={point.y} r={variant === "inline" ? "3.5" : "4.5"} fill="#fffaf3" />
            <circle cx={point.x} cy={point.y} r={variant === "inline" ? "2" : "2.5"} fill="#31433f" />
          </g>
        ))}
      </g>
    </svg>
  );
}

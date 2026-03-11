import type { LayoutModel } from "@fence-estimator/contracts";

interface DrawingPreviewProps {
  layout: LayoutModel;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
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

function project(value: number, min: number, size: number, viewportSize: number, padding: number): number {
  if (size === 0) {
    return viewportSize / 2;
  }
  return padding + ((value - min) / size) * (viewportSize - padding * 2);
}

export function DrawingPreview({ layout }: DrawingPreviewProps) {
  const bounds = getBounds(layout);

  if (!bounds) {
    return (
      <div className="drawing-preview drawing-preview-empty">
        <span>Blank drawing</span>
      </div>
    );
  }

  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const size = Math.max(width, height);

  return (
    <svg className="drawing-preview" viewBox="0 0 220 140" role="img" aria-label="Drawing preview">
      <defs>
        <linearGradient id="drawing-preview-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#142737" />
          <stop offset="100%" stopColor="#0b141d" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="220" height="140" rx="18" fill="url(#drawing-preview-fill)" />
      <g opacity="0.22" stroke="#35536c" strokeWidth="1">
        <line x1="20" y1="35" x2="200" y2="35" />
        <line x1="20" y1="70" x2="200" y2="70" />
        <line x1="20" y1="105" x2="200" y2="105" />
      </g>
      <g strokeLinecap="round" strokeLinejoin="round">
        {layout.segments.map((segment) => {
          const x1 = project(segment.start.x, bounds.minX, size, 220, 18);
          const y1 = project(segment.start.y, bounds.minY, size, 140, 18);
          const x2 = project(segment.end.x, bounds.minX, size, 220, 18);
          const y2 = project(segment.end.y, bounds.minY, size, 140, 18);
          return <line key={segment.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d7e7f7" strokeWidth="4" />;
        })}
        {layout.gates?.map((gate) => {
          const segment = layout.segments.find((entry) => entry.id === gate.segmentId);
          if (!segment) {
            return null;
          }
          const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) || 1;
          const startRatio = gate.startOffsetMm / length;
          const endRatio = gate.endOffsetMm / length;
          const gateStartX = segment.start.x + (segment.end.x - segment.start.x) * startRatio;
          const gateStartY = segment.start.y + (segment.end.y - segment.start.y) * startRatio;
          const gateEndX = segment.start.x + (segment.end.x - segment.start.x) * endRatio;
          const gateEndY = segment.start.y + (segment.end.y - segment.start.y) * endRatio;
          return (
            <line
              key={gate.id}
              x1={project(gateStartX, bounds.minX, size, 220, 18)}
              y1={project(gateStartY, bounds.minY, size, 140, 18)}
              x2={project(gateEndX, bounds.minX, size, 220, 18)}
              y2={project(gateEndY, bounds.minY, size, 140, 18)}
              stroke="#ff7a45"
              strokeWidth="5"
            />
          );
        })}
      </g>
    </svg>
  );
}


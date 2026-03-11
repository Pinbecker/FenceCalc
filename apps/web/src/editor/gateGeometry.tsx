import { Circle, Group, Line, Text } from "react-konva";
import type { GateType, LayoutSegment, PointMm } from "@fence-estimator/contracts";
import { distanceMm } from "@fence-estimator/geometry";

import {
  DRAW_INCREMENT_MM,
  DOUBLE_GATE_WIDTH_MM,
  GATE_LABEL_OFFSET_PX,
  GATE_OPEN_ANGLE_DEGREES,
  LABEL_FONT_SIZE_PX,
  MIN_SEGMENT_MM,
  SINGLE_GATE_WIDTH_MM
} from "./constants.js";
import { normalizeVector, rotateVector } from "./editorMath.js";
import type { GateInsertionPreview, GateVisual, LineSnapPreview } from "./types.js";

export function renderGateSymbol(
  gate: GateVisual,
  scale: number,
  style: {
    frameStroke: string;
    leafStroke: string;
    swingStroke: string;
    markerFill: string;
    labelColor: string;
    opacity?: number;
  },
  label: string | null,
  keyOverride?: string,
) {
  const postTickHalfMm = Math.max(120, Math.min(260, gate.widthMm * 0.16));
  const strokeWidth = 2.6 / scale;
  const sweepStrokeWidth = 1.7 / scale;
  const markerRadius = 3.2 / scale;
  const labelOffsetMm = Math.max(220, Math.min(420, gate.widthMm * 0.18)) + GATE_LABEL_OFFSET_PX / scale;
  const labelY = gate.centerPoint.y + gate.normal.y * labelOffsetMm;
  const labelX = gate.centerPoint.x + gate.normal.x * labelOffsetMm;

  const startPostTop = {
    x: gate.startPoint.x + gate.normal.x * postTickHalfMm,
    y: gate.startPoint.y + gate.normal.y * postTickHalfMm
  };
  const startPostBottom = {
    x: gate.startPoint.x - gate.normal.x * postTickHalfMm,
    y: gate.startPoint.y - gate.normal.y * postTickHalfMm
  };
  const endPostTop = {
    x: gate.endPoint.x + gate.normal.x * postTickHalfMm,
    y: gate.endPoint.y + gate.normal.y * postTickHalfMm
  };
  const endPostBottom = {
    x: gate.endPoint.x - gate.normal.x * postTickHalfMm,
    y: gate.endPoint.y - gate.normal.y * postTickHalfMm
  };

  const key = keyOverride ?? gate.key;

  if (gate.leafCount === 1) {
    const openDirection = rotateVector(gate.tangent, GATE_OPEN_ANGLE_DEGREES);
    const controlDirection = normalizeVector({
      x: gate.tangent.x + openDirection.x,
      y: gate.tangent.y + openDirection.y
    }) ?? openDirection;
    const openTip = {
      x: gate.startPoint.x + openDirection.x * gate.widthMm,
      y: gate.startPoint.y + openDirection.y * gate.widthMm
    };
    const sweepControl = {
      x: gate.startPoint.x + controlDirection.x * gate.widthMm * 1.1,
      y: gate.startPoint.y + controlDirection.y * gate.widthMm * 1.1
    };

    return (
      <Group key={key} listening={false} opacity={style.opacity ?? 1}>
        <Line
          points={[gate.startPoint.x, gate.startPoint.y, gate.endPoint.x, gate.endPoint.y]}
          stroke={style.frameStroke}
          strokeWidth={strokeWidth}
          dash={[9 / scale, 6 / scale]}
          lineCap="round"
        />
        <Line
          points={[startPostTop.x, startPostTop.y, startPostBottom.x, startPostBottom.y]}
          stroke={style.frameStroke}
          strokeWidth={strokeWidth}
          lineCap="round"
        />
        <Line
          points={[endPostTop.x, endPostTop.y, endPostBottom.x, endPostBottom.y]}
          stroke={style.frameStroke}
          strokeWidth={strokeWidth}
          lineCap="round"
        />
        <Line
          points={[gate.startPoint.x, gate.startPoint.y, openTip.x, openTip.y]}
          stroke={style.leafStroke}
          strokeWidth={strokeWidth}
          lineCap="round"
        />
        <Line
          points={[gate.endPoint.x, gate.endPoint.y, sweepControl.x, sweepControl.y, openTip.x, openTip.y]}
          stroke={style.swingStroke}
          strokeWidth={sweepStrokeWidth}
          dash={[8 / scale, 5 / scale]}
          bezier
          lineCap="round"
        />
        <Circle x={gate.startPoint.x} y={gate.startPoint.y} radius={markerRadius} fill={style.markerFill} />
        {label ? (
          <Text
            x={labelX}
            y={labelY}
            text={label}
            fontSize={LABEL_FONT_SIZE_PX / scale}
            fill={style.labelColor}
            offsetX={(label.length * 3.6) / scale}
            offsetY={10 / scale}
          />
        ) : null}
      </Group>
    );
  }

  const leafLengthMm = gate.widthMm / 2;
  const rightClosedDirection = {
    x: -gate.tangent.x,
    y: -gate.tangent.y
  };
  const leftOpenDirection = rotateVector(gate.tangent, GATE_OPEN_ANGLE_DEGREES);
  const rightOpenDirection = rotateVector(rightClosedDirection, -GATE_OPEN_ANGLE_DEGREES);
  const leftControlDirection = normalizeVector({
    x: gate.tangent.x + leftOpenDirection.x,
    y: gate.tangent.y + leftOpenDirection.y
  }) ?? leftOpenDirection;
  const rightControlDirection = normalizeVector({
    x: rightClosedDirection.x + rightOpenDirection.x,
    y: rightClosedDirection.y + rightOpenDirection.y
  }) ?? rightOpenDirection;

  const leftOpenTip = {
    x: gate.startPoint.x + leftOpenDirection.x * leafLengthMm,
    y: gate.startPoint.y + leftOpenDirection.y * leafLengthMm
  };
  const rightOpenTip = {
    x: gate.endPoint.x + rightOpenDirection.x * leafLengthMm,
    y: gate.endPoint.y + rightOpenDirection.y * leafLengthMm
  };
  const leftSweepControl = {
    x: gate.startPoint.x + leftControlDirection.x * leafLengthMm * 1.1,
    y: gate.startPoint.y + leftControlDirection.y * leafLengthMm * 1.1
  };
  const rightSweepControl = {
    x: gate.endPoint.x + rightControlDirection.x * leafLengthMm * 1.1,
    y: gate.endPoint.y + rightControlDirection.y * leafLengthMm * 1.1
  };

  return (
    <Group key={key} listening={false} opacity={style.opacity ?? 1}>
      <Line
        points={[gate.startPoint.x, gate.startPoint.y, gate.endPoint.x, gate.endPoint.y]}
        stroke={style.frameStroke}
        strokeWidth={strokeWidth}
        dash={[9 / scale, 6 / scale]}
        lineCap="round"
      />
      <Line
        points={[startPostTop.x, startPostTop.y, startPostBottom.x, startPostBottom.y]}
        stroke={style.frameStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[endPostTop.x, endPostTop.y, endPostBottom.x, endPostBottom.y]}
        stroke={style.frameStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[gate.startPoint.x, gate.startPoint.y, leftOpenTip.x, leftOpenTip.y]}
        stroke={style.leafStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[gate.endPoint.x, gate.endPoint.y, rightOpenTip.x, rightOpenTip.y]}
        stroke={style.leafStroke}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
      <Line
        points={[gate.centerPoint.x, gate.centerPoint.y, leftSweepControl.x, leftSweepControl.y, leftOpenTip.x, leftOpenTip.y]}
        stroke={style.swingStroke}
        strokeWidth={sweepStrokeWidth}
        dash={[8 / scale, 5 / scale]}
        bezier
        lineCap="round"
      />
      <Line
        points={[gate.centerPoint.x, gate.centerPoint.y, rightSweepControl.x, rightSweepControl.y, rightOpenTip.x, rightOpenTip.y]}
        stroke={style.swingStroke}
        strokeWidth={sweepStrokeWidth}
        dash={[8 / scale, 5 / scale]}
        bezier
        lineCap="round"
      />
      <Circle x={gate.startPoint.x} y={gate.startPoint.y} radius={markerRadius} fill={style.markerFill} />
      <Circle x={gate.endPoint.x} y={gate.endPoint.y} radius={markerRadius} fill={style.markerFill} />
      {label ? (
        <Text
          x={labelX}
          y={labelY}
          text={label}
          fontSize={LABEL_FONT_SIZE_PX / scale}
          fill={style.labelColor}
          offsetX={(label.length * 3.6) / scale}
          offsetY={10 / scale}
        />
      ) : null}
    </Group>
  );
}

export function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= 0) {
    return segment.start;
  }
  const t = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * t,
    y: segment.start.y + (segment.end.y - segment.start.y) * t
  };
}

export function projectPointOntoSegment(point: PointMm, segment: LayoutSegment): { projected: PointMm; offsetMm: number; distanceMm: number } {
  const vx = segment.end.x - segment.start.x;
  const vy = segment.end.y - segment.start.y;
  const segmentLengthSquared = vx * vx + vy * vy;
  if (segmentLengthSquared <= 0) {
    return {
      projected: segment.start,
      offsetMm: 0,
      distanceMm: distanceMm(point, segment.start)
    };
  }
  const wx = point.x - segment.start.x;
  const wy = point.y - segment.start.y;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / segmentLengthSquared));
  const projected = {
    x: segment.start.x + vx * t,
    y: segment.start.y + vy * t
  };
  return {
    projected,
    offsetMm: distanceMm(segment.start, projected),
    distanceMm: distanceMm(point, projected)
  };
}

export function findNearestSegmentSnap(point: PointMm, segments: LayoutSegment[], maxDistanceMm: number): LineSnapPreview | null {
  let best: LineSnapPreview | null = null;

  for (const segment of segments) {
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0) {
      continue;
    }
    const projection = projectPointOntoSegment(point, segment);
    if (projection.distanceMm > maxDistanceMm) {
      continue;
    }
    const snappedOffsetMm = Math.max(
      0,
      Math.min(segmentLengthMm, Math.round(projection.offsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM),
    );
    const snappedPoint = interpolateAlongSegment(segment, snappedOffsetMm);
    const snappedDistanceMm = distanceMm(point, snappedPoint);
    if (snappedDistanceMm > maxDistanceMm) {
      continue;
    }
    if (!best || snappedDistanceMm < best.distanceMm) {
      best = {
        segment,
        point: snappedPoint,
        startOffsetMm: snappedOffsetMm,
        endOffsetMm: Math.max(0, segmentLengthMm - snappedOffsetMm),
        distanceMm: snappedDistanceMm
      };
    }
  }

  return best;
}

export function resolveGateWidthMm(gateType: GateType, customGateWidthMm: number): number {
  if (gateType === "SINGLE_LEAF") {
    return SINGLE_GATE_WIDTH_MM;
  }
  if (gateType === "DOUBLE_LEAF") {
    return DOUBLE_GATE_WIDTH_MM;
  }
  return customGateWidthMm;
}

export function buildGatePreview(segment: LayoutSegment, centerOffsetMm: number, requestedWidthMm: number): GateInsertionPreview | null {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm < MIN_SEGMENT_MM * 2 + DRAW_INCREMENT_MM) {
    return null;
  }

  const maxWidthMm = Math.max(DRAW_INCREMENT_MM, segmentLengthMm - MIN_SEGMENT_MM * 2);
  const widthMm = Math.max(DRAW_INCREMENT_MM, Math.min(requestedWidthMm, maxWidthMm));
  let startOffsetMm = centerOffsetMm - widthMm / 2;
  let endOffsetMm = centerOffsetMm + widthMm / 2;
  startOffsetMm = Math.max(MIN_SEGMENT_MM, Math.min(segmentLengthMm - MIN_SEGMENT_MM - widthMm, startOffsetMm));
  endOffsetMm = Math.min(segmentLengthMm - MIN_SEGMENT_MM, startOffsetMm + widthMm);

  startOffsetMm = Math.round(startOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  endOffsetMm = Math.round(endOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  if (endOffsetMm - startOffsetMm < DRAW_INCREMENT_MM) {
    return null;
  }
  if (startOffsetMm < MIN_SEGMENT_MM || segmentLengthMm - endOffsetMm < MIN_SEGMENT_MM) {
    return null;
  }

  const entryPoint = interpolateAlongSegment(segment, startOffsetMm);
  const exitPoint = interpolateAlongSegment(segment, endOffsetMm);
  const tangent = normalizeVector({
    x: exitPoint.x - entryPoint.x,
    y: exitPoint.y - entryPoint.y
  });
  if (!tangent) {
    return null;
  }

  return {
    segment,
    segmentLengthMm,
    startOffsetMm,
    endOffsetMm,
    widthMm: endOffsetMm - startOffsetMm,
    entryPoint,
    exitPoint,
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
    targetPoint: interpolateAlongSegment(segment, centerOffsetMm)
  };
}

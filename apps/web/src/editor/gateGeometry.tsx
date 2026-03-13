import { Circle, Group, Line } from "react-konva";

import {
  GATE_LABEL_OFFSET_PX,
  GATE_OPEN_ANGLE_DEGREES,
  LABEL_FONT_SIZE_PX
} from "./constants.js";
import { normalizeVector, rotateVector } from "./editorMath.js";
import { renderCanvasLabel } from "./stage/canvasLabel.js";
import type { GateVisual } from "./types.js";

export {
  buildGatePreview,
  findNearestSegmentSnap,
  interpolateAlongSegment,
  projectPointOntoSegment,
  resolveGateWidthMm
} from "./gateMath.js";

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
  const strokeWidth = 2.2 / scale;
  const sweepStrokeWidth = 1.35 / scale;
  const markerRadius = 2.8 / scale;
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
        {label
          ? renderCanvasLabel({
              keyValue: `${key}-label`,
              x: labelX,
              y: labelY,
              text: label,
              scale,
              fill: "rgba(17, 25, 24, 0.78)",
              stroke: "rgba(255, 255, 255, 0.12)",
              textColor: style.labelColor,
              fontSizePx: LABEL_FONT_SIZE_PX,
              minWidthPx: 60
            })
          : null}
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
      {label
        ? renderCanvasLabel({
            keyValue: `${key}-label`,
            x: labelX,
            y: labelY,
            text: label,
            scale,
            fill: "rgba(17, 25, 24, 0.78)",
            stroke: "rgba(255, 255, 255, 0.12)",
            textColor: style.labelColor,
            fontSizePx: LABEL_FONT_SIZE_PX,
            minWidthPx: 60
          })
        : null}
    </Group>
  );
}

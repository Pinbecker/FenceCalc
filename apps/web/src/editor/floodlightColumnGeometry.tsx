import { Circle, Line } from "react-konva";

import type { FloodlightColumnVisual } from "./types.js";

function toWorldPoint(
  origin: { x: number; y: number },
  across: { x: number; y: number },
  forward: { x: number; y: number },
  localX: number,
  localY: number
) {
  return {
    x: origin.x + across.x * localX + forward.x * localY,
    y: origin.y + across.y * localX + forward.y * localY
  };
}

export function renderFloodlightColumnSymbol(
  floodlightColumn: FloodlightColumnVisual,
  scale: number,
  palette: {
    stroke: string;
    fill: string;
    accent: string;
    opacity?: number;
  },
  keyOverride?: string,
  options?: {
    simplified?: boolean;
  }
) {
  const simplified = options?.simplified ?? false;
  const key = keyOverride ?? floodlightColumn.key;
  const poleHalfWidth = 145;
  const poleHalfHeight = 480;
  const lampBarHalfWidth = 420;
  const lampBarOffset = 760;
  const lampRadius = 130;
  const lightHousingInset = 80;
  const supportArmInset = 90;
  const forwardLength = Math.hypot(floodlightColumn.normal.x, floodlightColumn.normal.y) || 1;
  const forward = {
    x: floodlightColumn.normal.x / forwardLength,
    y: floodlightColumn.normal.y / forwardLength
  };
  const across = {
    x: -forward.y,
    y: forward.x
  };
  const poleTopLeft = toWorldPoint(floodlightColumn.point, across, forward, -poleHalfWidth, -poleHalfHeight);
  const poleTopRight = toWorldPoint(floodlightColumn.point, across, forward, poleHalfWidth, -poleHalfHeight);
  const poleBottomRight = toWorldPoint(floodlightColumn.point, across, forward, poleHalfWidth, poleHalfHeight);
  const poleBottomLeft = toWorldPoint(floodlightColumn.point, across, forward, -poleHalfWidth, poleHalfHeight);
  const lampBarStart = toWorldPoint(floodlightColumn.point, across, forward, -lampBarHalfWidth, lampBarOffset);
  const lampBarEnd = toWorldPoint(floodlightColumn.point, across, forward, lampBarHalfWidth, lampBarOffset);
  const supportArmStart = toWorldPoint(floodlightColumn.point, across, forward, 0, poleHalfHeight - supportArmInset);
  const supportArmEnd = toWorldPoint(floodlightColumn.point, across, forward, 0, lampBarOffset - supportArmInset);
  const lampLeft = toWorldPoint(
    floodlightColumn.point,
    across,
    forward,
    -lampBarHalfWidth * 0.56,
    lampBarOffset + lightHousingInset
  );
  const lampRight = toWorldPoint(
    floodlightColumn.point,
    across,
    forward,
    lampBarHalfWidth * 0.56,
    lampBarOffset + lightHousingInset
  );
  const simplifiedTip = toWorldPoint(floodlightColumn.point, across, forward, 0, 640);

  if (simplified) {
    return (
      <>
        <Line
          key={`${key}-simplified-pole`}
          points={[floodlightColumn.point.x, floodlightColumn.point.y, simplifiedTip.x, simplifiedTip.y]}
          stroke={palette.stroke}
          strokeWidth={2.4 / scale}
          lineCap="round"
          opacity={palette.opacity ?? 1}
          listening={false}
        />
        <Circle
          key={`${key}-simplified-lamp`}
          x={simplifiedTip.x}
          y={simplifiedTip.y}
          radius={180}
          fill={palette.accent}
          stroke={palette.stroke}
          strokeWidth={1.4 / scale}
          opacity={palette.opacity ?? 1}
          listening={false}
        />
      </>
    );
  }

  return (
    <>
      <Line
        key={`${key}-pole`}
        points={[
          poleTopLeft.x,
          poleTopLeft.y,
          poleTopRight.x,
          poleTopRight.y,
          poleBottomRight.x,
          poleBottomRight.y,
          poleBottomLeft.x,
          poleBottomLeft.y
        ]}
        closed
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth={1.6 / scale}
        opacity={palette.opacity ?? 1}
        listening={false}
      />
      <Line
        key={`${key}-support`}
        points={[supportArmStart.x, supportArmStart.y, supportArmEnd.x, supportArmEnd.y]}
        stroke={palette.stroke}
        strokeWidth={2.8 / scale}
        lineCap="round"
        opacity={palette.opacity ?? 1}
        listening={false}
      />
      <Line
        key={`${key}-bar`}
        points={[
          lampBarStart.x,
          lampBarStart.y,
          lampBarEnd.x,
          lampBarEnd.y
        ]}
        stroke={palette.stroke}
        strokeWidth={2.2 / scale}
        lineCap="round"
        opacity={palette.opacity ?? 1}
        listening={false}
      />
      <Circle
        key={`${key}-lamp-left`}
        x={lampLeft.x}
        y={lampLeft.y}
        radius={lampRadius}
        fill={palette.accent}
        stroke={palette.stroke}
        strokeWidth={1.4 / scale}
        opacity={palette.opacity ?? 1}
        listening={false}
      />
      <Circle
        key={`${key}-lamp-right`}
        x={lampRight.x}
        y={lampRight.y}
        radius={lampRadius}
        fill={palette.accent}
        stroke={palette.stroke}
        strokeWidth={1.4 / scale}
        opacity={palette.opacity ?? 1}
        listening={false}
      />
    </>
  );
}

import { Circle, Group, Line, Rect } from "react-konva";

import type { BasketballPostVisual } from "./types.js";

const BASKETBALL_POST_ARM_LENGTH_MM = 1800;
const BASKETBALL_POST_HOOP_RADIUS_MM = 180;

export function renderBasketballPostSymbol(
  basketballPost: BasketballPostVisual,
  scale: number,
  style: {
    stroke: string;
    accent: string;
    fill: string;
    opacity?: number;
  },
  keyOverride?: string
) {
  const key = keyOverride ?? basketballPost.key;
  const halfSize = 7.5 / scale;
  const strokeWidth = 1.55 / scale;
  const detailWidth = 1.25 / scale;
  const armEnd = {
    x: basketballPost.point.x + basketballPost.normal.x * BASKETBALL_POST_ARM_LENGTH_MM,
    y: basketballPost.point.y + basketballPost.normal.y * BASKETBALL_POST_ARM_LENGTH_MM
  };

  return (
    <Group key={key} listening={false} opacity={style.opacity ?? 1}>
      <Rect
        x={basketballPost.point.x - halfSize}
        y={basketballPost.point.y - halfSize}
        width={halfSize * 2}
        height={halfSize * 2}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={strokeWidth}
      />
      <Line
        points={[basketballPost.point.x, basketballPost.point.y, armEnd.x, armEnd.y]}
        stroke={style.accent}
        strokeWidth={detailWidth}
        lineCap="round"
      />
      <Circle
        x={armEnd.x}
        y={armEnd.y}
        radius={BASKETBALL_POST_HOOP_RADIUS_MM}
        stroke={style.accent}
        strokeWidth={detailWidth}
      />
    </Group>
  );
}

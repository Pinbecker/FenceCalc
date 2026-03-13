import { Group, Rect, Text } from "react-konva";

interface CanvasLabelProps {
  keyValue: string;
  x: number;
  y: number;
  text: string;
  scale: number;
  fill: string;
  textColor: string;
  stroke?: string;
  fontSizePx?: number;
  minWidthPx?: number;
  paddingXPx?: number;
  paddingYPx?: number;
  opacity?: number;
}

export function renderCanvasLabel({
  keyValue,
  x,
  y,
  text,
  scale,
  fill,
  textColor,
  stroke = "rgba(255,255,255,0.14)",
  fontSizePx = 12,
  minWidthPx = 0,
  paddingXPx = 10,
  paddingYPx = 6,
  opacity = 1
}: CanvasLabelProps) {
  const fontSize = fontSizePx / scale;
  const paddingX = paddingXPx / scale;
  const paddingY = paddingYPx / scale;
  const textWidth = Math.max(minWidthPx, Math.max(3, text.length) * fontSizePx * 0.54) / scale;
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const left = x - width / 2;
  const top = y - height / 2;

  return (
    <Group key={keyValue} listening={false} opacity={opacity}>
      <Rect
        x={left}
        y={top}
        width={width}
        height={height}
        cornerRadius={10 / scale}
        fill={fill}
        stroke={stroke}
        strokeWidth={1 / scale}
      />
      <Text
        x={left}
        y={top + paddingY - 0.5 / scale}
        width={width}
        text={text}
        fontSize={fontSize}
        fill={textColor}
        align="center"
        fontStyle="bold"
      />
    </Group>
  );
}

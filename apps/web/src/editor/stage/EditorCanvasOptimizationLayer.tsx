import { Arrow, Circle, Group, Layer, Line, Text } from "react-konva";

import { LABEL_FONT_SIZE_PX } from "../constants";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasOptimizationLayerProps = Pick<EditorCanvasStageProps, "selectedPlanVisual" | "view">;

export function EditorCanvasOptimizationLayer({
  selectedPlanVisual,
  view
}: EditorCanvasOptimizationLayerProps) {
  return (
    <Layer listening={false}>
      {selectedPlanVisual ? (
        <Group key={`plan-${selectedPlanVisual.plan.id}`}>
          {selectedPlanVisual.links.map((link, index) => (
            <Arrow
              key={`plan-link-${index + 1}`}
              points={[link.start.x, link.start.y, link.end.x, link.end.y]}
              stroke="#ffffff"
              fill="#ffffff"
              strokeWidth={2.2 / view.scale}
              pointerLength={11 / view.scale}
              pointerWidth={11 / view.scale}
              dash={[8 / view.scale, 6 / view.scale]}
              opacity={0.9}
            />
          ))}
          {selectedPlanVisual.cuts.map((entry) => (
            <Group key={entry.cut.id}>
              <Line
                points={[entry.start.x, entry.start.y, entry.end.x, entry.end.y]}
                stroke={entry.cut.mode === "OPEN_STOCK_PANEL" ? "#ffb347" : "#17e3d0"}
                strokeWidth={8 / view.scale}
                lineCap="round"
              />
              <Circle
                x={entry.center.x}
                y={entry.center.y}
                radius={8 / view.scale}
                fill="#061019"
                stroke="#ffffff"
                strokeWidth={1.6 / view.scale}
              />
              <Text
                x={entry.center.x}
                y={entry.center.y}
                text={String(entry.cut.step)}
                fontSize={LABEL_FONT_SIZE_PX / view.scale}
                fill="#f7fbff"
                align="center"
                verticalAlign="middle"
                offsetX={3.6 / view.scale}
                offsetY={6 / view.scale}
              />
            </Group>
          ))}
        </Group>
      ) : null}
    </Layer>
  );
}

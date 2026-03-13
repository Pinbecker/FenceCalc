import { Layer, Line } from "react-konva";

import { MAJOR_GRID_STROKE_PX, MINOR_GRID_STROKE_PX } from "../constants";
import type { EditorCanvasStageProps } from "./types";

type EditorCanvasGridLayerProps = Pick<
  EditorCanvasStageProps,
  "horizontalLines" | "verticalLines" | "view" | "visibleBounds"
>;

export function EditorCanvasGridLayer({
  horizontalLines,
  verticalLines,
  view,
  visibleBounds
}: EditorCanvasGridLayerProps) {
  return (
    <Layer listening={false}>
      {verticalLines.map((line) => (
        <Line
          key={`v-${line.coordinate}`}
          points={[line.coordinate, visibleBounds.top, line.coordinate, visibleBounds.bottom]}
          stroke={line.major ? "rgba(173, 188, 189, 0.16)" : "rgba(173, 188, 189, 0.08)"}
          strokeWidth={(line.major ? MAJOR_GRID_STROKE_PX : MINOR_GRID_STROKE_PX) / view.scale}
        />
      ))}
      {horizontalLines.map((line) => (
        <Line
          key={`h-${line.coordinate}`}
          points={[visibleBounds.left, line.coordinate, visibleBounds.right, line.coordinate]}
          stroke={line.major ? "rgba(173, 188, 189, 0.16)" : "rgba(173, 188, 189, 0.08)"}
          strokeWidth={(line.major ? MAJOR_GRID_STROKE_PX : MINOR_GRID_STROKE_PX) / view.scale}
        />
      ))}
    </Layer>
  );
}

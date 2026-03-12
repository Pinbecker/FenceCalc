import { Stage } from "react-konva";

import { EditorCanvasGeometryLayer } from "./editor/stage/EditorCanvasGeometryLayer";
import { EditorCanvasGridLayer } from "./editor/stage/EditorCanvasGridLayer";
import { EditorCanvasHud } from "./editor/stage/EditorCanvasHud";
import { EditorCanvasOptimizationLayer } from "./editor/stage/EditorCanvasOptimizationLayer";
import { EditorCanvasPreviewLayer } from "./editor/stage/EditorCanvasPreviewLayer";
import type { EditorCanvasStageProps } from "./editor/stage/types";

export function EditorCanvasStage({
  stageRef,
  canvasWidth,
  canvasHeight,
  view,
  onStageMouseDown,
  onStageMouseMove,
  onStageMouseUp,
  onStageWheel,
  onContextMenu,
  ...props
}: EditorCanvasStageProps) {
  return (
    <main
      className="canvas-wrap"
      onMouseDownCapture={(event) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      }}
      onAuxClick={(event) => {
        event.preventDefault();
      }}
    >
      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onTouchStart={onStageMouseDown}
        onTouchMove={onStageMouseMove}
        onTouchEnd={onStageMouseUp}
        onWheel={onStageWheel}
        onContextMenu={onContextMenu}
      >
        <EditorCanvasGridLayer
          view={view}
          visibleBounds={props.visibleBounds}
          verticalLines={props.verticalLines}
          horizontalLines={props.horizontalLines}
        />
        <EditorCanvasGeometryLayer
          view={view}
          interactionMode={props.interactionMode}
          visualPosts={props.visualPosts}
          segments={props.segments}
          selectedSegmentId={props.selectedSegmentId}
          selectedGateId={props.selectedGateId}
          gatesBySegmentId={props.gatesBySegmentId}
          segmentLengthLabelsBySegmentId={props.segmentLengthLabelsBySegmentId}
          visibleSegmentLabelKeys={props.visibleSegmentLabelKeys}
          placedGateVisuals={props.placedGateVisuals}
          selectedPlanVisual={props.selectedPlanVisual}
          onSelectSegment={props.onSelectSegment}
          onStartSegmentDrag={props.onStartSegmentDrag}
          onOpenSegmentLengthEditor={props.onOpenSegmentLengthEditor}
          onUpdateSegmentEndpoint={props.onUpdateSegmentEndpoint}
          onSelectGate={props.onSelectGate}
          onStartGateDrag={props.onStartGateDrag}
        />
        <EditorCanvasPreviewLayer
          view={view}
          visibleBounds={props.visibleBounds}
          interactionMode={props.interactionMode}
          drawStart={props.drawStart}
          rectangleStart={props.rectangleStart}
          ghostEnd={props.ghostEnd}
          ghostLengthMm={props.ghostLengthMm}
          axisGuide={props.axisGuide}
          drawHoverSnap={props.drawHoverSnap}
          rectanglePreviewEnd={props.rectanglePreviewEnd}
          recessPreview={props.recessPreview}
          gatePreview={props.gatePreview}
          gatePreviewVisual={props.gatePreviewVisual}
          oppositeGateGuides={props.oppositeGateGuides}
        />
        <EditorCanvasOptimizationLayer view={view} selectedPlanVisual={props.selectedPlanVisual} />
      </Stage>

      <EditorCanvasHud
        scaleBar={props.scaleBar}
        interactionMode={props.interactionMode}
        disableSnap={props.disableSnap}
        drawStart={props.drawStart}
      />
    </main>
  );
}

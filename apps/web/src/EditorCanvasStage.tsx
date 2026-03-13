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
  onStageDoubleClick,
  onStageWheel,
  onContextMenu,
  ...props
}: EditorCanvasStageProps) {
  const cursor =
    props.isPanning
      ? "grabbing"
      : props.interactionMode === "DRAW"
        ? props.drawStart
          ? "crosshair"
          : "cell"
        : props.interactionMode === "RECESS" ||
            props.interactionMode === "GATE" ||
            props.interactionMode === "BASKETBALL_POST"
          ? props.recessPreview || props.gatePreview || props.basketballPostPreview
            ? "crosshair"
            : "default"
          : props.hoveredGateId || props.hoveredSegmentId
            ? props.hoveredGateId === props.selectedGateId || props.hoveredSegmentId === props.selectedSegmentId
              ? "grab"
              : "pointer"
            : "default";

  return (
    <main
      className="canvas-wrap"
      style={{ cursor }}
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
        onDblClick={onStageDoubleClick}
        onDblTap={onStageDoubleClick}
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
          hoveredSegmentId={props.hoveredSegmentId}
          hoveredGateId={props.hoveredGateId}
          selectedSegmentId={props.selectedSegmentId}
          selectedGateId={props.selectedGateId}
          gatesBySegmentId={props.gatesBySegmentId}
          placedBasketballPostVisuals={props.placedBasketballPostVisuals}
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
          gateType={props.gateType}
          drawStart={props.drawStart}
          rectangleStart={props.rectangleStart}
          ghostEnd={props.ghostEnd}
          ghostLengthMm={props.ghostLengthMm}
          axisGuide={props.axisGuide}
          drawHoverSnap={props.drawHoverSnap}
          rectanglePreviewEnd={props.rectanglePreviewEnd}
          recessPreview={props.recessPreview}
          gatePreview={props.gatePreview}
          basketballPostPreview={props.basketballPostPreview}
          gatePreviewVisual={props.gatePreviewVisual}
          closeLoopPoint={props.closeLoopPoint}
          oppositeGateGuides={props.oppositeGateGuides}
        />
        <EditorCanvasOptimizationLayer view={view} selectedPlanVisual={props.selectedPlanVisual} />
      </Stage>

      <EditorCanvasHud
        scaleBar={props.scaleBar}
        interactionMode={props.interactionMode}
        disableSnap={props.disableSnap}
        isPanning={props.isPanning}
        hoveredSegmentId={props.hoveredSegmentId}
        hoveredGateId={props.hoveredGateId}
        drawStart={props.drawStart}
        drawSnapLabel={props.drawSnapLabel}
        closeLoopPoint={props.closeLoopPoint}
        gatePreview={props.gatePreview}
        basketballPostPreview={props.basketballPostPreview}
        recessPreview={props.recessPreview}
      />
    </main>
  );
}

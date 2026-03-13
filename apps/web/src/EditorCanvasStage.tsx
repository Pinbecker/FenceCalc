import { Stage } from "react-konva";

import { EditorCanvasGeometryLayer } from "./editor/stage/EditorCanvasGeometryLayer";
import { EditorCanvasGridLayer } from "./editor/stage/EditorCanvasGridLayer";
import { EditorCanvasHud } from "./editor/stage/EditorCanvasHud";
import { EditorCanvasOptimizationLayer } from "./editor/stage/EditorCanvasOptimizationLayer";
import { EditorCanvasPreviewLayer } from "./editor/stage/EditorCanvasPreviewLayer";
import type { EditorCanvasStageProps } from "./editor/stage/types";

const DRAW_CURSOR = (() => {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2.25" fill="#f5fbff" stroke="#0f2730" stroke-width="1.25"/>
      <path d="M12 1.75v6.25M12 16v6.25M1.75 12H8M16 12h6.25" stroke="#0f2730" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="#9fe7f8" stroke-width="1" stroke-linecap="round"/>
    </svg>`
  );
  return `url("data:image/svg+xml,${svg}") 12 12, crosshair`;
})();

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
        ? DRAW_CURSOR
        : props.interactionMode === "RECESS" ||
            props.interactionMode === "GATE" ||
            props.interactionMode === "BASKETBALL_POST"
          ? props.recessPreview || props.gatePreview || props.basketballPostPreview
            ? "crosshair"
            : "default"
          : props.hoveredBasketballPostId || props.hoveredGateId || props.hoveredSegmentId
            ? props.hoveredBasketballPostId === props.selectedBasketballPostId ||
              props.hoveredGateId === props.selectedGateId ||
              props.hoveredSegmentId === props.selectedSegmentId
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
          hoveredBasketballPostId={props.hoveredBasketballPostId}
          hoveredSegmentId={props.hoveredSegmentId}
          hoveredGateId={props.hoveredGateId}
          selectedSegmentId={props.selectedSegmentId}
          selectedGateId={props.selectedGateId}
          selectedBasketballPostId={props.selectedBasketballPostId}
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
          onSelectBasketballPost={props.onSelectBasketballPost}
          onStartBasketballPostDrag={props.onStartBasketballPostDrag}
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
        hoveredBasketballPostId={props.hoveredBasketballPostId}
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

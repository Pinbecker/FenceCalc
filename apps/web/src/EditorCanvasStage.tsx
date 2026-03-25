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
            props.interactionMode === "GOAL_UNIT" ||
            props.interactionMode === "GATE" ||
            props.interactionMode === "BASKETBALL_POST" ||
            props.interactionMode === "FLOODLIGHT_COLUMN" ||
            props.interactionMode === "KICKBOARD" ||
            props.interactionMode === "PITCH_DIVIDER" ||
            props.interactionMode === "SIDE_NETTING"
          ? props.recessPreview ||
            props.goalUnitPreview ||
            props.gatePreview ||
            props.basketballPostPreview ||
            props.floodlightColumnPreview ||
            props.kickboardPreview ||
            props.pitchDividerAnchorPreview ||
            props.pitchDividerPreview ||
            props.sideNettingAnchorPreview ||
            props.sideNettingPreview
            ? "crosshair"
            : "default"
          : props.hoveredBasketballPostId || props.hoveredFloodlightColumnId || props.hoveredGateId || props.hoveredSegmentId
            ? props.hoveredBasketballPostId === props.selectedBasketballPostId ||
              props.hoveredFloodlightColumnId === props.selectedFloodlightColumnId ||
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
          hoveredFloodlightColumnId={props.hoveredFloodlightColumnId ?? null}
          hoveredSegmentId={props.hoveredSegmentId}
          hoveredGateId={props.hoveredGateId}
          selectedSegmentId={props.selectedSegmentId}
          selectedGateId={props.selectedGateId}
          selectedBasketballPostId={props.selectedBasketballPostId}
          selectedFloodlightColumnId={props.selectedFloodlightColumnId ?? null}
          gatesBySegmentId={props.gatesBySegmentId}
          placedBasketballPostVisuals={props.placedBasketballPostVisuals}
          placedFloodlightColumnVisuals={props.placedFloodlightColumnVisuals ?? []}
          goalUnitVisuals={props.goalUnitVisuals ?? []}
          kickboardVisuals={props.kickboardVisuals ?? []}
          pitchDividerVisuals={props.pitchDividerVisuals ?? []}
          sideNettingVisuals={props.sideNettingVisuals ?? []}
          segmentLengthLabelsBySegmentId={props.segmentLengthLabelsBySegmentId}
          visibleSegmentLabelKeys={props.visibleSegmentLabelKeys}
          placedGateVisuals={props.placedGateVisuals}
          selectedPlanVisual={props.selectedPlanVisual}
          onSelectSegment={props.onSelectSegment}
          onStartSegmentDrag={props.onStartSegmentDrag}
          onOpenSegmentLengthEditor={props.onOpenSegmentLengthEditor}
          onUpdateSegmentEndpoint={props.onUpdateSegmentEndpoint}
          onStartSegmentEndpointDrag={props.onStartSegmentEndpointDrag}
          onEndSegmentEndpointDrag={props.onEndSegmentEndpointDrag}
          onSelectGate={props.onSelectGate}
          onStartGateDrag={props.onStartGateDrag}
          onSelectBasketballPost={props.onSelectBasketballPost}
          onStartBasketballPostDrag={props.onStartBasketballPostDrag}
          onSelectFloodlightColumn={props.onSelectFloodlightColumn ?? (() => undefined)}
          onStartFloodlightColumnDrag={props.onStartFloodlightColumnDrag ?? (() => undefined)}
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
          activeDrawNodeSnap={props.activeDrawNodeSnap}
          drawHoverSnap={props.drawHoverSnap}
          rectanglePreviewEnd={props.rectanglePreviewEnd}
          recessPreview={props.recessPreview}
          goalUnitPreview={props.goalUnitPreview ?? null}
          gatePreview={props.gatePreview}
          basketballPostPreview={props.basketballPostPreview}
          floodlightColumnPreview={props.floodlightColumnPreview ?? null}
          kickboardPreview={props.kickboardPreview ?? null}
          pitchDividerAnchorPreview={props.pitchDividerAnchorPreview ?? null}
          pitchDividerPreview={props.pitchDividerPreview ?? null}
          pendingPitchDividerStart={props.pendingPitchDividerStart ?? null}
          sideNettingSegmentPreview={props.sideNettingSegmentPreview ?? null}
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
        hoveredFloodlightColumnId={props.hoveredFloodlightColumnId ?? null}
        hoveredSegmentId={props.hoveredSegmentId}
        hoveredGateId={props.hoveredGateId}
        drawStart={props.drawStart}
        drawSnapLabel={props.drawSnapLabel}
        closeLoopPoint={props.closeLoopPoint}
        gatePreview={props.gatePreview}
        basketballPostPreview={props.basketballPostPreview}
        floodlightColumnPreview={props.floodlightColumnPreview ?? null}
        recessPreview={props.recessPreview}
        goalUnitPreview={props.goalUnitPreview ?? null}
        kickboardPreview={props.kickboardPreview ?? null}
        pitchDividerAnchorPreview={props.pitchDividerAnchorPreview ?? null}
        pitchDividerPreview={props.pitchDividerPreview ?? null}
        sideNettingAnchorPreview={props.sideNettingAnchorPreview ?? null}
        sideNettingPreview={props.sideNettingPreview ?? null}
      />
    </main>
  );
}

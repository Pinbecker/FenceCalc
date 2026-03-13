import type { GateType } from "@fence-estimator/contracts";

interface EditorInteractionPanelProps {
  interactionMode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE" | "BASKETBALL_POST";
  recessWidthInputM: string;
  recessDepthInputM: string;
  gateType: GateType;
  customGateWidthInputM: string;
  recessWidthOptionsMm: readonly number[];
  recessDepthOptionsMm: readonly number[];
  gateWidthOptionsMm: readonly number[];
  recessPreview:
    | {
        depthMm: number;
        startOffsetMm: number;
        endOffsetMm: number;
        segmentLengthMm: number;
        side: "LEFT" | "RIGHT";
        sideSource: "AUTO" | "MANUAL";
        snapMeta: {
          label: string;
        };
      }
    | null;
  gatePreview:
    | {
        widthMm: number;
        startOffsetMm: number;
        endOffsetMm: number;
        segmentLengthMm: number;
        snapMeta: {
          label: string;
        };
      }
    | null;
  basketballPostPreview:
    | {
        offsetMm: number;
        facing: "LEFT" | "RIGHT";
        snapMeta: {
          label: string;
        };
      }
    | null;
  formatLengthMm: (value: number) => string;
  formatMetersInputFromMm: (value: number) => string;
  onSetInteractionMode: (mode: "DRAW" | "SELECT" | "RECTANGLE" | "RECESS" | "GATE" | "BASKETBALL_POST") => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetGateType: (type: GateType) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
}

export function EditorInteractionPanel({
  interactionMode,
  recessWidthInputM,
  recessDepthInputM,
  gateType,
  customGateWidthInputM,
  recessWidthOptionsMm,
  recessDepthOptionsMm,
  gateWidthOptionsMm,
  recessPreview,
  gatePreview,
  basketballPostPreview,
  formatLengthMm,
  formatMetersInputFromMm,
  onSetInteractionMode,
  onRecessWidthInputChange,
  onRecessDepthInputChange,
  onNormalizeRecessInputs,
  onSetGateType,
  onCustomGateWidthInputChange,
  onNormalizeGateInputs
}: EditorInteractionPanelProps) {
  return (
    <section className="panel-block panel-interaction">
      <div className="panel-heading">
        <div>
          <h2>Interaction</h2>
          <p className="muted-line">Choose the canvas task first, then adjust the mode-specific settings below.</p>
        </div>
      </div>
      <div className="mode-toggle-row mode-toggle-row-6" role="tablist" aria-label="Interaction mode">
        <button type="button" className={`mode-toggle-btn${interactionMode === "DRAW" ? " active" : ""}`} onClick={() => onSetInteractionMode("DRAW")}>
          Draw
        </button>
        <button type="button" className={`mode-toggle-btn${interactionMode === "SELECT" ? " active" : ""}`} onClick={() => onSetInteractionMode("SELECT")}>
          Select
        </button>
        <button
          type="button"
          className={`mode-toggle-btn${interactionMode === "RECTANGLE" ? " active" : ""}`}
          onClick={() => onSetInteractionMode("RECTANGLE")}
        >
          Rectangle
        </button>
        <button type="button" className={`mode-toggle-btn${interactionMode === "RECESS" ? " active" : ""}`} onClick={() => onSetInteractionMode("RECESS")}>
          Recess
        </button>
        <button type="button" className={`mode-toggle-btn${interactionMode === "GATE" ? " active" : ""}`} onClick={() => onSetInteractionMode("GATE")}>
          Gate
        </button>
        <button
          type="button"
          className={`mode-toggle-btn${interactionMode === "BASKETBALL_POST" ? " active" : ""}`}
          onClick={() => onSetInteractionMode("BASKETBALL_POST")}
        >
          Basketball Post
        </button>
      </div>
      {interactionMode === "DRAW" ? (
        <p className="muted-line">Click to start a run and keep clicking to chain segments. Hold Shift to disable angle snapping. Press Enter or double-click to finish.</p>
      ) : null}
      {interactionMode === "RECTANGLE" ? (
        <p className="muted-line">Click first corner, then opposite corner to place a rectangle perimeter.</p>
      ) : null}
      {interactionMode === "RECESS" ? (
        <>
          <label>
            Recess Width
            <input
              type="number"
              min={0.05}
              step={0.05}
              list="recess-width-presets"
              value={recessWidthInputM}
              onChange={(event) => onRecessWidthInputChange(event.target.value)}
              onBlur={onNormalizeRecessInputs}
            />
            <datalist id="recess-width-presets">
              {recessWidthOptionsMm.map((value) => (
                <option key={value} value={formatMetersInputFromMm(value)} />
              ))}
            </datalist>
          </label>
          <label>
            Recess Depth
            <input
              type="number"
              min={0.05}
              step={0.05}
              list="recess-depth-presets"
              value={recessDepthInputM}
              onChange={(event) => onRecessDepthInputChange(event.target.value)}
              onBlur={onNormalizeRecessInputs}
            />
            <datalist id="recess-depth-presets">
              {recessDepthOptionsMm.map((value) => (
                <option key={value} value={formatMetersInputFromMm(value)} />
              ))}
            </datalist>
          </label>
          {recessPreview ? (
            <>
              <p className="muted-line">
                Opening {formatLengthMm(recessPreview.endOffsetMm - recessPreview.startOffsetMm)} x {formatLengthMm(recessPreview.depthMm)}
              </p>
            </>
          ) : (
            <p className="muted-line">Hover near a fence line and click to place recess.</p>
          )}
        </>
      ) : null}
      {interactionMode === "GATE" ? (
        <>
          <div className="mode-toggle-row mode-toggle-row-3">
            <button type="button" className={`mode-toggle-btn${gateType === "SINGLE_LEAF" ? " active" : ""}`} onClick={() => onSetGateType("SINGLE_LEAF")}>
              Single 1.2m
            </button>
            <button type="button" className={`mode-toggle-btn${gateType === "DOUBLE_LEAF" ? " active" : ""}`} onClick={() => onSetGateType("DOUBLE_LEAF")}>
              Double 3.0m
            </button>
            <button type="button" className={`mode-toggle-btn${gateType === "CUSTOM" ? " active" : ""}`} onClick={() => onSetGateType("CUSTOM")}>
              Custom
            </button>
          </div>
          {gateType === "CUSTOM" ? (
            <label>
              Custom Gate Width
              <input
                type="number"
                min={0.05}
                step={0.05}
                list="gate-width-presets"
                value={customGateWidthInputM}
                onChange={(event) => onCustomGateWidthInputChange(event.target.value)}
                onBlur={onNormalizeGateInputs}
              />
              <datalist id="gate-width-presets">
                {gateWidthOptionsMm.map((value) => (
                  <option key={value} value={formatMetersInputFromMm(value)} />
                ))}
              </datalist>
            </label>
          ) : null}
          {gatePreview ? (
            <>
              <p className="muted-line">
                Gate {formatLengthMm(gatePreview.widthMm)} | left run {formatLengthMm(gatePreview.startOffsetMm)} | right run{" "}
                {formatLengthMm(gatePreview.segmentLengthMm - gatePreview.endOffsetMm)}
              </p>
              <p className="muted-line">Snap {gatePreview.snapMeta.label}.</p>
            </>
          ) : (
            <p className="muted-line">Hover near a fence line and click to insert gate object.</p>
          )}
        </>
      ) : null}
      {interactionMode === "BASKETBALL_POST" ? (
        basketballPostPreview ? (
          <>
            <p className="muted-line">
              Basketball post at {formatLengthMm(basketballPostPreview.offsetMm)} facing {basketballPostPreview.facing.toLowerCase()}.
            </p>
            <p className="muted-line">Snap {basketballPostPreview.snapMeta.label}. Hover either side of the run to flip the arm.</p>
          </>
        ) : (
          <p className="muted-line">Hover either side of a fence line and click to place a basketball post with the arm facing that side.</p>
        )
      ) : null}
    </section>
  );
}

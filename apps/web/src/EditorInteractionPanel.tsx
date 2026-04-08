import type { BasketballArmLengthMm, GateType, GoalUnitHeightMm, GoalUnitWidthMm, KickboardProfile, KickboardSectionHeightMm } from "@fence-estimator/contracts";

interface EditorInteractionPanelProps {
  interactionMode:
    | "DRAW"
    | "SELECT"
    | "RECTANGLE"
    | "RECESS"
    | "GOAL_UNIT"
    | "GATE"
    | "BASKETBALL_POST"
    | "FLOODLIGHT_COLUMN"
    | "KICKBOARD"
    | "PITCH_DIVIDER"
    | "SIDE_NETTING";
  recessWidthInputM: string;
  recessDepthInputM: string;
  goalUnitWidthMm?: GoalUnitWidthMm;
  goalUnitHeightMm?: GoalUnitHeightMm;
  basketballPlacementType?: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST";
  basketballArmLengthMm?: BasketballArmLengthMm;
  kickboardSectionHeightMm?: KickboardSectionHeightMm;
  kickboardProfile?: KickboardProfile;
  sideNettingHeightMm?: number;
  pendingPitchDividerStart?:
    | {
        segmentId: string;
        offsetMm: number;
      }
    | null;
  pendingSideNettingStart?:
    | {
        segmentId: string;
        offsetMm: number;
      }
    | null;
  gateType: GateType;
  customGateWidthInputM: string;
  recessWidthOptionsMm: readonly number[];
  recessDepthOptionsMm: readonly number[];
  goalUnitWidthOptionsMm?: readonly GoalUnitWidthMm[];
  goalUnitHeightOptionsMm?: readonly GoalUnitHeightMm[];
  basketballArmLengthOptionsMm?: readonly BasketballArmLengthMm[];
  kickboardSectionHeightOptionsMm?: readonly KickboardSectionHeightMm[];
  sideNettingHeightOptionsMm?: readonly number[];
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
  floodlightColumnPreview?:
    | {
        offsetMm: number;
        snapMeta: {
          label: string;
        };
      }
    | null;
  goalUnitPreview?:
    | {
        widthMm: number;
        depthMm: number;
        goalHeightMm: number;
        side: "LEFT" | "RIGHT";
        snapMeta: {
          label: string;
        };
      }
    | null;
  kickboardPreview?:
    | {
        segmentId: string;
        snapMeta: {
          label: string;
        };
      }
    | null;
  pitchDividerPreview?:
    | {
        spanLengthMm: number;
        isValid: boolean;
      }
    | null;
  sideNettingPreview?:
    | {
        lengthMm: number;
        snapMeta: {
          label: string;
        };
      }
    | null;
  formatLengthMm: (value: number) => string;
  formatMetersInputFromMm: (value: number) => string;
  onSetInteractionMode: (
    mode:
      | "DRAW"
      | "SELECT"
      | "RECTANGLE"
      | "RECESS"
      | "GOAL_UNIT"
      | "GATE"
      | "BASKETBALL_POST"
      | "FLOODLIGHT_COLUMN"
      | "KICKBOARD"
      | "PITCH_DIVIDER"
      | "SIDE_NETTING"
  ) => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetGoalUnitWidthMm?: (value: GoalUnitWidthMm) => void;
  onSetGoalUnitHeightMm?: (value: GoalUnitHeightMm) => void;
  onSetGateType: (type: GateType) => void;
  onSetBasketballPlacementType?: (value: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST") => void;
  onSetBasketballArmLengthMm?: (value: BasketballArmLengthMm) => void;
  onSetKickboardSectionHeightMm?: (value: KickboardSectionHeightMm) => void;
  onSetKickboardProfile?: (value: KickboardProfile) => void;
  onSetSideNettingHeightMm?: (value: number) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
}

export function EditorInteractionPanel({
  interactionMode,
  recessWidthInputM,
  recessDepthInputM,
  goalUnitWidthMm = 3000,
  goalUnitHeightMm = 3000,
  basketballPlacementType = "DEDICATED_POST",
  basketballArmLengthMm = 1800,
  kickboardSectionHeightMm = 200,
  kickboardProfile = "SQUARE",
  sideNettingHeightMm = 2000,
  pendingPitchDividerStart = null,
  pendingSideNettingStart = null,
  gateType,
  customGateWidthInputM,
  recessWidthOptionsMm,
  recessDepthOptionsMm,
  goalUnitWidthOptionsMm = [3000, 3600, 4800] as const,
  goalUnitHeightOptionsMm = [3000, 4000] as const,
  basketballArmLengthOptionsMm = [1200, 1800] as const,
  kickboardSectionHeightOptionsMm = [200, 225, 250] as const,
  sideNettingHeightOptionsMm = [500, 1000, 1500, 2000] as const,
  gateWidthOptionsMm,
  recessPreview,
  gatePreview,
  basketballPostPreview,
  floodlightColumnPreview = null,
  goalUnitPreview = null,
  kickboardPreview = null,
  pitchDividerPreview = null,
  sideNettingPreview = null,
  formatLengthMm,
  formatMetersInputFromMm,
  onSetInteractionMode,
  onRecessWidthInputChange,
  onRecessDepthInputChange,
  onNormalizeRecessInputs,
  onSetGoalUnitWidthMm = () => undefined,
  onSetGoalUnitHeightMm = () => undefined,
  onSetGateType,
  onSetBasketballPlacementType = () => undefined,
  onSetBasketballArmLengthMm = () => undefined,
  onSetKickboardSectionHeightMm = () => undefined,
  onSetKickboardProfile = () => undefined,
  onSetSideNettingHeightMm = () => undefined,
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
      <div className="mode-toggle-row" role="tablist" aria-label="Interaction mode" style={{ flexWrap: "wrap" }}>
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
        <button type="button" className={`mode-toggle-btn${interactionMode === "GOAL_UNIT" ? " active" : ""}`} onClick={() => onSetInteractionMode("GOAL_UNIT")}>
          Goal Unit
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
        <button
          type="button"
          className={`mode-toggle-btn${interactionMode === "FLOODLIGHT_COLUMN" ? " active" : ""}`}
          onClick={() => onSetInteractionMode("FLOODLIGHT_COLUMN")}
        >
          Floodlight
        </button>
        <button type="button" className={`mode-toggle-btn${interactionMode === "KICKBOARD" ? " active" : ""}`} onClick={() => onSetInteractionMode("KICKBOARD")}>
          Kickboard
        </button>
        <button type="button" className={`mode-toggle-btn${interactionMode === "PITCH_DIVIDER" ? " active" : ""}`} onClick={() => onSetInteractionMode("PITCH_DIVIDER")}>
          Pitch Divider
        </button>
        <button type="button" className={`mode-toggle-btn${interactionMode === "SIDE_NETTING" ? " active" : ""}`} onClick={() => onSetInteractionMode("SIDE_NETTING")}>
          Side Netting
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
      {interactionMode === "GOAL_UNIT" ? (
        <>
          <label>
            Goal Unit Width
            <select value={goalUnitWidthMm} onChange={(event) => onSetGoalUnitWidthMm(Number(event.target.value))}>
              {goalUnitWidthOptionsMm.map((value) => (
                <option key={value} value={value}>
                  {formatLengthMm(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal Unit Height
            <select value={goalUnitHeightMm} onChange={(event) => onSetGoalUnitHeightMm(Number(event.target.value))}>
              {goalUnitHeightOptionsMm.map((value) => (
                <option key={value} value={value}>
                  {formatLengthMm(value)}
                </option>
              ))}
            </select>
          </label>
          {goalUnitPreview ? (
            <>
              <p className="muted-line">
                Goal unit {formatLengthMm(goalUnitPreview.widthMm)} x {formatLengthMm(goalUnitPreview.goalHeightMm)} at {formatLengthMm(goalUnitPreview.depthMm)} deep.
              </p>
              <p className="muted-line">Snap {goalUnitPreview.snapMeta.label}. Side: {goalUnitPreview.side.toLowerCase()}.</p>
            </>
          ) : (
            <p className="muted-line">Hover near a fence line and click to place a predefined recessed goal unit.</p>
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
        <>
          <label>
            Basketball Type
            <select value={basketballPlacementType} onChange={(event) => onSetBasketballPlacementType(event.target.value as "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST")}>
              <option value="DEDICATED_POST">Dedicated post</option>
              <option value="MOUNTED_TO_EXISTING_POST">Mounted to existing post</option>
            </select>
          </label>
          {basketballPlacementType === "DEDICATED_POST" ? (
            <label>
              Arm Length
              <select value={basketballArmLengthMm} onChange={(event) => onSetBasketballArmLengthMm(Number(event.target.value))}>
                {basketballArmLengthOptionsMm.map((value) => (
                  <option key={value} value={value}>
                    {formatLengthMm(value)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {basketballPostPreview ? (
            <>
              <p className="muted-line">
                Basketball {basketballPlacementType === "DEDICATED_POST" ? "post" : "mount"} at {formatLengthMm(basketballPostPreview.offsetMm)} facing {basketballPostPreview.facing.toLowerCase()}.
              </p>
              <p className="muted-line">Snap {basketballPostPreview.snapMeta.label}. Hover either side of the run to flip orientation.</p>
            </>
          ) : (
            <p className="muted-line">Hover either side of a valid fence line and click to place basketball equipment on an intermediate post.</p>
          )}
        </>
      ) : null}
      {interactionMode === "FLOODLIGHT_COLUMN" ? (
        floodlightColumnPreview ? (
          <>
            <p className="muted-line">
              Floodlight column at {formatLengthMm(floodlightColumnPreview.offsetMm)}.
            </p>
            <p className="muted-line">Snap {floodlightColumnPreview.snapMeta.label}. Corners snap when you hover near them.</p>
          </>
        ) : (
          <p className="muted-line">Hover a fence line and click to place a floodlight column. Nearby corners snap automatically.</p>
        )
      ) : null}
      {interactionMode === "KICKBOARD" ? (
        <>
          <label>
            Kickboard Section
            <select value={kickboardSectionHeightMm} onChange={(event) => onSetKickboardSectionHeightMm(Number(event.target.value))}>
              {kickboardSectionHeightOptionsMm.map((value) => (
                <option key={value} value={value}>
                  {value} x 50
                </option>
              ))}
            </select>
          </label>
          <label>
            Profile
            <select value={kickboardProfile} onChange={(event) => onSetKickboardProfile(event.target.value)}>
              <option value="SQUARE">Square</option>
              <option value="CHAMFERED">Chamfered</option>
            </select>
          </label>
          {kickboardPreview ? (
            <p className="muted-line">Click to apply kickboards to the hovered fence line. Click again in this mode to replace the existing kickboard on that line.</p>
          ) : (
            <p className="muted-line">Hover a fence line and click to apply kickboards.</p>
          )}
        </>
      ) : null}
      {interactionMode === "PITCH_DIVIDER" ? (
        <>
          {pendingPitchDividerStart ? (
            <p className="muted-line">Start anchor set at {formatLengthMm(pendingPitchDividerStart.offsetMm)}. Hover another fence line and click to finish the divider.</p>
          ) : (
            <p className="muted-line">Click the first fence-line anchor, then click the second fence-line anchor to create a divider.</p>
          )}
          {pitchDividerPreview ? (
            <p className="muted-line">
              Span {formatLengthMm(pitchDividerPreview.spanLengthMm)}. {pitchDividerPreview.isValid ? "Valid divider." : "Invalid: exceeds 70m."}
            </p>
          ) : null}
        </>
      ) : null}
      {interactionMode === "SIDE_NETTING" ? (
        <>
          <label>
            Additional Height
            <select value={sideNettingHeightMm} onChange={(event) => onSetSideNettingHeightMm(Number(event.target.value))}>
              {sideNettingHeightOptionsMm.map((value) => (
                <option key={value} value={value}>
                  {formatLengthMm(value)}
                </option>
              ))}
            </select>
          </label>
          {pendingSideNettingStart ? (
            <p className="muted-line">Start post set at {formatLengthMm(pendingSideNettingStart.offsetMm)}. Click a second existing post on the same fence line to finish the side-netting run.</p>
          ) : (
            <p className="muted-line">Click a start post on the fence line, then click the end post to define the covered run.</p>
          )}
          {sideNettingPreview ? (
            <p className="muted-line">Side-netting run {formatLengthMm(sideNettingPreview.lengthMm)}. Click to apply.</p>
          ) : (
            <p className="muted-line">Hover a fence line to snap the next point.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

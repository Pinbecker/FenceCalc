import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BasketballArmLengthMm,
  FenceHeightKey,
  FenceSpec,
  GateType,
  GoalUnitHeightMm,
  GoalUnitWidthMm,
  KickboardProfile,
  KickboardSectionHeightMm,
  TwinBarVariant
} from "@fence-estimator/contracts";

import type { InteractionMode } from "./editor/types";
import type { EditorGoalUnitOption, EditorKickboardOption } from "./editor/pricingEditorOptions";

/* Tool definitions */

interface ToolDef {
  id: InteractionMode;
  label: string;
  shortcut: string;
  icon: string;
  group: "core" | "openings" | "features";
  hasParams: boolean;
}

const TOOLS: ToolDef[] = [
  { id: "SELECT", label: "Select", shortcut: "S", icon: "cursor", group: "core", hasParams: false },
  { id: "DRAW", label: "Draw", shortcut: "D", icon: "pen", group: "core", hasParams: false },
  { id: "RECTANGLE", label: "Rectangle", shortcut: "X", icon: "rect", group: "core", hasParams: false },
  { id: "RECESS", label: "Recess", shortcut: "R", icon: "recess", group: "openings", hasParams: true },
  { id: "GATE", label: "Gate", shortcut: "G", icon: "gate", group: "openings", hasParams: true },
  { id: "GOAL_UNIT", label: "Goal Unit", shortcut: "U", icon: "goal", group: "openings", hasParams: true },
  { id: "BASKETBALL_POST", label: "Basketball", shortcut: "B", icon: "basketball", group: "features", hasParams: true },
  { id: "FLOODLIGHT_COLUMN", label: "Floodlight", shortcut: "F", icon: "floodlight", group: "features", hasParams: true },
  { id: "KICKBOARD", label: "Kickboard", shortcut: "K", icon: "kickboard", group: "features", hasParams: true },
  { id: "PITCH_DIVIDER", label: "Pitch Divider", shortcut: "P", icon: "divider", group: "features", hasParams: false },
  { id: "SIDE_NETTING", label: "Side Netting", shortcut: "N", icon: "netting", group: "features", hasParams: true },
];

/* SVG Icon set */

function ToolIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const s = size;
  switch (icon) {
    case "cursor":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4.5L11.7 19.5l2.15-5.12L19 12.2z" />
          <path d="M13.2 13.8l4.1 5.2" />
        </svg>
      );
    case "pen":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="19" x2="19" y2="5" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
        </svg>
      );
    case "rect":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="6" width="16" height="12" rx="1" />
        </svg>
      );
    case "recess":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3,12 8,12 8,18 16,18 16,12 21,12" />
        </svg>
      );
    case "gate":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="8" y2="12" />
          <line x1="16" y1="12" x2="21" y2="12" />
          <path d="M8 12 Q12 6 16 12" />
        </svg>
      );
    case "goal":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8h14v8H5z" />
          <path d="M8 8v8" />
          <path d="M16 8v8" />
          <path d="M5 12h14" />
        </svg>
      );
    case "basketball":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="20" x2="8" y2="6" />
          <line x1="8" y1="7" x2="15.5" y2="7" />
          <rect x="13.5" y="5.5" width="4.5" height="3.5" rx="0.8" />
          <circle cx="17.5" cy="12.5" r="1.7" />
        </svg>
      );
    case "floodlight":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="9" x2="12" y2="20" />
          <path d="M8 5h8l-1.4 4h-5.2z" />
          <line x1="9.2" y1="11.5" x2="14.8" y2="11.5" />
        </svg>
      );
    case "kickboard":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="14" width="18" height="4" rx="1" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    case "divider":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="3 2" />
        </svg>
      );
    case "netting":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="18" x2="4" y2="6" />
          <line x1="20" y1="18" x2="20" y2="6" />
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" strokeDasharray="2 2" />
        </svg>
      );
    default:
      return <span style={{ fontSize: 14 }}>?</span>;
  }
}

/* Flyout wrappers */

function FlyoutPanel(props: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        props.onClose();
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [props]);

  return (
    <div className="palette-flyout" ref={ref}>
      {props.children}
    </div>
  );
}

/* Props */

export interface EditorToolPaletteProps {
  isReadOnly?: boolean;
  interactionMode: InteractionMode;
  activeSpec: FenceSpec;
  activeHeightOptions: FenceHeightKey[];
  twinBarHeightOptions: FenceHeightKey[];
  rollFormHeightOptions: FenceHeightKey[];
  recessWidthInputM: string;
  recessDepthInputM: string;
  goalUnitWidthMm: GoalUnitWidthMm;
  goalUnitHeightMm: GoalUnitHeightMm;
  goalUnitHasBasketballPost: boolean;
  basketballPlacementType: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST";
  basketballArmLengthMm: BasketballArmLengthMm;
  kickboardSectionHeightMm: KickboardSectionHeightMm;
  kickboardProfile: KickboardProfile;
  kickboardThicknessMm: number;
  kickboardBoardLengthMm: number;
  floodlightColumnHeightMm: number;
  sideNettingHeightMm: number;
  gateType: GateType;
  customGateWidthInputM: string;
  recessWidthOptionsMm: readonly number[];
  recessDepthOptionsMm: readonly number[];
  goalUnitOptions: readonly EditorGoalUnitOption[];
  basketballArmLengthOptionsMm: readonly BasketballArmLengthMm[];
  kickboardOptions: readonly EditorKickboardOption[];
  floodlightColumnHeightOptionsMm: readonly number[];
  sideNettingHeightOptionsMm: readonly number[];
  gateWidthOptionsMm: readonly number[];
  formatLengthMm: (value: number) => string;
  formatMetersInputFromMm: (value: number) => string;
  getSegmentColor: (spec: FenceSpec) => string;
  onSetInteractionMode: (mode: InteractionMode) => void;
  onRecessWidthInputChange: (value: string) => void;
  onRecessDepthInputChange: (value: string) => void;
  onNormalizeRecessInputs: () => void;
  onSetGoalUnitWidthMm: (value: GoalUnitWidthMm) => void;
  onSetGoalUnitHeightMm: (value: GoalUnitHeightMm) => void;
  onSetGoalUnitHasBasketballPost: (value: boolean) => void;
  onSetGateType: (type: GateType) => void;
  onSetBasketballPlacementType: (value: "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST") => void;
  onSetBasketballArmLengthMm: (value: BasketballArmLengthMm) => void;
  onSetKickboardSectionHeightMm: (value: KickboardSectionHeightMm) => void;
  onSetKickboardProfile: (value: KickboardProfile) => void;
  onSetKickboardThicknessMm: (value: number) => void;
  onSetKickboardBoardLengthMm: (value: number) => void;
  onSetFloodlightColumnHeightMm: (value: number) => void;
  onSetSideNettingHeightMm: (value: number) => void;
  onCustomGateWidthInputChange: (value: string) => void;
  onNormalizeGateInputs: () => void;
  onSetActiveSpec: (updater: (previous: FenceSpec) => FenceSpec) => void;
}

/* Component */

export function EditorToolPalette({
  isReadOnly = false,
  interactionMode,
  activeSpec,
  activeHeightOptions,
  twinBarHeightOptions,
  rollFormHeightOptions,
  recessWidthInputM,
  recessDepthInputM,
  goalUnitWidthMm,
  goalUnitHeightMm,
  goalUnitHasBasketballPost,
  basketballPlacementType,
  basketballArmLengthMm,
  kickboardSectionHeightMm,
  kickboardProfile,
  kickboardThicknessMm,
  kickboardBoardLengthMm,
  floodlightColumnHeightMm,
  sideNettingHeightMm,
  gateType,
  customGateWidthInputM,
  recessWidthOptionsMm,
  recessDepthOptionsMm,
  goalUnitOptions,
  basketballArmLengthOptionsMm,
  kickboardOptions,
  floodlightColumnHeightOptionsMm,
  sideNettingHeightOptionsMm,
  gateWidthOptionsMm,
  formatLengthMm,
  formatMetersInputFromMm,
  getSegmentColor,
  onSetInteractionMode,
  onRecessWidthInputChange,
  onRecessDepthInputChange,
  onNormalizeRecessInputs,
  onSetGoalUnitWidthMm,
  onSetGoalUnitHeightMm,
  onSetGoalUnitHasBasketballPost,
  onSetGateType,
  onSetBasketballPlacementType,
  onSetBasketballArmLengthMm,
  onSetKickboardSectionHeightMm,
  onSetKickboardProfile,
  onSetKickboardThicknessMm,
  onSetKickboardBoardLengthMm,
  onSetFloodlightColumnHeightMm,
  onSetSideNettingHeightMm,
  onCustomGateWidthInputChange,
  onNormalizeGateInputs,
  onSetActiveSpec
}: EditorToolPaletteProps) {
  const [openFlyout, setOpenFlyout] = useState<InteractionMode | "fence" | null>(null);
  const [isFenceConfigOpen, setIsFenceConfigOpen] = useState(false);

  const isLegacyRollFormDrawing = activeSpec.system === "ROLL_FORM";
  const fenceColorSwatch = getSegmentColor(activeSpec);
  const availableHeightOptions = activeSpec.system === "TWIN_BAR" ? activeHeightOptions : rollFormHeightOptions;
  const fenceVariantColors = availableHeightOptions.map((heightOption) =>
    getSegmentColor({ ...activeSpec, height: heightOption }),
  );
  const hasFenceColorVariants = new Set(fenceVariantColors).size > 1;
  const selectedGoalUnitKey = `${goalUnitWidthMm}:${goalUnitHeightMm}:${goalUnitHasBasketballPost ? "basketball" : "plain"}`;
  const selectedKickboardKey = `${kickboardSectionHeightMm}:${kickboardThicknessMm}:${kickboardProfile}:${kickboardBoardLengthMm}`;
  const activeTool = TOOLS.find((tool) => tool.id === interactionMode) ?? TOOLS[0]!;

  const selectTool = useCallback(
    (mode: InteractionMode) => {
      if (isReadOnly) {
        return;
      }
      onSetInteractionMode(mode);
      const tool = TOOLS.find((t) => t.id === mode);
      if (tool?.hasParams && mode !== interactionMode) {
        setOpenFlyout(mode);
      } else if (mode === interactionMode && tool?.hasParams) {
        setOpenFlyout((current) => (current === mode ? null : mode));
      } else {
        setOpenFlyout(null);
      }
    },
    [interactionMode, isReadOnly, onSetInteractionMode],
  );

  const closeFlyout = useCallback(() => {
    setOpenFlyout(null);
    setIsFenceConfigOpen(false);
  }, []);

  useEffect(() => {
    if (!isReadOnly) {
      return;
    }
    closeFlyout();
  }, [closeFlyout, isReadOnly]);

  return (
    <div className={`tool-palette${isReadOnly ? " is-read-only" : ""}`}>
      {/* Tool buttons */}
      <div className="tool-palette-tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`tool-btn${interactionMode === tool.id ? " active" : ""}${tool.hasParams && interactionMode === tool.id ? " has-flyout" : ""}`}
            title={isReadOnly ? `${tool.label} disabled in view-only mode` : `${tool.label} (${tool.shortcut})`}
            onClick={() => selectTool(tool.id)}
            disabled={isReadOnly}
          >
            <ToolIcon icon={tool.icon} />
            <kbd>{tool.shortcut}</kbd>
            {tool.hasParams && interactionMode === tool.id ? <span className="tool-btn-arrow">▸</span> : null}
          </button>
        ))}
      </div>

      {/* Fence config section */}
      <div className="tool-palette-divider" />
      <button
        type="button"
        className={`tool-btn tool-btn-fence${isFenceConfigOpen ? " active" : ""}`}
        title={isReadOnly ? "Fence specification is locked in view-only mode" : "Fence specification"}
        onClick={() => {
          if (isReadOnly) {
            return;
          }
          setIsFenceConfigOpen((current) => !current);
          setOpenFlyout((current) => (current === "fence" ? null : "fence"));
        }}
        disabled={isReadOnly}
      >
        <span className="fence-swatch" style={{ background: fenceColorSwatch }} />
        <span className="fence-label">{activeSpec.height}</span>
      </button>
      <div className="tool-palette-caption">
        <strong>{activeTool.label}</strong>
        <span>{isReadOnly ? "View only" : "Click again for options"}</span>
      </div>
      {isReadOnly ? <span className="tool-palette-lock">View only</span> : null}

      {/* Fence config flyout */}
      {openFlyout === "fence" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Fence Specification</div>
          <label className="flyout-field">
            <span>System</span>
            <select
              value={isLegacyRollFormDrawing ? "ROLL_FORM" : "TWIN_BAR"}
              onChange={(event) => {
                const nextSystem = event.target.value as FenceSpec["system"];
                onSetActiveSpec((previous) => {
                  if (nextSystem === "TWIN_BAR") {
                    const nextHeight = twinBarHeightOptions.includes(previous.height)
                      ? previous.height
                      : twinBarHeightOptions[2];
                    return {
                      system: nextSystem,
                      height: nextHeight ?? "2m",
                      twinBarVariant: previous.twinBarVariant ?? "STANDARD"
                    };
                  }
                  const nextHeight = rollFormHeightOptions.includes(previous.height)
                    ? previous.height
                    : rollFormHeightOptions[0];
                  return { system: nextSystem, height: nextHeight ?? "2m" };
                });
              }}
            >
              <option value="TWIN_BAR">Twin Bar</option>
              {isLegacyRollFormDrawing ? (
                <option value="ROLL_FORM">Roll Form (legacy)</option>
              ) : null}
            </select>
          </label>
          <label className="flyout-field">
            <span>Height</span>
            <select
              value={activeSpec.height}
              onChange={(event) => {
                const nextHeight = event.target.value as FenceHeightKey;
                onSetActiveSpec((previous) => ({ ...previous, height: nextHeight }));
              }}
            >
              {(activeSpec.system === "TWIN_BAR" ? activeHeightOptions : rollFormHeightOptions).map(
                (heightOption) => (
                  <option key={heightOption} value={heightOption}>
                    {heightOption}
                  </option>
                ),
              )}
            </select>
          </label>
          {activeSpec.system === "TWIN_BAR" ? (
            <label className="flyout-field">
              <span>Variant</span>
              <select
                value={activeSpec.twinBarVariant ?? "STANDARD"}
                onChange={(event) => {
                  const nextVariant = event.target.value as TwinBarVariant;
                  onSetActiveSpec((previous) => ({ ...previous, twinBarVariant: nextVariant }));
                }}
              >
                <option value="STANDARD">Standard</option>
                <option value="SUPER_REBOUND">Super Rebound</option>
              </select>
            </label>
          ) : null}
          {hasFenceColorVariants ? (
            <div className="flyout-legend">
              {availableHeightOptions.map((heightOption) => (
                <div key={heightOption} className="flyout-legend-row">
                  <span
                    className="fence-swatch"
                    style={{
                      background: getSegmentColor({ ...activeSpec, height: heightOption })
                    }}
                  />
                  <span>{heightOption}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="flyout-note">Fence line colour stays consistent across heights and variants.</p>
          )}
        </FlyoutPanel>
      ) : null}

      {/* Tool parameter flyouts */}
      {openFlyout === "RECESS" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Recess Options</div>
          <label className="flyout-field">
            <span>Width (m)</span>
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
          <label className="flyout-field">
            <span>Depth (m)</span>
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
        </FlyoutPanel>
      ) : null}

      {openFlyout === "GATE" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Gate Options</div>
          <div className="flyout-toggle-row">
            <button type="button" className={`flyout-toggle${gateType === "SINGLE_LEAF" ? " active" : ""}`}
              onClick={() => onSetGateType("SINGLE_LEAF")}>Single 1.2m</button>
            <button type="button" className={`flyout-toggle${gateType === "DOUBLE_LEAF" ? " active" : ""}`}
              onClick={() => onSetGateType("DOUBLE_LEAF")}>Double 3m</button>
            <button type="button" className={`flyout-toggle${gateType === "CUSTOM" ? " active" : ""}`}
              onClick={() => onSetGateType("CUSTOM")}>Custom</button>
          </div>
          {gateType === "CUSTOM" ? (
            <label className="flyout-field">
              <span>Width (m)</span>
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
        </FlyoutPanel>
      ) : null}

      {openFlyout === "GOAL_UNIT" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Goal Unit</div>
          <label className="flyout-field">
            <span>Variant</span>
            <select
              value={selectedGoalUnitKey}
              onChange={(event) => {
                const nextOption = goalUnitOptions.find((option) => option.key === event.target.value);
                if (!nextOption) {
                  return;
                }
                onSetGoalUnitWidthMm(nextOption.widthMm);
                onSetGoalUnitHeightMm(nextOption.goalHeightMm);
                onSetGoalUnitHasBasketballPost(nextOption.hasBasketballPost);
              }}
            >
              {goalUnitOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
        </FlyoutPanel>
      ) : null}

      {openFlyout === "BASKETBALL_POST" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Basketball Post</div>
          <label className="flyout-field">
            <span>Type</span>
            <select value={basketballPlacementType}
              onChange={(event) => onSetBasketballPlacementType(event.target.value as "DEDICATED_POST" | "MOUNTED_TO_EXISTING_POST")}>
              <option value="DEDICATED_POST">Dedicated post</option>
              <option value="MOUNTED_TO_EXISTING_POST">Mounted to existing</option>
            </select>
          </label>
          {basketballPlacementType === "DEDICATED_POST" ? (
            <label className="flyout-field">
              <span>Arm Length</span>
              <select value={basketballArmLengthMm}
                onChange={(event) => onSetBasketballArmLengthMm(Number(event.target.value))}>
                {basketballArmLengthOptionsMm.map((value) => (
                  <option key={value} value={value}>{formatLengthMm(value)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </FlyoutPanel>
      ) : null}

      {openFlyout === "FLOODLIGHT_COLUMN" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Floodlight Column</div>
          <label className="flyout-field">
            <span>Column height</span>
            <select
              value={floodlightColumnHeightMm}
              onChange={(event) => onSetFloodlightColumnHeightMm(Number(event.target.value))}
            >
              {floodlightColumnHeightOptionsMm.map((value) => (
                <option key={value} value={value}>{formatLengthMm(value)}</option>
              ))}
            </select>
          </label>
        </FlyoutPanel>
      ) : null}

      {openFlyout === "KICKBOARD" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Kickboard</div>
          <label className="flyout-field">
            <span>Variant</span>
            <select
              value={selectedKickboardKey}
              onChange={(event) => {
                const nextOption = kickboardOptions.find((option) => option.key === event.target.value);
                if (!nextOption) {
                  return;
                }
                onSetKickboardSectionHeightMm(nextOption.sectionHeightMm);
                onSetKickboardThicknessMm(nextOption.thicknessMm);
                onSetKickboardProfile(nextOption.profile);
                onSetKickboardBoardLengthMm(nextOption.boardLengthMm);
              }}
            >
              {kickboardOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
        </FlyoutPanel>
      ) : null}

      {openFlyout === "SIDE_NETTING" ? (
        <FlyoutPanel onClose={closeFlyout}>
          <div className="flyout-heading">Side Netting</div>
          <label className="flyout-field">
            <span>Height</span>
            <select value={sideNettingHeightMm}
              onChange={(event) => onSetSideNettingHeightMm(Number(event.target.value))}>
              {sideNettingHeightOptionsMm.map((value) => (
                <option key={value} value={value}>{formatLengthMm(value)}</option>
              ))}
            </select>
          </label>
        </FlyoutPanel>
      ) : null}
    </div>
  );
}

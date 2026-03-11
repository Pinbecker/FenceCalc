import type { FenceHeightKey, FenceSpec, TwinBarVariant } from "@fence-estimator/contracts";

interface EditorFencePalettePanelProps {
  activeSpec: FenceSpec;
  activeHeightOptions: FenceHeightKey[];
  twinBarHeightOptions: FenceHeightKey[];
  rollFormHeightOptions: FenceHeightKey[];
  onSetActiveSpec: (updater: (previous: FenceSpec) => FenceSpec) => void;
  getSegmentColor: (spec: FenceSpec) => string;
}

export function EditorFencePalettePanel({
  activeSpec,
  activeHeightOptions,
  twinBarHeightOptions,
  rollFormHeightOptions,
  onSetActiveSpec,
  getSegmentColor
}: EditorFencePalettePanelProps) {
  return (
    <section className="panel-block panel-fence-palette">
      <h2>Fence Palette</h2>
      <label>
        System
        <select
          value={activeSpec.system}
          onChange={(event) => {
            const nextSystem = event.target.value as FenceSpec["system"];
            onSetActiveSpec((previous) => {
              if (nextSystem === "TWIN_BAR") {
                const nextHeight = twinBarHeightOptions.includes(previous.height) ? previous.height : twinBarHeightOptions[2];
                return {
                  system: nextSystem,
                  height: nextHeight ?? "2m",
                  twinBarVariant: previous.twinBarVariant ?? "STANDARD"
                };
              }

              const nextHeight = rollFormHeightOptions.includes(previous.height) ? previous.height : rollFormHeightOptions[0];
              return {
                system: nextSystem,
                height: nextHeight ?? "2m"
              };
            });
          }}
        >
          <option value="TWIN_BAR">Twin Bar</option>
          <option value="ROLL_FORM">Roll Form Welded Mesh</option>
        </select>
      </label>
      <label>
        Height
        <select
          value={activeSpec.height}
          onChange={(event) => {
            const nextHeight = event.target.value as FenceHeightKey;
            onSetActiveSpec((previous) => ({ ...previous, height: nextHeight }));
          }}
        >
          {activeHeightOptions.map((heightOption) => (
            <option key={heightOption} value={heightOption}>
              {heightOption}
            </option>
          ))}
        </select>
      </label>
      {activeSpec.system === "TWIN_BAR" ? (
        <label>
          Variant
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
      <div className="palette-legend">
        {(activeSpec.system === "TWIN_BAR" ? twinBarHeightOptions : rollFormHeightOptions).map((heightOption) => (
          <div key={heightOption}>
            <span className="swatch" style={{ background: getSegmentColor({ ...activeSpec, height: heightOption }) }} />
            {activeSpec.system === "TWIN_BAR"
              ? `${heightOption} ${activeSpec.twinBarVariant === "SUPER_REBOUND" ? "Super Rebound" : "Standard"}`
              : `Roll Form ${heightOption}`}
          </div>
        ))}
      </div>
    </section>
  );
}

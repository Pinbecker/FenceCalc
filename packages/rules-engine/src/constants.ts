import type {
  FenceSpec,
  RollFormHeightKey,
  TwinBarHeightKey
} from "@fence-estimator/contracts";

export const TWIN_BAR_PANEL_WIDTH_MM = 2525;
export const ROLL_LENGTH_MM = 25000;

/**
 * This defaults to the panel center style spacing until a catalogue-specific
 * Roll Form post spacing is provided.
 */
export const ROLL_FORM_BAY_WIDTH_MM = 2525;

export interface LayerConfig {
  heightMm: number;
}

export interface SpecConfig {
  assembledHeightMm: number;
  bayWidthMm: number;
  layers: LayerConfig[];
}

const TWIN_BAR_HEIGHT_CONFIG: Record<TwinBarHeightKey, SpecConfig> = {
  "1.2m": {
    assembledHeightMm: 1200,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 1000 }]
  },
  "1.8m": {
    assembledHeightMm: 1800,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 1800 }]
  },
  "2m": {
    assembledHeightMm: 2000,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 2000 }]
  },
  "2.4m": {
    assembledHeightMm: 2400,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 2400 }]
  },
  "3m": {
    assembledHeightMm: 3000,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 3000 }]
  },
  "4m": {
    assembledHeightMm: 4000,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 3000 }, { heightMm: 1000 }]
  },
  "4.5m": {
    assembledHeightMm: 4500,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 3000 }, { heightMm: 1400 }]
  },
  "5m": {
    assembledHeightMm: 5000,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 3000 }, { heightMm: 2000 }]
  },
  "6m": {
    assembledHeightMm: 6000,
    bayWidthMm: TWIN_BAR_PANEL_WIDTH_MM,
    layers: [{ heightMm: 3000 }, { heightMm: 3000 }]
  }
};

const ROLL_FORM_HEIGHT_CONFIG: Record<RollFormHeightKey, SpecConfig> = {
  "2m": {
    assembledHeightMm: 2100,
    bayWidthMm: ROLL_FORM_BAY_WIDTH_MM,
    layers: [{ heightMm: 2100 }]
  },
  "3m": {
    assembledHeightMm: 3000,
    bayWidthMm: ROLL_FORM_BAY_WIDTH_MM,
    layers: [{ heightMm: 2100 }, { heightMm: 900 }]
  }
};

export function getSpecConfig(spec: FenceSpec): SpecConfig {
  if (spec.system === "TWIN_BAR") {
    const config = TWIN_BAR_HEIGHT_CONFIG[spec.height];
    if (!config) {
      throw new Error(`Unsupported twin bar height: ${spec.height}`);
    }
    return config;
  }

  if (spec.height === "2m" || spec.height === "3m") {
    return ROLL_FORM_HEIGHT_CONFIG[spec.height];
  }
  throw new Error(`Unsupported roll form height: ${spec.height}`);
}

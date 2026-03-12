import {
  ROLL_FORM_HEIGHT_KEYS,
  TWIN_BAR_HEIGHT_KEYS,
  type FenceHeightKey,
  type FenceSpec,
  type PointMm
} from "@fence-estimator/contracts";

export const MIN_SEGMENT_MM = 50;
export const DRAW_INCREMENT_MM = 50;
export const GRID_STEPS_MM = [250, 500, 1000, 2500, 5000, 10000];
export const MIN_GRID_PIXEL_SPACING = 40;
export const MIN_SCALE = 0.003;
export const MAX_SCALE = 3;
export const MINOR_GRID_STROKE_PX = 0.8;
export const MAJOR_GRID_STROKE_PX = 1.3;
export const SEGMENT_STROKE_PX = 3.5;
export const SEGMENT_SELECTED_STROKE_PX = 5;
export const GHOST_STROKE_PX = 2.8;
export const LABEL_FONT_SIZE_PX = 12;
export const SEGMENT_LABEL_OFFSET_PX = 18;
export const GATE_LABEL_OFFSET_PX = 18;
export const HANDLE_RADIUS_PX = 7;
export const POST_SYMBOL_RADIUS_PX = 5;
export const NODE_SNAP_DISTANCE_PX = 14;
export const AXIS_GUIDE_SNAP_PX = 16;
export const DRAW_LINE_SNAP_PX = 18;
export const RECESS_POINTER_SNAP_PX = 20;
export const GATE_POINTER_SNAP_PX = 20;
export const RECESS_CORNER_SNAP_MM = 250;
export const RECESS_WIDTH_OPTIONS_MM = [500, 1000, 1500, 2000, 2500, 3000];
export const RECESS_DEPTH_OPTIONS_MM = [500, 1000, 1500, 2000];
export const SINGLE_GATE_WIDTH_MM = 1200;
export const DOUBLE_GATE_WIDTH_MM = 3000;
export const GATE_WIDTH_OPTIONS_MM = [1000, 1200, 1500, 1800, 2400, 3000, 3600, 4000];
export const GATE_OPEN_ANGLE_DEGREES = 33;
export const GATE_DOUBLE_LEAF_THRESHOLD_MM = 1800;
export const RECESS_INPUT_STEP_M = 0.05;
export const INITIAL_VISIBLE_WIDTH_MM = 150000;
export const SCALE_BAR_TARGET_RATIO = 0.18;
export const SCALE_BAR_MAX_RATIO = 0.4;
export const SCALE_BAR_CANDIDATES_MM = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000
];

const TWIN_BAR_STANDARD_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#f6e58d",
  "1.8m": "#b8f2d0",
  "2m": "#a9d6ff",
  "2.4m": "#d7c6ff",
  "3m": "#ffc3b0",
  "4m": "#ffd6a5",
  "4.5m": "#f7b2d9",
  "5m": "#b8f2e6",
  "6m": "#d9ed92"
};

const TWIN_BAR_SUPER_REBOUND_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#d4a700",
  "1.8m": "#18a558",
  "2m": "#1d6fd6",
  "2.4m": "#6e44c7",
  "3m": "#e85d04",
  "4m": "#f77f00",
  "4.5m": "#d63384",
  "5m": "#0f9d8a",
  "6m": "#7cb518"
};

const ROLL_FORM_COLORS: Record<(typeof ROLL_FORM_HEIGHT_KEYS)[number], string> = {
  "2m": "#00a884",
  "3m": "#ffd166"
};

export const TWIN_BAR_HEIGHT_OPTIONS: FenceHeightKey[] = [...TWIN_BAR_HEIGHT_KEYS];
export const ROLL_FORM_HEIGHT_OPTIONS: FenceHeightKey[] = [...ROLL_FORM_HEIGHT_KEYS];

export function defaultFenceSpec(): FenceSpec {
  return {
    system: "TWIN_BAR",
    height: "2m",
    twinBarVariant: "STANDARD"
  };
}

export function getSegmentColor(spec: FenceSpec): string {
  if (spec.system === "ROLL_FORM") {
    if (spec.height === "2m") {
      return ROLL_FORM_COLORS["2m"];
    }
    if (spec.height === "3m") {
      return ROLL_FORM_COLORS["3m"];
    }
    return "#2fbf71";
  }

  const palette = spec.twinBarVariant === "SUPER_REBOUND" ? TWIN_BAR_SUPER_REBOUND_COLORS : TWIN_BAR_STANDARD_COLORS;
  switch (spec.height) {
    case "1.2m":
      return palette["1.2m"];
    case "1.8m":
      return palette["1.8m"];
    case "2m":
      return palette["2m"];
    case "2.4m":
      return palette["2.4m"];
    case "3m":
      return palette["3m"];
    case "4m":
      return palette["4m"];
    case "4.5m":
      return palette["4.5m"];
    case "5m":
      return palette["5m"];
    case "6m":
      return palette["6m"];
    default:
      return spec.twinBarVariant === "SUPER_REBOUND" ? "#ff8438" : "#4f83ff";
  }
}

export function parseMetersInputToMm(value: string): number | null {
  const parsedMeters = Number(value);
  if (!Number.isFinite(parsedMeters)) {
    return null;
  }
  const parsedMm = Math.round((parsedMeters * 1000) / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  if (parsedMm < DRAW_INCREMENT_MM) {
    return null;
  }
  return parsedMm;
}

export function quantize(point: PointMm): PointMm {
  return {
    x: Math.round(point.x / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM,
    y: Math.round(point.y / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM
  };
}

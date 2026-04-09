import {
  BASKETBALL_ARM_LENGTHS_MM,
  GOAL_UNIT_HEIGHTS_MM,
  GOAL_UNIT_WIDTHS_MM,
  KICKBOARD_SECTION_HEIGHTS_MM,
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
export const RECESS_WIDTH_OPTIONS_MM = [1000, 1500, 2500, 4000, 6000, 7500, 9000];
export const RECESS_DEPTH_OPTIONS_MM = [500, 1000, 1500, 2000, 2500, 3000];
export const SINGLE_GATE_WIDTH_MM = 1200;
export const DOUBLE_GATE_WIDTH_MM = 3000;
export const GATE_WIDTH_OPTIONS_MM = [1000, 1200, 1500, 1800, 2400, 3000, 3600, 4000];
export const GATE_OPEN_ANGLE_DEGREES = 33;
export const GATE_DOUBLE_LEAF_THRESHOLD_MM = 1800;
export const RECESS_INPUT_STEP_M = 0.05;
export const GOAL_UNIT_WIDTH_OPTIONS_MM = [...GOAL_UNIT_WIDTHS_MM];
export const GOAL_UNIT_HEIGHT_OPTIONS_MM = [...GOAL_UNIT_HEIGHTS_MM];
export const BASKETBALL_ARM_LENGTH_OPTIONS_MM = [...BASKETBALL_ARM_LENGTHS_MM];
export const KICKBOARD_SECTION_HEIGHT_OPTIONS_MM = [...KICKBOARD_SECTION_HEIGHTS_MM];
export const SIDE_NETTING_HEIGHT_OPTIONS_MM = [500, 1000, 1500, 2000];
export const INITIAL_VISIBLE_WIDTH_MM = 60000;
export const SCALE_BAR_TARGET_RATIO = 0.18;
export const SCALE_BAR_MAX_RATIO = 0.4;
export const SCALE_BAR_CANDIDATES_MM = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000
];

const TWIN_BAR_STANDARD_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#f0e4a4",
  "1.8m": "#b6e4b5",
  "2m": "#a9d6ff",
  "2.4m": "#d4c0ff",
  "3m": "#ffbfab",
  "4m": "#ffd6a5",
  "4.5m": "#f5b7d5",
  "5m": "#9fe2d5",
  "6m": "#d7e7a1"
};

const TWIN_BAR_SUPER_REBOUND_COLORS: Record<(typeof TWIN_BAR_HEIGHT_KEYS)[number], string> = {
  "1.2m": "#d4af1f",
  "1.8m": "#37a64b",
  "2m": "#2f6bff",
  "2.4m": "#7a48e8",
  "3m": "#e36a3b",
  "4m": "#f08c00",
  "4.5m": "#c2458b",
  "5m": "#119d84",
  "6m": "#86b220"
};

const ROLL_FORM_COLORS: Record<(typeof ROLL_FORM_HEIGHT_KEYS)[number], string> = {
  "2m": TWIN_BAR_STANDARD_COLORS["2m"],
  "3m": TWIN_BAR_STANDARD_COLORS["3m"]
};

export const TWIN_BAR_HEIGHT_OPTIONS: FenceHeightKey[] = [...TWIN_BAR_HEIGHT_KEYS];
export const ROLL_FORM_HEIGHT_OPTIONS: FenceHeightKey[] = [...ROLL_FORM_HEIGHT_KEYS];

export function defaultFenceSpec(): FenceSpec {
  return {
    system: "TWIN_BAR",
    height: "3m",
    twinBarVariant: "STANDARD"
  };
}

export function getSegmentColor(spec: FenceSpec): string {
  if (spec.system === "ROLL_FORM") {
    return ROLL_FORM_COLORS[spec.height as (typeof ROLL_FORM_HEIGHT_KEYS)[number]] ?? TWIN_BAR_STANDARD_COLORS["2m"];
  }

  const palette = spec.twinBarVariant === "SUPER_REBOUND" ? TWIN_BAR_SUPER_REBOUND_COLORS : TWIN_BAR_STANDARD_COLORS;
  return palette[spec.height as (typeof TWIN_BAR_HEIGHT_KEYS)[number]] ?? TWIN_BAR_STANDARD_COLORS["3m"];
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

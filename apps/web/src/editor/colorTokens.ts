/**
 * Centralised color token system for the editor canvas.
 *
 * Every visual color used on the canvas should originate from this file
 * so the palette can be tuned in a single place.
 */

/* ------------------------------------------------------------------ */
/*  Selection & interaction overlays                                   */
/* ------------------------------------------------------------------ */

export const SELECTION = {
  /** Outer glow behind a selected object */
  glow: "rgba(100, 210, 255, 0.28)",
  /** Primary selection outline stroke */
  outline: "#64d2ff",
  /** Inner highlight on selected segments */
  highlight: "rgba(100, 210, 255, 0.52)",
  /** Fill of endpoint / control handles */
  handleFill: "#64d2ff",
  /** Stroke of endpoint / control handles */
  handleStroke: "rgba(0, 0, 0, 0.35)",
} as const;

export const HOVER = {
  /** Outer glow behind a hovered object */
  glow: "rgba(160, 225, 255, 0.22)",
  /** Primary hover outline stroke */
  outline: "rgba(160, 225, 255, 0.72)",
} as const;

/* ------------------------------------------------------------------ */
/*  Post symbols                                                       */
/* ------------------------------------------------------------------ */

export const POST = {
  stroke: "#14201e",
  fill: {
    END: "#d3c5aa",
    INTERMEDIATE: "#94b8b4",
    CORNER: "#b78f6f",
    JUNCTION: "#8c9fb1",
    INLINE_JOIN: "#a9b4bd",
    GATE: "#c4a66f",
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Segment (fence line) labels                                        */
/* ------------------------------------------------------------------ */

export const SEGMENT_LABEL = {
  default: {
    fill: "rgba(15, 23, 24, 0.74)",
    stroke: "rgba(227, 238, 241, 0.14)",
    textColor: "#dce7ea",
  },
  hover: {
    fill: "rgba(15, 23, 24, 0.74)",
    stroke: "rgba(227, 238, 241, 0.14)",
    textColor: "#f4fbfd",
  },
  selected: {
    fill: "rgba(28, 54, 68, 0.86)",
    stroke: "rgba(100, 210, 255, 0.30)",
    textColor: "#c8edff",
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Segment selection / hover halos                                    */
/* ------------------------------------------------------------------ */

export const SEGMENT_HALO = {
  selected: {
    outer: "rgba(100, 210, 255, 0.35)",
    inner: "rgba(100, 210, 255, 0.58)",
  },
  hover: {
    outer: "rgba(160, 225, 255, 0.22)",
    inner: "rgba(160, 225, 255, 0.48)",
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Gate palettes (keyed by gate type)                                 */
/* ------------------------------------------------------------------ */

export interface GateColorSet {
  frameStroke: string;
  leafStroke: string;
  swingStroke: string;
  markerFill: string;
  labelColor: string;
}

interface GateStatePalette {
  default: GateColorSet;
  hover: GateColorSet;
  selected: GateColorSet;
}

export const GATE_PALETTES: Record<string, GateStatePalette> = {
  DOUBLE_LEAF: {
    default: {
      frameStroke: "#9aca74",
      leafStroke: "#e7ffd0",
      swingStroke: "#7ab542",
      markerFill: "#f2ffe4",
      labelColor: "#edffd7",
    },
    hover: {
      frameStroke: "#c7efaf",
      leafStroke: "#f4ffe5",
      swingStroke: "#a8dc6d",
      markerFill: "#fbfff5",
      labelColor: "#f6ffe7",
    },
    selected: {
      frameStroke: "#e0ffc7",
      leafStroke: "#fbffe8",
      swingStroke: "#c3ef83",
      markerFill: "#ffffff",
      labelColor: "#fcffe9",
    },
  },
  CUSTOM: {
    default: {
      frameStroke: "#c78fe8",
      leafStroke: "#f8e6ff",
      swingStroke: "#c169d5",
      markerFill: "#fff1ff",
      labelColor: "#ffeaff",
    },
    hover: {
      frameStroke: "#dfb8f5",
      leafStroke: "#fdf2ff",
      swingStroke: "#d88ae8",
      markerFill: "#fff9ff",
      labelColor: "#fff2ff",
    },
    selected: {
      frameStroke: "#f0d5ff",
      leafStroke: "#fff5ff",
      swingStroke: "#e8a8f3",
      markerFill: "#ffffff",
      labelColor: "#fff7ff",
    },
  },
  DEFAULT: {
    default: {
      frameStroke: "#7fcaf3",
      leafStroke: "#fff0c6",
      swingStroke: "#efaa54",
      markerFill: "#effbff",
      labelColor: "#fff4d6",
    },
    hover: {
      frameStroke: "#b3e3fb",
      leafStroke: "#fff7dd",
      swingStroke: "#f4c173",
      markerFill: "#f9feff",
      labelColor: "#fff9e5",
    },
    selected: {
      frameStroke: "#d7f1ff",
      leafStroke: "#fffbe8",
      swingStroke: "#ffd08a",
      markerFill: "#ffffff",
      labelColor: "#fffdf0",
    },
  },
} as const;

/* ------------------------------------------------------------------ */
/*  Basketball post palettes                                           */
/* ------------------------------------------------------------------ */

export const BASKETBALL_POST = {
  default: { stroke: "#3b2414", accent: "#ffb24d", fill: "#e77c2f" },
  hover: { stroke: "#ffe0bc", accent: "#ffc567", fill: "#f08c3f" },
  selected: { stroke: "#fff3cb", accent: "#ffd27a", fill: "#ff9c48" },
} as const;

/* ------------------------------------------------------------------ */
/*  Floodlight column palettes                                         */
/* ------------------------------------------------------------------ */

export const FLOODLIGHT_COLUMN = {
  default: { stroke: "#7a4c00", fill: "#d89a00", accent: "#ffe36c" },
  hover: { stroke: "#fff2b8", fill: "#eeb63b", accent: "#fff2a0" },
  selected: { stroke: "#fff7d6", fill: "#f3c94d", accent: "#fff6bf" },
} as const;

/* ------------------------------------------------------------------ */
/*  Accessory halo (selected / hover ring around basketball / etc.)    */
/* ------------------------------------------------------------------ */

export const ACCESSORY_HALO = {
  selected: SELECTION.outline,
  hover: HOVER.outline,
} as const;

/* ------------------------------------------------------------------ */
/*  Snap guide colours (differentiated by snap kind)                   */
/* ------------------------------------------------------------------ */

export const SNAP = {
  /** Node-to-node / endpoint snap */
  node: "#5ef0a8",
  /** Axis alignment guide (horizontal / vertical) */
  axis: "#64d2ff",
  /** Midpoint / centered snap */
  centered: "#c9a0ff",
  /** Alignment snap to neighbouring object */
  alignment: "#ffbe5c",
  /** Generic / fallback guide colour */
  guide: "#b8c8d0",
  /** Close-loop snap target */
  closeLoop: "#5ef0a8",
  /** Indicator dot fill */
  indicatorFill: "#ffffff",
} as const;

/* ------------------------------------------------------------------ */
/*  Canvas chrome                                                      */
/* ------------------------------------------------------------------ */

export const GRID = {
  major: "rgba(173, 188, 189, 0.16)",
  minor: "rgba(173, 188, 189, 0.08)",
} as const;

/* ------------------------------------------------------------------ */
/*  Zoom-level detail tiers                                            */
/* ------------------------------------------------------------------ */

export type DetailLevel = "full" | "reduced" | "overview" | "schematic";

/**
 * Determine which rendering detail tier to use based on current canvas
 * scale. Each tier progressively simplifies minor detail so dense drawings
 * remain legible at low zoom levels.
 *
 *  full      (scale >= 0.15)  - all geometry, labels, and post shapes
 *  reduced   (0.06 - 0.15)    - simplified post dots, reduced labels
 *  overview  (0.02 - 0.06)    - smaller post dots, hide minor labels
 *  schematic (< 0.02)         - minimum-size post dots and line emphasis
 */
export function getDetailLevel(scale: number): DetailLevel {
  if (scale >= 0.15) return "full";
  if (scale >= 0.06) return "reduced";
  if (scale >= 0.02) return "overview";
  return "schematic";
}

/**
 * Intermediate posts stay visible at every detail level; decluttering is
 * handled by simplification and size reduction rather than removal.
 */
export function shouldShowIntermediatePosts(level: DetailLevel): boolean {
  return level === "full" || level === "reduced" || level === "overview" || level === "schematic";
}

/**
 * Should any post symbols be rendered?
 */
export function shouldShowPosts(level: DetailLevel): boolean {
  return level === "full" || level === "reduced" || level === "overview" || level === "schematic";
}

/**
 * Should gate swing arcs be rendered (vs. simplified line)?
 */
export function shouldShowGateDetail(level: DetailLevel): boolean {
  return level === "full";
}

/**
 * Should non-selected / non-hovered labels be rendered?
 */
export function shouldShowMinorLabels(level: DetailLevel): boolean {
  return level === "full" || level === "reduced";
}

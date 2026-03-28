import { z } from "zod";
import {
  BASKETBALL_ARM_LENGTHS_MM,
  DRAWING_STATUSES,
  FENCE_HEIGHT_KEYS,
  GOAL_UNIT_HEIGHTS_MM,
  GOAL_UNIT_WIDTHS_MM,
  JOB_STAGES,
  KICKBOARD_SECTION_HEIGHTS_MM,
  PITCH_DIVIDER_MAX_SPAN_MM,
  ROLL_FORM_HEIGHT_KEYS,
  SIDE_NETTING_EXTENDED_POST_INTERVAL,
  SIDE_NETTING_MAX_ADDITIONAL_HEIGHT_MM,
  TWIN_BAR_HEIGHT_KEYS
} from "./domain.js";
import { PRICING_ITEM_CATEGORIES } from "./estimating.js";
import { INSTALL_LIFT_LEVELS, PRICING_WORKBOOK_RATE_MODES, PRICING_WORKBOOK_SHEETS } from "./pricingWorkbook.js";

const goalUnitWidthMmSchema = z.union([
  z.literal(GOAL_UNIT_WIDTHS_MM[0]),
  z.literal(GOAL_UNIT_WIDTHS_MM[1]),
  z.literal(GOAL_UNIT_WIDTHS_MM[2])
]);
const goalUnitHeightMmSchema = z.union([
  z.literal(GOAL_UNIT_HEIGHTS_MM[0]),
  z.literal(GOAL_UNIT_HEIGHTS_MM[1])
]);
const basketballArmLengthMmSchema = z.union([
  z.literal(BASKETBALL_ARM_LENGTHS_MM[0]),
  z.literal(BASKETBALL_ARM_LENGTHS_MM[1])
]);
const kickboardSectionHeightMmSchema = z.union([
  z.literal(KICKBOARD_SECTION_HEIGHTS_MM[0]),
  z.literal(KICKBOARD_SECTION_HEIGHTS_MM[1]),
  z.literal(KICKBOARD_SECTION_HEIGHTS_MM[2])
]);

export const pointMmSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

export const drawingCanvasViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  scale: z.number().finite().positive()
});

export const fenceSystemSchema = z.enum(["TWIN_BAR", "ROLL_FORM"]);
export const fenceHeightKeySchema = z.enum(FENCE_HEIGHT_KEYS);
export const twinBarVariantSchema = z.enum(["STANDARD", "SUPER_REBOUND"]);
const twinBarHeights = new Set<string>(TWIN_BAR_HEIGHT_KEYS);
const rollFormHeights = new Set<string>(ROLL_FORM_HEIGHT_KEYS);

export const fenceSpecSchema = z.object({
  system: fenceSystemSchema,
  height: fenceHeightKeySchema,
  twinBarVariant: twinBarVariantSchema.optional()
}).superRefine((spec, context) => {
  if (spec.system === "ROLL_FORM" && !rollFormHeights.has(spec.height)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported roll form height: ${spec.height}`
    });
  }
  if (spec.system === "TWIN_BAR" && !twinBarHeights.has(spec.height)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported twin bar height: ${spec.height}`
    });
  }
});

export const layoutSegmentSchema = z.object({
  id: z.string().min(1),
  start: pointMmSchema,
  end: pointMmSchema,
  spec: fenceSpecSchema
});

export const gateTypeSchema = z.enum(["SINGLE_LEAF", "DOUBLE_LEAF", "CUSTOM"]);
export const gatePlacementSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  startOffsetMm: z.number().finite().nonnegative(),
  endOffsetMm: z.number().finite().positive(),
  gateType: gateTypeSchema
}).superRefine((gate, context) => {
  if (gate.endOffsetMm <= gate.startOffsetMm) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Gate end offset must be greater than the start offset"
    });
  }
});

export const inlineFeatureFacingSchema = z.enum(["LEFT", "RIGHT"]);
export const goalUnitPlacementSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  centerOffsetMm: z.number().finite().nonnegative(),
  side: inlineFeatureFacingSchema,
  widthMm: goalUnitWidthMmSchema,
  depthMm: z.number().finite().positive(),
  goalHeightMm: goalUnitHeightMmSchema
});
export const basketballFeaturePlacementSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  offsetMm: z.number().finite().nonnegative(),
  facing: inlineFeatureFacingSchema,
  type: z.enum(["DEDICATED_POST", "MOUNTED_TO_EXISTING_POST", "GOAL_UNIT_INTEGRATED"]).default("DEDICATED_POST"),
  mountingMode: z.enum(["PROJECTING_ARM", "POST_MOUNTED", "GOAL_UNIT_REAR_CENTER"]).default("PROJECTING_ARM"),
  armLengthMm: basketballArmLengthMmSchema.optional(),
  pairedFeatureId: z.string().min(1).nullable().optional(),
  replacesIntermediatePost: z.boolean().default(true),
  goalUnitId: z.string().min(1).nullable().optional()
}).superRefine((feature, context) => {
  if (feature.type === "DEDICATED_POST") {
    if (feature.armLengthMm === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dedicated basketball posts require an arm length"
      });
    }
    if (feature.mountingMode !== "PROJECTING_ARM") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dedicated basketball posts must use projecting-arm mounting"
      });
    }
  }
  if (feature.type === "MOUNTED_TO_EXISTING_POST") {
    if (feature.armLengthMm !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mounted basketball assemblies cannot define an arm length"
      });
    }
    if (feature.mountingMode !== "POST_MOUNTED") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mounted basketball assemblies must use post-mounted mode"
      });
    }
  }
  if (feature.type === "GOAL_UNIT_INTEGRATED") {
    if (!feature.goalUnitId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Goal-unit integrated basketball assemblies must reference a goal unit"
      });
    }
    if (feature.mountingMode !== "GOAL_UNIT_REAR_CENTER") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Goal-unit integrated basketball assemblies must use goal-unit rear-centre mounting"
      });
    }
  }
});
export const floodlightColumnPlacementSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  offsetMm: z.number().finite().nonnegative(),
  facing: inlineFeatureFacingSchema
});
export const kickboardAttachmentSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  sectionHeightMm: kickboardSectionHeightMmSchema,
  thicknessMm: z.literal(50),
  profile: z.enum(["SQUARE", "CHAMFERED"]),
  boardLengthMm: z.literal(2500)
});
export const segmentAnchorSchema = z.object({
  segmentId: z.string().min(1),
  offsetMm: z.number().finite().nonnegative()
});
export const pitchDividerPlacementSchema = z.object({
  id: z.string().min(1),
  startAnchor: segmentAnchorSchema,
  endAnchor: segmentAnchorSchema
});
export const sideNettingAttachmentSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  additionalHeightMm: z.number().finite().positive().max(SIDE_NETTING_MAX_ADDITIONAL_HEIGHT_MM),
  startOffsetMm: z.number().finite().nonnegative().optional(),
  endOffsetMm: z.number().finite().nonnegative().optional(),
  extendedPostInterval: z.literal(SIDE_NETTING_EXTENDED_POST_INTERVAL)
});

const MAX_LAYOUT_SEGMENTS = 2_000;
const MAX_LAYOUT_GATES = 500;
const MAX_LAYOUT_BASKETBALL_FEATURES = 500;
const MAX_LAYOUT_FLOODLIGHT_COLUMNS = 500;
const MAX_LAYOUT_GOAL_UNITS = 200;
const MAX_LAYOUT_KICKBOARDS = 500;
const MAX_LAYOUT_PITCH_DIVIDERS = 200;
const MAX_LAYOUT_SIDE_NETTINGS = 500;

function fenceHeightToMm(heightKey: string): number {
  return Number.parseFloat(heightKey) * 1000;
}

function interpolatePoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  offsetMm: number,
  lengthMm: number
) {
  if (lengthMm <= 0) {
    return start;
  }
  const ratio = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio
  };
}

export const layoutModelSchema = z
  .object({
    segments: z.array(layoutSegmentSchema).max(MAX_LAYOUT_SEGMENTS),
    gates: z.array(gatePlacementSchema).max(MAX_LAYOUT_GATES).default([]),
    basketballFeatures: z.array(basketballFeaturePlacementSchema).max(MAX_LAYOUT_BASKETBALL_FEATURES).default([]),
    basketballPosts: z.array(basketballFeaturePlacementSchema).max(MAX_LAYOUT_BASKETBALL_FEATURES).default([]),
    floodlightColumns: z.array(floodlightColumnPlacementSchema).max(MAX_LAYOUT_FLOODLIGHT_COLUMNS).default([]),
    goalUnits: z.array(goalUnitPlacementSchema).max(MAX_LAYOUT_GOAL_UNITS).default([]),
    kickboards: z.array(kickboardAttachmentSchema).max(MAX_LAYOUT_KICKBOARDS).default([]),
    pitchDividers: z.array(pitchDividerPlacementSchema).max(MAX_LAYOUT_PITCH_DIVIDERS).default([]),
    sideNettings: z.array(sideNettingAttachmentSchema).max(MAX_LAYOUT_SIDE_NETTINGS).default([])
  })
  .superRefine((layout, context) => {
    const basketballFeatures = [...(layout.basketballFeatures ?? []), ...(layout.basketballPosts ?? [])];
    const seenSegmentIds = new Set<string>();
    const segmentLengthById = new Map<string, number>();
    const segmentsById = new Map<string, z.infer<typeof layoutSegmentSchema>>();

    for (const segment of layout.segments) {
      if (seenSegmentIds.has(segment.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate segment id: ${segment.id}`
        });
      }
      seenSegmentIds.add(segment.id);

      const lengthMm = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
      segmentLengthById.set(segment.id, lengthMm);
      segmentsById.set(segment.id, segment);
      if (lengthMm <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Segment ${segment.id} must have a non-zero length`
        });
      }
    }

    const seenGateIds = new Set<string>();
    const gatesBySegmentId = new Map<string, Array<{ id: string; startOffsetMm: number; endOffsetMm: number }>>();

    for (const gate of layout.gates ?? []) {
      if (seenGateIds.has(gate.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate gate id: ${gate.id}`
        });
      }
      seenGateIds.add(gate.id);

      const segmentLengthMm = segmentLengthById.get(gate.segmentId);
      if (segmentLengthMm === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Gate ${gate.id} references missing segment ${gate.segmentId}`
        });
        continue;
      }

      if (gate.endOffsetMm > segmentLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Gate ${gate.id} exceeds segment ${gate.segmentId} length`
        });
      }

      const bucket = gatesBySegmentId.get(gate.segmentId);
      if (bucket) {
        bucket.push(gate);
      } else {
        gatesBySegmentId.set(gate.segmentId, [gate]);
      }
    }

    for (const [segmentId, gates] of gatesBySegmentId) {
      const ordered = [...gates].sort((left, right) => left.startOffsetMm - right.startOffsetMm);
      let previousEndMm = Number.NEGATIVE_INFINITY;
      for (const gate of ordered) {
        if (gate.startOffsetMm < previousEndMm) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Gates on segment ${segmentId} must not overlap`
          });
        }
        previousEndMm = Math.max(previousEndMm, gate.endOffsetMm);
      }
    }

    const seenGoalUnitIds = new Set<string>();
    for (const goalUnit of layout.goalUnits ?? []) {
      if (seenGoalUnitIds.has(goalUnit.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate goal unit id: ${goalUnit.id}`
        });
      }
      seenGoalUnitIds.add(goalUnit.id);

      const segmentLengthMm = segmentLengthById.get(goalUnit.segmentId);
      if (segmentLengthMm === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Goal unit ${goalUnit.id} references missing segment ${goalUnit.segmentId}`
        });
        continue;
      }

      const halfWidthMm = goalUnit.widthMm / 2;
      if (goalUnit.centerOffsetMm - halfWidthMm < 0 || goalUnit.centerOffsetMm + halfWidthMm > segmentLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Goal unit ${goalUnit.id} exceeds segment ${goalUnit.segmentId} length`
        });
      }
    }

    const seenBasketballFeatureIds = new Set<string>();
    for (const basketballFeature of basketballFeatures) {
      if (seenBasketballFeatureIds.has(basketballFeature.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate basketball feature id: ${basketballFeature.id}`
        });
      }
      seenBasketballFeatureIds.add(basketballFeature.id);

      const segmentLengthMm = segmentLengthById.get(basketballFeature.segmentId);
      const segment = segmentsById.get(basketballFeature.segmentId);
      if (segmentLengthMm === undefined || !segment) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Basketball feature ${basketballFeature.id} references missing segment ${basketballFeature.segmentId}`
        });
        continue;
      }

      if (basketballFeature.offsetMm > segmentLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Basketball feature ${basketballFeature.id} exceeds segment ${basketballFeature.segmentId} length`
        });
      }

      const fenceHeightMm = fenceHeightToMm(segment.spec.height);
      if (basketballFeature.type === "DEDICATED_POST" && fenceHeightMm !== 3000 && fenceHeightMm !== 4000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Dedicated basketball feature ${basketballFeature.id} requires a 3.0m or 4.0m fence line`
        });
      }
      if (basketballFeature.type === "MOUNTED_TO_EXISTING_POST" && fenceHeightMm < 3000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Mounted basketball feature ${basketballFeature.id} requires a fence line at least 3.0m high`
        });
      }
    }

    const seenFloodlightColumnIds = new Set<string>();
    for (const floodlightColumn of layout.floodlightColumns ?? []) {
      if (seenFloodlightColumnIds.has(floodlightColumn.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate floodlight column id: ${floodlightColumn.id}`
        });
      }
      seenFloodlightColumnIds.add(floodlightColumn.id);

      const segmentLengthMm = segmentLengthById.get(floodlightColumn.segmentId);
      if (segmentLengthMm === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Floodlight column ${floodlightColumn.id} references missing segment ${floodlightColumn.segmentId}`
        });
        continue;
      }

      if (floodlightColumn.offsetMm > segmentLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Floodlight column ${floodlightColumn.id} exceeds segment ${floodlightColumn.segmentId} length`
        });
      }
    }

    const seenKickboardIds = new Set<string>();
    const kickboardSegmentIds = new Set<string>();
    for (const kickboard of layout.kickboards ?? []) {
      if (seenKickboardIds.has(kickboard.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate kickboard id: ${kickboard.id}`
        });
      }
      seenKickboardIds.add(kickboard.id);

      if (kickboardSegmentIds.has(kickboard.segmentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Kickboard segment ${kickboard.segmentId} can only have one kickboard attachment`
        });
      }
      kickboardSegmentIds.add(kickboard.segmentId);

      if (!segmentLengthById.has(kickboard.segmentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Kickboard ${kickboard.id} references missing segment ${kickboard.segmentId}`
        });
      }
    }

    const seenSideNettingIds = new Set<string>();
    const sideNettingSegmentIds = new Set<string>();
    for (const sideNetting of layout.sideNettings ?? []) {
      if (seenSideNettingIds.has(sideNetting.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate side netting id: ${sideNetting.id}`
        });
      }
      seenSideNettingIds.add(sideNetting.id);

      if (sideNettingSegmentIds.has(sideNetting.segmentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Side netting segment ${sideNetting.segmentId} can only have one side-netting attachment`
        });
      }
      sideNettingSegmentIds.add(sideNetting.segmentId);

      if (!segmentLengthById.has(sideNetting.segmentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Side netting ${sideNetting.id} references missing segment ${sideNetting.segmentId}`
        });
        continue;
      }

      const segmentLengthMm = segmentLengthById.get(sideNetting.segmentId) ?? 0;
      const startOffsetMm = sideNetting.startOffsetMm ?? 0;
      const endOffsetMm = sideNetting.endOffsetMm ?? segmentLengthMm;

      if (startOffsetMm >= endOffsetMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Side netting ${sideNetting.id} must have a positive covered range`
        });
      }

      if (endOffsetMm > segmentLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Side netting ${sideNetting.id} exceeds segment ${sideNetting.segmentId} length`
        });
      }
    }

    const seenPitchDividerIds = new Set<string>();
    for (const pitchDivider of layout.pitchDividers ?? []) {
      if (seenPitchDividerIds.has(pitchDivider.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate pitch divider id: ${pitchDivider.id}`
        });
      }
      seenPitchDividerIds.add(pitchDivider.id);

      const startSegment = segmentsById.get(pitchDivider.startAnchor.segmentId);
      const endSegment = segmentsById.get(pitchDivider.endAnchor.segmentId);
      const startLengthMm = segmentLengthById.get(pitchDivider.startAnchor.segmentId);
      const endLengthMm = segmentLengthById.get(pitchDivider.endAnchor.segmentId);
      if (!startSegment || !endSegment || startLengthMm === undefined || endLengthMm === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Pitch divider ${pitchDivider.id} references missing fence-line anchors`
        });
        continue;
      }

      if (pitchDivider.startAnchor.offsetMm > startLengthMm || pitchDivider.endAnchor.offsetMm > endLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Pitch divider ${pitchDivider.id} exceeds one of its host fence-line lengths`
        });
        continue;
      }

      const startPoint = interpolatePoint(
        startSegment.start,
        startSegment.end,
        pitchDivider.startAnchor.offsetMm,
        startLengthMm
      );
      const endPoint = interpolatePoint(endSegment.start, endSegment.end, pitchDivider.endAnchor.offsetMm, endLengthMm);
      const spanMm = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
      if (spanMm > PITCH_DIVIDER_MAX_SPAN_MM) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Pitch divider ${pitchDivider.id} exceeds the maximum 70m span`
        });
      }
    }
  });

const nonNegativeIntegerSchema = z.number().int().nonnegative();
const postBreakdownSchema = z.object({
  end: nonNegativeIntegerSchema,
  intermediate: nonNegativeIntegerSchema,
  corner: nonNegativeIntegerSchema,
  junction: nonNegativeIntegerSchema,
  inlineJoin: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema
});
const twinBarFenceBreakdownSchema = z.object({
  standard: nonNegativeIntegerSchema,
  superRebound: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema
});
const rollFenceBreakdownSchema = z.object({
  roll2100: nonNegativeIntegerSchema,
  roll900: nonNegativeIntegerSchema,
  total: nonNegativeIntegerSchema
});
const featureQuantityLineSchema = z.object({
  key: z.string().trim().min(1).max(160),
  kind: z.enum(["GOAL_UNIT", "BASKETBALL", "KICKBOARD", "PITCH_DIVIDER", "SIDE_NETTING"]),
  component: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  quantity: z.number().finite().min(0),
  unit: z.enum(["item", "panel", "post", "assembly", "board", "m", "m2"]),
  relatedIds: z.array(z.string().trim().min(1).max(160)).max(20).optional()
});
const twinBarCutSectionSchema = z.object({
  segmentId: z.string().min(1),
  startOffsetMm: z.number().finite().nonnegative(),
  endOffsetMm: z.number().finite().nonnegative(),
  lengthMm: z.number().finite().nonnegative()
});
const twinBarOptimizationCutSchema = z.object({
  id: z.string().min(1),
  step: nonNegativeIntegerSchema,
  mode: z.enum(["OPEN_STOCK_PANEL", "REUSE_OFFCUT"]),
  demand: twinBarCutSectionSchema,
  lengthMm: z.number().finite().nonnegative(),
  effectiveLengthMm: z.number().finite().nonnegative(),
  offcutBeforeMm: z.number().finite().nonnegative(),
  offcutAfterMm: z.number().finite().nonnegative()
});
const twinBarOptimizationPlanSchema = z.object({
  id: z.string().min(1),
  variant: twinBarVariantSchema,
  stockPanelHeightMm: nonNegativeIntegerSchema,
  stockPanelWidthMm: nonNegativeIntegerSchema,
  cuts: z.array(twinBarOptimizationCutSchema),
  consumedMm: z.number().finite().nonnegative(),
  leftoverMm: z.number().finite().nonnegative(),
  reusableLeftoverMm: z.number().finite().nonnegative(),
  reusedCuts: nonNegativeIntegerSchema,
  panelsSaved: nonNegativeIntegerSchema
});
const twinBarOptimizationBucketSchema = z.object({
  variant: twinBarVariantSchema,
  stockPanelHeightMm: nonNegativeIntegerSchema,
  solver: z.enum(["EXACT_SEARCH", "BEST_FIT_DECREASING"]),
  fullPanels: nonNegativeIntegerSchema,
  cutDemands: nonNegativeIntegerSchema,
  stockPanelsOpened: nonNegativeIntegerSchema,
  reusedCuts: nonNegativeIntegerSchema,
  baselinePanels: nonNegativeIntegerSchema,
  optimizedPanels: nonNegativeIntegerSchema,
  panelsSaved: nonNegativeIntegerSchema,
  totalConsumedMm: z.number().finite().nonnegative(),
  totalLeftoverMm: z.number().finite().nonnegative(),
  reusableLeftoverMm: z.number().finite().nonnegative(),
  utilizationRate: z.number().finite().min(0),
  plans: z.array(twinBarOptimizationPlanSchema)
});

export const estimateResultSchema = z.object({
  posts: z.object({
    terminal: nonNegativeIntegerSchema,
    intermediate: nonNegativeIntegerSchema,
    total: nonNegativeIntegerSchema,
    cornerPosts: nonNegativeIntegerSchema,
    byHeightAndType: z.record(z.string(), postBreakdownSchema),
    byHeightMm: z.record(z.string(), nonNegativeIntegerSchema)
  }),
  corners: z.object({
    total: nonNegativeIntegerSchema,
    internal: nonNegativeIntegerSchema,
    external: nonNegativeIntegerSchema,
    unclassified: nonNegativeIntegerSchema,
    byHeightMm: z
      .record(
        z.string(),
        z.object({
          total: nonNegativeIntegerSchema,
          internal: nonNegativeIntegerSchema,
          external: nonNegativeIntegerSchema,
          unclassified: nonNegativeIntegerSchema
        })
      )
      .default({})
  }),
  materials: z.object({
    twinBarPanels: nonNegativeIntegerSchema,
    twinBarPanelsSuperRebound: nonNegativeIntegerSchema,
    twinBarPanelsByStockHeightMm: z.record(z.string(), nonNegativeIntegerSchema),
    twinBarPanelsByFenceHeight: z.record(z.string(), twinBarFenceBreakdownSchema),
    roll2100: nonNegativeIntegerSchema,
    roll900: nonNegativeIntegerSchema,
    totalRolls: nonNegativeIntegerSchema,
    rollsByFenceHeight: z.record(z.string(), rollFenceBreakdownSchema)
  }),
  featureQuantities: z.array(featureQuantityLineSchema).max(2_000).default([]),
  optimization: z.object({
    strategy: z.literal("CHAINED_CUT_PLANNER"),
    twinBar: z.object({
      reuseAllowanceMm: z.number().finite().nonnegative(),
      stockPanelWidthMm: z.number().finite().nonnegative(),
      fixedFullPanels: nonNegativeIntegerSchema,
      baselinePanels: nonNegativeIntegerSchema,
      optimizedPanels: nonNegativeIntegerSchema,
      panelsSaved: nonNegativeIntegerSchema,
      totalCutDemands: nonNegativeIntegerSchema,
      stockPanelsOpened: nonNegativeIntegerSchema,
      reusedCuts: nonNegativeIntegerSchema,
      totalConsumedMm: z.number().finite().nonnegative(),
      totalLeftoverMm: z.number().finite().nonnegative(),
      reusableLeftoverMm: z.number().finite().nonnegative(),
      utilizationRate: z.number().finite().min(0),
      buckets: z.array(twinBarOptimizationBucketSchema)
    })
  }),
  segments: z.array(
    z.object({
      segmentId: z.string().min(1),
      lengthMm: nonNegativeIntegerSchema,
      bays: nonNegativeIntegerSchema,
      intermediatePosts: nonNegativeIntegerSchema,
      panels: nonNegativeIntegerSchema,
      roll2100: nonNegativeIntegerSchema,
      roll900: nonNegativeIntegerSchema
    })
  )
});

export const estimateSnapshotRequestSchema = z.object({
  layout: layoutModelSchema
});

export const pricingItemCategorySchema = z.enum(PRICING_ITEM_CATEGORIES);
export const pricingItemSchema = z.object({
  itemCode: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(200),
  category: pricingItemCategorySchema,
  fenceSystem: fenceSystemSchema,
  unit: z.string().trim().min(1).max(40),
  materialCost: z.number().finite().min(0),
  labourCost: z.number().finite().min(0),
  isActive: z.boolean(),
  notes: z.string().trim().max(600).optional(),
  sortOrder: z.number().finite().optional()
});

export const pricingWorkbookSheetSchema = z.enum(PRICING_WORKBOOK_SHEETS);
export const pricingWorkbookRateModeSchema = z.enum(PRICING_WORKBOOK_RATE_MODES);
export const installLiftLevelSchema = z.enum(INSTALL_LIFT_LEVELS);

const pricingWorkbookQuantityRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("MANUAL_ENTRY"),
    defaultQuantity: z.number().finite().min(0).optional()
  }),
  z.object({
    kind: z.literal("PANEL_COUNT"),
    heightKey: fenceHeightKeySchema,
    variant: z.enum(["STANDARD", "SUPER_REBOUND", "TOTAL"])
  }),
  z.object({
    kind: z.literal("PANEL_LAYER_COUNT"),
    panelHeightMm: z.number().finite().positive(),
    variant: z.enum(["STANDARD", "SUPER_REBOUND", "TOTAL"]),
    lift: installLiftLevelSchema.optional()
  }),
  z.object({
    kind: z.literal("POST_COUNT"),
    heightMm: z.number().finite().nonnegative(),
    postType: z.enum(["end", "intermediate", "corner", "junction", "inlineJoin", "total"])
  }),
  z.object({
    kind: z.literal("CORNER_COUNT"),
    heightMm: z.number().finite().nonnegative(),
    cornerType: z.enum(["internal", "external", "unclassified", "total"])
  }),
  z.object({
    kind: z.literal("TOP_RAIL_COUNT"),
    heightKey: fenceHeightKeySchema
  }),
  z.object({
    kind: z.literal("GATE_COUNT"),
    heightKey: fenceHeightKeySchema,
    gateType: gateTypeSchema,
    output: z.enum(["gate", "leaf", "post_set"])
  }),
  z.object({
    kind: z.literal("GATE_COUNT_BUCKET"),
    heightBucket: z.enum(["UP_TO_4M", "AT_LEAST_4_5M"]),
    gateType: z.enum(["SINGLE_LEAF", "DOUBLE_LEAF"])
  }),
  z.object({
    kind: z.literal("FEATURE_QUANTITY"),
    featureKind: z.enum(["GOAL_UNIT", "BASKETBALL", "KICKBOARD", "PITCH_DIVIDER", "SIDE_NETTING"]),
    component: z.string().trim().min(1).max(120)
  }),
  z.object({
    kind: z.literal("FLOODLIGHT_COLUMN_COUNT")
  }),
  z.object({
    kind: z.literal("TOTAL_POSTS_BY_HEIGHT"),
    heightMm: z.number().finite().nonnegative()
  }),
  z.object({
    kind: z.literal("TOTAL_POSTS")
  })
]);

export const pricingWorkbookRowSchema = z.object({
  code: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(240),
  unit: z.string().trim().min(1).max(40),
  rate: z.number().finite().min(0),
  rateMode: pricingWorkbookRateModeSchema.optional(),
  quantityRule: pricingWorkbookQuantityRuleSchema,
  notes: z.string().trim().max(600).optional(),
  tone: z.enum(["default", "highlight", "manual", "warning"]).optional()
});

export const pricingWorkbookSectionSchema = z.object({
  key: z.string().trim().min(1).max(160),
  sheet: pricingWorkbookSheetSchema,
  title: z.string().trim().min(1).max(160),
  caption: z.string().trim().max(240).optional(),
  rows: z.array(pricingWorkbookRowSchema).max(400)
});

export const pricingWorkbookSettingsSchema = z.object({
  labourOverheadPercent: z.number().finite().min(0),
  travelLodgePerDay: z.number().finite().min(0),
  markupRate: z.number().finite().min(0),
  distributionCharge: z.number().finite().min(0),
  concretePricePerCube: z.number().finite().min(0),
  hardDigDefault: z.boolean(),
  clearSpoilsDefault: z.boolean(),
  colourOption: z.string().trim().min(1).max(120)
});

export const pricingWorkbookConfigSchema = z.object({
  settings: pricingWorkbookSettingsSchema,
  sections: z.array(pricingWorkbookSectionSchema).max(80)
});

export const estimateWorkbookManualEntrySchema = z.object({
  code: z.string().trim().min(1).max(160),
  quantity: z.number().finite().min(0)
});

export const estimateWorkbookCommercialInputsSchema = z.object({
  travelDays: z.number().finite().min(0),
  markupUnits: z.number().finite().min(0)
});

export const estimateWorkbookRowSchema = z.object({
  code: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(240),
  unit: z.string().trim().min(1).max(40),
  quantity: z.number().finite().min(0),
  rate: z.number().finite().min(0),
  rateMode: pricingWorkbookRateModeSchema,
  total: z.number().finite().min(0),
  isEditable: z.boolean(),
  notes: z.string().trim().max(600).optional(),
  tone: z.enum(["default", "highlight", "manual", "warning"]).optional()
});

export const estimateWorkbookSectionSchema = z.object({
  key: z.string().trim().min(1).max(160),
  sheet: pricingWorkbookSheetSchema,
  title: z.string().trim().min(1).max(160),
  caption: z.string().trim().max(240).optional(),
  subtotal: z.number().finite().min(0),
  rows: z.array(estimateWorkbookRowSchema).max(400)
});

export const estimateWorkbookTotalsSchema = z.object({
  materialsSubtotal: z.number().finite().min(0),
  labourSubtotal: z.number().finite().min(0),
  labourOverheadPercent: z.number().finite().min(0),
  labourOverheadAmount: z.number().finite().min(0),
  distributionCharge: z.number().finite().min(0),
  travelDays: z.number().finite().min(0),
  travelRatePerDay: z.number().finite().min(0),
  travelTotal: z.number().finite().min(0),
  markupUnits: z.number().finite().min(0),
  markupRate: z.number().finite().min(0),
  markupTotal: z.number().finite().min(0),
  grandTotal: z.number().finite().min(0)
});

export const estimateWorkbookSchema = z.object({
  settings: pricingWorkbookSettingsSchema,
  sections: z.array(estimateWorkbookSectionSchema).max(80),
  manualEntries: z.array(estimateWorkbookManualEntrySchema).max(200).default([]),
  commercialInputs: estimateWorkbookCommercialInputsSchema,
  totals: estimateWorkbookTotalsSchema
});

export const pricingConfigRecordSchema = z.object({
  companyId: z.string().trim().min(0).max(120),
  items: z.array(pricingItemSchema).max(500),
  workbook: pricingWorkbookConfigSchema.optional(),
  updatedAtIso: z.string().datetime(),
  updatedByUserId: z.string().trim().min(1).max(120).nullable()
});

export const pricingConfigUpdateRequestSchema = z
  .object({
    items: z.array(pricingItemSchema).max(500).optional(),
    workbook: pricingWorkbookConfigSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.items === undefined && value.workbook === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one pricing payload field must be provided"
      });
    }
  });

export const ancillaryEstimateItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  quantity: z.number().finite().min(0),
  materialCost: z.number().finite().min(0),
  labourCost: z.number().finite().min(0)
});

export const estimateWarningSchema = z.object({
  code: z.enum([
    "UNSUPPORTED_FENCE_SYSTEM",
    "INLINE_JOIN_OR_JUNCTION_POSTS",
    "UNCLASSIFIED_CORNERS",
    "CUSTOM_GATES",
    "FIXINGS_EXCLUDED"
  ]),
  message: z.string().trim().min(1).max(600)
});

export const estimatePricingSnapshotSchema = z.object({
  updatedAtIso: z.string().datetime(),
  updatedByUserId: z.string().trim().min(1).max(120).nullable(),
  source: z.enum(["DEFAULT", "COMPANY_CONFIG"])
});

export const estimateRowSchema = z.object({
  key: z.string().trim().min(1).max(160),
  itemCode: z.string().trim().min(1).max(160).nullable(),
  itemName: z.string().trim().min(1).max(240),
  category: pricingItemCategorySchema,
  quantity: z.number().finite().min(0),
  unit: z.string().trim().min(1).max(40),
  unitMaterialCost: z.number().finite().min(0),
  unitLabourCost: z.number().finite().min(0),
  totalMaterialCost: z.number().finite().min(0),
  totalLabourCost: z.number().finite().min(0),
  totalCost: z.number().finite().min(0),
  notes: z.string().trim().max(600).optional()
});

export const estimateGroupSchema = z.object({
  key: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  rows: z.array(estimateRowSchema).max(500),
  subtotalMaterialCost: z.number().finite().min(0),
  subtotalLabourCost: z.number().finite().min(0),
  subtotalCost: z.number().finite().min(0)
});

export const pricedEstimateResultSchema = z.object({
  drawing: z.object({
    drawingId: z.string().trim().min(1).max(120),
    drawingName: z.string().trim().min(1).max(160),
    customerId: z.string().trim().min(1).max(120).nullable(),
    customerName: z.string().trim().min(1).max(160)
  }),
  groups: z.array(estimateGroupSchema).max(200),
  ancillaryItems: z.array(ancillaryEstimateItemSchema).max(200),
  manualEntries: z.array(estimateWorkbookManualEntrySchema).max(200).default([]),
  workbook: estimateWorkbookSchema.optional(),
  totals: z.object({
    materialCost: z.number().finite().min(0),
    labourCost: z.number().finite().min(0),
    totalCost: z.number().finite().min(0)
  }),
  warnings: z.array(estimateWarningSchema).max(50),
  pricingSnapshot: estimatePricingSnapshotSchema
});

export const quoteDrawingSnapshotSchema = z.object({
  drawingId: z.string().trim().min(1).max(120),
  drawingName: z.string().trim().min(1).max(160),
  customerId: z.string().trim().min(1).max(120).nullable(),
  customerName: z.string().trim().min(1).max(160),
  layout: layoutModelSchema,
  savedViewport: drawingCanvasViewportSchema.nullable().optional(),
  estimate: estimateResultSchema,
  schemaVersion: z.coerce.number().int().min(1),
  rulesVersion: z.string().trim().min(1).max(120),
  versionNumber: z.coerce.number().int().min(1),
  revisionNumber: z.coerce.number().int().min(0).optional()
});

export const quoteRecordSchema = z.object({
  id: z.string().trim().min(1).max(120),
  companyId: z.string().trim().min(1).max(120),
  jobId: z.string().trim().min(1).max(120).optional(),
  sourceDrawingId: z.string().trim().min(1).max(120).optional(),
  sourceDrawingVersionNumber: z.coerce.number().int().min(1).optional(),
  drawingId: z.string().trim().min(1).max(120),
  drawingVersionNumber: z.coerce.number().int().min(1),
  pricedEstimate: pricedEstimateResultSchema,
  drawingSnapshot: quoteDrawingSnapshotSchema,
  createdByUserId: z.string().trim().min(1).max(120),
  createdAtIso: z.string().datetime()
});

export const quoteCreateRequestSchema = z.object({
  ancillaryItems: z.array(ancillaryEstimateItemSchema).max(200).default([]),
  manualEntries: z.array(estimateWorkbookManualEntrySchema).max(200).default([])
});

export const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(10).max(128);
export const companyNameSchema = z.string().trim().min(2).max(120);
export const displayNameSchema = z.string().trim().min(2).max(120);
export const drawingNameSchema = z.string().trim().min(1).max(160);
export const jobNameSchema = z.string().trim().min(1).max(160);
export const customerNameSchema = z.string().trim().min(1).max(160);
export const customerIdSchema = z.string().trim().min(1).max(120);
export const customerTextFieldSchema = z.string().trim().max(240);
export const customerNotesSchema = z.string().trim().max(2_000);
export const drawingJobRoleSchema = z.enum(["PRIMARY", "SECONDARY"]);
export const jobStageSchema = z.enum(JOB_STAGES);
export const jobTaskTitleSchema = z.string().trim().min(1).max(240);

export const jobCommercialInputsSchema = z.object({
  labourOverheadPercent: z.number().finite().min(0),
  travelLodgePerDay: z.number().finite().min(0),
  travelDays: z.number().finite().min(0),
  markupRate: z.number().finite().min(0),
  markupUnits: z.number().finite().min(0),
  distributionCharge: z.number().finite().min(0),
  concretePricePerCube: z.number().finite().min(0),
  hardDig: z.boolean(),
  clearSpoils: z.boolean()
});

export const taskPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const jobTaskRecordSchema = z.object({
  id: z.string().trim().min(1).max(120),
  companyId: z.string().trim().min(1).max(120),
  jobId: z.string().trim().min(1).max(120),
  jobName: z.string().trim().max(200),
  title: jobTaskTitleSchema,
  description: z.string().trim().max(2_000),
  priority: taskPrioritySchema,
  isCompleted: z.boolean(),
  assignedUserId: z.string().trim().min(1).max(120).nullable(),
  assignedUserDisplayName: z.string().trim().max(120),
  dueAtIso: z.string().datetime().nullable(),
  completedAtIso: z.string().datetime().nullable(),
  completedByUserId: z.string().trim().min(1).max(120).nullable(),
  completedByDisplayName: z.string().trim().max(120),
  createdByUserId: z.string().trim().min(1).max(120),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime()
});

export const jobRecordSchema = z.object({
  id: z.string().trim().min(1).max(120),
  companyId: z.string().trim().min(1).max(120),
  customerId: customerIdSchema,
  customerName: customerNameSchema,
  name: jobNameSchema,
  stage: jobStageSchema,
  primaryDrawingId: z.string().trim().min(1).max(120).nullable(),
  commercialInputs: jobCommercialInputsSchema,
  notes: z.string().trim().max(2_000),
  ownerUserId: z.string().trim().min(1).max(120).nullable(),
  ownerDisplayName: z.string().trim().max(120),
  isArchived: z.boolean(),
  archivedAtIso: z.string().datetime().nullable(),
  archivedByUserId: z.string().trim().min(1).max(120).nullable(),
  stageChangedAtIso: z.string().datetime().nullable(),
  stageChangedByUserId: z.string().trim().min(1).max(120).nullable(),
  createdByUserId: z.string().trim().min(1).max(120),
  updatedByUserId: z.string().trim().min(1).max(120),
  updatedByDisplayName: z.string().trim().max(120),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime()
});

export const jobSummarySchema = jobRecordSchema.extend({
  drawingCount: z.coerce.number().int().min(0),
  openTaskCount: z.coerce.number().int().min(0),
  completedTaskCount: z.coerce.number().int().min(0),
  lastActivityAtIso: z.string().datetime().nullable(),
  latestQuoteTotal: z.number().finite().min(0).nullable(),
  latestQuoteCreatedAtIso: z.string().datetime().nullable(),
  latestEstimateTotal: z.number().finite().min(0).nullable(),
  primaryDrawingName: z.string().trim().min(1).max(160).nullable(),
  primaryDrawingUpdatedAtIso: z.string().datetime().nullable(),
  primaryPreviewLayout: layoutModelSchema.nullable()
});

export const jobCreateRequestSchema = z.object({
  customerId: customerIdSchema,
  name: jobNameSchema,
  notes: z.string().trim().max(2_000).default("")
});

export const jobUpdateRequestSchema = z
  .object({
    name: jobNameSchema.optional(),
    stage: jobStageSchema.optional(),
    commercialInputs: jobCommercialInputsSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    ownerUserId: z.string().trim().min(1).max(120).nullable().optional(),
    archived: z.boolean().optional()
  })
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.stage === undefined &&
      value.commercialInputs === undefined &&
      value.notes === undefined &&
      value.ownerUserId === undefined &&
      value.archived === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one job field must be provided"
      });
    }
  });

export const jobTaskCreateRequestSchema = z.object({
  title: jobTaskTitleSchema,
  description: z.string().trim().max(2_000).optional(),
  priority: taskPrioritySchema.optional(),
  assignedUserId: z.string().trim().min(1).max(120).nullable().optional(),
  dueAtIso: z.string().datetime().nullable().optional()
});

export const jobTaskUpdateRequestSchema = z
  .object({
    title: jobTaskTitleSchema.optional(),
    description: z.string().trim().max(2_000).optional(),
    priority: taskPrioritySchema.optional(),
    assignedUserId: z.string().trim().min(1).max(120).nullable().optional(),
    dueAtIso: z.string().datetime().nullable().optional(),
    isCompleted: z.boolean().optional()
  })
  .superRefine((value, context) => {
    if (
      value.title === undefined &&
      value.description === undefined &&
      value.priority === undefined &&
      value.assignedUserId === undefined &&
      value.dueAtIso === undefined &&
      value.isCompleted === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one task field must be provided"
      });
    }
  });

export const jobPrimaryDrawingUpdateRequestSchema = z.object({
  drawingId: z.string().trim().min(1).max(120)
});

export const jobDrawingCreateRequestSchema = z.object({
  name: drawingNameSchema.optional(),
  sourceDrawingId: z.string().trim().min(1).max(120).optional()
});

export const jobQuoteCreateRequestSchema = quoteCreateRequestSchema.extend({
  drawingId: z.string().trim().min(1).max(120).optional()
});

export const customerContactSchema = z.object({
  name: z.string().trim().max(240).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().email().max(320).or(z.literal("")).default("")
});

export const customerAdditionalContactsSchema = z.array(customerContactSchema).max(20).default([]);

export const registerRequestSchema = z.object({
  companyName: companyNameSchema,
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema
});

export const bootstrapOwnerRequestSchema = registerRequestSchema;

export const companyUserRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const userCreateRequestSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["ADMIN", "MEMBER"])
});

export const userPasswordSetRequestSchema = z.object({
  password: passwordSchema
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const drawingCreateRequestSchema = z.object({
  name: drawingNameSchema,
  customerId: customerIdSchema,
  jobId: z.string().trim().min(1).max(120).optional(),
  layout: layoutModelSchema,
  savedViewport: drawingCanvasViewportSchema.nullable().optional()
});

export const drawingUpdateRequestSchema = z
  .object({
    expectedVersionNumber: z.coerce.number().int().min(1),
    name: drawingNameSchema.optional(),
    customerId: customerIdSchema.optional(),
    jobId: z.string().trim().min(1).max(120).nullable().optional(),
    layout: layoutModelSchema.optional(),
    savedViewport: drawingCanvasViewportSchema.nullable().optional()
  })
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.customerId === undefined &&
      value.jobId === undefined &&
      value.layout === undefined &&
      value.savedViewport === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one drawing field must be provided"
      });
    }
  });

export const drawingArchiveRequestSchema = z.object({
  archived: z.boolean(),
  expectedVersionNumber: z.coerce.number().int().min(1)
});

export const drawingStatusSchema = z.enum(DRAWING_STATUSES);

export const drawingStatusUpdateRequestSchema = z.object({
  status: drawingStatusSchema,
  expectedVersionNumber: z.coerce.number().int().min(1)
});

export const customerRecordSchema = z.object({
  id: z.string().trim().min(1).max(120),
  companyId: z.string().trim().min(1).max(120),
  name: customerNameSchema,
  primaryContactName: customerTextFieldSchema,
  primaryEmail: z.string().trim().email().max(320).or(z.literal("")),
  primaryPhone: z.string().trim().max(40),
  additionalContacts: z.array(customerContactSchema).max(20),
  siteAddress: z.string().trim().max(400),
  notes: customerNotesSchema,
  isArchived: z.boolean(),
  createdByUserId: z.string().trim().min(1).max(120),
  updatedByUserId: z.string().trim().min(1).max(120),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime()
});

export const customerSummarySchema = customerRecordSchema.extend({
  activeDrawingCount: z.coerce.number().int().min(0),
  archivedDrawingCount: z.coerce.number().int().min(0),
  lastActivityAtIso: z.string().datetime().nullable()
});

export const customerCreateRequestSchema = z.object({
  name: customerNameSchema,
  primaryContactName: customerTextFieldSchema.default(""),
  primaryEmail: z.string().trim().email().max(320).or(z.literal("")).default(""),
  primaryPhone: z.string().trim().max(40).default(""),
  additionalContacts: customerAdditionalContactsSchema,
  siteAddress: z.string().trim().max(400).default(""),
  notes: customerNotesSchema.default("")
});

export const customerUpdateRequestSchema = z
  .object({
    name: customerNameSchema.optional(),
    primaryContactName: customerTextFieldSchema.optional(),
    primaryEmail: z.string().trim().email().max(320).or(z.literal("")).optional(),
    primaryPhone: z.string().trim().max(40).optional(),
    additionalContacts: customerAdditionalContactsSchema.optional(),
    siteAddress: z.string().trim().max(400).optional(),
    notes: customerNotesSchema.optional()
  })
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.primaryContactName === undefined &&
      value.primaryEmail === undefined &&
      value.primaryPhone === undefined &&
      value.additionalContacts === undefined &&
      value.siteAddress === undefined &&
      value.notes === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one customer field must be provided"
      });
    }
  });

export const customerArchiveRequestSchema = z.object({
  archived: z.boolean(),
  cascadeDrawings: z.boolean().default(false)
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: passwordSchema
});

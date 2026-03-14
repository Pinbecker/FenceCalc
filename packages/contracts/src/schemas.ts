import { z } from "zod";
import { FENCE_HEIGHT_KEYS, ROLL_FORM_HEIGHT_KEYS, TWIN_BAR_HEIGHT_KEYS } from "./domain.js";

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
export const basketballPostPlacementSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  offsetMm: z.number().finite().nonnegative(),
  facing: inlineFeatureFacingSchema
});
export const floodlightColumnPlacementSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  offsetMm: z.number().finite().nonnegative(),
  facing: inlineFeatureFacingSchema
});

const MAX_LAYOUT_SEGMENTS = 2_000;
const MAX_LAYOUT_GATES = 500;
const MAX_LAYOUT_BASKETBALL_POSTS = 500;
const MAX_LAYOUT_FLOODLIGHT_COLUMNS = 500;

export const layoutModelSchema = z
  .object({
    segments: z.array(layoutSegmentSchema).max(MAX_LAYOUT_SEGMENTS),
    gates: z.array(gatePlacementSchema).max(MAX_LAYOUT_GATES).default([]),
    basketballPosts: z.array(basketballPostPlacementSchema).max(MAX_LAYOUT_BASKETBALL_POSTS).default([]),
    floodlightColumns: z.array(floodlightColumnPlacementSchema).max(MAX_LAYOUT_FLOODLIGHT_COLUMNS).default([])
  })
  .superRefine((layout, context) => {
    const seenSegmentIds = new Set<string>();
    const segmentLengthById = new Map<string, number>();

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

    const seenBasketballPostIds = new Set<string>();
    for (const basketballPost of layout.basketballPosts ?? []) {
      if (seenBasketballPostIds.has(basketballPost.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate basketball post id: ${basketballPost.id}`
        });
      }
      seenBasketballPostIds.add(basketballPost.id);

      const segmentLengthMm = segmentLengthById.get(basketballPost.segmentId);
      if (segmentLengthMm === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Basketball post ${basketballPost.id} references missing segment ${basketballPost.segmentId}`
        });
        continue;
      }

      if (basketballPost.offsetMm > segmentLengthMm) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Basketball post ${basketballPost.id} exceeds segment ${basketballPost.segmentId} length`
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
    unclassified: nonNegativeIntegerSchema
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

export const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(10).max(128);
export const companyNameSchema = z.string().trim().min(2).max(120);
export const displayNameSchema = z.string().trim().min(2).max(120);
export const drawingNameSchema = z.string().trim().min(1).max(160);
export const customerNameSchema = z.string().trim().min(1).max(160);

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
  customerName: customerNameSchema,
  layout: layoutModelSchema,
  savedViewport: drawingCanvasViewportSchema.nullable().optional()
});

export const drawingUpdateRequestSchema = z
  .object({
    expectedVersionNumber: z.coerce.number().int().min(1),
    name: drawingNameSchema.optional(),
    customerName: customerNameSchema.optional(),
    layout: layoutModelSchema.optional(),
    savedViewport: drawingCanvasViewportSchema.nullable().optional()
  })
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.customerName === undefined &&
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

export const passwordResetRequestSchema = z.object({
  email: emailSchema
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: passwordSchema
});

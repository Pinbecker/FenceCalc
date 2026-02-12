import { z } from "zod";
import { FENCE_HEIGHT_KEYS, ROLL_FORM_HEIGHT_KEYS, TWIN_BAR_HEIGHT_KEYS } from "./domain.js";

export const pointMmSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
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

export const layoutModelSchema = z.object({
  segments: z.array(layoutSegmentSchema)
});

export const estimateSnapshotRequestSchema = z.object({
  layout: layoutModelSchema
});

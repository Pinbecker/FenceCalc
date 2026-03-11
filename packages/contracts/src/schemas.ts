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

export const layoutModelSchema = z.object({
  segments: z.array(layoutSegmentSchema),
  gates: z.array(gatePlacementSchema).default([])
});

export const estimateSnapshotRequestSchema = z.object({
  layout: layoutModelSchema
});

export const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(10).max(128);
export const companyNameSchema = z.string().trim().min(2).max(120);
export const displayNameSchema = z.string().trim().min(2).max(120);
export const drawingNameSchema = z.string().trim().min(1).max(160);

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

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const drawingCreateRequestSchema = z.object({
  name: drawingNameSchema,
  layout: layoutModelSchema
});

export const drawingUpdateRequestSchema = z
  .object({
    name: drawingNameSchema.optional(),
    layout: layoutModelSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.name === undefined && value.layout === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one drawing field must be provided"
      });
    }
  });

export const drawingArchiveRequestSchema = z.object({
  archived: z.boolean()
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(128),
  password: passwordSchema
});

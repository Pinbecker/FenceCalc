import { z } from "zod";

import { PRICING_ITEM_CATEGORIES, type PricingItemCategory } from "./estimating.js";
import type {
  PricingWorkbookConfig,
  PricingWorkbookRowPresentation,
  PricingWorkbookSettings,
  PricingWorkbookSheet,
} from "./pricingWorkbook.js";

export const COMPANY_CONFIGURATION_STATUSES = ["DRAFT", "PUBLISHED", "SUPERSEDED"] as const;
export type CompanyConfigurationStatus = (typeof COMPANY_CONFIGURATION_STATUSES)[number];

export const ASSEMBLY_ROUNDING_MODES = ["NONE", "UP", "DOWN", "NEAREST"] as const;
export type AssemblyRoundingMode = (typeof ASSEMBLY_ROUNDING_MODES)[number];

export const ASSEMBLY_CONDITION_OPERATORS = ["GT", "GTE", "LT", "LTE", "EQ"] as const;
export type AssemblyConditionOperator = (typeof ASSEMBLY_CONDITION_OPERATORS)[number];

export interface CompanyCatalogueItem {
  id: string;
  code: string;
  label: string;
  sheet: PricingWorkbookSheet;
  category: PricingItemCategory;
  unit: string;
  rate: number;
  rateMode?: "MONEY" | "REFERENCE" | "VOLUME_PER_UNIT" | undefined;
  tone?: "default" | "highlight" | "manual" | "warning" | undefined;
  concreteQuantityKey?: string | undefined;
  holeQuantityKey?: string | undefined;
  notes?: string | undefined;
  active: boolean;
}

export type CompanyAssemblyQuantitySource =
  | { kind: "MANUAL_ENTRY"; defaultQuantity: number }
  | { kind: "DRAWING_QUANTITY"; quantityKey: string };

export interface CompanyAssemblyFormula {
  multiplier: number;
  rounding: AssemblyRoundingMode;
  increment: number;
  minimum: number;
  condition?:
    | {
        operator: AssemblyConditionOperator;
        value: number;
      }
    | undefined;
}

export interface CompanyAssemblyRule {
  id: string;
  name: string;
  catalogueItemId: string;
  quantitySource: CompanyAssemblyQuantitySource;
  formula: CompanyAssemblyFormula;
  presentation: PricingWorkbookRowPresentation;
  enabled: boolean;
}

export interface CompanyConfigurationDefinition {
  templateId: string;
  name: string;
  settings: PricingWorkbookSettings;
  catalogueItems: CompanyCatalogueItem[];
  assemblies: CompanyAssemblyRule[];
}

export interface CompanyConfigurationVersionRecord {
  id: string;
  companyId: string;
  versionNumber: number;
  status: CompanyConfigurationStatus;
  definition: CompanyConfigurationDefinition;
  compiledWorkbook: PricingWorkbookConfig;
  changeNote: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  publishedByUserId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  publishedAtIso: string | null;
}

export interface CompanyConfigurationTemplateSummary {
  id: string;
  name: string;
  description: string;
}

export interface CompanyConfigurationWorkspace {
  draft: CompanyConfigurationVersionRecord;
  published: CompanyConfigurationVersionRecord | null;
  history: CompanyConfigurationVersionRecord[];
  templates: CompanyConfigurationTemplateSummary[];
}

export interface CompanyConfigurationPreviewFact {
  quantityKey: string;
  quantity: number;
}

export interface CompanyConfigurationPreviewLine {
  assemblyId: string;
  assemblyName: string;
  catalogueItemId: string;
  catalogueCode: string;
  label: string;
  sheet: PricingWorkbookSheet;
  unit: string;
  sourceQuantity: number;
  resolvedQuantity: number;
  rate: number;
  total: number;
  applied: boolean;
  explanation: string;
}

export interface CompanyConfigurationPreviewResult {
  lines: CompanyConfigurationPreviewLine[];
  materialsTotal: number;
  labourTotal: number;
  grandTotal: number;
  errors: string[];
  warnings: string[];
  canPublish: boolean;
}

const shortTextSchema = z.string().trim().min(1).max(160);
const identifierSchema = z.string().trim().min(1).max(160);
const nonNegativeNumberSchema = z.number().finite().min(0).max(1_000_000_000);

export const companyCatalogueItemSchema = z.object({
  id: identifierSchema,
  code: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  label: shortTextSchema,
  sheet: z.enum(["MATERIALS", "LABOUR"]),
  category: z.enum(PRICING_ITEM_CATEGORIES),
  unit: z.string().trim().min(1).max(40),
  rate: nonNegativeNumberSchema,
  rateMode: z.enum(["MONEY", "REFERENCE", "VOLUME_PER_UNIT"]).optional(),
  tone: z.enum(["default", "highlight", "manual", "warning"]).optional(),
  concreteQuantityKey: identifierSchema.optional(),
  holeQuantityKey: identifierSchema.optional(),
  notes: z.string().trim().max(1_000).optional(),
  active: z.boolean(),
});

export const companyAssemblyFormulaSchema = z.object({
  multiplier: z.number().finite().min(0).max(100_000),
  rounding: z.enum(ASSEMBLY_ROUNDING_MODES),
  increment: z.number().finite().positive().max(1_000_000),
  minimum: nonNegativeNumberSchema,
  condition: z
    .object({
      operator: z.enum(ASSEMBLY_CONDITION_OPERATORS),
      value: nonNegativeNumberSchema,
    })
    .optional(),
});

export const companyAssemblyRuleSchema = z.object({
  id: identifierSchema,
  name: shortTextSchema,
  catalogueItemId: identifierSchema,
  quantitySource: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("MANUAL_ENTRY"), defaultQuantity: nonNegativeNumberSchema }),
    z.object({ kind: z.literal("DRAWING_QUANTITY"), quantityKey: identifierSchema }),
  ]),
  formula: companyAssemblyFormulaSchema,
  presentation: z.object({
    pairKey: identifierSchema,
    groupKey: identifierSchema,
    groupTitle: shortTextSchema,
    sortOrder: z.number().int().min(0).max(100_000),
  }),
  enabled: z.boolean(),
});

export const companyConfigurationDefinitionSchema = z
  .object({
    templateId: identifierSchema,
    name: shortTextSchema,
    settings: z.custom<PricingWorkbookSettings>(
      (value) => value !== null && typeof value === "object",
    ),
    catalogueItems: z.array(companyCatalogueItemSchema).max(1_000),
    assemblies: z.array(companyAssemblyRuleSchema).max(1_000),
  })
  .superRefine((definition, context) => {
    const itemIds = new Set<string>();
    const codes = new Set<string>();
    definition.catalogueItems.forEach((item, index) => {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["catalogueItems", index, "id"],
          message: "Catalogue item IDs must be unique",
        });
      }
      if (codes.has(item.code)) {
        context.addIssue({
          code: "custom",
          path: ["catalogueItems", index, "code"],
          message: "Catalogue codes must be unique",
        });
      }
      itemIds.add(item.id);
      codes.add(item.code);
    });

    const assemblyIds = new Set<string>();
    const outputItemIds = new Set<string>();
    definition.assemblies.forEach((assembly, index) => {
      if (assemblyIds.has(assembly.id)) {
        context.addIssue({
          code: "custom",
          path: ["assemblies", index, "id"],
          message: "Assembly IDs must be unique",
        });
      }
      if (!itemIds.has(assembly.catalogueItemId)) {
        context.addIssue({
          code: "custom",
          path: ["assemblies", index, "catalogueItemId"],
          message: "Assembly references a missing catalogue item",
        });
      }
      if (outputItemIds.has(assembly.catalogueItemId)) {
        context.addIssue({
          code: "custom",
          path: ["assemblies", index, "catalogueItemId"],
          message: "A catalogue item can be output by only one assembly",
        });
      }
      assemblyIds.add(assembly.id);
      outputItemIds.add(assembly.catalogueItemId);
    });
  });

export const companyConfigurationVersionRecordSchema = z.object({
  id: identifierSchema,
  companyId: identifierSchema,
  versionNumber: z.number().int().positive(),
  status: z.enum(COMPANY_CONFIGURATION_STATUSES),
  definition: companyConfigurationDefinitionSchema,
  compiledWorkbook: z.custom<PricingWorkbookConfig>(
    (value) => value !== null && typeof value === "object",
  ),
  changeNote: z.string().trim().max(2_000).nullable(),
  createdByUserId: identifierSchema,
  updatedByUserId: identifierSchema,
  publishedByUserId: identifierSchema.nullable(),
  createdAtIso: z.string().datetime(),
  updatedAtIso: z.string().datetime(),
  publishedAtIso: z.string().datetime().nullable(),
});

export const companyConfigurationDraftUpdateRequestSchema = z.object({
  definition: companyConfigurationDefinitionSchema,
  changeNote: z.string().trim().max(2_000).nullish(),
});

export const companyConfigurationPublishRequestSchema = z.object({
  changeNote: z.string().trim().min(1).max(2_000),
  facts: z
    .array(z.object({ quantityKey: identifierSchema, quantity: nonNegativeNumberSchema }))
    .max(500),
});

export const companyConfigurationTemplateCloneRequestSchema = z.object({
  templateId: identifierSchema,
});

export const companyConfigurationPreviewRequestSchema = z.object({
  definition: companyConfigurationDefinitionSchema,
  facts: z
    .array(z.object({ quantityKey: identifierSchema, quantity: nonNegativeNumberSchema }))
    .max(500),
});

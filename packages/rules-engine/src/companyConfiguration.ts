import type {
  CompanyAssemblyFormula,
  CompanyAssemblyRule,
  CompanyCatalogueItem,
  CompanyConfigurationDefinition,
  CompanyConfigurationPreviewFact,
  CompanyConfigurationPreviewLine,
  CompanyConfigurationPreviewResult,
  CompanyConfigurationTemplateSummary,
  PricingWorkbookConfig,
  PricingWorkbookRow,
} from "@fence-estimator/contracts";
import {
  buildDefaultPricingWorkbookConfig,
  companyConfigurationDefinitionSchema,
} from "@fence-estimator/contracts";

export const COMPANY_CONFIGURATION_TEMPLATES: CompanyConfigurationTemplateSummary[] = [
  {
    id: "TWIN_BAR_STARTER_V1",
    name: "Twin Bar starter",
    description: "A complete starting catalogue and assembly set for Twin Bar fencing and sports-ground features.",
  },
  {
    id: "BLANK_V1",
    name: "Blank configuration",
    description: "Commercial defaults with an empty catalogue for companies building their own system from scratch.",
  },
];

function stableItemId(code: string): string {
  return `catalogue-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 160);
}

function defaultFormula(): CompanyAssemblyFormula {
  return { multiplier: 1, rounding: "NONE", increment: 1, minimum: 0 };
}

export function buildCompanyConfigurationFromWorkbook(
  workbook: PricingWorkbookConfig,
  options: { templateId?: string; name?: string } = {},
): CompanyConfigurationDefinition {
  const catalogueItems: CompanyCatalogueItem[] = [];
  const assemblies: CompanyAssemblyRule[] = [];

  for (const section of workbook.sections) {
    for (const row of section.rows) {
      const itemId = stableItemId(row.code);
      catalogueItems.push({
        id: itemId,
        code: row.code,
        label: row.label,
        sheet: section.sheet,
        category: row.category ?? "ANCILLARY",
        unit: row.unit,
        rate: row.rate,
        ...(row.rateMode ? { rateMode: row.rateMode } : {}),
        ...(row.tone ? { tone: row.tone } : {}),
        ...(row.notes ? { notes: row.notes } : {}),
        ...(row.concreteQuantityKey ? { concreteQuantityKey: row.concreteQuantityKey } : {}),
        ...(row.holeQuantityKey ? { holeQuantityKey: row.holeQuantityKey } : {}),
        active: true,
      });
      assemblies.push({
        id: `assembly-${row.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 160),
        name: row.label,
        catalogueItemId: itemId,
        quantitySource:
          row.quantityRule.kind === "MANUAL_ENTRY"
            ? { kind: "MANUAL_ENTRY", defaultQuantity: row.quantityRule.defaultQuantity ?? 0 }
            : row.quantityRule.kind === "CATALOG_QUANTITY"
              ? { kind: "DRAWING_QUANTITY", quantityKey: row.quantityRule.quantityKey }
              : row.quantityRule.source.kind === "MANUAL_ENTRY"
                ? { kind: "MANUAL_ENTRY", defaultQuantity: row.quantityRule.source.defaultQuantity }
                : { kind: "DRAWING_QUANTITY", quantityKey: row.quantityRule.source.quantityKey },
        formula:
          row.quantityRule.kind === "ASSEMBLY"
            ? {
                multiplier: row.quantityRule.multiplier,
                rounding: row.quantityRule.rounding,
                increment: row.quantityRule.increment,
                minimum: row.quantityRule.minimum,
                ...(row.quantityRule.condition ? { condition: row.quantityRule.condition } : {}),
              }
            : defaultFormula(),
        presentation: row.presentation ?? {
          pairKey: row.code,
          groupKey: section.key,
          groupTitle: section.title,
          sortOrder: 9_000,
        },
        enabled: true,
      });
    }
  }

  return {
    templateId: options.templateId ?? "CURRENT_COMPANY_CONFIGURATION",
    name: options.name ?? "Company estimating configuration",
    settings: structuredClone(workbook.settings),
    catalogueItems,
    assemblies,
  };
}

export function buildCompanyConfigurationTemplate(templateId: string): CompanyConfigurationDefinition | null {
  const workbook = buildDefaultPricingWorkbookConfig();
  if (templateId === "TWIN_BAR_STARTER_V1") {
    return buildCompanyConfigurationFromWorkbook(workbook, {
      templateId,
      name: "Twin Bar starter configuration",
    });
  }
  if (templateId === "BLANK_V1") {
    return {
      templateId,
      name: "Blank company configuration",
      settings: structuredClone(workbook.settings),
      catalogueItems: [],
      assemblies: [],
    };
  }
  return null;
}

export function compileCompanyConfiguration(
  definition: CompanyConfigurationDefinition,
): PricingWorkbookConfig {
  const parsed = companyConfigurationDefinitionSchema.parse(definition);
  const itemsById = new Map(parsed.catalogueItems.map((item) => [item.id, item] as const));
  const sections = new Map<string, PricingWorkbookConfig["sections"][number]>();

  for (const assembly of parsed.assemblies) {
    if (!assembly.enabled) continue;
    const item = itemsById.get(assembly.catalogueItemId);
    if (!item?.active) continue;
    const sectionKey = `${item.sheet.toLowerCase()}:${assembly.presentation.groupKey}`;
    const section = sections.get(sectionKey) ?? {
      key: sectionKey,
      sheet: item.sheet,
      title: assembly.presentation.groupTitle,
      rows: [],
    };
    const row: PricingWorkbookRow = {
      code: item.code,
      label: item.label,
      unit: item.unit,
      rate: item.rate,
      quantityRule: {
        kind: "ASSEMBLY",
        source:
          assembly.quantitySource.kind === "MANUAL_ENTRY"
            ? { kind: "MANUAL_ENTRY", defaultQuantity: assembly.quantitySource.defaultQuantity }
            : { kind: "CATALOG_QUANTITY", quantityKey: assembly.quantitySource.quantityKey },
        multiplier: assembly.formula.multiplier,
        rounding: assembly.formula.rounding,
        increment: assembly.formula.increment,
        minimum: assembly.formula.minimum,
        ...(assembly.formula.condition ? { condition: assembly.formula.condition } : {}),
      },
      category: item.category,
      presentation: assembly.presentation,
      ...(item.rateMode ? { rateMode: item.rateMode } : {}),
      ...(item.tone ? { tone: item.tone } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.concreteQuantityKey ? { concreteQuantityKey: item.concreteQuantityKey } : {}),
      ...(item.holeQuantityKey ? { holeQuantityKey: item.holeQuantityKey } : {}),
    };
    section.rows.push(row);
    sections.set(sectionKey, section);
  }

  return {
    settings: structuredClone(parsed.settings),
    sections: [...sections.values()]
      .map((section) => ({
        ...section,
        rows: [...section.rows].sort(
          (left, right) =>
            (left.presentation?.sortOrder ?? 0) - (right.presentation?.sortOrder ?? 0) ||
            left.label.localeCompare(right.label, "en-GB", { numeric: true }),
        ),
      }))
      .sort((left, right) => left.title.localeCompare(right.title, "en-GB", { numeric: true })),
  };
}

function conditionPasses(sourceQuantity: number, formula: CompanyAssemblyFormula): boolean {
  const condition = formula.condition;
  if (!condition) return true;
  if (condition.operator === "GT") return sourceQuantity > condition.value;
  if (condition.operator === "GTE") return sourceQuantity >= condition.value;
  if (condition.operator === "LT") return sourceQuantity < condition.value;
  if (condition.operator === "LTE") return sourceQuantity <= condition.value;
  return sourceQuantity === condition.value;
}

export function resolveAssemblyQuantity(sourceQuantity: number, formula: CompanyAssemblyFormula): number {
  if (sourceQuantity <= 0 || !conditionPasses(sourceQuantity, formula)) return 0;
  const scaled = (sourceQuantity * formula.multiplier) / formula.increment;
  const rounded = formula.rounding === "UP" ? Math.ceil(scaled)
    : formula.rounding === "DOWN" ? Math.floor(scaled)
      : formula.rounding === "NEAREST" ? Math.round(scaled)
        : scaled;
  return Math.round(Math.max(formula.minimum, rounded * formula.increment) * 1_000) / 1_000;
}

export function previewCompanyConfiguration(
  definition: CompanyConfigurationDefinition,
  facts: CompanyConfigurationPreviewFact[],
): CompanyConfigurationPreviewResult {
  const parsed = companyConfigurationDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    return {
      lines: [], materialsTotal: 0, labourTotal: 0, grandTotal: 0,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      warnings: [], canPublish: false,
    };
  }
  const factMap = new Map(facts.map((fact) => [fact.quantityKey, fact.quantity]));
  const items = new Map(parsed.data.catalogueItems.map((item) => [item.id, item] as const));
  const warnings: string[] = [];
  const lines: CompanyConfigurationPreviewLine[] = [];

  for (const assembly of parsed.data.assemblies) {
    const item = items.get(assembly.catalogueItemId);
    if (!assembly.enabled || !item?.active) continue;
    const sourceQuantity = assembly.quantitySource.kind === "MANUAL_ENTRY"
      ? assembly.quantitySource.defaultQuantity
      : factMap.get(assembly.quantitySource.quantityKey) ?? 0;
    const resolvedQuantity = resolveAssemblyQuantity(sourceQuantity, assembly.formula);
    const total = Math.round(resolvedQuantity * item.rate * 100) / 100;
    if (item.rate === 0) warnings.push(`${item.label} has a zero rate.`);
    lines.push({
      assemblyId: assembly.id,
      assemblyName: assembly.name,
      catalogueItemId: item.id,
      catalogueCode: item.code,
      label: item.label,
      sheet: item.sheet,
      unit: item.unit,
      sourceQuantity,
      resolvedQuantity,
      rate: item.rate,
      total,
      applied: resolvedQuantity > 0,
      explanation: `${sourceQuantity} source × ${assembly.formula.multiplier}${assembly.formula.rounding === "NONE" ? "" : `, round ${assembly.formula.rounding.toLowerCase()} to ${assembly.formula.increment}`} = ${resolvedQuantity}`,
    });
  }
  const materialsTotal = Math.round(lines.filter((line) => line.sheet === "MATERIALS").reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  const labourTotal = Math.round(lines.filter((line) => line.sheet === "LABOUR").reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  if (parsed.data.assemblies.filter((assembly) => assembly.enabled).length === 0) {
    warnings.push("No enabled assemblies will produce estimate lines.");
  }
  return {
    lines,
    materialsTotal,
    labourTotal,
    grandTotal: Math.round((materialsTotal + labourTotal) * 100) / 100,
    errors: [],
    warnings: [...new Set(warnings)],
    canPublish: true,
  };
}

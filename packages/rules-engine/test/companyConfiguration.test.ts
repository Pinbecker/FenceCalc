import { describe, expect, it } from "vitest";

import {
  buildCompanyConfigurationTemplate,
  compileCompanyConfiguration,
  previewCompanyConfiguration,
  resolveAssemblyQuantity,
} from "../src/companyConfiguration.js";

describe("company configuration", () => {
  it("compiles the Twin Bar starter into typed assembly workbook rows", () => {
    const definition = buildCompanyConfigurationTemplate("TWIN_BAR_STARTER_V1");
    expect(definition).not.toBeNull();
    const workbook = compileCompanyConfiguration(definition!);
    expect(definition!.catalogueItems.length).toBeGreaterThan(50);
    expect(workbook.sections.flatMap((section) => section.rows)).toHaveLength(
      definition!.assemblies.length,
    );
    expect(workbook.sections.flatMap((section) => section.rows).every((row) => row.quantityRule.kind === "ASSEMBLY")).toBe(true);
  });

  it("evaluates multipliers, increments, minimums and conditions without executable formulas", () => {
    expect(resolveAssemblyQuantity(5, { multiplier: 1.25, rounding: "UP", increment: 1, minimum: 0 })).toBe(7);
    expect(resolveAssemblyQuantity(2, { multiplier: 0.5, rounding: "NONE", increment: 1, minimum: 3 })).toBe(3);
    expect(resolveAssemblyQuantity(4, { multiplier: 1, rounding: "NONE", increment: 1, minimum: 0, condition: { operator: "GT", value: 5 } })).toBe(0);
  });

  it("returns an explainable example preview before publication", () => {
    const definition = buildCompanyConfigurationTemplate("TWIN_BAR_STARTER_V1")!;
    const assembly = definition.assemblies.find((candidate) => candidate.quantitySource.kind === "DRAWING_QUANTITY")!;
    const item = definition.catalogueItems.find((candidate) => candidate.id === assembly.catalogueItemId)!;
    assembly.formula = { multiplier: 1.5, rounding: "UP", increment: 1, minimum: 0 };
    item.rate = 10;
    const result = previewCompanyConfiguration(definition, [{
      quantityKey: assembly.quantitySource.kind === "DRAWING_QUANTITY" ? assembly.quantitySource.quantityKey : "",
      quantity: 3,
    }]);
    const line = result.lines.find((candidate) => candidate.assemblyId === assembly.id)!;
    expect(line.resolvedQuantity).toBe(5);
    expect(line.total).toBe(50);
    expect(line.explanation).toContain("round up");
    expect(result.canPublish).toBe(true);
  });

  it("offers a truly blank template without weakening commercial defaults", () => {
    const definition = buildCompanyConfigurationTemplate("BLANK_V1")!;
    expect(definition.catalogueItems).toEqual([]);
    expect(definition.assemblies).toEqual([]);
    expect(definition.settings.vatRate).toBe(20);
  });
});

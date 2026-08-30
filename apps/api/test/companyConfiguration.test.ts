import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SqliteAppRepository } from "../src/repository/sqliteRepository.js";
import {
  getCompanyConfigurationWorkspace,
  previewConfiguration,
  publishCompanyConfiguration,
  updateCompanyConfigurationDraft,
} from "../src/services/companyConfigurationService.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("company configuration lifecycle", () => {
  it("keeps drafts isolated, previews rules and publishes immutable versions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fence-estimator-configuration-"));
    temporaryDirectories.push(directory);
    const repository = new SqliteAppRepository(join(directory, "configuration.db"));
    const account = await repository.bootstrapOwnerAccount({
      companyId: "company-1",
      companyName: "Configuration Fence Co",
      userId: "user-1",
      displayName: "Owner",
      email: "owner@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      createdAtIso: "2026-08-30T09:00:00.000Z",
    });
    expect(account).not.toBeNull();

    const initial = await getCompanyConfigurationWorkspace(repository, "company-1", "user-1");
    expect(initial.published?.versionNumber).toBe(1);
    expect(initial.draft.versionNumber).toBe(2);
    const definition = structuredClone(initial.draft.definition);
    const assembly = definition.assemblies.find(
      (candidate) => candidate.quantitySource.kind === "DRAWING_QUANTITY",
    )!;
    const item = definition.catalogueItems.find(
      (candidate) => candidate.id === assembly.catalogueItemId,
    )!;
    item.rate = 123.45;
    assembly.formula = { multiplier: 2, rounding: "UP", increment: 1, minimum: 0 };

    const saved = await updateCompanyConfigurationDraft(
      repository,
      "company-1",
      "user-1",
      definition,
      "Test a revised assembly",
    );
    expect(
      saved.published?.definition.catalogueItems.find((candidate) => candidate.id === item.id)
        ?.rate,
    ).not.toBe(123.45);
    const quantityKey =
      assembly.quantitySource.kind === "DRAWING_QUANTITY"
        ? assembly.quantitySource.quantityKey
        : "";
    const preview = previewConfiguration(definition, [{ quantityKey, quantity: 2.5 }]);
    const previewLine = preview.lines.find((candidate) => candidate.catalogueItemId === item.id)!;
    expect(previewLine.resolvedQuantity).toBe(5);
    expect(previewLine.total).toBe(617.25);

    await expect(
      publishCompanyConfiguration(repository, "company-1", "user-1", "Untested publish", []),
    ).rejects.toThrow("positive drawing quantity");

    const published = await publishCompanyConfiguration(
      repository,
      "company-1",
      "user-1",
      "Publish tested multiplier",
      [{ quantityKey, quantity: 2.5 }],
    );
    expect(published.published?.versionNumber).toBe(2);
    expect(published.draft.versionNumber).toBe(3);
    expect(published.history.map((version) => version.status)).toEqual([
      "DRAFT",
      "PUBLISHED",
      "SUPERSEDED",
    ]);
    const livePricing = await repository.getPricingConfig("company-1");
    const liveRow = livePricing?.workbook?.sections
      .flatMap((section) => section.rows)
      .find((row) => row.code === item.code);
    expect(liveRow?.rate).toBe(123.45);
    expect(liveRow?.quantityRule.kind).toBe("ASSEMBLY");
    await repository.close();
  });
});

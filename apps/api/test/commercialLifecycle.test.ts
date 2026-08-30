import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LayoutModel } from "@fence-estimator/contracts";
import type { Pool } from "pg";
import { DataType, newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";

import type { AuthenticatedRequestContext } from "../src/authorization.js";
import type { AppRepository } from "../src/repository/types.js";
import { PostgresAppRepository } from "../src/repository/postgresRepository.js";
import { SqliteAppRepository } from "../src/repository/sqliteRepository.js";
import { createCustomerForCompany } from "../src/services/customerService.js";
import {
  createDrawingForCompany,
  saveRevisionForCompany,
  setDrawingStatusForCompany,
  startRevisionForCompany,
} from "../src/services/drawingService.js";
import {
  calculateEstimateVersionForCompany,
  createEstimateForCompany,
  setEstimateVersionStatusForCompany,
} from "../src/services/estimateLifecycleService.js";
import { createProjectForCompany } from "../src/services/projectService.js";
import {
  createQuoteForCompany,
  setQuoteVersionStatusForCompany,
} from "../src/services/quoteLifecycleService.js";
import { quotePdfFileName, renderQuotePdf } from "../src/services/quotePdfService.js";
import { createSiteForCompany } from "../src/services/siteService.js";

const temporaryDirectories: string[] = [];

function createSqliteRepository(): AppRepository {
  const directory = mkdtempSync(join(tmpdir(), "fence-estimator-lifecycle-"));
  temporaryDirectories.push(directory);
  return new SqliteAppRepository(join(directory, "lifecycle.db"));
}

function createPostgresCompatibleRepository(): AppRepository {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: (key: number) => key,
  });
  const adapter = database.adapters.createPg();
  return new PostgresAppRepository("postgresql://integration.invalid/test", {
    pool: new adapter.Pool() as unknown as Pool,
    compatibilityMode: true,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function createTestContext(repository: AppRepository): Promise<AuthenticatedRequestContext> {
  const createdAtIso = "2026-08-30T08:00:00.000Z";
  const account = await repository.bootstrapOwnerAccount({
    companyId: "company-1",
    companyName: "Serious Fence Company",
    userId: "user-1",
    displayName: "Alex Estimator",
    email: "alex@example.com",
    passwordHash: "not-used-in-this-test",
    passwordSalt: "not-used-in-this-test",
    createdAtIso,
  });
  if (!account) throw new Error("Test account was not created");
  return {
    company: account.company,
    user: account.user,
    session: {
      id: "session-1",
      companyId: account.company.id,
      userId: account.user.id,
      createdAtIso,
      expiresAtIso: "2027-08-30T08:00:00.000Z",
      revokedAtIso: null,
    },
  };
}

const usableLayout: LayoutModel = {
  segments: [
    {
      id: "fence-line-1",
      start: { x: 0, y: 0 },
      end: { x: 10_000, y: 0 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" },
    },
  ],
  gates: [],
  basketballFeatures: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: [],
};

const crossingLayout: LayoutModel = {
  ...usableLayout,
  segments: [
    {
      id: "horizontal",
      start: { x: 0, y: 5000 },
      end: { x: 10_000, y: 5000 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" },
    },
    {
      id: "vertical",
      start: { x: 5000, y: 0 },
      end: { x: 5000, y: 10_000 },
      spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" },
    },
  ],
};

describe.each([
  ["SQLite", createSqliteRepository],
  ["PostgreSQL-compatible", createPostgresCompatibleRepository],
] as const)("%s commercial lifecycle", (_providerName, createRepository) => {
  it("pins design revisions through estimate approval, quote issue and acceptance", async () => {
    const repository = createRepository();
    const context = await createTestContext(repository);

    const customer = await createCustomerForCompany(repository, context, {
      name: "Northshire Council",
      contactName: "Jordan Smith",
      contactEmail: "jordan@example.com",
      contactPhone: null,
      siteAddress: null,
      notes: null,
    });
    const site = await createSiteForCompany(repository, context, {
      customerId: customer.id,
      name: "Riverside Sports Ground",
      addressLine1: "1 Riverside Way",
      addressLine2: null,
      city: "York",
      county: null,
      postcode: "yo1 1aa",
      countryCode: "GB",
      notes: null,
    });
    expect(site).not.toBeNull();
    const project = await createProjectForCompany(repository, context, {
      customerId: customer.id,
      siteId: site!.id,
      name: "Sports perimeter renewal",
      scope: "Tennis courts and football pitch perimeter fencing",
      targetDateIso: "2026-10-30",
      notes: null,
    });
    expect(project?.status).toBe("ENQUIRY");
    expect(project?.reference).toMatch(/^P-\d{4}-0001$/);
    expect(project?.targetDateIso).toBe("2026-10-30");
    expect(site?.postcode).toBe("YO1 1AA");

    const designResult = await createDrawingForCompany(repository, context, {
      projectId: project!.id,
      name: "Combined sports layout",
      initialLayout: usableLayout,
    });
    expect(designResult).not.toBeNull();

    const invalidSave = await saveRevisionForCompany(
      repository,
      context,
      designResult!.revision.id,
      {
        expectedVersionNumber: designResult!.revision.versionNumber,
        layout: crossingLayout,
        savedViewport: null,
      },
    );
    expect(invalidSave.kind).toBe("invalid");
    if (invalidSave.kind !== "invalid") throw new Error("Crossing drawing was not rejected");
    expect(invalidSave.issues.map((issue) => issue.code)).toContain("SEGMENT_CROSSING");
    const unchangedRevision = await repository.getRevisionById(
      designResult!.revision.id,
      context.company.id,
    );
    expect(unchangedRevision?.layout.segments).toEqual(usableLayout.segments);

    const estimateResult = await createEstimateForCompany(repository, context, {
      projectId: project!.id,
      name: "Main estimate",
      notes: "Includes both sports areas",
      designRevisionIds: [designResult!.revision.id],
    });
    expect(estimateResult.ok).toBe(true);
    if (!estimateResult.ok) throw new Error(estimateResult.message);
    expect(estimateResult.value.estimate.reference).toMatch(/^E-\d{4}-0001$/);
    expect(estimateResult.value.version.designRevisionSelections).toHaveLength(1);

    const prematureReview = await setEstimateVersionStatusForCompany(
      repository,
      context,
      estimateResult.value.version.id,
      "IN_REVIEW",
    );
    expect(prematureReview).toMatchObject({ ok: false, status: 409 });

    const readyDesign = await setDrawingStatusForCompany(
      repository,
      context,
      designResult!.drawing.id,
      "READY",
    );
    expect(readyDesign?.status).toBe("READY");
    const blockedSave = await saveRevisionForCompany(
      repository,
      context,
      designResult!.revision.id,
      {
        expectedVersionNumber: designResult!.revision.versionNumber,
        layout: usableLayout,
        savedViewport: null,
      },
    );
    expect(blockedSave.kind).toBe("read_only");

    const calculated = await calculateEstimateVersionForCompany(
      repository,
      context,
      estimateResult.value.version.id,
      { ancillaryItems: [], manualEntries: [], externalCornersEnabled: true },
    );
    expect(calculated).toMatchObject({
      ok: true,
      value: { calculation: { designs: [{ drawingRevisionId: designResult!.revision.id }] } },
    });

    const review = await setEstimateVersionStatusForCompany(
      repository,
      context,
      estimateResult.value.version.id,
      "IN_REVIEW",
    );
    expect(review).toMatchObject({ ok: true, value: { status: "IN_REVIEW" } });
    const beforeApprovalQuote = await createQuoteForCompany(repository, context, {
      estimateVersionId: estimateResult.value.version.id,
      name: "Council proposal",
      title: "Sports perimeter fencing proposal",
      customerMessage: null,
      validUntilIso: "2026-12-31",
    });
    expect(beforeApprovalQuote).toMatchObject({ ok: false, status: 409 });

    const approval = await setEstimateVersionStatusForCompany(
      repository,
      context,
      estimateResult.value.version.id,
      "APPROVED",
    );
    expect(approval).toMatchObject({ ok: true, value: { status: "APPROVED" } });
    const newDesignRevision = await startRevisionForCompany(
      repository,
      context,
      designResult!.drawing.id,
      "Customer requested an alternative gate position",
    );
    expect(newDesignRevision?.revisionNumber).toBe(2);
    expect(newDesignRevision?.id).not.toBe(designResult!.revision.id);

    const quoteResult = await createQuoteForCompany(repository, context, {
      estimateVersionId: estimateResult.value.version.id,
      name: "Council proposal",
      title: "Sports perimeter fencing proposal",
      customerMessage: "Prepared for Northshire Council",
      validUntilIso: "2026-12-31",
    });
    expect(quoteResult.ok).toBe(true);
    if (!quoteResult.ok) throw new Error(quoteResult.message);
    expect(quoteResult.value.quote.reference).toMatch(/^Q-\d{4}-0001$/);
    expect(quoteResult.value.version.estimateVersionId).toBe(estimateResult.value.version.id);
    expect(quoteResult.value.version.presentation).toMatchObject({
      displayMode: "SUMMARY",
      currencyCode: "GBP",
      vatRate: 20,
    });
    expect(quoteResult.value.version.presentation.netTotal).toBeGreaterThan(0);
    expect(quoteResult.value.version.presentation.grossTotal).toBeGreaterThan(
      quoteResult.value.version.presentation.netTotal,
    );

    const issued = await setQuoteVersionStatusForCompany(
      repository,
      context,
      quoteResult.value.version.id,
      "ISSUED",
    );
    expect(issued).toMatchObject({ ok: true, value: { status: "ISSUED" } });
    if (!issued.ok) throw new Error(issued.message);
    expect(issued.value.presentation.document).toMatchObject({
      sellerName: "Serious Fence Company",
      customerName: "Northshire Council",
      projectName: "Sports perimeter renewal",
      siteName: "Riverside Sports Ground",
    });
    const pdf = await renderQuotePdf({
      quote: quoteResult.value.quote,
      version: issued.value,
      document: issued.value.presentation.document!,
    });
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(4_000);
    expect(quotePdfFileName(quoteResult.value.quote, issued.value)).toMatch(
      /^Q-\d{4}-0001-v1\.pdf$/,
    );
    expect((await repository.getProjectById(project!.id, context.company.id))?.status).toBe(
      "QUOTED",
    );

    const accepted = await setQuoteVersionStatusForCompany(
      repository,
      context,
      quoteResult.value.version.id,
      "ACCEPTED",
    );
    expect(accepted).toMatchObject({ ok: true, value: { status: "ACCEPTED" } });
    expect((await repository.getProjectById(project!.id, context.company.id))?.status).toBe("WON");

    const pinnedEstimate = await repository.getEstimateVersionById(
      estimateResult.value.version.id,
      context.company.id,
    );
    expect(pinnedEstimate?.designRevisionSelections[0]?.drawingRevisionId).toBe(
      designResult!.revision.id,
    );
    expect(pinnedEstimate?.designRevisionSelections[0]?.drawingRevisionId).not.toBe(
      newDesignRevision!.id,
    );
    await repository.close();
  });
});

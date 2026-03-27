import { randomUUID } from "node:crypto";
import type { AncillaryEstimateItem, EstimateWorkbookManualEntry } from "@fence-estimator/contracts";
import { buildDefaultPricingConfig } from "@fence-estimator/contracts";
import { buildPricedEstimate } from "@fence-estimator/rules-engine";

import { writeAuditLog } from "../auditLogSupport.js";
import { mergeJobCommercialManualEntries } from "../jobEstimateSupport.js";
import type { AppRepository } from "../repository.js";

interface QuoteActorContext {
  company: {
    id: string;
  };
  user: {
    id: string;
  };
}

export type CreateQuoteResult =
  | { kind: "success"; quote: Awaited<ReturnType<AppRepository["createQuote"]>> }
  | { kind: "drawing_not_found" }
  | { kind: "job_not_found" };

export async function createQuoteForDrawing(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  drawingId: string,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[] = []
): Promise<CreateQuoteResult> {
  const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!drawing) {
    return { kind: "drawing_not_found" };
  }
  if (!drawing.jobId) {
    return { kind: "job_not_found" };
  }
  const job = await repository.getJobById(drawing.jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }

  const pricingConfig =
    (await repository.getPricingConfig(authenticated.company.id)) ??
    buildDefaultPricingConfig(authenticated.company.id, null);
  const createdAtIso = new Date().toISOString();
  const mergedManualEntries = mergeJobCommercialManualEntries(job.commercialInputs, manualEntries);
  const quote = await repository.createQuote({
    id: randomUUID(),
    companyId: authenticated.company.id,
    jobId: job.id,
    sourceDrawingId: drawing.id,
    sourceDrawingVersionNumber: drawing.versionNumber,
    drawingId: drawing.id,
    drawingVersionNumber: drawing.versionNumber,
    pricedEstimate: buildPricedEstimate(drawing, pricingConfig, ancillaryItems, mergedManualEntries),
    drawingSnapshot: {
      drawingId: drawing.id,
      drawingName: drawing.name,
      customerId: drawing.customerId,
      customerName: drawing.customerName,
      layout: drawing.layout,
      ...(drawing.savedViewport ? { savedViewport: drawing.savedViewport } : {}),
      estimate: drawing.estimate,
      schemaVersion: drawing.schemaVersion,
      rulesVersion: drawing.rulesVersion,
      versionNumber: drawing.versionNumber
    },
    createdByUserId: authenticated.user.id,
    createdAtIso
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: "QUOTE_CREATED",
    summary: `Created quote snapshot for ${drawing.name}`,
    createdAtIso,
    metadata: {
      jobId: job.id,
      drawingId: drawing.id,
      drawingVersionNumber: drawing.versionNumber,
      totalCost: quote.pricedEstimate.totals.totalCost
    }
  });

  return { kind: "success", quote };
}

export async function createQuoteForJob(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  jobId: string,
  drawingId: string | null,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[] = []
): Promise<CreateQuoteResult> {
  const job = await repository.getJobById(jobId, authenticated.company.id);
  if (!job) {
    return { kind: "job_not_found" };
  }
  const targetDrawingId = drawingId ?? job.primaryDrawingId;
  if (!targetDrawingId) {
    return { kind: "drawing_not_found" };
  }
  const drawing = await repository.getDrawingById(targetDrawingId, authenticated.company.id);
  if (!drawing || drawing.jobId !== job.id) {
    return { kind: "drawing_not_found" };
  }

  const pricingConfig =
    (await repository.getPricingConfig(authenticated.company.id)) ??
    buildDefaultPricingConfig(authenticated.company.id, null);
  const createdAtIso = new Date().toISOString();
  const mergedManualEntries = mergeJobCommercialManualEntries(job.commercialInputs, manualEntries);
  const quote = await repository.createQuote({
    id: randomUUID(),
    companyId: authenticated.company.id,
    jobId: job.id,
    sourceDrawingId: drawing.id,
    sourceDrawingVersionNumber: drawing.versionNumber,
    drawingId: drawing.id,
    drawingVersionNumber: drawing.versionNumber,
    pricedEstimate: buildPricedEstimate(drawing, pricingConfig, ancillaryItems, mergedManualEntries),
    drawingSnapshot: {
      drawingId: drawing.id,
      drawingName: drawing.name,
      customerId: drawing.customerId,
      customerName: drawing.customerName,
      layout: drawing.layout,
      ...(drawing.savedViewport ? { savedViewport: drawing.savedViewport } : {}),
      estimate: drawing.estimate,
      schemaVersion: drawing.schemaVersion,
      rulesVersion: drawing.rulesVersion,
      versionNumber: drawing.versionNumber
    },
    createdByUserId: authenticated.user.id,
    createdAtIso
  });

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "QUOTE",
    entityId: quote.id,
    action: "QUOTE_CREATED",
    summary: `Created quote snapshot for ${job.name}`,
    createdAtIso,
    metadata: {
      jobId: job.id,
      drawingId: drawing.id,
      drawingVersionNumber: drawing.versionNumber,
      totalCost: quote.pricedEstimate.totals.totalCost
    }
  });

  return { kind: "success", quote };
}

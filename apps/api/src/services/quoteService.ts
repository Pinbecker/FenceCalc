import { randomUUID } from "node:crypto";
import type { AncillaryEstimateItem, EstimateWorkbookManualEntry } from "@fence-estimator/contracts";
import { buildDefaultPricingConfig } from "@fence-estimator/contracts";
import { buildPricedEstimate } from "@fence-estimator/rules-engine";

import { writeAuditLog } from "../auditLogSupport.js";
import { mergeDrawingWorkspaceCommercialManualEntries } from "../drawingWorkspaceEstimateSupport.js";
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
  | { kind: "workspace_not_found" };

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
  const workspaceId = drawing.workspaceId ?? drawing.jobId ?? null;
  if (!workspaceId) {
    return { kind: "workspace_not_found" };
  }
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }

  const pricingConfig =
    (await repository.getPricingConfig(authenticated.company.id)) ??
    buildDefaultPricingConfig(authenticated.company.id, null);
  const createdAtIso = new Date().toISOString();
  const mergedManualEntries = mergeDrawingWorkspaceCommercialManualEntries(
    workspace.commercialInputs,
    manualEntries,
  );
  const quote = await repository.createQuote({
    id: randomUUID(),
    companyId: authenticated.company.id,
    workspaceId: workspace.id,
    jobId: workspace.id,
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
      versionNumber: drawing.versionNumber,
      revisionNumber: drawing.revisionNumber
    },
    createdByUserId: authenticated.user.id,
    createdAtIso
  });

  // Auto-set drawing status to QUOTED
  if (drawing.status === "DRAFT") {
    await repository.setDrawingStatus({
      drawingId: drawing.id,
      companyId: authenticated.company.id,
      expectedVersionNumber: drawing.versionNumber,
      status: "QUOTED",
      statusChangedAtIso: createdAtIso,
      statusChangedByUserId: authenticated.user.id,
      updatedAtIso: createdAtIso,
      updatedByUserId: authenticated.user.id
    });
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "QUOTE",
      entityId: quote.id,
      action: "QUOTE_CREATED",
      summary: `Created quote snapshot for ${drawing.name}`,
      createdAtIso,
      metadata: {
      workspaceId: workspace.id,
      drawingId: drawing.id,
      drawingVersionNumber: drawing.versionNumber,
      totalCost: quote.pricedEstimate.totals.totalCost
    }
  });

  return { kind: "success", quote };
}

export async function createQuoteForDrawingWorkspace(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  workspaceId: string,
  drawingId: string | null,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[] = []
): Promise<CreateQuoteResult> {
  const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
  if (!workspace) {
    return { kind: "workspace_not_found" };
  }
  const targetDrawingId = drawingId ?? workspace.primaryDrawingId;
  if (!targetDrawingId) {
    return { kind: "drawing_not_found" };
  }
  const drawing = await repository.getDrawingById(targetDrawingId, authenticated.company.id);
  if (!drawing || (drawing.workspaceId ?? drawing.jobId ?? null) !== workspace.id) {
    return { kind: "drawing_not_found" };
  }

  const pricingConfig =
    (await repository.getPricingConfig(authenticated.company.id)) ??
    buildDefaultPricingConfig(authenticated.company.id, null);
  const createdAtIso = new Date().toISOString();
  const mergedManualEntries = mergeDrawingWorkspaceCommercialManualEntries(
    workspace.commercialInputs,
    manualEntries,
  );
  const quote = await repository.createQuote({
    id: randomUUID(),
    companyId: authenticated.company.id,
    workspaceId: workspace.id,
    jobId: workspace.id,
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
      versionNumber: drawing.versionNumber,
      revisionNumber: drawing.revisionNumber
    },
    createdByUserId: authenticated.user.id,
    createdAtIso
  });

  // Auto-set drawing status to QUOTED
  if (drawing.status === "DRAFT") {
    await repository.setDrawingStatus({
      drawingId: drawing.id,
      companyId: authenticated.company.id,
      expectedVersionNumber: drawing.versionNumber,
      status: "QUOTED",
      statusChangedAtIso: createdAtIso,
      statusChangedByUserId: authenticated.user.id,
      updatedAtIso: createdAtIso,
      updatedByUserId: authenticated.user.id
    });
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
      entityType: "QUOTE",
      entityId: quote.id,
      action: "QUOTE_CREATED",
      summary: `Created quote snapshot for ${workspace.name}`,
      createdAtIso,
      metadata: {
      workspaceId: workspace.id,
      drawingId: drawing.id,
      drawingVersionNumber: drawing.versionNumber,
      totalCost: quote.pricedEstimate.totals.totalCost
    }
  });

  return { kind: "success", quote };
}

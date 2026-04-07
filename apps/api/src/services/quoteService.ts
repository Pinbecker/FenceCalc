import { randomUUID } from "node:crypto";
import type {
  AncillaryEstimateItem,
  DrawingRecord,
  EstimateWorkbookManualEntry
} from "@fence-estimator/contracts";
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

function buildQuoteSnapshotInput(
  drawing: DrawingRecord,
  workspaceId: string,
  companyId: string,
  userId: string,
  createdAtIso: string,
  pricedEstimate: ReturnType<typeof buildPricedEstimate>,
) {
  return {
    id: randomUUID(),
    companyId,
    workspaceId,
    sourceDrawingId: drawing.id,
    sourceDrawingVersionNumber: drawing.versionNumber,
    drawingId: drawing.id,
    drawingVersionNumber: drawing.versionNumber,
    pricedEstimate,
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
    createdByUserId: userId,
    createdAtIso
  };
}

async function autoQuoteDrawingIfNeeded(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  drawing: NonNullable<Awaited<ReturnType<AppRepository["getDrawingById"]>>>,
  createdAtIso: string,
): Promise<void> {
  if (drawing.status !== "DRAFT") {
    return;
  }

  const updatedDrawing = await repository.setDrawingStatus({
    drawingId: drawing.id,
    companyId: authenticated.company.id,
    expectedVersionNumber: drawing.versionNumber,
    status: "QUOTED",
    statusChangedAtIso: createdAtIso,
    statusChangedByUserId: authenticated.user.id,
    updatedAtIso: createdAtIso,
    updatedByUserId: authenticated.user.id
  });
  if (!updatedDrawing) {
    throw new Error("Drawing status could not be updated while creating the quote.");
  }

  await writeAuditLog(repository, {
    companyId: authenticated.company.id,
    actorUserId: authenticated.user.id,
    entityType: "DRAWING",
    entityId: drawing.id,
    action: "DRAWING_STATUS_CHANGED",
    summary: `Changed ${drawing.name} from ${drawing.status} to QUOTED`,
    createdAtIso,
    metadata: {
      previousStatus: drawing.status,
      newStatus: "QUOTED"
    }
  });
}

export async function createQuoteForDrawing(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  drawingId: string,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[] = []
): Promise<CreateQuoteResult> {
  const createdAtIso = new Date().toISOString();
  return repository.runInTransaction(async () => {
    const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
    if (!drawing) {
      return { kind: "drawing_not_found" as const };
    }
    const workspaceId = drawing.workspaceId ?? null;
    if (!workspaceId) {
      return { kind: "workspace_not_found" as const };
    }
    const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
    if (!workspace) {
      return { kind: "workspace_not_found" as const };
    }

    const pricingConfig =
      (await repository.getPricingConfig(authenticated.company.id)) ??
      buildDefaultPricingConfig(authenticated.company.id, null);
    const mergedManualEntries = mergeDrawingWorkspaceCommercialManualEntries(
      workspace.commercialInputs,
      manualEntries,
    );
    const quote = await repository.createQuote(
      buildQuoteSnapshotInput(
        drawing,
        workspace.id,
        authenticated.company.id,
        authenticated.user.id,
        createdAtIso,
        buildPricedEstimate(drawing, pricingConfig, ancillaryItems, mergedManualEntries),
      ),
    );

    await autoQuoteDrawingIfNeeded(repository, authenticated, drawing, createdAtIso);

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

    return { kind: "success" as const, quote };
  });
}

export async function createQuoteForDrawingWorkspace(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  workspaceId: string,
  drawingId: string | null,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[] = []
): Promise<CreateQuoteResult> {
  const createdAtIso = new Date().toISOString();
  return repository.runInTransaction(async () => {
    const workspace = await repository.getDrawingWorkspaceById(workspaceId, authenticated.company.id);
    if (!workspace) {
      return { kind: "workspace_not_found" as const };
    }
    const targetDrawingId = drawingId ?? workspace.primaryDrawingId;
    if (!targetDrawingId) {
      return { kind: "drawing_not_found" as const };
    }
    const drawing = await repository.getDrawingById(targetDrawingId, authenticated.company.id);
    if (!drawing || drawing.workspaceId !== workspace.id) {
      return { kind: "drawing_not_found" as const };
    }

    const pricingConfig =
      (await repository.getPricingConfig(authenticated.company.id)) ??
      buildDefaultPricingConfig(authenticated.company.id, null);
    const mergedManualEntries = mergeDrawingWorkspaceCommercialManualEntries(
      workspace.commercialInputs,
      manualEntries,
    );
    const quote = await repository.createQuote(
      buildQuoteSnapshotInput(
        drawing,
        workspace.id,
        authenticated.company.id,
        authenticated.user.id,
        createdAtIso,
        buildPricedEstimate(drawing, pricingConfig, ancillaryItems, mergedManualEntries),
      ),
    );

    await autoQuoteDrawingIfNeeded(repository, authenticated, drawing, createdAtIso);

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

    return { kind: "success" as const, quote };
  });
}

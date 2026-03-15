import { randomUUID } from "node:crypto";
import type { AncillaryEstimateItem } from "@fence-estimator/contracts";
import { buildDefaultPricingConfig } from "@fence-estimator/contracts";
import { buildPricedEstimate } from "@fence-estimator/rules-engine";

import { writeAuditLog } from "../auditLogSupport.js";
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
  | { kind: "drawing_not_found" };

export async function createQuoteForDrawing(
  repository: AppRepository,
  authenticated: QuoteActorContext,
  drawingId: string,
  ancillaryItems: AncillaryEstimateItem[]
): Promise<CreateQuoteResult> {
  const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
  if (!drawing) {
    return { kind: "drawing_not_found" };
  }

  const pricingConfig =
    (await repository.getPricingConfig(authenticated.company.id)) ??
    buildDefaultPricingConfig(authenticated.company.id, null);
  const createdAtIso = new Date().toISOString();
  const quote = await repository.createQuote({
    id: randomUUID(),
    companyId: authenticated.company.id,
    drawingId: drawing.id,
    drawingVersionNumber: drawing.versionNumber,
    pricedEstimate: buildPricedEstimate(drawing, pricingConfig, ancillaryItems),
    drawingSnapshot: {
      drawingId: drawing.id,
      drawingName: drawing.name,
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
      drawingId: drawing.id,
      drawingVersionNumber: drawing.versionNumber,
      totalCost: quote.pricedEstimate.totals.totalCost
    }
  });

  return { kind: "success", quote };
}

import { buildDefaultPricingConfig, pricingConfigUpdateRequestSchema } from "@fence-estimator/contracts";

import { requireAdmin, requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";

export function registerPricingRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/pricing-config", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;

    const pricingConfig =
      (await repository.getPricingConfig(auth.company.id)) ??
      buildDefaultPricingConfig(auth.company.id, null);
    return reply.code(200).send({ pricingConfig });
  });

  app.put("/api/v1/pricing-config", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`pricing-config:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = pricingConfigUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid pricing config payload", details: parsed.error.flatten() });
    }

    const existing =
      (await repository.getPricingConfig(auth.company.id)) ??
      buildDefaultPricingConfig(auth.company.id, null);

    const pricingConfig = await repository.upsertPricingConfig({
      companyId: auth.company.id,
      items: parsed.data.items ?? existing.items,
      ...(parsed.data.workbook ?? existing.workbook
        ? { workbook: parsed.data.workbook ?? existing.workbook }
        : {}),
      updatedAtIso: new Date().toISOString(),
      updatedByUserId: auth.user.id,
    });
    return reply.code(200).send({ pricingConfig });
  });
}

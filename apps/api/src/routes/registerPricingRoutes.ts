import { buildDefaultPricingConfig, pricingConfigUpdateRequestSchema } from "@fence-estimator/contracts";

import { requirePricingManager } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";

export function registerPricingRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/pricing-config", async (request, reply) => {
    const authenticated = await requirePricingManager(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const pricingConfig =
      (await repository.getPricingConfig(authenticated.company.id)) ??
      buildDefaultPricingConfig(authenticated.company.id, null);

    return reply.code(200).send({ pricingConfig });
  });

  app.put("/api/v1/pricing-config", async (request, reply) => {
    const authenticated = await requirePricingManager(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`pricing-config:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = pricingConfigUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid pricing config payload",
        details: parsed.error.flatten()
      });
    }

    const existingPricingConfig =
      (await repository.getPricingConfig(authenticated.company.id)) ??
      buildDefaultPricingConfig(authenticated.company.id, null);

    const pricingConfig = await repository.upsertPricingConfig({
      companyId: authenticated.company.id,
      items: parsed.data.items ?? existingPricingConfig.items,
      ...(parsed.data.workbook ?? existingPricingConfig.workbook ? { workbook: parsed.data.workbook ?? existingPricingConfig.workbook } : {}),
      updatedAtIso: new Date().toISOString(),
      updatedByUserId: authenticated.user.id
    });

    return reply.code(200).send({ pricingConfig });
  });
}

import { layoutModelSchema } from "@fence-estimator/contracts";

import { requireAuth } from "../authorization.js";
import { buildEstimate, normalizeLayout } from "../estimateSupport.js";
import type { RouteDependencies } from "../routeSupport.js";

export function registerEstimateRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/health", async (_request, reply) => {
    try {
      await repository.checkHealth();
      return reply.code(200).send({
        ok: true,
        service: "fence-estimator-api",
        repository: "ready",
        timestampIso: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(503).send({
        ok: false,
        service: "fence-estimator-api",
        repository: "unavailable",
        error: (error as Error).message,
        timestampIso: new Date().toISOString()
      });
    }
  });

  app.post("/api/v1/estimate", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    if (!writeLimiter.allow(`estimate:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = layoutModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid layout payload",
        details: parsed.error.flatten()
      });
    }

    try {
      const result = buildEstimate(normalizeLayout(parsed.data));
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
  });
}

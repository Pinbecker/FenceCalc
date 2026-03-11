import { layoutModelSchema } from "@fence-estimator/contracts";

import { buildEstimate, type RouteDependencies } from "../app-support.js";

export function registerEstimateRoutes({ app, writeLimiter }: RouteDependencies): void {
  app.get("/health", () => ({
    ok: true,
    service: "fence-estimator-api",
    timestampIso: new Date().toISOString()
  }));

  app.post("/api/v1/estimate", async (request, reply) => {
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
      const result = buildEstimate(parsed.data);
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
  });
}

import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply } from "fastify";
import { layoutModelSchema } from "@fence-estimator/contracts";

import { requireAuth } from "../authorization.js";
import { buildEstimate, normalizeLayout } from "../estimateSupport.js";
import type { RouteDependencies } from "../routeSupport.js";

export function registerEstimateRoutes({
  app,
  config,
  repository,
  writeLimiter,
  metrics,
}: RouteDependencies): void {
  const readinessHandler = async (_request: unknown, reply: FastifyReply) => {
    try {
      await repository.checkHealth();
      const details = await repository.getHealthDetails();
      metrics.markReady(true);
      return reply.code(200).send({
        ok: true,
        service: "fence-estimator-api",
        repository: "ready",
        database: details,
        timestampIso: new Date().toISOString(),
      });
    } catch (error) {
      metrics.markReady(false);
      return reply.code(503).send({
        ok: false,
        service: "fence-estimator-api",
        repository: "unavailable",
        error: (error as Error).message,
        timestampIso: new Date().toISOString(),
      });
    }
  };

  app.get("/livez", async (_request, reply) =>
    reply.code(200).send({
      ok: true,
      service: "fence-estimator-api",
      timestampIso: new Date().toISOString(),
    }),
  );
  app.get("/readyz", readinessHandler);
  app.get("/health", readinessHandler);

  app.get("/metrics", async (request, reply) => {
    if (config.metricsBearerToken) {
      const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const expectedDigest = createHash("sha256").update(config.metricsBearerToken).digest();
      const suppliedDigest = createHash("sha256").update(supplied).digest();
      if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
        return reply.code(401).send({ error: "Metrics authentication required" });
      }
    }
    return reply
      .header("content-type", metrics.contentType)
      .code(200)
      .send(await metrics.render());
  });

  app.post("/api/v1/estimate", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) return reply;
    if (!writeLimiter.allow(`estimate:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = layoutModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid layout payload", details: parsed.error.flatten() });
    }
    try {
      return reply.code(200).send(buildEstimate(normalizeLayout(parsed.data)));
    } catch (error) {
      return reply
        .code(400)
        .send({ error: "Invalid layout configuration", details: (error as Error).message });
    }
  });
}

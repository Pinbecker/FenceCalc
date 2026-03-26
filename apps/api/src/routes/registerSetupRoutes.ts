import { bootstrapOwnerRequestSchema } from "@fence-estimator/contracts";

import type { RouteDependencies } from "../routeSupport.js";
import { buildSessionCookieHeader, createSessionEnvelope } from "../sessionHttp.js";
import { bootstrapOwnerAccount } from "../services/setupService.js";

export function registerSetupRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/setup/status", async (_request, reply) => {
    const userCount = await repository.getUserCount();
    return reply.code(200).send({
      bootstrapRequired: userCount === 0,
      bootstrapSecretRequired: userCount === 0 && Boolean(config.bootstrapOwnerSecret)
    });
  });

  app.post("/api/v1/setup/bootstrap-owner", async (request, reply) => {
    if (!writeLimiter.allow(`bootstrap:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = bootstrapOwnerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid bootstrap payload",
        details: parsed.error.flatten()
      });
    }

    const providedSecret =
      typeof request.headers["x-bootstrap-secret"] === "string"
        ? request.headers["x-bootstrap-secret"].trim()
        : Array.isArray(request.headers["x-bootstrap-secret"])
          ? request.headers["x-bootstrap-secret"][0]?.trim() ?? ""
          : "";

    const result = await bootstrapOwnerAccount(repository, config, parsed.data, providedSecret);
    if (result.kind === "forbidden") {
      return reply.code(403).send({ error: "Bootstrap secret is required" });
    }
    if (result.kind === "conflict") {
      return reply.code(409).send({ error: "Bootstrap is no longer available" });
    }

    const envelope = createSessionEnvelope(config, result.account.company, result.account.user);
    await repository.createSession({
      id: envelope.session.id,
      companyId: envelope.company.id,
      userId: envelope.user.id,
      tokenHash: envelope.sessionTokenHash,
      createdAtIso: envelope.session.createdAtIso,
      expiresAtIso: envelope.session.expiresAtIso,
      revokedAtIso: null
    });

    reply.header("set-cookie", buildSessionCookieHeader(config, envelope.sessionToken));
    return reply.code(201).send({
      company: envelope.company,
      user: envelope.user,
      session: envelope.session
    });
  });
}

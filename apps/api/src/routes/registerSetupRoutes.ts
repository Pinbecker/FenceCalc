import { randomUUID } from "node:crypto";
import { bootstrapOwnerRequestSchema } from "@fence-estimator/contracts";

import { hashPassword } from "../auth.js";
import { createSessionEnvelope, type RouteDependencies, writeAuditLog } from "../app-support.js";

export function registerSetupRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/setup/status", async (_request, reply) => {
    const userCount = await repository.getUserCount();
    return reply.code(200).send({
      bootstrapRequired: userCount === 0
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

    const userCount = await repository.getUserCount();
    if (userCount > 0) {
      return reply.code(409).send({ error: "Bootstrap is no longer available" });
    }

    const existingUser = await repository.getUserByEmail(parsed.data.email);
    if (existingUser) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const nowIso = new Date().toISOString();
    const password = hashPassword(parsed.data.password);
    const account = await repository.createOwnerAccount({
      companyId: randomUUID(),
      companyName: parsed.data.companyName,
      userId: randomUUID(),
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      createdAtIso: nowIso
    });
    const envelope = createSessionEnvelope(config, account.company, account.user);
    await repository.createSession({
      id: envelope.session.id,
      companyId: envelope.company.id,
      userId: envelope.user.id,
      tokenHash: envelope.sessionTokenHash,
      createdAtIso: envelope.session.createdAtIso,
      expiresAtIso: envelope.session.expiresAtIso,
      revokedAtIso: null
    });
    await writeAuditLog(repository, {
      companyId: account.company.id,
      actorUserId: account.user.id,
      entityType: "AUTH",
      entityId: account.user.id,
      action: "OWNER_BOOTSTRAPPED",
      summary: `Bootstrapped owner ${account.user.displayName}`,
      createdAtIso: nowIso,
      metadata: { email: account.user.email }
    });

    return reply.code(201).send({
      company: envelope.company,
      user: envelope.user,
      session: envelope.session
    });
  });
}

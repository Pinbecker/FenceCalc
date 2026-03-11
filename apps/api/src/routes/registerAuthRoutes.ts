import { randomUUID } from "node:crypto";
import {
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema
} from "@fence-estimator/contracts";

import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "../auth.js";
import { createSessionEnvelope, readBearerToken, type RouteDependencies, requireAuth, writeAuditLog } from "../app-support.js";

export function registerAuthRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.post("/api/v1/auth/register", async (_request, reply) =>
    reply.code(403).send({ error: "Self-service registration is disabled" }),
  );

  app.post("/api/v1/auth/login", async (request, reply) => {
    if (!writeLimiter.allow(`login:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid login payload",
        details: parsed.error.flatten()
      });
    }

    const user = await repository.getUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash)) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const company = await repository.getCompanyById(user.companyId);
    if (!company) {
      return reply.code(500).send({ error: "User company is missing" });
    }

    const envelope = createSessionEnvelope(config, company, {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAtIso: user.createdAtIso
    });
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
      companyId: company.id,
      actorUserId: user.id,
      entityType: "AUTH",
      entityId: envelope.session.id,
      action: "LOGIN_SUCCEEDED",
      summary: `${user.displayName} signed in`,
      createdAtIso: envelope.session.createdAtIso,
      metadata: { email: user.email }
    });

    return reply.code(200).send({
      company: envelope.company,
      user: envelope.user,
      session: envelope.session
    });
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    return reply.code(200).send({
      company: authenticated.company,
      user: authenticated.user
    });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = readBearerToken(request.headers);
    if (!token) {
      return reply.code(200).send({ ok: true });
    }

    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    const revokedAtIso = new Date().toISOString();
    await repository.revokeSession(hashSessionToken(token), revokedAtIso);
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "AUTH",
      entityId: authenticated.user.id,
      action: "SESSION_REVOKED",
      summary: `${authenticated.user.displayName} signed out`,
      createdAtIso: revokedAtIso
    });

    return reply.code(200).send({ ok: true });
  });

  app.post("/api/v1/auth/request-password-reset", async (request, reply) => {
    if (!writeLimiter.allow(`password-reset-request:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = passwordResetRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid password reset payload",
        details: parsed.error.flatten()
      });
    }

    const user = await repository.getUserByEmail(parsed.data.email);
    if (user) {
      const issuedAtIso = new Date().toISOString();
      const resetToken = createSessionToken();
      const expiresAtIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await repository.createPasswordResetToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hashSessionToken(resetToken),
        createdAtIso: issuedAtIso,
        expiresAtIso
      });
      await writeAuditLog(repository, {
        companyId: user.companyId,
        actorUserId: null,
        entityType: "AUTH",
        entityId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        summary: `Password reset requested for ${user.email}`,
        createdAtIso: issuedAtIso,
        metadata: {
          email: user.email,
          resetToken
        }
      });
    }

    return reply.code(202).send({ ok: true });
  });

  app.post("/api/v1/auth/reset-password", async (request, reply) => {
    if (!writeLimiter.allow(`password-reset-confirm:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = passwordResetConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid password reset confirmation payload",
        details: parsed.error.flatten()
      });
    }

    const password = hashPassword(parsed.data.password);
    const consumedAtIso = new Date().toISOString();
    const consumption = await repository.consumePasswordResetToken(
      hashSessionToken(parsed.data.token),
      password.hash,
      password.salt,
      consumedAtIso,
    );
    if (!consumption) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    await writeAuditLog(repository, {
      companyId: consumption.company.id,
      actorUserId: consumption.user.id,
      entityType: "AUTH",
      entityId: consumption.user.id,
      action: "PASSWORD_RESET_COMPLETED",
      summary: `Password reset completed for ${consumption.user.email}`,
      createdAtIso: consumedAtIso
    });

    return reply.code(200).send({ ok: true });
  });
}

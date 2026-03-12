import { loginRequestSchema } from "@fence-estimator/contracts";

import { hashSessionToken, verifyPassword } from "../auth.js";
import { requireAuth } from "../authorization.js";
import { writeAuditLog } from "../auditLogSupport.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  buildClearedSessionCookieHeader,
  buildSessionCookieHeader,
  createSessionEnvelope,
  readSessionToken
} from "../sessionHttp.js";

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

    reply.header("set-cookie", buildSessionCookieHeader(config, envelope.sessionToken));
    return reply.code(200).send({
      company: envelope.company,
      user: envelope.user,
      session: envelope.session
    });
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    return reply.code(200).send({
      session: authenticated.session,
      company: authenticated.company,
      user: authenticated.user
    });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = readSessionToken(request.headers, config);
    if (!token) {
      reply.header("set-cookie", buildClearedSessionCookieHeader(config));
      return reply.code(200).send({ ok: true });
    }

    const authenticated = await requireAuth(request, reply, repository, config);
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

    reply.header("set-cookie", buildClearedSessionCookieHeader(config));
    return reply.code(200).send({ ok: true });
  });

  app.post("/api/v1/auth/request-password-reset", async (_request, reply) =>
    reply.code(501).send({
      error: "Password reset is disabled until a secure out-of-band delivery channel is configured"
    }),
  );

  app.post("/api/v1/auth/reset-password", async (_request, reply) =>
    reply.code(501).send({
      error: "Password reset is disabled until a secure out-of-band delivery channel is configured"
    }),
  );
}

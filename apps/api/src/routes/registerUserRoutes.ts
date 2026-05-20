import { randomUUID } from "node:crypto";
import { userCreateRequestSchema, userPasswordSetRequestSchema } from "@fence-estimator/contracts";
import { z } from "zod";

import { hashPassword } from "../auth.js";
import { requireAdmin } from "../authorization.js";
import { writeAuditLog } from "../auditLogSupport.js";
import type { RouteDependencies } from "../routeSupport.js";

const userRouteParamsSchema = z.object({
  userId: z.string().trim().min(1),
});

export function registerUserRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/users", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const users = await repository.listUsers(auth.company.id);
    return reply.code(200).send({ users });
  });

  app.post("/api/v1/users", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`user-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = userCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid user payload", details: parsed.error.flatten() });
    }
    const existingUser = await repository.getUserByEmail(parsed.data.email);
    if (existingUser) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const password = hashPassword(parsed.data.password);
    const createdAtIso = new Date().toISOString();
    const user = await repository.createUser({
      id: randomUUID(),
      companyId: auth.company.id,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      createdAtIso,
    });
    await writeAuditLog(repository, {
      companyId: auth.company.id,
      actorUserId: auth.user.id,
      entityType: "USER",
      entityId: user.id,
      action: "USER_CREATED",
      summary: `${auth.user.displayName} added ${user.displayName}`,
      createdAtIso,
      metadata: { role: user.role, email: user.email },
    });
    return reply.code(201).send({ user });
  });

  app.put("/api/v1/users/:userId/password", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`user-password-set:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsedParams = userRouteParamsSchema.safeParse(request.params ?? {});
    if (!parsedParams.success) {
      return reply
        .code(400)
        .send({ error: "Invalid user route parameters", details: parsedParams.error.flatten() });
    }
    const parsedBody = userPasswordSetRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply
        .code(400)
        .send({ error: "Invalid password payload", details: parsedBody.error.flatten() });
    }
    const targetUser = await repository.getUserById(parsedParams.data.userId, auth.company.id);
    if (!targetUser) {
      return reply.code(404).send({ error: "User not found" });
    }
    if (targetUser.id === auth.user.id) {
      return reply.code(400).send({
        error: "Ask another admin to reset your password, or use the operator recovery runbook",
      });
    }

    const password = hashPassword(parsedBody.data.password);
    const resetAtIso = new Date().toISOString();
    await repository.updateUserPassword(
      targetUser.id,
      auth.company.id,
      password.hash,
      password.salt,
    );
    await repository.revokeSessionsForUser(targetUser.id, auth.company.id, resetAtIso);
    await writeAuditLog(repository, {
      companyId: auth.company.id,
      actorUserId: auth.user.id,
      entityType: "USER",
      entityId: targetUser.id,
      action: "USER_PASSWORD_RESET",
      summary: `${auth.user.displayName} reset ${targetUser.displayName}'s password`,
      createdAtIso: resetAtIso,
      metadata: {
        email: targetUser.email,
        role: targetUser.role,
        sessionsRevoked: true,
      },
    });
    return reply.code(202).send({ ok: true });
  });
}

import { randomUUID } from "node:crypto";
import { userCreateRequestSchema } from "@fence-estimator/contracts";

import { hashPassword } from "../auth.js";
import { requireUserManager, type RouteDependencies, writeAuditLog } from "../app-support.js";

export function registerUserRoutes({ app, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/users", async (request, reply) => {
    const authenticated = await requireUserManager(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    const users = await repository.listUsers(authenticated.company.id);
    return reply.code(200).send({ users });
  });

  app.post("/api/v1/users", async (request, reply) => {
    const authenticated = await requireUserManager(request, reply, repository);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`user-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = userCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid user payload",
        details: parsed.error.flatten()
      });
    }

    const existingUser = await repository.getUserByEmail(parsed.data.email);
    if (existingUser) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const password = hashPassword(parsed.data.password);
    const createdAtIso = new Date().toISOString();
    const user = await repository.createUser({
      id: randomUUID(),
      companyId: authenticated.company.id,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      createdAtIso
    });
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "USER",
      entityId: user.id,
      action: "USER_CREATED",
      summary: `${authenticated.user.displayName} added ${user.displayName}`,
      createdAtIso,
      metadata: { role: user.role, email: user.email }
    });

    return reply.code(201).send({ user });
  });
}

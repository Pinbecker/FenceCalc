import { z } from "zod";

import { requireUserManager } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

export function registerAuditRoutes({ app, config, repository }: RouteDependencies): void {
  app.get("/api/v1/audit-log", async (request, reply) => {
    const authenticated = await requireUserManager(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const parsed = auditLogQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid audit log query",
        details: parsed.error.flatten()
      });
    }

    const entries = await repository.listAuditLog(authenticated.company.id, parsed.data.limit ?? 50);
    return reply.code(200).send({ entries });
  });
}

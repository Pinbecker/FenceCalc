import { z } from "zod";
import type { AuditLogRecord } from "@fence-estimator/contracts";

import { requireUserManager } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().datetime().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  entityType: z.enum(["AUTH", "USER", "DRAWING", "QUOTE", "CUSTOMER"]).optional(),
  search: z.string().trim().max(120).optional()
});

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}

function toAuditLogCsv(entries: AuditLogRecord[]): string {
  const rows = [
    ["createdAtIso", "entityType", "action", "summary", "actorUserId", "entityId", "metadataJson"],
    ...entries.map((entry) => [
      entry.createdAtIso,
      entry.entityType,
      entry.action,
      entry.summary,
      entry.actorUserId ?? "",
      entry.entityId ?? "",
      entry.metadata ? JSON.stringify(entry.metadata) : ""
    ])
  ];

  return rows.map((row) => row.map((value) => escapeCsvValue(value)).join(",")).join("\n");
}

async function listAllAuditLogEntries(
  repository: RouteDependencies["repository"],
  companyId: string,
  filters: {
    fromCreatedAtIso?: string | null;
    toCreatedAtIso?: string | null;
    entityType?: AuditLogRecord["entityType"] | null;
    search?: string | null;
  }
): Promise<AuditLogRecord[]> {
  const entries: AuditLogRecord[] = [];
  let beforeCreatedAtIso: string | null = null;

  for (;;) {
    const batch = await repository.listAuditLog(companyId, {
      limit: 200,
      beforeCreatedAtIso,
      fromCreatedAtIso: filters.fromCreatedAtIso ?? null,
      toCreatedAtIso: filters.toCreatedAtIso ?? null,
      entityType: filters.entityType ?? null,
      search: filters.search ?? null
    });
    entries.push(...batch);
    if (batch.length < 200) {
      break;
    }
    beforeCreatedAtIso = batch[batch.length - 1]?.createdAtIso ?? null;
    if (!beforeCreatedAtIso) {
      break;
    }
  }

  return entries;
}

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

    const entries = await repository.listAuditLog(authenticated.company.id, {
      limit: parsed.data.limit ?? 50,
      beforeCreatedAtIso: parsed.data.before ?? null,
      fromCreatedAtIso: parsed.data.from ?? null,
      toCreatedAtIso: parsed.data.to ?? null,
      entityType: parsed.data.entityType ?? null,
      search: parsed.data.search ?? null
    });

    return reply.code(200).send({
      entries,
      nextBeforeCreatedAtIso: entries.length > 0 ? entries[entries.length - 1]?.createdAtIso ?? null : null
    });
  });

  app.get("/api/v1/audit-log/export", async (request, reply) => {
    const authenticated = await requireUserManager(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const parsed = auditLogQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid audit log export query",
        details: parsed.error.flatten()
      });
    }

    const entries = await listAllAuditLogEntries(repository, authenticated.company.id, {
      fromCreatedAtIso: parsed.data.from ?? null,
      toCreatedAtIso: parsed.data.to ?? null,
      entityType: parsed.data.entityType ?? null,
      search: parsed.data.search ?? null
    });
    const csv = toAuditLogCsv(entries);

    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="audit-log-${authenticated.company.id}.csv"`);
    return reply.code(200).send(csv);
  });
}

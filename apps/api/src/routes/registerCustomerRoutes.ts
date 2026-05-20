import {
  customerArchiveRequestSchema,
  customerCreateRequestSchema,
  customerUpdateRequestSchema,
} from "@fence-estimator/contracts";

import { requireAdmin, requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createCustomerForCompany,
  deleteCustomerForCompany,
  getCustomerForCompany,
  listCustomersForCompany,
  setCustomerArchivedForCompany,
  updateCustomerForCompany,
} from "../services/customerService.js";
import type { ScopeFilter } from "../repository.js";

function parseScope(value: unknown): ScopeFilter {
  if (value === "ALL" || value === "ACTIVE" || value === "ARCHIVED") {
    return value;
  }
  return "ACTIVE";
}

export function registerCustomerRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/customers", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const query = request.query as { scope?: string; search?: string } | undefined;
    const customers = await listCustomersForCompany(
      repository,
      auth.company.id,
      parseScope(query?.scope),
      query?.search ?? "",
    );
    return reply.code(200).send({ customers });
  });

  app.post("/api/v1/customers", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`customers:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = customerCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid customer payload", details: parsed.error.flatten() });
    }
    const customer = await createCustomerForCompany(repository, auth, {
      name: parsed.data.name,
      contactName: parsed.data.contactName ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      contactPhone: parsed.data.contactPhone ?? null,
      siteAddress: parsed.data.siteAddress ?? null,
      notes: parsed.data.notes ?? null,
    });
    return reply.code(201).send({ customer });
  });

  app.get("/api/v1/customers/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const customer = await getCustomerForCompany(repository, auth.company.id, id);
    if (!customer) return reply.code(404).send({ error: "Customer not found" });
    return reply.code(200).send({ customer });
  });

  app.put("/api/v1/customers/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`customers:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = customerUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid customer payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const customer = await updateCustomerForCompany(repository, auth, id, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.contactName !== undefined
        ? { contactName: parsed.data.contactName ?? null }
        : {}),
      ...(parsed.data.contactEmail !== undefined
        ? { contactEmail: parsed.data.contactEmail ?? null }
        : {}),
      ...(parsed.data.contactPhone !== undefined
        ? { contactPhone: parsed.data.contactPhone ?? null }
        : {}),
      ...(parsed.data.siteAddress !== undefined
        ? { siteAddress: parsed.data.siteAddress ?? null }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
    });
    if (!customer) return reply.code(404).send({ error: "Customer not found" });
    return reply.code(200).send({ customer });
  });

  app.put("/api/v1/customers/:id/archive", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = customerArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid archive payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const customer = await setCustomerArchivedForCompany(
      repository,
      auth,
      id,
      parsed.data.isArchived,
    );
    if (!customer) return reply.code(404).send({ error: "Customer not found" });
    return reply.code(200).send({ customer });
  });

  app.delete("/api/v1/customers/:id", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const ok = await deleteCustomerForCompany(repository, auth, id);
    if (!ok) {
      return reply.code(409).send({ error: "Customer must be archived before deletion" });
    }
    return reply.code(204).send();
  });
}

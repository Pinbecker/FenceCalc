import {
  siteArchiveRequestSchema,
  siteCreateRequestSchema,
  siteUpdateRequestSchema,
} from "@fence-estimator/contracts";

import { requireAdmin, requireAuth } from "../authorization.js";
import type { ScopeFilter } from "../repository.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createSiteForCompany,
  deleteSiteForCompany,
  getSiteForCompany,
  listSitesForCompany,
  setSiteArchivedForCompany,
  updateSiteForCompany,
} from "../services/siteService.js";

function parseScope(value: unknown): ScopeFilter {
  return value === "ALL" || value === "ARCHIVED" ? value : "ACTIVE";
}

export function registerSiteRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/sites", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const query = request.query as { scope?: string; customerId?: string; search?: string };
    const sites = await listSitesForCompany(repository, auth.company.id, {
      scope: parseScope(query.scope),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search ? { search: query.search } : {}),
    });
    return reply.code(200).send({ sites });
  });

  app.post("/api/v1/sites", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`sites:${request.ip}`)) return reply.code(429).send({ error: "Rate limit exceeded" });
    const parsed = siteCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid site payload", details: parsed.error.flatten() });
    const site = await createSiteForCompany(repository, auth, {
      ...parsed.data,
      addressLine1: parsed.data.addressLine1 ?? null,
      addressLine2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city ?? null,
      county: parsed.data.county ?? null,
      postcode: parsed.data.postcode ?? null,
      notes: parsed.data.notes ?? null,
    });
    if (!site) return reply.code(409).send({ error: "Customer is unavailable or an active site already uses that name" });
    return reply.code(201).send({ site });
  });

  app.get("/api/v1/sites/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const site = await getSiteForCompany(repository, auth.company.id, id);
    return site ? reply.code(200).send({ site }) : reply.code(404).send({ error: "Site not found" });
  });

  app.put("/api/v1/sites/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = siteUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid site payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const site = await updateSiteForCompany(repository, auth, id, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.addressLine1 !== undefined
        ? { addressLine1: parsed.data.addressLine1 ?? null }
        : {}),
      ...(parsed.data.addressLine2 !== undefined
        ? { addressLine2: parsed.data.addressLine2 ?? null }
        : {}),
      ...(parsed.data.city !== undefined ? { city: parsed.data.city ?? null } : {}),
      ...(parsed.data.county !== undefined ? { county: parsed.data.county ?? null } : {}),
      ...(parsed.data.postcode !== undefined ? { postcode: parsed.data.postcode ?? null } : {}),
      ...(parsed.data.countryCode !== undefined ? { countryCode: parsed.data.countryCode } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
    });
    if (!site) return reply.code(409).send({ error: "Site not found or its name is already in use" });
    return reply.code(200).send({ site });
  });

  app.put("/api/v1/sites/:id/archive", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = siteArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid archive payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const site = await setSiteArchivedForCompany(repository, auth, id, parsed.data.isArchived);
    if (!site) return reply.code(409).send({ error: "A site with active projects cannot be archived" });
    return reply.code(200).send({ site });
  });

  app.delete("/api/v1/sites/:id", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const deleted = await deleteSiteForCompany(repository, auth, id);
    return deleted
      ? reply.code(204).send()
      : reply.code(409).send({ error: "Site must be archived and unused before deletion" });
  });
}

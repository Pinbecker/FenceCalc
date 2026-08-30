import {
  projectArchiveRequestSchema,
  projectCreateRequestSchema,
  projectStatusUpdateRequestSchema,
  projectUpdateRequestSchema,
} from "@fence-estimator/contracts";

import { requireAdmin, requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createProjectForCompany,
  deleteProjectForCompany,
  getProjectForCompany,
  listProjectsForCompany,
  setProjectArchivedForCompany,
  setProjectStatusForCompany,
  updateProjectForCompany,
} from "../services/projectService.js";
import type { ScopeFilter } from "../repository.js";

function parseScope(value: unknown): ScopeFilter {
  if (value === "ALL" || value === "ACTIVE" || value === "ARCHIVED") {
    return value;
  }
  return "ACTIVE";
}

export function registerProjectRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const query = request.query as
      | { scope?: string; customerId?: string; search?: string }
      | undefined;
    const projects = await listProjectsForCompany(repository, auth.company.id, {
      scope: parseScope(query?.scope),
      ...(query?.customerId ? { customerId: query.customerId } : {}),
      ...(query?.search ? { search: query.search } : {}),
    });
    return reply.code(200).send({ projects });
  });

  app.post("/api/v1/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`projects:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = projectCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid project payload", details: parsed.error.flatten() });
    }
    const project = await createProjectForCompany(repository, auth, {
      customerId: parsed.data.customerId,
      siteId: parsed.data.siteId,
      name: parsed.data.name,
      scope: parsed.data.scope ?? null,
      targetDateIso: parsed.data.targetDateIso ?? null,
      notes: parsed.data.notes ?? null,
    });
    if (!project) {
      return reply.code(404).send({ error: "Customer or active site not found" });
    }
    return reply.code(201).send({ project });
  });

  app.get("/api/v1/projects/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const project = await getProjectForCompany(repository, auth.company.id, id);
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return reply.code(200).send({ project });
  });

  app.put("/api/v1/projects/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`projects:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = projectUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid project payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const project = await updateProjectForCompany(repository, auth, id, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.siteId !== undefined ? { siteId: parsed.data.siteId } : {}),
      ...(parsed.data.scope !== undefined ? { scope: parsed.data.scope ?? null } : {}),
      ...(parsed.data.targetDateIso !== undefined
        ? { targetDateIso: parsed.data.targetDateIso ?? null }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return reply.code(200).send({ project });
  });

  app.put("/api/v1/projects/:id/status", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = projectStatusUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid status payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    if (parsed.data.status === "QUOTED" || parsed.data.status === "WON") {
      return reply.code(409).send({
        error: parsed.data.status === "QUOTED"
          ? "A project becomes quoted when a quote is issued"
          : "A project becomes won when an issued quote is accepted",
      });
    }
    const project = await setProjectStatusForCompany(repository, auth, id, parsed.data.status);
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return reply.code(200).send({ project });
  });

  app.put("/api/v1/projects/:id/archive", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = projectArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid archive payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const project = await setProjectArchivedForCompany(
      repository,
      auth,
      id,
      parsed.data.isArchived,
    );
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return reply.code(200).send({ project });
  });

  app.delete("/api/v1/projects/:id", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const ok = await deleteProjectForCompany(repository, auth, id);
    if (!ok) {
      return reply.code(409).send({ error: "Project must be archived before deletion" });
    }
    return reply.code(204).send();
  });
}

import {
  estimateArchiveRequestSchema,
  estimateCalculationRequestSchema,
  estimateLifecycleCreateRequestSchema,
  estimateVersionCreateRequestSchema,
  estimateVersionStatusUpdateRequestSchema,
  estimateVersionUpdateRequestSchema,
} from "@fence-estimator/contracts";

import { requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createEstimateForCompany,
  calculateEstimateVersionForCompany,
  createEstimateVersionForCompany,
  getEstimateForCompany,
  getEstimateVersionForCompany,
  listEstimatesForProjectForCompany,
  listEstimateVersionsForCompany,
  setEstimateArchivedForCompany,
  setEstimateVersionStatusForCompany,
  updateEstimateVersionForCompany,
} from "../services/estimateLifecycleService.js";

export function registerEstimateLifecycleRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/projects/:projectId/estimates", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { projectId } = request.params as { projectId: string };
    const estimates = await listEstimatesForProjectForCompany(repository, auth.company.id, projectId);
    return reply.code(200).send({ estimates });
  });

  app.post("/api/v1/estimates", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`estimates:${request.ip}`)) return reply.code(429).send({ error: "Rate limit exceeded" });
    const parsed = estimateLifecycleCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid estimate payload", details: parsed.error.flatten() });
    const result = await createEstimateForCompany(repository, auth, {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      designRevisionIds: parsed.data.designRevisionIds,
      notes: parsed.data.notes ?? null,
    });
    return result.ok
      ? reply.code(201).send(result.value)
      : reply.code(result.status).send({ error: result.message });
  });

  app.get("/api/v1/estimates/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const estimate = await getEstimateForCompany(repository, auth.company.id, id);
    if (!estimate) return reply.code(404).send({ error: "Estimate not found" });
    const currentVersion = await getEstimateVersionForCompany(repository, auth.company.id, estimate.currentVersionId);
    return reply.code(200).send({ estimate, currentVersion });
  });

  app.get("/api/v1/estimates/:id/versions", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const versions = await listEstimateVersionsForCompany(repository, auth.company.id, id);
    return reply.code(200).send({ versions });
  });

  app.post("/api/v1/estimates/:id/versions", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = estimateVersionCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid estimate version payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await createEstimateVersionForCompany(repository, auth, id, {
      notes: parsed.data.notes ?? null,
      ...(parsed.data.designRevisionIds ? { designRevisionIds: parsed.data.designRevisionIds } : {}),
    });
    return result.ok
      ? reply.code(201).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.get("/api/v1/estimate-versions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const version = await getEstimateVersionForCompany(repository, auth.company.id, id);
    return version
      ? reply.code(200).send({ version })
      : reply.code(404).send({ error: "Estimate version not found" });
  });

  app.put("/api/v1/estimate-versions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = estimateVersionUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid estimate version payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await updateEstimateVersionForCompany(repository, auth, id, {
      ...(parsed.data.designRevisionIds ? { designRevisionIds: parsed.data.designRevisionIds } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
    });
    return result.ok
      ? reply.code(200).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.put("/api/v1/estimate-versions/:id/status", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = estimateVersionStatusUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid estimate status payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await setEstimateVersionStatusForCompany(repository, auth, id, parsed.data.status);
    return result.ok
      ? reply.code(200).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.post("/api/v1/estimate-versions/:id/calculate", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`estimate-calculation:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = estimateCalculationRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid calculation payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const result = await calculateEstimateVersionForCompany(repository, auth, id, parsed.data);
    return result.ok
      ? reply.code(200).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.put("/api/v1/estimates/:id/archive", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = estimateArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid archive payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await setEstimateArchivedForCompany(repository, auth, id, parsed.data.isArchived);
    return result.ok
      ? reply.code(200).send({ estimate: result.value })
      : reply.code(result.status).send({ error: result.message });
  });
}

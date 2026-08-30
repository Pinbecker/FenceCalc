import {
  drawingArchiveRequestSchema,
  drawingCreateRequestSchema,
  drawingRenameRequestSchema,
  drawingStatusUpdateRequestSchema,
  revisionCreateRequestSchema,
  revisionNotesUpdateRequestSchema,
  revisionUpdateRequestSchema,
  type LayoutModel,
} from "@fence-estimator/contracts";

import { requireAdmin, requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createDrawingForCompany,
  deleteDrawingForCompany,
  deleteRevisionForCompany,
  getDrawingForCompany,
  getRevisionForCompany,
  InvalidDrawingLayoutError,
  listDrawingsForProjectForCompany,
  listRevisionsForDrawingForCompany,
  renameDrawingForCompany,
  saveRevisionForCompany,
  setDrawingStatusForCompany,
  setDrawingArchivedForCompany,
  startRevisionForCompany,
  updateRevisionNotesForCompany,
} from "../services/drawingService.js";

export function registerDrawingRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  // -------- Drawings --------

  app.get("/api/v1/projects/:projectId/drawings", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { projectId } = request.params as { projectId: string };
    const drawings = await listDrawingsForProjectForCompany(repository, auth, projectId);
    return reply.code(200).send({ drawings });
  });

  app.post("/api/v1/drawings", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`drawings:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = drawingCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid drawing payload", details: parsed.error.flatten() });
    }
    let result;
    try {
      result = await createDrawingForCompany(repository, auth, {
        projectId: parsed.data.projectId,
        name: parsed.data.name,
        ...(parsed.data.initialLayout
          ? { initialLayout: parsed.data.initialLayout as unknown as LayoutModel }
          : {}),
        ...(parsed.data.initialViewport ? { initialViewport: parsed.data.initialViewport } : {}),
      });
    } catch (error) {
      if (error instanceof InvalidDrawingLayoutError) {
        return reply.code(422).send({ error: error.message, integrityIssues: error.issues });
      }
      throw error;
    }
    if (!result) {
      return reply.code(404).send({ error: "Project not found" });
    }
    return reply.code(201).send({ drawing: result.drawing, revision: result.revision });
  });

  app.get("/api/v1/drawings/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const drawing = await getDrawingForCompany(repository, auth, id);
    if (!drawing) return reply.code(404).send({ error: "Drawing not found" });
    return reply.code(200).send({ drawing });
  });

  app.put("/api/v1/drawings/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`drawings:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = drawingRenameRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid drawing payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const drawing = await renameDrawingForCompany(repository, auth, id, parsed.data.name);
    if (!drawing) return reply.code(404).send({ error: "Drawing not found" });
    return reply.code(200).send({ drawing });
  });

  app.put("/api/v1/drawings/:id/archive", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = drawingArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid archive payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const drawing = await setDrawingArchivedForCompany(
      repository,
      auth,
      id,
      parsed.data.isArchived,
    );
    if (!drawing) return reply.code(404).send({ error: "Drawing not found" });
    return reply.code(200).send({ drawing });
  });

  app.put("/api/v1/drawings/:id/status", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = drawingStatusUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid design status payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const drawing = await setDrawingStatusForCompany(repository, auth, id, parsed.data.status);
    if (!drawing) {
      return reply
        .code(409)
        .send({ error: "A design must contain a fence line before it can be marked ready" });
    }
    return reply.code(200).send({ drawing });
  });

  app.delete("/api/v1/drawings/:id", async (request, reply) => {
    const auth = await requireAdmin(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const ok = await deleteDrawingForCompany(repository, auth, id);
    if (!ok) {
      return reply.code(409).send({ error: "Drawing must be archived before deletion" });
    }
    return reply.code(204).send();
  });

  // -------- Revisions --------

  app.get("/api/v1/drawings/:id/revisions", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const revisions = await listRevisionsForDrawingForCompany(repository, auth, id);
    return reply.code(200).send({ revisions });
  });

  app.post("/api/v1/drawings/:id/revisions", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`drawings:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = revisionCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid revision payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const revision = await startRevisionForCompany(repository, auth, id, parsed.data.notes ?? null);
    if (!revision) return reply.code(404).send({ error: "Drawing not found" });
    return reply.code(201).send({ revision });
  });

  app.get("/api/v1/revisions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const revision = await getRevisionForCompany(repository, auth, id);
    if (!revision) return reply.code(404).send({ error: "Revision not found" });
    return reply.code(200).send({ revision });
  });

  app.put("/api/v1/revisions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`drawings:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const parsed = revisionUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid revision payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const result = await saveRevisionForCompany(repository, auth, id, {
      expectedVersionNumber: parsed.data.expectedVersionNumber,
      layout: parsed.data.layout as unknown as LayoutModel,
      savedViewport: parsed.data.savedViewport ?? null,
    });
    if (result.kind === "not_found") {
      return reply.code(404).send({ error: "Revision not found" });
    }
    if (result.kind === "conflict") {
      return reply.code(409).send({ error: "Revision has been modified by another user" });
    }
    if (result.kind === "read_only") {
      return reply
        .code(409)
        .send({ error: "Only the latest working design revision can be edited" });
    }
    if (result.kind === "invalid") {
      return reply.code(422).send({
        error: "The drawing contains invalid geometry",
        integrityIssues: result.issues,
      });
    }
    return reply.code(200).send({ revision: result.revision });
  });

  app.put("/api/v1/revisions/:id/notes", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = revisionNotesUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid notes payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const revision = await updateRevisionNotesForCompany(
      repository,
      auth,
      id,
      parsed.data.notes ?? null,
    );
    if (!revision) return reply.code(404).send({ error: "Revision not found" });
    return reply.code(200).send({ revision });
  });

  app.delete("/api/v1/revisions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const ok = await deleteRevisionForCompany(repository, auth, id);
    if (!ok) {
      return reply
        .code(409)
        .send({ error: "Only the latest non-root revision of a drawing can be deleted" });
    }
    return reply.code(204).send();
  });
}

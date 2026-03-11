import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  drawingArchiveRequestSchema,
  drawingCreateRequestSchema,
  drawingUpdateRequestSchema
} from "@fence-estimator/contracts";

import { buildEstimate, requireAuth, type RouteDependencies, writeAuditLog } from "../app-support.js";

const drawingScopeSchema = z.enum(["ALL", "ACTIVE", "ARCHIVED"]).catch("ACTIVE");
const drawingRestoreRequestSchema = z.object({
  versionNumber: z.coerce.number().int().min(1)
});

export function registerDrawingRoutes({ app, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    const scope = drawingScopeSchema.parse((request.query as { scope?: unknown } | undefined)?.scope);
    const drawings = await repository.listDrawings(authenticated.company.id, scope);
    return reply.code(200).send({ drawings });
  });

  app.post("/api/v1/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`drawing-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = drawingCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing payload",
        details: parsed.error.flatten()
      });
    }

    try {
      const result = buildEstimate(parsed.data.layout);
      const nowIso = new Date().toISOString();
      const drawing = await repository.createDrawing({
        id: randomUUID(),
        companyId: authenticated.company.id,
        name: parsed.data.name,
        layout: result.layout,
        estimate: result.estimate,
        createdByUserId: authenticated.user.id,
        updatedByUserId: authenticated.user.id,
        createdAtIso: nowIso,
        updatedAtIso: nowIso
      });
      await writeAuditLog(repository, {
        companyId: authenticated.company.id,
        actorUserId: authenticated.user.id,
        entityType: "DRAWING",
        entityId: drawing.id,
        action: "DRAWING_CREATED",
        summary: `${authenticated.user.displayName} created ${drawing.name}`,
        createdAtIso: nowIso,
        metadata: { versionNumber: drawing.versionNumber }
      });

      return reply.code(201).send({ drawing });
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
  });

  app.get("/api/v1/drawings/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ error: "Missing drawing id" });
    }

    const drawing = await repository.getDrawingById(params.id, authenticated.company.id);
    if (!drawing) {
      return reply.code(404).send({ error: "Drawing not found" });
    }
    return reply.code(200).send({ drawing });
  });

  app.put("/api/v1/drawings/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`drawing-update:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ error: "Missing drawing id" });
    }

    const parsed = drawingUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing update payload",
        details: parsed.error.flatten()
      });
    }

    const existing = await repository.getDrawingById(params.id, authenticated.company.id);
    if (!existing) {
      return reply.code(404).send({ error: "Drawing not found" });
    }

    try {
      const nextLayout = parsed.data.layout ? buildEstimate(parsed.data.layout) : { layout: existing.layout, estimate: existing.estimate };
      const updated = await repository.updateDrawing({
        drawingId: existing.id,
        companyId: authenticated.company.id,
        name: parsed.data.name ?? existing.name,
        layout: nextLayout.layout,
        estimate: nextLayout.estimate,
        updatedByUserId: authenticated.user.id,
        updatedAtIso: new Date().toISOString()
      });
      if (!updated) {
        return reply.code(404).send({ error: "Drawing not found" });
      }
      await writeAuditLog(repository, {
        companyId: authenticated.company.id,
        actorUserId: authenticated.user.id,
        entityType: "DRAWING",
        entityId: updated.id,
        action: "DRAWING_UPDATED",
        summary: `${authenticated.user.displayName} updated ${updated.name}`,
        createdAtIso: updated.updatedAtIso,
        metadata: { versionNumber: updated.versionNumber }
      });

      return reply.code(200).send({ drawing: updated });
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
  });

  app.put("/api/v1/drawings/:id/archive", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`drawing-archive:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ error: "Missing drawing id" });
    }

    const parsed = drawingArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing archive payload",
        details: parsed.error.flatten()
      });
    }

    const updatedAtIso = new Date().toISOString();
    const drawing = await repository.setDrawingArchivedState({
      drawingId: params.id,
      companyId: authenticated.company.id,
      archived: parsed.data.archived,
      archivedAtIso: parsed.data.archived ? updatedAtIso : null,
      archivedByUserId: parsed.data.archived ? authenticated.user.id : null,
      updatedAtIso,
      updatedByUserId: authenticated.user.id
    });
    if (!drawing) {
      return reply.code(404).send({ error: "Drawing not found" });
    }
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "DRAWING",
      entityId: drawing.id,
      action: parsed.data.archived ? "DRAWING_ARCHIVED" : "DRAWING_UNARCHIVED",
      summary: `${authenticated.user.displayName} ${parsed.data.archived ? "archived" : "restored"} ${drawing.name}`,
      createdAtIso: updatedAtIso
    });

    return reply.code(200).send({ drawing });
  });

  app.get("/api/v1/drawings/:id/versions", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ error: "Missing drawing id" });
    }

    const versions = await repository.listDrawingVersions(params.id, authenticated.company.id);
    return reply.code(200).send({ versions });
  });

  app.post("/api/v1/drawings/:id/restore", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`drawing-restore:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = request.params as { id?: string };
    if (!params.id) {
      return reply.code(400).send({ error: "Missing drawing id" });
    }

    const parsed = drawingRestoreRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing restore payload",
        details: parsed.error.flatten()
      });
    }

    const restored = await repository.restoreDrawingVersion({
      drawingId: params.id,
      companyId: authenticated.company.id,
      versionNumber: parsed.data.versionNumber,
      restoredByUserId: authenticated.user.id,
      restoredAtIso: new Date().toISOString()
    });
    if (!restored) {
      return reply.code(404).send({ error: "Drawing version not found" });
    }
    await writeAuditLog(repository, {
      companyId: authenticated.company.id,
      actorUserId: authenticated.user.id,
      entityType: "DRAWING",
      entityId: restored.id,
      action: "DRAWING_VERSION_RESTORED",
      summary: `${authenticated.user.displayName} restored version ${parsed.data.versionNumber} of ${restored.name}`,
      createdAtIso: restored.updatedAtIso,
      metadata: { restoredFromVersion: parsed.data.versionNumber, versionNumber: restored.versionNumber }
    });

    return reply.code(200).send({ drawing: restored });
  });
}

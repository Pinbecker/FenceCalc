import type { FastifyReply } from "fastify";
import { z } from "zod";
import {
  drawingArchiveRequestSchema,
  drawingCreateRequestSchema,
  drawingUpdateRequestSchema
} from "@fence-estimator/contracts";

import { requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createDrawingForCompany,
  restoreDrawingVersionForCompany,
  setDrawingArchivedStateForCompany,
  updateDrawingForCompany
} from "../services/drawingService.js";

const drawingScopeSchema = z.enum(["ALL", "ACTIVE", "ARCHIVED"]).catch("ACTIVE");
const drawingRestoreRequestSchema = z.object({
  versionNumber: z.coerce.number().int().min(1),
  expectedVersionNumber: z.coerce.number().int().min(1)
});

function sendDrawingMutationFailure(
  reply: FastifyReply,
  result:
    | { kind: "conflict"; currentVersionNumber: number }
    | { kind: "drawing_not_found" }
    | { kind: "version_not_found" }
    | { kind: "invalid_layout"; message: string },
) {
  if (result.kind === "conflict") {
    return reply.code(409).send({
      error: "Drawing has changed since it was loaded",
      details: {
        currentVersionNumber: result.currentVersionNumber
      }
    });
  }

  if (result.kind === "version_not_found") {
    return reply.code(404).send({ error: "Drawing version not found" });
  }

  if (result.kind === "invalid_layout") {
    return reply.code(400).send({
      error: "Invalid layout configuration",
      details: result.message
    });
  }

  return reply.code(404).send({ error: "Drawing not found" });
}

export function registerDrawingRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const scope = drawingScopeSchema.parse((request.query as { scope?: unknown } | undefined)?.scope);
    const drawings = await repository.listDrawings(authenticated.company.id, scope);
    return reply.code(200).send({ drawings });
  });

  app.post("/api/v1/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
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

    const result = await createDrawingForCompany(repository, authenticated, parsed.data);
    if (result.kind !== "success") {
      return sendDrawingMutationFailure(reply, result);
    }

    return reply.code(201).send({ drawing: result.drawing });
  });

  app.get("/api/v1/drawings/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
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
    const authenticated = await requireAuth(request, reply, repository, config);
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

    const result = await updateDrawingForCompany(repository, authenticated, params.id, parsed.data);
    if (result.kind !== "success") {
      return sendDrawingMutationFailure(reply, result);
    }

    return reply.code(200).send({ drawing: result.drawing });
  });

  app.put("/api/v1/drawings/:id/archive", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
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

    const result = await setDrawingArchivedStateForCompany(repository, authenticated, params.id, parsed.data);
    if (result.kind !== "success") {
      return sendDrawingMutationFailure(reply, result);
    }

    return reply.code(200).send({ drawing: result.drawing });
  });

  app.get("/api/v1/drawings/:id/versions", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
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
    const authenticated = await requireAuth(request, reply, repository, config);
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

    const result = await restoreDrawingVersionForCompany(
      repository,
      authenticated,
      params.id,
      parsed.data.versionNumber,
      parsed.data.expectedVersionNumber,
    );
    if (result.kind !== "success") {
      return sendDrawingMutationFailure(reply, result);
    }

    return reply.code(200).send({ drawing: result.drawing });
  });
}

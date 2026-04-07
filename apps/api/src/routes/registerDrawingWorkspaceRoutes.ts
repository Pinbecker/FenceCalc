import {
  buildDefaultPricingConfig,
  type DrawingCanvasViewport,
  type LayoutModel,
  drawingTaskCreateRequestSchema,
  drawingTaskUpdateRequestSchema,
  drawingWorkspaceDrawingCreateRequestSchema,
  drawingWorkspaceCreateRequestSchema,
  drawingWorkspaceQuoteCreateRequestSchema,
  drawingWorkspaceUpdateRequestSchema,
} from "@fence-estimator/contracts";
import { buildPricedEstimate } from "@fence-estimator/rules-engine";
import { z } from "zod";

import { requireAuth } from "../authorization.js";
import { mergeDrawingWorkspaceCommercialManualEntries } from "../drawingWorkspaceEstimateSupport.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createDrawingWorkspaceForCompany,
  createDrawingWorkspaceDrawingForCompany,
  createDrawingWorkspaceTaskForCompany,
  deleteDrawingWorkspaceForCompany,
  deleteDrawingWorkspaceTaskForCompany,
  updateDrawingWorkspaceForCompany,
  updateDrawingWorkspaceTaskForCompany,
} from "../services/drawingWorkspaceService.js";
import { createQuoteForDrawingWorkspace } from "../services/quoteService.js";

const workspaceScopeSchema = z.enum(["ALL", "ACTIVE", "ARCHIVED"]).catch("ACTIVE");
const workspaceRouteParamsSchema = z.object({
  id: z.string().trim().min(1),
});
const workspaceTaskRouteParamsSchema = z.object({
  id: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
});
const companyTaskQuerySchema = z.object({
  includeCompleted: z.enum(["true", "false"]).optional(),
  assignedUserId: z.string().trim().min(1).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  search: z.string().trim().optional(),
  dueBucket: z.enum(["OVERDUE", "TODAY", "UPCOMING", "NO_DATE"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function registerDrawingWorkspaceRoutes({
  app,
  config,
  repository,
  writeLimiter,
}: RouteDependencies): void {
  app.get("/api/v1/drawing-workspaces", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const query =
      (request.query as { scope?: unknown; search?: unknown; customerId?: unknown } | undefined) ??
      {};
    const scope = workspaceScopeSchema.parse(query.scope);
    const search = typeof query.search === "string" ? query.search : "";
    const customerId =
      typeof query.customerId === "string" && query.customerId.trim()
        ? query.customerId.trim()
        : undefined;
    const workspaces = await repository.listDrawingWorkspaces(
      authenticated.company.id,
      scope,
      search,
      customerId,
    );
    return reply.code(200).send({ workspaces });
  });

  app.post("/api/v1/drawing-workspaces", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`workspace-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = drawingWorkspaceCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace payload",
        details: parsed.error.flatten(),
      });
    }

    const createInput = {
      customerId: parsed.data.customerId,
      name: parsed.data.name,
      notes: parsed.data.notes,
      ...(parsed.data.initialDrawing
        ? {
            initialDrawing: {
              layout: parsed.data.initialDrawing.layout as LayoutModel,
              ...(parsed.data.initialDrawing.savedViewport === undefined
                ? {}
                : {
                    savedViewport:
                      parsed.data.initialDrawing.savedViewport as DrawingCanvasViewport | null,
                  }),
            },
          }
        : {}),
    };

    const result = await createDrawingWorkspaceForCompany(repository, authenticated, createInput);
    if (result.kind === "invalid_customer") {
      return reply.code(400).send({ error: result.message });
    }
    if (result.kind !== "success") {
      return reply.code(404).send({ error: "Drawing workspace could not be created" });
    }

    return reply.code(201).send({ workspace: result.workspace });
  });

  app.get("/api/v1/drawing-workspaces/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }

    const workspace = await repository.getDrawingWorkspaceById(
      params.data.id,
      authenticated.company.id,
    );
    if (!workspace) {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    return reply.code(200).send({ workspace });
  });

  app.put("/api/v1/drawing-workspaces/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`workspace-update:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }

    const parsed = drawingWorkspaceUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await updateDrawingWorkspaceForCompany(
      repository,
      authenticated,
      params.data.id,
      parsed.data,
    );
    if (result.kind !== "success") {
      if (result.kind === "workspace_not_found") {
        return reply.code(404).send({ error: "Drawing workspace not found" });
      }
      if (result.kind === "invalid_user" || result.kind === "invalid_customer") {
        return reply.code(400).send({ error: result.message });
      }
      return reply.code(404).send({ error: "Drawing not found" });
    }

    return reply.code(200).send({ workspace: result.workspace });
  });

  app.delete("/api/v1/drawing-workspaces/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (authenticated.user.role !== "OWNER" && authenticated.user.role !== "ADMIN") {
      return reply.code(403).send({ error: "Admin role required" });
    }
    if (!writeLimiter.allow(`workspace-delete:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }

    const result = await deleteDrawingWorkspaceForCompany(
      repository,
      authenticated,
      params.data.id,
    );
    if (result.kind === "workspace_not_found") {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    if (result.kind === "not_archived") {
      return reply
        .code(409)
        .send({ error: "Drawing workspace must be archived before it can be deleted" });
    }

    return reply.code(200).send({ deleted: true });
  });

  app.get("/api/v1/drawing-workspaces/:id/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }

    const workspace = await repository.getDrawingWorkspaceById(
      params.data.id,
      authenticated.company.id,
    );
    if (!workspace) {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }

    const drawings = await repository.listDrawingsForWorkspace(
      workspace.id,
      authenticated.company.id,
    );
    return reply.code(200).send({ drawings });
  });

  app.post("/api/v1/drawing-workspaces/:id/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`workspace-drawing-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }
    const parsed = drawingWorkspaceDrawingCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace drawing payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await createDrawingWorkspaceDrawingForCompany(
      repository,
      authenticated,
      params.data.id,
      parsed.data,
    );
    if (result.kind === "workspace_not_found") {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    if (result.kind === "drawing_not_found") {
      return reply.code(404).send({ error: "Drawing or workspace not found" });
    }
    if (result.kind === "invalid_customer" || result.kind === "invalid_layout") {
      return reply.code(400).send({ error: result.message });
    }
    if (result.kind === "quoted_locked") {
      return reply.code(409).send({ error: result.message });
    }
    if (result.kind !== "success") {
      return reply.code(400).send({ error: "Unable to create drawing revision" });
    }

    return reply.code(201).send({ drawing: result.drawing });
  });

  app.get("/api/v1/drawing-workspaces/:id/estimate", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }
    const query = (request.query as { drawingId?: unknown } | undefined) ?? {};
    const requestedDrawingId =
      typeof query.drawingId === "string" && query.drawingId.trim() ? query.drawingId.trim() : null;

    const workspace = await repository.getDrawingWorkspaceById(
      params.data.id,
      authenticated.company.id,
    );
    if (!workspace) {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    const drawingId = requestedDrawingId ?? workspace.primaryDrawingId;
    if (!drawingId) {
      return reply.code(404).send({ error: "No drawing available for this workspace" });
    }
    const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
    if (!drawing || drawing.workspaceId !== workspace.id) {
      return reply.code(404).send({ error: "Drawing not found" });
    }

    const pricingConfig =
      (await repository.getPricingConfig(authenticated.company.id)) ??
      buildDefaultPricingConfig(authenticated.company.id, null);
    const pricedEstimate = buildPricedEstimate(
      drawing,
      pricingConfig,
      [],
      mergeDrawingWorkspaceCommercialManualEntries(workspace.commercialInputs),
    );
    return reply.code(200).send({ pricedEstimate });
  });

  app.get("/api/v1/drawing-workspaces/:id/quotes", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }

    const workspace = await repository.getDrawingWorkspaceById(
      params.data.id,
      authenticated.company.id,
    );
    if (!workspace) {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    const quotes = await repository.listQuotesForDrawingWorkspace(
      workspace.id,
      authenticated.company.id,
    );
    return reply.code(200).send({ quotes });
  });

  app.post("/api/v1/drawing-workspaces/:id/quotes", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`workspace-quote-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }
    const parsed = drawingWorkspaceQuoteCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace quote payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await createQuoteForDrawingWorkspace(
      repository,
      authenticated,
      params.data.id,
      parsed.data.drawingId ?? null,
      parsed.data.ancillaryItems,
      parsed.data.manualEntries,
    );
    if (result.kind === "workspace_not_found") {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    if (result.kind === "drawing_not_found") {
      return reply.code(404).send({ error: "Drawing not found" });
    }

    return reply.code(201).send({ quote: result.quote });
  });

  app.get("/api/v1/drawing-workspaces/:id/tasks", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }
    const workspace = await repository.getDrawingWorkspaceById(
      params.data.id,
      authenticated.company.id,
    );
    if (!workspace) {
      return reply.code(404).send({ error: "Drawing workspace not found" });
    }
    const tasks = await repository.listDrawingWorkspaceTasks(workspace.id, authenticated.company.id);
    return reply.code(200).send({ tasks });
  });

  app.post("/api/v1/drawing-workspaces/:id/tasks", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`workspace-task-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const params = workspaceRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid drawing workspace route parameters",
        details: params.error.flatten(),
      });
    }
    const parsed = drawingTaskCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid task payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await createDrawingWorkspaceTaskForCompany(
      repository,
      authenticated,
      params.data.id,
      parsed.data,
    );
    if (result.kind !== "success") {
      if (result.kind === "workspace_not_found") {
        return reply.code(404).send({ error: "Drawing workspace not found" });
      }
      if (result.kind === "drawing_not_found") {
        return reply.code(404).send({ error: "Drawing not found" });
      }
      if (result.kind === "invalid_user") {
        return reply.code(400).send({ error: result.message });
      }
      return reply.code(400).send({ error: "Unable to create task" });
    }
    return reply.code(201).send({ task: result.task });
  });

  app.put("/api/v1/drawing-workspaces/:id/tasks/:taskId", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`workspace-task-update:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const params = workspaceTaskRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid task route parameters",
        details: params.error.flatten(),
      });
    }
    const parsed = drawingTaskUpdateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid task payload",
        details: parsed.error.flatten(),
      });
    }

    const result = await updateDrawingWorkspaceTaskForCompany(
      repository,
      authenticated,
      params.data.id,
      params.data.taskId,
      parsed.data,
    );
    if (result.kind !== "success") {
      if (result.kind === "workspace_not_found") {
        return reply.code(404).send({ error: "Drawing workspace not found" });
      }
      if (result.kind === "drawing_not_found") {
        return reply.code(404).send({ error: "Drawing not found" });
      }
      if (result.kind === "task_not_found") {
        return reply.code(404).send({ error: "Task not found" });
      }
      if (result.kind === "invalid_user") {
        return reply.code(400).send({ error: result.message });
      }
      return reply.code(400).send({ error: "Unable to update task" });
    }
    return reply.code(200).send({ task: result.task });
  });

  app.delete("/api/v1/drawing-workspaces/:id/tasks/:taskId", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    const params = workspaceTaskRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid task route parameters",
        details: params.error.flatten(),
      });
    }

    const result = await deleteDrawingWorkspaceTaskForCompany(
      repository,
      authenticated,
      params.data.id,
      params.data.taskId,
    );
    if (result.kind !== "success") {
      if (result.kind === "workspace_not_found") {
        return reply.code(404).send({ error: "Drawing workspace not found" });
      }
      if (result.kind === "task_not_found") {
        return reply.code(404).send({ error: "Task not found" });
      }
      return reply.code(400).send({ error: "Unable to delete task" });
    }
    return reply.code(200).send({ success: true });
  });

  app.get("/api/v1/tasks", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    const query = companyTaskQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send({
        error: "Invalid task query parameters",
        details: query.error.flatten(),
      });
    }
    const tasks = await repository.listCompanyDrawingTasks(authenticated.company.id, {
      includeCompleted: query.data.includeCompleted === "true",
      ...(query.data.assignedUserId ? { assignedUserId: query.data.assignedUserId } : {}),
      ...(query.data.priority ? { priority: query.data.priority } : {}),
      ...(query.data.search ? { search: query.data.search } : {}),
      ...(query.data.dueBucket ? { dueBucket: query.data.dueBucket } : {}),
      ...(query.data.limit !== undefined ? { limit: query.data.limit } : {}),
    });
    return reply.code(200).send({ tasks });
  });

}

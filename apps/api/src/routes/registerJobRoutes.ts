import { buildDefaultPricingConfig, jobCreateRequestSchema, jobDrawingCreateRequestSchema, jobPrimaryDrawingUpdateRequestSchema, jobQuoteCreateRequestSchema, jobTaskCreateRequestSchema, jobTaskUpdateRequestSchema, jobUpdateRequestSchema } from "@fence-estimator/contracts";
import { buildPricedEstimate } from "@fence-estimator/rules-engine";
import { z } from "zod";

import { requireAuth } from "../authorization.js";
import { mergeJobCommercialManualEntries } from "../jobEstimateSupport.js";
import type { RouteDependencies } from "../routeSupport.js";
import { createJobDrawingForCompany, createJobForCompany, createJobTaskForCompany, deleteJobForCompany, deleteJobTaskForCompany, setJobPrimaryDrawingForCompany, updateJobForCompany, updateJobTaskForCompany } from "../services/jobService.js";
import { createQuoteForJob } from "../services/quoteService.js";

const jobScopeSchema = z.enum(["ALL", "ACTIVE", "ARCHIVED"]).catch("ACTIVE");
const jobRouteParamsSchema = z.object({
  id: z.string().trim().min(1)
});
const jobTaskRouteParamsSchema = z.object({
  id: z.string().trim().min(1),
  taskId: z.string().trim().min(1)
});

export function registerJobRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/jobs", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const query = (request.query as { scope?: unknown; search?: unknown; customerId?: unknown } | undefined) ?? {};
    const scope = jobScopeSchema.parse(query.scope);
    const search = typeof query.search === "string" ? query.search : "";
    const customerId = typeof query.customerId === "string" && query.customerId.trim() ? query.customerId.trim() : undefined;
    const jobs = await repository.listJobs(authenticated.company.id, scope, search, customerId);
    return reply.code(200).send({ jobs });
  });

  app.post("/api/v1/jobs", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = jobCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid job payload",
        details: parsed.error.flatten()
      });
    }

    const result = await createJobForCompany(repository, authenticated, parsed.data);
    if (result.kind === "invalid_customer") {
      return reply.code(400).send({ error: result.message });
    }
    if (result.kind !== "success") {
      return reply.code(404).send({ error: "Job could not be created" });
    }

    return reply.code(201).send({ job: result.job });
  });

  app.get("/api/v1/jobs/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }

    const job = await repository.getJobById(params.data.id, authenticated.company.id);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }
    return reply.code(200).send({ job });
  });

  app.put("/api/v1/jobs/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-update:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }

    const parsed = jobUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid job payload",
        details: parsed.error.flatten()
      });
    }

    const result = await updateJobForCompany(repository, authenticated, params.data.id, parsed.data);
    if (result.kind !== "success") {
      if (result.kind === "job_not_found") {
        return reply.code(404).send({ error: "Job not found" });
      }
      if (result.kind === "invalid_user") {
        return reply.code(400).send({ error: result.message });
      }
      if (result.kind === "invalid_customer") {
        return reply.code(400).send({ error: result.message });
      }
      return reply.code(404).send({ error: "Drawing not found" });
    }

    return reply.code(200).send({ job: result.job });
  });

  app.delete("/api/v1/jobs/:id", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (authenticated.user.role !== "OWNER" && authenticated.user.role !== "ADMIN") {
      return reply.code(403).send({ error: "Admin role required" });
    }
    if (!writeLimiter.allow(`job-delete:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }

    const result = await deleteJobForCompany(repository, authenticated, params.data.id);
    if (result.kind === "job_not_found") {
      return reply.code(404).send({ error: "Job not found" });
    }
    if (result.kind === "not_archived") {
      return reply.code(409).send({ error: "Job must be archived before it can be deleted" });
    }

    return reply.code(200).send({ deleted: true });
  });

  app.get("/api/v1/jobs/:id/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }

    const job = await repository.getJobById(params.data.id, authenticated.company.id);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    const drawings = await repository.listDrawingsForJob(job.id, authenticated.company.id);
    return reply.code(200).send({ drawings });
  });

  app.post("/api/v1/jobs/:id/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-drawing-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const parsed = jobDrawingCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid job drawing payload",
        details: parsed.error.flatten()
      });
    }

    const result = await createJobDrawingForCompany(repository, authenticated, params.data.id, parsed.data);
    if (result.kind === "drawing_not_found") {
      return reply.code(404).send({ error: "Drawing or job not found" });
    }
    if (result.kind === "invalid_customer") {
      return reply.code(400).send({ error: result.message });
    }
    if (result.kind !== "success") {
      return reply.code(400).send({ error: "Unable to create job drawing" });
    }

    return reply.code(201).send({ drawing: result.drawing });
  });

  app.put("/api/v1/jobs/:id/primary-drawing", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-primary-drawing:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const parsed = jobPrimaryDrawingUpdateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid primary drawing payload",
        details: parsed.error.flatten()
      });
    }

    const result = await setJobPrimaryDrawingForCompany(repository, authenticated, params.data.id, parsed.data.drawingId);
    if (result.kind !== "success") {
      if (result.kind === "job_not_found") {
        return reply.code(404).send({ error: "Job not found" });
      }
      return reply.code(404).send({ error: "Drawing not found" });
    }

    return reply.code(200).send({ job: result.job });
  });

  app.get("/api/v1/jobs/:id/estimate", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const query = (request.query as { drawingId?: unknown } | undefined) ?? {};
    const requestedDrawingId = typeof query.drawingId === "string" && query.drawingId.trim() ? query.drawingId.trim() : null;

    const job = await repository.getJobById(params.data.id, authenticated.company.id);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }
    const drawingId = requestedDrawingId ?? job.primaryDrawingId;
    if (!drawingId) {
      return reply.code(404).send({ error: "No drawing available for this job" });
    }
    const drawing = await repository.getDrawingById(drawingId, authenticated.company.id);
    if (!drawing || drawing.jobId !== job.id) {
      return reply.code(404).send({ error: "Drawing not found" });
    }

    const pricingConfig =
      (await repository.getPricingConfig(authenticated.company.id)) ??
      buildDefaultPricingConfig(authenticated.company.id, null);
    const pricedEstimate = buildPricedEstimate(
      drawing,
      pricingConfig,
      [],
      mergeJobCommercialManualEntries(job.commercialInputs)
    );
    return reply.code(200).send({ pricedEstimate });
  });

  app.get("/api/v1/jobs/:id/quotes", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }

    const job = await repository.getJobById(params.data.id, authenticated.company.id);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }
    const quotes = await repository.listQuotesForJob(job.id, authenticated.company.id);
    return reply.code(200).send({ quotes });
  });

  app.post("/api/v1/jobs/:id/quotes", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-quote-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const parsed = jobQuoteCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid job quote payload",
        details: parsed.error.flatten()
      });
    }

    const result = await createQuoteForJob(
      repository,
      authenticated,
      params.data.id,
      parsed.data.drawingId ?? null,
      parsed.data.ancillaryItems,
      parsed.data.manualEntries
    );
    if (result.kind === "job_not_found") {
      return reply.code(404).send({ error: "Job not found" });
    }
    if (result.kind === "drawing_not_found") {
      return reply.code(404).send({ error: "Drawing not found" });
    }

    return reply.code(201).send({ quote: result.quote });
  });

  app.get("/api/v1/jobs/:id/tasks", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const job = await repository.getJobById(params.data.id, authenticated.company.id);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }
    const tasks = await repository.listJobTasks(job.id, authenticated.company.id);
    return reply.code(200).send({ tasks });
  });

  app.post("/api/v1/jobs/:id/tasks", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-task-create:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const parsed = jobTaskCreateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid task payload",
        details: parsed.error.flatten()
      });
    }

    const result = await createJobTaskForCompany(repository, authenticated, params.data.id, parsed.data);
    if (result.kind !== "success") {
      if (result.kind === "job_not_found") {
        return reply.code(404).send({ error: "Job not found" });
      }
      if (result.kind === "invalid_user") {
        return reply.code(400).send({ error: result.message });
      }
      return reply.code(400).send({ error: "Unable to create task" });
    }
    return reply.code(201).send({ task: result.task });
  });

  app.put("/api/v1/jobs/:id/tasks/:taskId", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    if (!writeLimiter.allow(`job-task-update:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
    const params = jobTaskRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid task route parameters",
        details: params.error.flatten()
      });
    }
    const parsed = jobTaskUpdateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid task payload",
        details: parsed.error.flatten()
      });
    }

    const result = await updateJobTaskForCompany(repository, authenticated, params.data.id, params.data.taskId, parsed.data);
    if (result.kind !== "success") {
      if (result.kind === "job_not_found") {
        return reply.code(404).send({ error: "Job not found" });
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

  app.delete("/api/v1/jobs/:id/tasks/:taskId", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    const params = jobTaskRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid task route parameters",
        details: params.error.flatten()
      });
    }

    const result = await deleteJobTaskForCompany(repository, authenticated, params.data.id, params.data.taskId);
    if (result.kind !== "success") {
      if (result.kind === "job_not_found") {
        return reply.code(404).send({ error: "Job not found" });
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
    const tasks = await repository.listCompanyTasks(authenticated.company.id);
    return reply.code(200).send({ tasks });
  });

  app.get("/api/v1/jobs/:id/activity", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository, config);
    if (!authenticated) {
      return reply;
    }
    const params = jobRouteParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send({
        error: "Invalid job route parameters",
        details: params.error.flatten()
      });
    }
    const job = await repository.getJobById(params.data.id, authenticated.company.id);
    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    const entries = await repository.listAuditLog(authenticated.company.id, { limit: 200 });
    const jobEntries = entries.filter((entry) => {
      if (entry.entityType === "JOB" && entry.entityId === job.id) {
        return true;
      }
      return entry.metadata?.jobId === job.id;
    });
    return reply.code(200).send({ entries: jobEntries });
  });
}

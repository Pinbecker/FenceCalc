import {
  quoteArchiveRequestSchema,
  quoteCreateRequestSchema,
  quoteVersionCreateRequestSchema,
  quoteVersionStatusUpdateRequestSchema,
  quoteVersionUpdateRequestSchema,
} from "@fence-estimator/contracts";

import { requireAuth } from "../authorization.js";
import type { RouteDependencies } from "../routeSupport.js";
import {
  createQuoteForCompany,
  createQuoteVersionForCompany,
  getQuoteForCompany,
  getQuoteVersionForCompany,
  listQuotesForProjectForCompany,
  listQuoteVersionsForCompany,
  setQuoteArchivedForCompany,
  setQuoteVersionStatusForCompany,
  updateQuoteVersionForCompany,
} from "../services/quoteLifecycleService.js";

export function registerQuoteRoutes({ app, config, repository, writeLimiter }: RouteDependencies): void {
  app.get("/api/v1/projects/:projectId/quotes", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { projectId } = request.params as { projectId: string };
    const quotes = await listQuotesForProjectForCompany(repository, auth.company.id, projectId);
    return reply.code(200).send({ quotes });
  });

  app.post("/api/v1/quotes", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    if (!writeLimiter.allow(`quotes:${request.ip}`)) return reply.code(429).send({ error: "Rate limit exceeded" });
    const parsed = quoteCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote payload", details: parsed.error.flatten() });
    const result = await createQuoteForCompany(repository, auth, {
      estimateVersionId: parsed.data.estimateVersionId,
      name: parsed.data.name,
      title: parsed.data.title,
      customerMessage: parsed.data.customerMessage ?? null,
      validUntilIso: parsed.data.validUntilIso ?? null,
      ...(parsed.data.displayMode ? { displayMode: parsed.data.displayMode } : {}),
      ...(parsed.data.vatRate !== undefined ? { vatRate: parsed.data.vatRate } : {}),
    });
    return result.ok
      ? reply.code(201).send(result.value)
      : reply.code(result.status).send({ error: result.message });
  });

  app.get("/api/v1/quotes/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const quote = await getQuoteForCompany(repository, auth.company.id, id);
    if (!quote) return reply.code(404).send({ error: "Quote not found" });
    const currentVersion = await getQuoteVersionForCompany(repository, auth.company.id, quote.currentVersionId);
    return reply.code(200).send({ quote, currentVersion });
  });

  app.get("/api/v1/quotes/:id/versions", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const versions = await listQuoteVersionsForCompany(repository, auth.company.id, id);
    return reply.code(200).send({ versions });
  });

  app.post("/api/v1/quotes/:id/versions", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = quoteVersionCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote version payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await createQuoteVersionForCompany(repository, auth, id, {
      estimateVersionId: parsed.data.estimateVersionId,
      title: parsed.data.title,
      customerMessage: parsed.data.customerMessage ?? null,
      validUntilIso: parsed.data.validUntilIso ?? null,
      ...(parsed.data.displayMode ? { displayMode: parsed.data.displayMode } : {}),
      ...(parsed.data.vatRate !== undefined ? { vatRate: parsed.data.vatRate } : {}),
    });
    return result.ok
      ? reply.code(201).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.get("/api/v1/quote-versions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const { id } = request.params as { id: string };
    const version = await getQuoteVersionForCompany(repository, auth.company.id, id);
    return version
      ? reply.code(200).send({ version })
      : reply.code(404).send({ error: "Quote version not found" });
  });

  app.put("/api/v1/quote-versions/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = quoteVersionUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote version payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await updateQuoteVersionForCompany(repository, auth, id, {
      ...(parsed.data.estimateVersionId ? { estimateVersionId: parsed.data.estimateVersionId } : {}),
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.customerMessage !== undefined ? { customerMessage: parsed.data.customerMessage ?? null } : {}),
      ...(parsed.data.validUntilIso !== undefined ? { validUntilIso: parsed.data.validUntilIso ?? null } : {}),
      ...(parsed.data.displayMode ? { displayMode: parsed.data.displayMode } : {}),
      ...(parsed.data.vatRate !== undefined ? { vatRate: parsed.data.vatRate } : {}),
    });
    return result.ok
      ? reply.code(200).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.put("/api/v1/quote-versions/:id/status", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = quoteVersionStatusUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote status payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await setQuoteVersionStatusForCompany(repository, auth, id, parsed.data.status);
    return result.ok
      ? reply.code(200).send({ version: result.value })
      : reply.code(result.status).send({ error: result.message });
  });

  app.put("/api/v1/quotes/:id/archive", async (request, reply) => {
    const auth = await requireAuth(request, reply, repository, config);
    if (!auth) return reply;
    const parsed = quoteArchiveRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid archive payload", details: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const result = await setQuoteArchivedForCompany(repository, auth, id, parsed.data.isArchived);
    return result.ok
      ? reply.code(200).send({ quote: result.value })
      : reply.code(result.status).send({ error: result.message });
  });
}

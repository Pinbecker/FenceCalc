import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import {
  drawingCreateRequestSchema,
  drawingUpdateRequestSchema,
  layoutModelSchema,
  loginRequestSchema,
  registerRequestSchema,
  type AuthSessionEnvelope,
  type CompanyRecord,
  type CompanyUserRecord,
  type EstimateResult,
  type GatePlacement,
  type LayoutModel
} from "@fence-estimator/contracts";
import { estimateDrawingLayout } from "@fence-estimator/rules-engine";

import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./auth.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { InMemoryWriteRequestLimiter, type WriteRequestLimiter } from "./security.js";
import { AppRepository, InMemoryAppRepository, SqliteAppRepository } from "./repository.js";

function normalizeLayout(layout: LayoutModel): LayoutModel {
  return {
    segments: layout.segments.map((segment) => ({
      ...segment,
      start: { x: Math.round(segment.start.x), y: Math.round(segment.start.y) },
      end: { x: Math.round(segment.end.x), y: Math.round(segment.end.y) }
    })),
    gates: (layout.gates ?? []).map((gate): GatePlacement => ({
      ...gate,
      startOffsetMm: Math.round(gate.startOffsetMm),
      endOffsetMm: Math.round(gate.endOffsetMm)
    }))
  };
}

interface BuildAppOptions {
  repository?: AppRepository;
  config?: AppConfig;
  writeLimiter?: WriteRequestLimiter;
}

interface AuthenticatedRequestContext {
  company: CompanyRecord;
  user: CompanyUserRecord;
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

function readBearerToken(headers: FastifyRequest["headers"]): string | null {
  const authorization = headers.authorization;
  const headerValue =
    typeof authorization === "string" ? authorization : Array.isArray(authorization) ? authorization[0] : null;
  if (!headerValue) {
    return null;
  }
  const [scheme, token] = headerValue.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function buildEstimate(layout: LayoutModel): { layout: LayoutModel; estimate: EstimateResult } {
  const normalized = normalizeLayout(layout);
  return {
    layout: normalized,
    estimate: estimateDrawingLayout(normalized)
  };
}

function createSessionEnvelope(
  config: AppConfig,
  company: CompanyRecord,
  user: CompanyUserRecord,
): AuthSessionEnvelope & { sessionTokenHash: string } {
  const token = createSessionToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  return {
    company,
    user,
    sessionTokenHash: hashSessionToken(token),
    session: {
      id: randomUUID(),
      companyId: company.id,
      userId: user.id,
      token,
      createdAtIso: createdAt.toISOString(),
      expiresAtIso: expiresAt.toISOString()
    }
  };
}

async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
): Promise<AuthenticatedRequestContext | null> {
  const token = readBearerToken(request.headers);
  if (!token) {
    await reply.code(401).send({ error: "Missing bearer token" });
    return null;
  }

  const authenticated = await repository.getAuthenticatedSession(hashSessionToken(token));
  if (!authenticated) {
    await reply.code(401).send({ error: "Invalid session" });
    return null;
  }

  if (new Date(authenticated.session.expiresAtIso).getTime() <= Date.now()) {
    await reply.code(401).send({ error: "Session expired" });
    return null;
  }

  return {
    company: authenticated.company,
    user: authenticated.user
  };
}

export function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes
  });
  app.register(cors, {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin, config.allowedOrigins));
    }
  });

  const repository = options.repository ?? new SqliteAppRepository(config.databasePath);
  const writeLimiter =
    options.writeLimiter ?? new InMemoryWriteRequestLimiter(config.writeRateLimitWindowMs, config.writeRateLimitMaxRequests);

  app.get("/health", () => ({
    ok: true,
    service: "fence-estimator-api",
    timestampIso: new Date().toISOString()
  }));

  app.post("/api/v1/estimate", async (request, reply) => {
    if (!writeLimiter.allow(`estimate:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = layoutModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid layout payload",
        details: parsed.error.flatten()
      });
    }

    try {
      const result = buildEstimate(parsed.data);
      return reply.code(200).send(result);
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
  });

  app.post("/api/v1/auth/register", async (request, reply) => {
    if (!writeLimiter.allow(`register:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid registration payload",
        details: parsed.error.flatten()
      });
    }

    const existingUser = await repository.getUserByEmail(parsed.data.email);
    if (existingUser) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const nowIso = new Date().toISOString();
    const password = hashPassword(parsed.data.password);
    const account = await repository.createOwnerAccount({
      companyId: randomUUID(),
      companyName: parsed.data.companyName,
      userId: randomUUID(),
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      passwordHash: password.hash,
      passwordSalt: password.salt,
      createdAtIso: nowIso
    });
    const envelope = createSessionEnvelope(config, account.company, account.user);
    await repository.createSession({
      id: envelope.session.id,
      companyId: envelope.company.id,
      userId: envelope.user.id,
      tokenHash: envelope.sessionTokenHash,
      createdAtIso: envelope.session.createdAtIso,
      expiresAtIso: envelope.session.expiresAtIso
    });

    return reply.code(201).send({
      company: envelope.company,
      user: envelope.user,
      session: envelope.session
    });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    if (!writeLimiter.allow(`login:${request.ip}`)) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }

    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid login payload",
        details: parsed.error.flatten()
      });
    }

    const user = await repository.getUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash)) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const company = await repository.getCompanyById(user.companyId);
    if (!company) {
      return reply.code(500).send({ error: "User company is missing" });
    }

    const envelope = createSessionEnvelope(config, company, {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAtIso: user.createdAtIso
    });
    await repository.createSession({
      id: envelope.session.id,
      companyId: envelope.company.id,
      userId: envelope.user.id,
      tokenHash: envelope.sessionTokenHash,
      createdAtIso: envelope.session.createdAtIso,
      expiresAtIso: envelope.session.expiresAtIso
    });

    return reply.code(200).send({
      company: envelope.company,
      user: envelope.user,
      session: envelope.session
    });
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    return reply.code(200).send({
      company: authenticated.company,
      user: authenticated.user
    });
  });

  app.get("/api/v1/drawings", async (request, reply) => {
    const authenticated = await requireAuth(request, reply, repository);
    if (!authenticated) {
      return reply;
    }

    const drawings = await repository.listDrawings(authenticated.company.id);
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

      return reply.code(200).send({ drawing: updated });
    } catch (error) {
      return reply.code(400).send({
        error: "Invalid layout configuration",
        details: (error as Error).message
      });
    }
  });

  return app;
}

export const testRepositoryFactory = (): AppRepository => new InMemoryAppRepository();

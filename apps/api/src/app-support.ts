import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  AuthSessionEnvelope,
  CompanyRecord,
  CompanyUserRecord,
  EstimateResult,
  GatePlacement,
  LayoutModel
} from "@fence-estimator/contracts";
import { estimateDrawingLayout } from "@fence-estimator/rules-engine";

import { createSessionToken, hashSessionToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { AppRepository } from "./repository.js";
import type { WriteRequestLimiter } from "./security.js";

export interface BuildAppOptions {
  repository?: AppRepository;
  config?: AppConfig;
  writeLimiter?: WriteRequestLimiter;
}

export interface AuthenticatedRequestContext {
  company: CompanyRecord;
  user: CompanyUserRecord;
}

export interface RouteDependencies {
  app: FastifyInstance;
  repository: AppRepository;
  config: AppConfig;
  writeLimiter: WriteRequestLimiter;
}

export function userCanManageUsers(user: CompanyUserRecord): boolean {
  return user.role === "OWNER" || user.role === "ADMIN";
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

export function normalizeLayout(layout: LayoutModel): LayoutModel {
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

export function buildEstimate(layout: LayoutModel): { layout: LayoutModel; estimate: EstimateResult } {
  const normalized = normalizeLayout(layout);
  return {
    layout: normalized,
    estimate: estimateDrawingLayout(normalized)
  };
}

export function createSessionEnvelope(
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
      expiresAtIso: expiresAt.toISOString(),
      revokedAtIso: null
    }
  };
}

export function readBearerToken(headers: FastifyRequest["headers"]): string | null {
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

export async function requireAuth(
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

export async function requireUserManager(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
): Promise<AuthenticatedRequestContext | null> {
  const authenticated = await requireAuth(request, reply, repository);
  if (!authenticated) {
    return null;
  }
  if (!userCanManageUsers(authenticated.user)) {
    await reply.code(403).send({ error: "User management requires admin access" });
    return null;
  }
  return authenticated;
}

export async function writeAuditLog(
  repository: AppRepository,
  input: Omit<import("./repository.js").CreateAuditLogInput, "id">,
): Promise<void> {
  await repository.addAuditLog({
    id: randomUUID(),
    ...input
  });
}

import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  AuthSessionRecord,
  CompanyRecord,
  CompanyUserRecord,
} from "@fence-estimator/contracts";

import { hashSessionToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { AppRepository } from "./repository.js";
import { readSessionToken } from "./sessionHttp.js";

export interface AuthenticatedRequestContext {
  session: AuthSessionRecord;
  company: CompanyRecord;
  user: CompanyUserRecord;
}

export type Permission =
  | "WORKSPACE_READ"
  | "WORKSPACE_WRITE"
  | "COMMERCIAL_WRITE"
  | "PRICING_MANAGE"
  | "COMPANY_MANAGE"
  | "AUDIT_READ"
  | "DESTRUCTIVE_WRITE";

const ROLE_PERMISSIONS: Record<CompanyUserRecord["role"], ReadonlySet<Permission>> = {
  ADMIN: new Set<Permission>([
    "WORKSPACE_READ",
    "WORKSPACE_WRITE",
    "COMMERCIAL_WRITE",
    "PRICING_MANAGE",
    "COMPANY_MANAGE",
    "AUDIT_READ",
    "DESTRUCTIVE_WRITE",
  ]),
  USER: new Set<Permission>(["WORKSPACE_READ", "WORKSPACE_WRITE", "COMMERCIAL_WRITE"]),
};

export function userHasPermission(user: CompanyUserRecord, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].has(permission);
}

export function userIsAdmin(user: CompanyUserRecord): boolean {
  return user.role === "ADMIN";
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
  config: AppConfig,
): Promise<AuthenticatedRequestContext | null> {
  const token = readSessionToken(request.headers, config);
  if (!token) {
    await reply.code(401).send({ error: "Missing session" });
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

  request.sentryContext = {
    sessionId: authenticated.session.id,
    companyId: authenticated.company.id,
    userId: authenticated.user.id,
    userRole: authenticated.user.role,
  };

  return {
    session: {
      id: authenticated.session.id,
      companyId: authenticated.session.companyId,
      userId: authenticated.session.userId,
      createdAtIso: authenticated.session.createdAtIso,
      expiresAtIso: authenticated.session.expiresAtIso,
      revokedAtIso: authenticated.session.revokedAtIso ?? null,
    },
    company: authenticated.company,
    user: authenticated.user,
  };
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
  config: AppConfig,
): Promise<AuthenticatedRequestContext | null> {
  return requirePermission(request, reply, repository, config, "COMPANY_MANAGE");
}

export async function requirePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
  config: AppConfig,
  permission: Permission,
): Promise<AuthenticatedRequestContext | null> {
  const authenticated = await requireAuth(request, reply, repository, config);
  if (!authenticated) {
    return null;
  }
  if (!userHasPermission(authenticated.user, permission)) {
    await reply.code(403).send({ error: "You do not have permission to perform this action" });
    return null;
  }
  return authenticated;
}

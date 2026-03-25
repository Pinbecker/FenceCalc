import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthSessionRecord, CompanyRecord, CompanyUserRecord } from "@fence-estimator/contracts";

import { hashSessionToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { AppRepository } from "./repository.js";
import { readSessionToken } from "./sessionHttp.js";

export interface AuthenticatedRequestContext {
  session: AuthSessionRecord;
  company: CompanyRecord;
  user: CompanyUserRecord;
}

export function userCanManageUsers(user: CompanyUserRecord): boolean {
  return user.role === "OWNER" || user.role === "ADMIN";
}

export function userCanManagePricing(user: CompanyUserRecord): boolean {
  return user.role === "OWNER" || user.role === "ADMIN";
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

  return {
    session: {
      id: authenticated.session.id,
      companyId: authenticated.session.companyId,
      userId: authenticated.session.userId,
      createdAtIso: authenticated.session.createdAtIso,
      expiresAtIso: authenticated.session.expiresAtIso,
      revokedAtIso: authenticated.session.revokedAtIso ?? null
    },
    company: authenticated.company,
    user: authenticated.user
  };
}

export async function requireUserManager(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
  config: AppConfig,
): Promise<AuthenticatedRequestContext | null> {
  const authenticated = await requireAuth(request, reply, repository, config);
  if (!authenticated) {
    return null;
  }

  if (!userCanManageUsers(authenticated.user)) {
    await reply.code(403).send({ error: "User management requires admin access" });
    return null;
  }

  return authenticated;
}

export async function requirePricingManager(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
  config: AppConfig,
): Promise<AuthenticatedRequestContext | null> {
  const authenticated = await requireAuth(request, reply, repository, config);
  if (!authenticated) {
    return null;
  }

  if (!userCanManagePricing(authenticated.user)) {
    await reply.code(403).send({ error: "Pricing configuration requires admin access" });
    return null;
  }

  return authenticated;
}

export async function requireAdminRole(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AppRepository,
  config: AppConfig,
): Promise<AuthenticatedRequestContext | null> {
  const authenticated = await requireAuth(request, reply, repository, config);
  if (!authenticated) {
    return null;
  }

  if (authenticated.user.role !== "OWNER" && authenticated.user.role !== "ADMIN") {
    await reply.code(403).send({ error: "This action requires admin access" });
    return null;
  }

  return authenticated;
}

import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AuthSessionEnvelope, CompanyRecord, CompanyUserRecord } from "@fence-estimator/contracts";

import { createSessionToken, hashSessionToken } from "./auth.js";
import type { AppConfig } from "./config.js";

export function createSessionEnvelope(
  config: AppConfig,
  company: CompanyRecord,
  user: CompanyUserRecord,
): AuthSessionEnvelope & { sessionToken: string; sessionTokenHash: string } {
  const token = createSessionToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  return {
    company,
    user,
    sessionToken: token,
    sessionTokenHash: hashSessionToken(token),
    session: {
      id: randomUUID(),
      companyId: company.id,
      userId: user.id,
      createdAtIso: createdAt.toISOString(),
      expiresAtIso: expiresAt.toISOString(),
      revokedAtIso: null
    }
  };
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, entry) => {
    const [rawName, ...rawValueParts] = entry.split("=");
    const name = rawName?.trim();
    const rawValue = rawValueParts.join("=").trim();
    if (!name || !rawValue) {
      return cookies;
    }
    cookies[name] = decodeURIComponent(rawValue);
    return cookies;
  }, {});
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

export function readSessionToken(headers: FastifyRequest["headers"], config: AppConfig): string | null {
  const cookieHeader =
    typeof headers.cookie === "string" ? headers.cookie : Array.isArray(headers.cookie) ? headers.cookie[0] : undefined;
  const cookieToken = parseCookies(cookieHeader)[config.sessionCookieName];
  if (cookieToken) {
    return cookieToken;
  }

  return readBearerToken(headers);
}

export function buildSessionCookieHeader(config: AppConfig, sessionToken: string): string {
  const maxAgeSeconds = config.sessionTtlDays * 24 * 60 * 60;
  return [
    `${config.sessionCookieName}=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    ...(config.sessionCookieSecure ? ["Secure"] : [])
  ].join("; ");
}

export function buildClearedSessionCookieHeader(config: AppConfig): string {
  return [
    `${config.sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ...(config.sessionCookieSecure ? ["Secure"] : [])
  ].join("; ");
}

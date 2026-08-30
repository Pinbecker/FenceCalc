import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { loadConfig } from "./config.js";
import { captureApiException } from "./observability/sentry.js";
import { type AppRepository, PostgresAppRepository, SqliteAppRepository } from "./repository.js";
import {
  InMemoryLoginAttemptLimiter,
  InMemoryWriteRequestLimiter,
  type LoginAttemptLimiter,
  type WriteRequestLimiter,
} from "./security.js";
import { BuildAppOptions, isAllowedOrigin } from "./routeSupport.js";
import { registerModules } from "./modules/registerModules.js";
import { ApiOperationalMetrics } from "./observability/metrics.js";

export function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    trustProxy: config.trustProxy,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    logger: {
      level: config.logLevel,
    },
    bodyLimit: config.bodyLimitBytes,
  });
  app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin, config.allowedOrigins));
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (request.url.startsWith("/api/v1/auth/")) {
      reply.header("cache-control", "no-store");
    }
    const method = request.method.toUpperCase();
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (
      config.enforceWriteOrigin &&
      isWrite &&
      (!request.headers.origin || !isAllowedOrigin(request.headers.origin, config.allowedOrigins))
    ) {
      return reply.code(403).send({ error: "Request origin is not allowed" });
    }
  });

  app.addHook("onError", async (request, _reply, error) => {
    captureApiException(error, request);
  });

  const repository: AppRepository =
    options.repository ??
    (config.databaseProvider === "postgresql"
      ? new PostgresAppRepository(config.databaseUrl!, {
          auditLogRetentionDays: config.auditLogRetentionDays,
          skipMigration: config.skipAutoMigration,
          poolMax: config.databasePoolMax,
          connectionTimeoutMs: config.databaseConnectionTimeoutMs,
          statementTimeoutMs: config.databaseStatementTimeoutMs,
        })
      : new SqliteAppRepository(config.databasePath, {
          auditLogRetentionDays: config.auditLogRetentionDays,
          skipMigration: config.skipAutoMigration,
        }));
  const writeLimiter: WriteRequestLimiter =
    options.writeLimiter ??
    new InMemoryWriteRequestLimiter(
      config.writeRateLimitWindowMs,
      config.writeRateLimitMaxRequests,
    );
  const loginAttemptLimiter: LoginAttemptLimiter =
    options.loginAttemptLimiter ??
    new InMemoryLoginAttemptLimiter(
      config.loginAttemptWindowMs,
      config.loginMaxAttempts,
      config.loginLockoutMs,
    );
  const metrics = new ApiOperationalMetrics();

  app.addHook("onResponse", async (request, reply) => {
    metrics.recordRequest(
      request.method,
      request.routeOptions.url ?? "unmatched",
      reply.statusCode,
      reply.elapsedTime / 1_000,
    );
  });

  app.addHook("onClose", async () => {
    await repository.close();
  });

  const dependencies = {
    app,
    repository,
    config,
    writeLimiter,
    loginAttemptLimiter,
    metrics,
  };

  registerModules(dependencies);

  return app;
}

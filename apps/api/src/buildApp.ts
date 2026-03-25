import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

import { loadConfig } from "./config.js";
import { InMemoryAppRepository, type AppRepository, SqliteAppRepository } from "./repository.js";
import {
  InMemoryLoginAttemptLimiter,
  InMemoryWriteRequestLimiter,
  type LoginAttemptLimiter,
  type WriteRequestLimiter
} from "./security.js";
import { BuildAppOptions, isAllowedOrigin } from "./routeSupport.js";
import { registerModules } from "./modules/registerModules.js";

export function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    trustProxy: config.trustProxy,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    logger: {
      level: config.logLevel
    },
    bodyLimit: config.bodyLimitBytes
  });
  app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });
  app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin, config.allowedOrigins));
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  const repository: AppRepository =
    options.repository ?? new SqliteAppRepository(config.databasePath, { auditLogRetentionDays: config.auditLogRetentionDays });
  const writeLimiter: WriteRequestLimiter =
    options.writeLimiter ?? new InMemoryWriteRequestLimiter(config.writeRateLimitWindowMs, config.writeRateLimitMaxRequests);
  const loginAttemptLimiter: LoginAttemptLimiter =
    options.loginAttemptLimiter ??
    new InMemoryLoginAttemptLimiter(config.loginAttemptWindowMs, config.loginMaxAttempts, config.loginLockoutMs);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  const dependencies = {
    app,
    repository,
    config,
    writeLimiter,
    loginAttemptLimiter
  };

  registerModules(dependencies);

  return app;
}

export const testRepositoryFactory = (): AppRepository => new InMemoryAppRepository();

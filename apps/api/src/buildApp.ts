import Fastify from "fastify";
import cors from "@fastify/cors";

import { loadConfig } from "./config.js";
import { InMemoryAppRepository, type AppRepository, SqliteAppRepository } from "./repository.js";
import { InMemoryWriteRequestLimiter, type WriteRequestLimiter } from "./security.js";
import { BuildAppOptions, isAllowedOrigin } from "./routeSupport.js";
import { registerModules } from "./modules/registerModules.js";

export function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel
    },
    bodyLimit: config.bodyLimitBytes
  });
  app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin, config.allowedOrigins));
    }
  });

  const repository: AppRepository = options.repository ?? new SqliteAppRepository(config.databasePath);
  const writeLimiter: WriteRequestLimiter =
    options.writeLimiter ?? new InMemoryWriteRequestLimiter(config.writeRateLimitWindowMs, config.writeRateLimitMaxRequests);

  const dependencies = {
    app,
    repository,
    config,
    writeLimiter
  };

  registerModules(dependencies);

  return app;
}

export const testRepositoryFactory = (): AppRepository => new InMemoryAppRepository();

import type { FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import type { AppRepository } from "./repository.js";
import type { WriteRequestLimiter } from "./security.js";

export interface BuildAppOptions {
  repository?: AppRepository;
  config?: AppConfig;
  writeLimiter?: WriteRequestLimiter;
}

export interface RouteDependencies {
  app: FastifyInstance;
  repository: AppRepository;
  config: AppConfig;
  writeLimiter: WriteRequestLimiter;
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

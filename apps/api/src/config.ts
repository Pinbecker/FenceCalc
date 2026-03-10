import { z } from "zod";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"];

const envSchema = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_PATH: z.string().trim().min(1).default("./data/fence-estimator.db"),
  ALLOWED_ORIGINS: z.string().optional(),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(5_242_880).default(262_144),
  WRITE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
  WRITE_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30)
});

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  allowedOrigins: string[];
  bodyLimitBytes: number;
  writeRateLimitWindowMs: number;
  writeRateLimitMaxRequests: number;
  sessionTtlDays: number;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    allowedOrigins: parseAllowedOrigins(parsed.ALLOWED_ORIGINS),
    bodyLimitBytes: parsed.BODY_LIMIT_BYTES,
    writeRateLimitWindowMs: parsed.WRITE_RATE_LIMIT_WINDOW_MS,
    writeRateLimitMaxRequests: parsed.WRITE_RATE_LIMIT_MAX_REQUESTS,
    sessionTtlDays: parsed.SESSION_TTL_DAYS
  };
}

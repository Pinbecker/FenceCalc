import { isAbsolute } from "node:path";
import { z } from "zod";

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"];
const envBooleanSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return value;
}, z.boolean());
const optionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }
  return value;
}, z.string().trim().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TRUST_PROXY: envBooleanSchema.default(false),
  DATABASE_PATH: z.string().trim().min(1).default("./data/fence-estimator.db"),
  ALLOWED_ORIGINS: z.string().optional(),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(5_242_880).default(262_144),
  WRITE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
  WRITE_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SESSION_COOKIE_NAME: z.string().trim().min(1).default("fence_estimator_session"),
  SESSION_COOKIE_SECURE: envBooleanSchema.default(false),
  BOOTSTRAP_OWNER_SECRET: optionalTrimmedStringSchema,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  trustProxy: boolean;
  databasePath: string;
  allowedOrigins: string[];
  bodyLimitBytes: number;
  writeRateLimitWindowMs: number;
  writeRateLimitMaxRequests: number;
  sessionTtlDays: number;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
  bootstrapOwnerSecret: string | null;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
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
  const allowedOrigins = parseAllowedOrigins(parsed.ALLOWED_ORIGINS);

  if (parsed.NODE_ENV === "production") {
    if (!isAbsolute(parsed.DATABASE_PATH)) {
      throw new Error("DATABASE_PATH must be an absolute path in production");
    }
    if (!parsed.ALLOWED_ORIGINS) {
      throw new Error("ALLOWED_ORIGINS must be explicitly set in production");
    }
    if (!parsed.SESSION_COOKIE_SECURE) {
      throw new Error("SESSION_COOKIE_SECURE must be true in production");
    }
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    trustProxy: parsed.TRUST_PROXY,
    databasePath: parsed.DATABASE_PATH,
    allowedOrigins,
    bodyLimitBytes: parsed.BODY_LIMIT_BYTES,
    writeRateLimitWindowMs: parsed.WRITE_RATE_LIMIT_WINDOW_MS,
    writeRateLimitMaxRequests: parsed.WRITE_RATE_LIMIT_MAX_REQUESTS,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    sessionCookieName: parsed.SESSION_COOKIE_NAME,
    sessionCookieSecure: parsed.SESSION_COOKIE_SECURE,
    bootstrapOwnerSecret: parsed.BOOTSTRAP_OWNER_SECRET ?? null,
    logLevel: parsed.LOG_LEVEL
  };
}

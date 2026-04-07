import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const productionDatabasePath = resolve("var", "lib", "fence-estimator", "fence-estimator.db");
  const defaultDatabasePath = resolve("data", "fence-estimator.db");
  const explicitTestDatabasePath = resolve("data", "test.db");

  it("provides safe local defaults", () => {
    const config = loadConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3001);
    expect(config.trustProxy).toBe(false);
    expect(config.databasePath).toBe(defaultDatabasePath);
    expect(config.allowedOrigins).toContain("http://localhost:5173");
    expect(config.loginAttemptWindowMs).toBe(900000);
    expect(config.loginMaxAttempts).toBe(5);
    expect(config.loginLockoutMs).toBe(900000);
    expect(config.auditLogRetentionDays).toBe(365);
    expect(config.sentryDsn).toBeNull();
    expect(config.sentryEnvironment).toBeNull();
    expect(config.sentryRelease).toBeNull();
    expect(config.sentryTracesSampleRate).toBe(0);
    expect(config.sessionTtlDays).toBe(30);
    expect(config.sessionCookieName).toBe("fence_estimator_session");
    expect(config.sessionCookieSecure).toBe(false);
    expect(config.bootstrapOwnerSecret).toBeNull();
    expect(config.skipAutoMigration).toBe(false);
    expect(config.logLevel).toBe("info");
  });

  it("parses explicit deployment overrides", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      HOST: "0.0.0.0",
      PORT: "8080",
      TRUST_PROXY: "true",
      DATABASE_PATH: "./data/test.db",
      ALLOWED_ORIGINS: "https://app.example.com, https://admin.example.com",
      BODY_LIMIT_BYTES: "524288",
      WRITE_RATE_LIMIT_WINDOW_MS: "30000",
      WRITE_RATE_LIMIT_MAX_REQUESTS: "40",
      LOGIN_ATTEMPT_WINDOW_MS: "600000",
      LOGIN_MAX_ATTEMPTS: "4",
      LOGIN_LOCKOUT_MS: "1200000",
      AUDIT_LOG_RETENTION_DAYS: "730",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      SENTRY_ENVIRONMENT: "staging",
      SENTRY_RELEASE: "2026.03.25",
      SENTRY_TRACES_SAMPLE_RATE: "0.2",
      SESSION_TTL_DAYS: "14",
      SESSION_COOKIE_NAME: "custom_cookie",
      SESSION_COOKIE_SECURE: "true",
      BOOTSTRAP_OWNER_SECRET: "bootstrap-secret",
      LOG_LEVEL: "warn"
    });

    expect(config.nodeEnv).toBe("test");
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8080);
    expect(config.trustProxy).toBe(true);
    expect(config.databasePath).toBe(explicitTestDatabasePath);
    expect(config.allowedOrigins).toEqual(["https://app.example.com", "https://admin.example.com"]);
    expect(config.bodyLimitBytes).toBe(524288);
    expect(config.writeRateLimitWindowMs).toBe(30000);
    expect(config.writeRateLimitMaxRequests).toBe(40);
    expect(config.loginAttemptWindowMs).toBe(600000);
    expect(config.loginMaxAttempts).toBe(4);
    expect(config.loginLockoutMs).toBe(1200000);
    expect(config.auditLogRetentionDays).toBe(730);
    expect(config.sentryDsn).toBe("https://public@example.ingest.sentry.io/123");
    expect(config.sentryEnvironment).toBe("staging");
    expect(config.sentryRelease).toBe("2026.03.25");
    expect(config.sentryTracesSampleRate).toBe(0.2);
    expect(config.sessionTtlDays).toBe(14);
    expect(config.sessionCookieName).toBe("custom_cookie");
    expect(config.sessionCookieSecure).toBe(true);
    expect(config.bootstrapOwnerSecret).toBe("bootstrap-secret");
    expect(config.skipAutoMigration).toBe(false);
    expect(config.logLevel).toBe("warn");
  });

  it("rejects unsafe production defaults", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_PATH: "./data/fence-estimator.db",
        SESSION_COOKIE_SECURE: "false"
      }),
    ).toThrow("DATABASE_PATH must be an absolute path in production");

    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_PATH: productionDatabasePath,
        SESSION_COOKIE_SECURE: "false",
        ALLOWED_ORIGINS: "https://app.example.com"
      }),
    ).toThrow("SESSION_COOKIE_SECURE must be true in production");
  });

  it("treats a blank bootstrap secret as unset", () => {
    const config = loadConfig({
      BOOTSTRAP_OWNER_SECRET: "   "
    });

    expect(config.bootstrapOwnerSecret).toBeNull();
  });

  it("skips auto-migration by default in production", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      DATABASE_PATH: productionDatabasePath,
      SESSION_COOKIE_SECURE: "true",
      ALLOWED_ORIGINS: "https://app.example.com"
    });

    expect(config.skipAutoMigration).toBe(true);
  });

  it("allows overriding skipAutoMigration in production", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      DATABASE_PATH: productionDatabasePath,
      SESSION_COOKIE_SECURE: "true",
      ALLOWED_ORIGINS: "https://app.example.com",
      SKIP_AUTO_MIGRATION: "false"
    });

    expect(config.skipAutoMigration).toBe(false);
  });
});

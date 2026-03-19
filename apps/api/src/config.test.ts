import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const productionDatabasePath = resolve("var", "lib", "fence-estimator", "fence-estimator.db");

  it("provides safe local defaults", () => {
    const config = loadConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3001);
    expect(config.trustProxy).toBe(false);
    expect(config.databasePath).toBe("./data/fence-estimator.db");
    expect(config.allowedOrigins).toContain("http://localhost:5173");
    expect(config.sessionTtlDays).toBe(30);
    expect(config.sessionCookieName).toBe("fence_estimator_session");
    expect(config.sessionCookieSecure).toBe(false);
    expect(config.bootstrapOwnerSecret).toBeNull();
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
    expect(config.databasePath).toBe("./data/test.db");
    expect(config.allowedOrigins).toEqual(["https://app.example.com", "https://admin.example.com"]);
    expect(config.bodyLimitBytes).toBe(524288);
    expect(config.writeRateLimitWindowMs).toBe(30000);
    expect(config.writeRateLimitMaxRequests).toBe(40);
    expect(config.sessionTtlDays).toBe(14);
    expect(config.sessionCookieName).toBe("custom_cookie");
    expect(config.sessionCookieSecure).toBe(true);
    expect(config.bootstrapOwnerSecret).toBe("bootstrap-secret");
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
});

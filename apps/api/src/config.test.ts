import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("provides safe local defaults", () => {
    const config = loadConfig({});

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3001);
    expect(config.databasePath).toBe("./data/fence-estimator.db");
    expect(config.allowedOrigins).toContain("http://localhost:5173");
    expect(config.sessionTtlDays).toBe(30);
  });

  it("parses explicit deployment overrides", () => {
    const config = loadConfig({
      HOST: "0.0.0.0",
      PORT: "8080",
      DATABASE_PATH: "./data/test.db",
      ALLOWED_ORIGINS: "https://app.example.com, https://admin.example.com",
      BODY_LIMIT_BYTES: "524288",
      WRITE_RATE_LIMIT_WINDOW_MS: "30000",
      WRITE_RATE_LIMIT_MAX_REQUESTS: "40",
      SESSION_TTL_DAYS: "14"
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8080);
    expect(config.databasePath).toBe("./data/test.db");
    expect(config.allowedOrigins).toEqual(["https://app.example.com", "https://admin.example.com"]);
    expect(config.bodyLimitBytes).toBe(524288);
    expect(config.writeRateLimitWindowMs).toBe(30000);
    expect(config.writeRateLimitMaxRequests).toBe(40);
    expect(config.sessionTtlDays).toBe(14);
  });
});

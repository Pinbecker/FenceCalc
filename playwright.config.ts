import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const tempDir = resolve(".tmp", "playwright");
mkdirSync(tempDir, { recursive: true });

const databasePath = resolve(tempDir, `e2e-${Date.now()}.db`);
const apiUrl = "http://127.0.0.1:3001";
const webUrl = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome"
  },
  webServer: [
    {
      command: "node apps/api/dist/server.js",
      port: 3001,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "3001",
        DATABASE_PATH: databasePath,
        ALLOWED_ORIGINS: webUrl,
        SESSION_COOKIE_SECURE: "false",
        BOOTSTRAP_OWNER_SECRET: "test-bootstrap-secret",
        NODE_ENV: "test"
      }
    },
    {
      command: "node apps/web/scripts/serve-dist.mjs",
      port: 4173,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "4173"
      }
    }
  ]
});

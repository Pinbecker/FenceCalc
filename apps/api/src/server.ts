import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });
let isShuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  app.log.info({ reason }, "API shutting down");

  try {
    await app.close();
    app.log.info({ reason }, "API shutdown complete");
    process.exit(exitCode);
  } catch (error) {
    app.log.fatal({ reason, error }, "API shutdown failed");
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  app.log.fatal({ error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  app.log.fatal({ reason }, "Unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

app
  .listen({ port: config.port, host: config.host })
  .then(() => {
    app.log.info({ port: config.port, host: config.host }, "API started");
  })
  .catch((error) => {
    app.log.error(error, "API failed to start");
    process.exit(1);
  });

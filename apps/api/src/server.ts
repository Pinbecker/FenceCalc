import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });

app
  .listen({ port: config.port, host: config.host })
  .then(() => {
    app.log.info({ port: config.port, host: config.host }, "API started");
  })
  .catch((error) => {
    app.log.error(error, "API failed to start");
    process.exit(1);
  });

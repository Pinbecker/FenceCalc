import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "build"], {
  env: {
    ...process.env,
    VITE_API_BASE_URL: "http://127.0.0.1:3101"
  }
});
run("npx", ["playwright", "test"]);

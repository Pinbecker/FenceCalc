import { execSync, spawn } from "node:child_process";

const DEFAULT_PORT = 5173;
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const passthroughArgs = process.argv.slice(2);

function findListeningPidsWindows(localPort) {
  try {
    const output = execSync("netstat -ano -p tcp", { encoding: "utf8" });
    const pids = new Set();
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith("TCP")) {
        continue;
      }
      const columns = line.split(/\s+/);
      if (columns.length < 5) {
        continue;
      }
      const localAddress = columns[1] ?? "";
      const state = columns[3] ?? "";
      const pid = columns[4] ?? "";
      if (state !== "LISTENING") {
        continue;
      }
      if (!localAddress.endsWith(`:${localPort}`)) {
        continue;
      }
      if (pid && pid !== "0") {
        pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function findListeningPidsUnix(localPort) {
  try {
    const output = execSync(`lsof -ti tcp:${localPort} -sTCP:LISTEN`, { encoding: "utf8" }).trim();
    if (!output) {
      return [];
    }
    return output.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function stopProcessByPid(pid) {
  if (process.platform === "win32") {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    return;
  }
  process.kill(Number(pid), "SIGTERM");
}

function releasePort(localPort) {
  const pids =
    process.platform === "win32" ? findListeningPidsWindows(localPort) : findListeningPidsUnix(localPort);
  if (pids.length === 0) {
    return;
  }
  console.log(`[dev] Port ${localPort} is busy. Stopping process(es): ${pids.join(", ")}`);
  for (const pid of pids) {
    try {
      stopProcessByPid(pid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dev] Could not stop PID ${pid}: ${message}`);
      process.exit(1);
    }
  }
}

function startVite() {
  const child = spawn("npx", ["vite", ...passthroughArgs], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });

  child.on("error", (error) => {
    console.error(`[dev] Failed to start vite: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

releasePort(port);
startVite();

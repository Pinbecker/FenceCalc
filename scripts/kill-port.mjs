import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parsePort(value) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value ?? ""}`);
  }

  return parsed;
}

async function getListeningPidsWindows(port) {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], { windowsHide: true });
  const matches = new Set();

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || !line.includes("LISTENING")) {
      continue;
    }

    const columns = line.split(/\s+/);
    if (columns.length < 5) {
      continue;
    }

    const localAddress = columns[1] ?? "";
    const state = columns[3] ?? "";
    const processId = columns[4] ?? "";

    if (state !== "LISTENING") {
      continue;
    }

    if (!localAddress.endsWith(`:${port}`)) {
      continue;
    }

    const parsedProcessId = Number.parseInt(processId, 10);
    if (Number.isInteger(parsedProcessId) && parsedProcessId > 0) {
      matches.add(parsedProcessId);
    }
  }

  return [...matches];
}

async function getListeningPidsUnix(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { windowsHide: true });
    return stdout
      .split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch (error) {
    const typedError = error;
    if (typedError && typeof typedError === "object" && "code" in typedError && typedError.code === 1) {
      return [];
    }
    throw error;
  }
}

async function getListeningPids(port) {
  if (platform() === "win32") {
    return getListeningPidsWindows(port);
  }

  return getListeningPidsUnix(port);
}

async function main() {
  const port = parsePort(process.argv[2] ?? "3001");
  const pids = await getListeningPids(port);

  if (pids.length === 0) {
    console.log(`No listening process found on port ${port}.`);
    return;
  }

  const stopped = [];

  for (const processId of pids) {
    try {
      process.kill(processId, "SIGTERM");
      stopped.push(processId);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
        continue;
      }

      throw error;
    }
  }

  if (stopped.length === 0) {
    console.log(`No running process remained on port ${port}.`);
    return;
  }

  console.log(`Stopped process${stopped.length === 1 ? "" : "es"} on port ${port}: ${stopped.join(", ")}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

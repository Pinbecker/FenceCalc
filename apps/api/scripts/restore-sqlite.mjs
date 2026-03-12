import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import Database from "better-sqlite3";

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const rawBackupPath = readOption(args, "--backup");
const rawDatabasePath = readOption(args, "--database") ?? process.env.DATABASE_PATH;

if (!rawBackupPath) {
  fail("Missing --backup <path>");
}
if (!rawDatabasePath) {
  fail("Missing --database <path> or DATABASE_PATH");
}

const backupPath = resolve(rawBackupPath);
const databasePath = resolve(rawDatabasePath);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
let safeguardPath = null;

mkdirSync(dirname(databasePath), { recursive: true });

if (existsSync(databasePath)) {
  const currentDatabase = new Database(databasePath, { fileMustExist: true });
  safeguardPath = join(
    dirname(databasePath),
    `${basename(databasePath, extname(databasePath))}.pre-restore-${timestamp}.db`,
  );
  await currentDatabase.backup(safeguardPath);
  currentDatabase.close();
}

const backupDatabase = new Database(backupPath, { fileMustExist: true, readonly: true });
await backupDatabase.backup(databasePath);
backupDatabase.close();

for (const suffix of ["-shm", "-wal"]) {
  const sidecarPath = `${databasePath}${suffix}`;
  if (existsSync(sidecarPath)) {
    rmSync(sidecarPath, { force: true });
  }
}

process.stdout.write(`SQLite database restored from ${backupPath} to ${databasePath}\n`);
if (safeguardPath) {
  process.stdout.write(`Previous database snapshot saved to ${safeguardPath}\n`);
}

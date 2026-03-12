import { mkdirSync, statSync, writeFileSync } from "node:fs";
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
const rawDatabasePath = readOption(args, "--database") ?? process.env.DATABASE_PATH;
if (!rawDatabasePath) {
  fail("Missing --database <path> or DATABASE_PATH");
}

const databasePath = resolve(rawDatabasePath);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const rawOutput = readOption(args, "--output");
const rawOutputDir = readOption(args, "--output-dir");
const outputDir = rawOutputDir ? resolve(rawOutputDir) : resolve(dirname(databasePath), "backups");
mkdirSync(outputDir, { recursive: true });

const outputPath =
  rawOutput
    ? resolve(rawOutput)
    : join(outputDir, `${basename(databasePath, extname(databasePath))}-${timestamp}.db`);
mkdirSync(dirname(outputPath), { recursive: true });

const database = new Database(databasePath, { fileMustExist: true, readonly: true });
await database.backup(outputPath);
database.close();

const backupStats = statSync(outputPath);
const manifestPath = `${outputPath}.json`;
writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      createdAtIso: new Date().toISOString(),
      sourceDatabasePath: databasePath,
      backupPath: outputPath,
      sizeBytes: backupStats.size
    },
    null,
    2,
  ),
  "utf8",
);

process.stdout.write(`SQLite backup created at ${outputPath}\n`);
process.stdout.write(`Manifest written to ${manifestPath}\n`);

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import pg from "pg";

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const { Pool } = pg;

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

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return {
    hash: scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString("hex"),
    salt,
  };
}

const args = process.argv.slice(2);
const rawDatabasePath = readOption(args, "--database") ?? process.env.DATABASE_PATH;
const databaseUrl = readOption(args, "--database-url") ?? process.env.DATABASE_URL;
const email = readOption(args, "--email");
const password = readOption(args, "--password");

if (!databaseUrl && !rawDatabasePath) {
  fail("Missing --database-url/DATABASE_URL or --database/DATABASE_PATH");
}
if (!email) {
  fail("Missing --email <value>");
}
if (!password || password.length < 10) {
  fail("Missing --password <value> or password shorter than 10 characters");
}

const resetAtIso = new Date().toISOString();
const passwordDigest = hashPassword(password);

async function resetPostgresUser() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT id, company_id, email, display_name, role FROM users WHERE lower(email) = lower($1) FOR UPDATE",
      [email],
    );
    const user = result.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      fail(`No user found for ${email}`);
    }

    await client.query("UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3", [
      passwordDigest.hash,
      passwordDigest.salt,
      user.id,
    ]);
    await client.query(
      "UPDATE sessions SET revoked_at_iso = $1 WHERE user_id = $2 AND company_id = $3 AND revoked_at_iso IS NULL",
      [resetAtIso, user.id, user.company_id],
    );
    await client.query(
      `
        INSERT INTO audit_log (
          id, company_id, actor_user_id, entity_type, entity_id, action, summary, metadata_json, created_at_iso
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        randomUUID(),
        user.company_id,
        null,
        "USER",
        user.id,
        "USER_PASSWORD_RESET",
        `Operator password recovery for ${user.display_name}`,
        JSON.stringify({
          email: user.email,
          role: user.role,
          recoveryChannel: "OPERATOR_CLI",
          sessionsRevoked: true,
        }),
        resetAtIso,
      ],
    );
    await client.query("COMMIT");
    process.stdout.write(`Password reset for ${user.email}. Active sessions were revoked.\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function resetSqliteUser() {
  const databasePath = resolve(rawDatabasePath);
  const database = new Database(databasePath, { fileMustExist: true });
  const user = database
    .prepare(
      "SELECT id, company_id, email, display_name, role FROM users WHERE lower(email) = lower(?)",
    )
    .get(email);

  if (!user) {
    database.close();
    fail(`No user found for ${email}`);
  }

  const transaction = database.transaction(() => {
    database
      .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .run(passwordDigest.hash, passwordDigest.salt, user.id);
    database
      .prepare(
        "UPDATE sessions SET revoked_at_iso = ? WHERE user_id = ? AND company_id = ? AND revoked_at_iso IS NULL",
      )
      .run(resetAtIso, user.id, user.company_id);
    database
      .prepare(
        `
          INSERT INTO audit_log (
            id, company_id, actor_user_id, entity_type, entity_id, action, summary, metadata_json, created_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        randomUUID(),
        user.company_id,
        null,
        "USER",
        user.id,
        "USER_PASSWORD_RESET",
        `Operator password recovery for ${user.display_name}`,
        JSON.stringify({
          email: user.email,
          role: user.role,
          recoveryChannel: "OPERATOR_CLI",
          sessionsRevoked: true,
        }),
        resetAtIso,
      );
  });

  transaction();
  database.close();
  process.stdout.write(`Password reset for ${user.email}. Active sessions were revoked.\n`);
}

if (databaseUrl) {
  await resetPostgresUser();
} else {
  resetSqliteUser();
}

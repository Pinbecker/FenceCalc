import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const KEY_LENGTH = 64;

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
    hash: scryptSync(password, salt, KEY_LENGTH).toString("hex"),
    salt
  };
}

const args = process.argv.slice(2);
const rawDatabasePath = readOption(args, "--database") ?? process.env.DATABASE_PATH;
const email = readOption(args, "--email");
const password = readOption(args, "--password");

if (!rawDatabasePath) {
  fail("Missing --database <path> or DATABASE_PATH");
}
if (!email) {
  fail("Missing --email <value>");
}
if (!password || password.length < 10) {
  fail("Missing --password <value> or password shorter than 10 characters");
}

const databasePath = resolve(rawDatabasePath);
const database = new Database(databasePath, { fileMustExist: true });
const user = database
  .prepare("SELECT id, company_id, email, display_name, role FROM users WHERE email = ?")
  .get(email);

if (!user) {
  database.close();
  fail(`No user found for ${email}`);
}

const resetAtIso = new Date().toISOString();
const passwordDigest = hashPassword(password);
const transaction = database.transaction(() => {
  database
    .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .run(passwordDigest.hash, passwordDigest.salt, user.id);
  database
    .prepare("UPDATE sessions SET revoked_at_iso = ? WHERE user_id = ? AND company_id = ? AND revoked_at_iso IS NULL")
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
        sessionsRevoked: true
      }),
      resetAtIso,
    );
});

transaction();
database.close();

process.stdout.write(`Password reset for ${user.email}. Active sessions were revoked.\n`);

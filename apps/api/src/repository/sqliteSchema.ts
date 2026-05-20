import type Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 2;

function getCurrentSchemaVersion(database: Database.Database): number {
  // Detect whether a usable schema_migrations table exists with the expected shape.
  // The legacy DB may have a different column layout; in that case we treat it as v0
  // and let the migration path drop & recreate everything.
  const tableExists = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name: string } | undefined;
  if (!tableExists) {
    return 0;
  }
  const columns = database
    .prepare("PRAGMA table_info(schema_migrations)")
    .all() as Array<{ name: string }>;
  const hasVersionColumn = columns.some((column) => column.name === "version");
  if (!hasVersionColumn) {
    return 0;
  }
  const row = database
    .prepare("SELECT MAX(version) as version FROM schema_migrations")
    .get() as { version: number | null };
  return row.version ?? 0;
}

function setSchemaVersion(database: Database.Database, version: number): void {
  database.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)").run(version);
}

function dropLegacyTables(database: Database.Database): void {
  const legacyTables = [
    "drawing_versions",
    "drawing_workspace_tasks",
    "job_tasks",
    "drawing_revisions",
    "quotes",
    "drawings",
    "drawing_workspaces",
    "jobs",
    "projects",
    "customers",
    "password_reset_tokens",
    "sessions",
    "audit_log",
    "pricing_config",
    "users",
    "companies",
  ];
  for (const table of legacyTables) {
    database.exec(`DROP TABLE IF EXISTS ${table};`);
  }
}

function createSchemaV2(database: Database.Database): void {
  database.exec(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at_iso TEXT NOT NULL
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at_iso TEXT NOT NULL
    );
    CREATE INDEX users_company_idx ON users (company_id);

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at_iso TEXT NOT NULL,
      expires_at_iso TEXT NOT NULL,
      revoked_at_iso TEXT NULL
    );
    CREATE INDEX sessions_user_idx ON sessions (user_id);

    CREATE TABLE password_reset_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at_iso TEXT NOT NULL,
      expires_at_iso TEXT NOT NULL,
      consumed_at_iso TEXT NULL
    );

    CREATE TABLE customers (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact_name TEXT NULL,
      contact_email TEXT NULL,
      contact_phone TEXT NULL,
      site_address TEXT NULL,
      notes TEXT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );
    CREATE INDEX customers_company_idx ON customers (company_id);
    CREATE INDEX customers_name_idx ON customers (company_id, name);

    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'QUOTED', 'WON', 'LOST', 'ON_HOLD')),
      notes TEXT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      status_changed_at_iso TEXT NULL,
      status_changed_by_user_id TEXT NULL,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );
    CREATE INDEX projects_company_idx ON projects (company_id);
    CREATE INDEX projects_customer_idx ON projects (customer_id);

    CREATE TABLE drawings (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      current_revision_id TEXT NULL,
      latest_revision_number INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );
    CREATE INDEX drawings_project_idx ON drawings (project_id);

    CREATE TABLE drawing_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      parent_revision_id TEXT NULL REFERENCES drawing_revisions(id) ON DELETE SET NULL,
      notes TEXT NULL,
      layout_json TEXT NOT NULL,
      saved_viewport_json TEXT NULL,
      estimate_json TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      rules_version TEXT NOT NULL,
      version_number INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE (drawing_id, revision_number)
    );
    CREATE INDEX drawing_revisions_drawing_idx ON drawing_revisions (drawing_id);

    CREATE TABLE pricing_config (
      company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      items_json TEXT NOT NULL,
      workbook_json TEXT NULL,
      updated_at_iso TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL
    );

    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      actor_user_id TEXT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata_json TEXT NULL,
      created_at_iso TEXT NOT NULL
    );
    CREATE INDEX audit_log_company_idx ON audit_log (company_id, created_at_iso DESC);
  `);
}

export function migrateSqliteDatabase(database: Database.Database): void {
  const currentVersion = getCurrentSchemaVersion(database);

  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return;
  }

  // Temporarily disable foreign-key enforcement so we can drop tables in any
  // order without tripping referential-integrity checks. Must be toggled
  // outside of a transaction.
  database.exec("PRAGMA foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      dropLegacyTables(database);
      database.exec("DROP TABLE IF EXISTS schema_migrations;");
      database.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY NOT NULL
        );
      `);
      createSchemaV2(database);
      setSchemaVersion(database, CURRENT_SCHEMA_VERSION);
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) {
        database.exec("ROLLBACK");
      }
      throw error;
    }
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

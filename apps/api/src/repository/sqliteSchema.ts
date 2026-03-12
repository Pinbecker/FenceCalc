import Database from "better-sqlite3";

export function migrateSqliteDatabase(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at_iso TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (
      database.prepare("SELECT name FROM schema_migrations ORDER BY id ASC").all() as Array<{ name: string }>
    ).map((row) => row.name),
  );

  const migrations = [
    {
      name: "001_core_tables",
      sql: `
        CREATE TABLE IF NOT EXISTS companies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at_iso TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at_iso TEXT NOT NULL,
          expires_at_iso TEXT NOT NULL,
          revoked_at_iso TEXT,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS drawings (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          layout_json TEXT NOT NULL,
          estimate_json TEXT NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT 1,
          rules_version TEXT NOT NULL DEFAULT '2026-03-11',
          version_number INTEGER NOT NULL DEFAULT 1,
          is_archived INTEGER NOT NULL DEFAULT 0,
          archived_at_iso TEXT,
          archived_by_user_id TEXT,
          created_by_user_id TEXT NOT NULL,
          updated_by_user_id TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (created_by_user_id) REFERENCES users(id),
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
          FOREIGN KEY (archived_by_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_drawings_company_updated_at
        ON drawings(company_id, updated_at_iso DESC);
      `
    },
    {
      name: "002_drawing_versions_and_audit",
      sql: `
        CREATE TABLE IF NOT EXISTS drawing_versions (
          id TEXT PRIMARY KEY,
          drawing_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL DEFAULT 1,
          rules_version TEXT NOT NULL DEFAULT '2026-03-11',
          version_number INTEGER NOT NULL,
          source TEXT NOT NULL,
          name TEXT NOT NULL,
          layout_json TEXT NOT NULL,
          estimate_json TEXT NOT NULL,
          created_by_user_id TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          FOREIGN KEY (drawing_id) REFERENCES drawings(id),
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_drawing_versions_lookup
        ON drawing_versions(drawing_id, version_number DESC);

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          actor_user_id TEXT,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          action TEXT NOT NULL,
          summary TEXT NOT NULL,
          metadata_json TEXT,
          created_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (actor_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_audit_log_company_created
        ON audit_log(company_id, created_at_iso DESC);
      `
    },
    {
      name: "003_password_reset_tokens",
      sql: `
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at_iso TEXT NOT NULL,
          expires_at_iso TEXT NOT NULL,
          consumed_at_iso TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `
    },
    {
      name: "004_drawing_viewports",
      sql: `
        ALTER TABLE drawings ADD COLUMN viewport_json TEXT;
        ALTER TABLE drawing_versions ADD COLUMN viewport_json TEXT;
      `
    }
  ] as const;

  const insertMigration = database.prepare("INSERT INTO schema_migrations (name, applied_at_iso) VALUES (?, ?)");

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue;
    }
    database.exec(migration.sql);
    insertMigration.run(migration.name, new Date().toISOString());
  }

  ensureLegacySchemaPatched(database);
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return Boolean(row);
}

function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(database, tableName)) {
    return false;
  }
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function ensureLegacySchemaPatched(database: Database.Database): void {
  if (tableExists(database, "sessions") && !hasColumn(database, "sessions", "revoked_at_iso")) {
    database.exec("ALTER TABLE sessions ADD COLUMN revoked_at_iso TEXT");
  }

  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "version_number")) {
    database.exec("ALTER TABLE drawings ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "is_archived")) {
    database.exec("ALTER TABLE drawings ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "archived_at_iso")) {
    database.exec("ALTER TABLE drawings ADD COLUMN archived_at_iso TEXT");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "archived_by_user_id")) {
    database.exec("ALTER TABLE drawings ADD COLUMN archived_by_user_id TEXT");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "schema_version")) {
    database.exec("ALTER TABLE drawings ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "rules_version")) {
    database.exec("ALTER TABLE drawings ADD COLUMN rules_version TEXT NOT NULL DEFAULT '2026-03-11'");
  }

  if (tableExists(database, "drawing_versions") && !hasColumn(database, "drawing_versions", "schema_version")) {
    database.exec("ALTER TABLE drawing_versions ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1");
  }
  if (tableExists(database, "drawing_versions") && !hasColumn(database, "drawing_versions", "rules_version")) {
    database.exec("ALTER TABLE drawing_versions ADD COLUMN rules_version TEXT NOT NULL DEFAULT '2026-03-11'");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "viewport_json")) {
    database.exec("ALTER TABLE drawings ADD COLUMN viewport_json TEXT");
  }
  if (tableExists(database, "drawing_versions") && !hasColumn(database, "drawing_versions", "viewport_json")) {
    database.exec("ALTER TABLE drawing_versions ADD COLUMN viewport_json TEXT");
  }

  if (tableExists(database, "drawings") && tableExists(database, "drawing_versions")) {
    database.exec(`
      INSERT INTO drawing_versions (
        id,
        drawing_id,
        company_id,
        schema_version,
        rules_version,
        version_number,
        source,
        name,
        layout_json,
        estimate_json,
        created_by_user_id,
        created_at_iso
      )
      SELECT
        d.id || ':1',
        d.id,
        d.company_id,
        COALESCE(d.schema_version, 1),
        COALESCE(d.rules_version, '2026-03-11'),
        1,
        'CREATE',
        d.name,
        d.layout_json,
        d.estimate_json,
        d.created_by_user_id,
        d.created_at_iso
      FROM drawings d
      WHERE NOT EXISTS (
        SELECT 1
        FROM drawing_versions dv
        WHERE dv.drawing_id = d.id
      )
    `);
  }
}

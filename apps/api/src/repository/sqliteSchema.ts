import Database from "better-sqlite3";
import { buildDefaultJobCommercialInputs } from "@fence-estimator/contracts";

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
      database.prepare("SELECT name FROM schema_migrations ORDER BY id ASC").all() as Array<{
        name: string;
      }>
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
          customer_name TEXT NOT NULL,
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
      `,
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
          customer_name TEXT NOT NULL,
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
      `,
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
      `,
    },
    {
      name: "004_drawing_viewports",
      sql: `
        ALTER TABLE drawings ADD COLUMN viewport_json TEXT;
        ALTER TABLE drawing_versions ADD COLUMN viewport_json TEXT;
      `,
    },
    {
      name: "005_drawing_customers",
      sql: `
        SELECT 1;
      `,
    },
    {
      name: "006_pricing_configs",
      sql: `
        CREATE TABLE IF NOT EXISTS pricing_configs (
          company_id TEXT PRIMARY KEY,
          config_json TEXT NOT NULL,
          updated_at_iso TEXT NOT NULL,
          updated_by_user_id TEXT,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
        );
      `,
    },
    {
      name: "007_quotes",
      sql: `
        CREATE TABLE IF NOT EXISTS quotes (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          drawing_id TEXT NOT NULL,
          drawing_version_number INTEGER NOT NULL,
          quote_json TEXT NOT NULL,
          created_by_user_id TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (drawing_id) REFERENCES drawings(id),
          FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_quotes_drawing_created
        ON quotes(company_id, drawing_id, created_at_iso DESC);
      `,
    },
    {
      name: "008_customers",
      sql: `
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          name_normalized TEXT NOT NULL,
          primary_contact_name TEXT NOT NULL DEFAULT '',
          primary_email TEXT NOT NULL DEFAULT '',
          primary_phone TEXT NOT NULL DEFAULT '',
          site_address TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          is_archived INTEGER NOT NULL DEFAULT 0,
          created_by_user_id TEXT NOT NULL,
          updated_by_user_id TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (created_by_user_id) REFERENCES users(id),
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
          UNIQUE (company_id, name_normalized)
        );

        CREATE INDEX IF NOT EXISTS idx_customers_company_updated
        ON customers(company_id, is_archived, updated_at_iso DESC);

        ALTER TABLE drawings ADD COLUMN customer_id TEXT;
        ALTER TABLE drawing_versions ADD COLUMN customer_id TEXT;
      `,
    },
    {
      name: "009_customer_contacts",
      sql: `
        ALTER TABLE customers ADD COLUMN additional_contacts_json TEXT NOT NULL DEFAULT '[]';
      `,
    },
    {
      name: "010_drawing_status",
      sql: `
        ALTER TABLE drawings ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT';
        ALTER TABLE drawings ADD COLUMN status_changed_at_iso TEXT;
        ALTER TABLE drawings ADD COLUMN status_changed_by_user_id TEXT;
      `,
    },
    {
      name: "011_jobs",
      sql: `
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          name TEXT NOT NULL,
          stage TEXT NOT NULL DEFAULT 'DRAFT',
          primary_drawing_id TEXT,
          commercial_inputs_json TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          owner_user_id TEXT,
          is_archived INTEGER NOT NULL DEFAULT 0,
          archived_at_iso TEXT,
          archived_by_user_id TEXT,
          stage_changed_at_iso TEXT,
          stage_changed_by_user_id TEXT,
          created_by_user_id TEXT NOT NULL,
          updated_by_user_id TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (customer_id) REFERENCES customers(id),
          FOREIGN KEY (owner_user_id) REFERENCES users(id),
          FOREIGN KEY (archived_by_user_id) REFERENCES users(id),
          FOREIGN KEY (stage_changed_by_user_id) REFERENCES users(id),
          FOREIGN KEY (created_by_user_id) REFERENCES users(id),
          FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_company_customer_updated
        ON jobs(company_id, customer_id, is_archived, updated_at_iso DESC);

        CREATE TABLE IF NOT EXISTS job_tasks (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          job_id TEXT NOT NULL,
          title TEXT NOT NULL,
          is_completed INTEGER NOT NULL DEFAULT 0,
          assigned_user_id TEXT,
          due_at_iso TEXT,
          completed_at_iso TEXT,
          completed_by_user_id TEXT,
          created_by_user_id TEXT NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_iso TEXT NOT NULL,
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (job_id) REFERENCES jobs(id),
          FOREIGN KEY (assigned_user_id) REFERENCES users(id),
          FOREIGN KEY (completed_by_user_id) REFERENCES users(id),
          FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_job_tasks_job_updated
        ON job_tasks(company_id, job_id, updated_at_iso DESC);

        ALTER TABLE drawings ADD COLUMN job_id TEXT;
        ALTER TABLE drawings ADD COLUMN job_role TEXT;
        ALTER TABLE quotes ADD COLUMN job_id TEXT;
        ALTER TABLE quotes ADD COLUMN source_drawing_id TEXT;
        ALTER TABLE quotes ADD COLUMN source_drawing_version_number INTEGER;
      `,
    },
    {
      name: "012_task_enhancements",
      sql: `
        ALTER TABLE job_tasks ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE job_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL';
      `,
    },
    {
      name: "013_parent_drawing",
      sql: `
        ALTER TABLE drawings ADD COLUMN parent_drawing_id TEXT;
      `,
    },
    {
      name: "014_revision_number",
      sql: `
        ALTER TABLE drawings ADD COLUMN revision_number INTEGER NOT NULL DEFAULT 0;
      `,
    },
    {
      name: "015_task_drawings",
      sql: `
        ALTER TABLE job_tasks ADD COLUMN drawing_id TEXT;
      `,
    },
    {
      name: "016_task_revision_drawings",
      sql: `
        ALTER TABLE job_tasks ADD COLUMN revision_drawing_id TEXT;
      `,
    },
  ] as const;

  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations (name, applied_at_iso) VALUES (?, ?)",
  );

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
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return columns.some((column) => column.name === columnName);
}

function ensureLegacySchemaPatched(database: Database.Database): void {
  const defaultCommercialInputsJson = JSON.stringify(buildDefaultJobCommercialInputs());
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
  if (
    tableExists(database, "drawings") &&
    !hasColumn(database, "drawings", "archived_by_user_id")
  ) {
    database.exec("ALTER TABLE drawings ADD COLUMN archived_by_user_id TEXT");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "schema_version")) {
    database.exec("ALTER TABLE drawings ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "rules_version")) {
    database.exec(
      "ALTER TABLE drawings ADD COLUMN rules_version TEXT NOT NULL DEFAULT '2026-03-11'",
    );
  }

  if (
    tableExists(database, "drawing_versions") &&
    !hasColumn(database, "drawing_versions", "schema_version")
  ) {
    database.exec(
      "ALTER TABLE drawing_versions ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
    );
  }
  if (
    tableExists(database, "drawing_versions") &&
    !hasColumn(database, "drawing_versions", "rules_version")
  ) {
    database.exec(
      "ALTER TABLE drawing_versions ADD COLUMN rules_version TEXT NOT NULL DEFAULT '2026-03-11'",
    );
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "viewport_json")) {
    database.exec("ALTER TABLE drawings ADD COLUMN viewport_json TEXT");
  }
  if (
    tableExists(database, "drawing_versions") &&
    !hasColumn(database, "drawing_versions", "viewport_json")
  ) {
    database.exec("ALTER TABLE drawing_versions ADD COLUMN viewport_json TEXT");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "customer_name")) {
    database.exec("ALTER TABLE drawings ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "drawings")) {
    database.exec(`
      UPDATE drawings
      SET customer_name = name
      WHERE TRIM(COALESCE(customer_name, '')) = ''
    `);
  }
  if (
    tableExists(database, "drawing_versions") &&
    !hasColumn(database, "drawing_versions", "customer_name")
  ) {
    database.exec("ALTER TABLE drawing_versions ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "drawing_versions")) {
    database.exec(`
      UPDATE drawing_versions
      SET customer_name = name
      WHERE TRIM(COALESCE(customer_name, '')) = ''
    `);
  }
  if (!tableExists(database, "customers")) {
    database.exec(`
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_normalized TEXT NOT NULL,
        primary_contact_name TEXT NOT NULL DEFAULT '',
        primary_email TEXT NOT NULL DEFAULT '',
        primary_phone TEXT NOT NULL DEFAULT '',
        site_address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id),
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
        UNIQUE (company_id, name_normalized)
      )
    `);
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_company_updated
    ON customers(company_id, is_archived, updated_at_iso DESC)
  `);
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "customer_id")) {
    database.exec("ALTER TABLE drawings ADD COLUMN customer_id TEXT");
  }
  if (
    tableExists(database, "drawing_versions") &&
    !hasColumn(database, "drawing_versions", "customer_id")
  ) {
    database.exec("ALTER TABLE drawing_versions ADD COLUMN customer_id TEXT");
  }

  if (tableExists(database, "customers") && tableExists(database, "drawings")) {
    database.exec(`
      INSERT INTO customers (
        id,
        company_id,
        name,
        name_normalized,
        primary_contact_name,
        primary_email,
        primary_phone,
        site_address,
        notes,
        is_archived,
        created_by_user_id,
        updated_by_user_id,
        created_at_iso,
        updated_at_iso
      )
      SELECT
        'customer:' || d.company_id || ':' || lower(trim(d.customer_name)),
        d.company_id,
        trim(d.customer_name),
        lower(trim(d.customer_name)),
        '',
        '',
        '',
        '',
        '',
        0,
        d.created_by_user_id,
        d.updated_by_user_id,
        MIN(d.created_at_iso),
        MAX(d.updated_at_iso)
      FROM drawings d
      WHERE trim(COALESCE(d.customer_name, '')) <> ''
      GROUP BY d.company_id, lower(trim(d.customer_name))
      ON CONFLICT(company_id, name_normalized) DO NOTHING
    `);

    database.exec(`
      UPDATE drawings
      SET customer_id = 'customer:' || company_id || ':' || lower(trim(customer_name))
      WHERE TRIM(COALESCE(customer_name, '')) <> ''
        AND TRIM(COALESCE(customer_id, '')) = ''
    `);
  }
  if (tableExists(database, "customers") && tableExists(database, "drawing_versions")) {
    database.exec(`
      UPDATE drawing_versions
      SET customer_id = 'customer:' || company_id || ':' || lower(trim(customer_name))
      WHERE TRIM(COALESCE(customer_name, '')) <> ''
        AND TRIM(COALESCE(customer_id, '')) = ''
    `);
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
        customer_name,
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
        COALESCE(NULLIF(TRIM(d.customer_name), ''), d.name),
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

  if (!tableExists(database, "pricing_configs")) {
    database.exec(`
      CREATE TABLE pricing_configs (
        company_id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_by_user_id TEXT,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
      )
    `);
  }

  if (!tableExists(database, "quotes")) {
    database.exec(`
      CREATE TABLE quotes (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        drawing_id TEXT NOT NULL,
        drawing_version_number INTEGER NOT NULL,
        quote_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (drawing_id) REFERENCES drawings(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_quotes_drawing_created
      ON quotes(company_id, drawing_id, created_at_iso DESC)
    `);
  }

  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "status")) {
    database.exec("ALTER TABLE drawings ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT'");
  }
  if (
    tableExists(database, "drawings") &&
    !hasColumn(database, "drawings", "status_changed_at_iso")
  ) {
    database.exec("ALTER TABLE drawings ADD COLUMN status_changed_at_iso TEXT");
  }
  if (
    tableExists(database, "drawings") &&
    !hasColumn(database, "drawings", "status_changed_by_user_id")
  ) {
    database.exec("ALTER TABLE drawings ADD COLUMN status_changed_by_user_id TEXT");
  }

  if (!tableExists(database, "jobs")) {
    database.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        name TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT 'DRAFT',
        primary_drawing_id TEXT,
        commercial_inputs_json TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        owner_user_id TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        archived_at_iso TEXT,
        archived_by_user_id TEXT,
        stage_changed_at_iso TEXT,
        stage_changed_by_user_id TEXT,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (owner_user_id) REFERENCES users(id),
        FOREIGN KEY (archived_by_user_id) REFERENCES users(id),
        FOREIGN KEY (stage_changed_by_user_id) REFERENCES users(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id),
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
      )
    `);
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "customer_name")) {
    database.exec("ALTER TABLE jobs ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "stage")) {
    database.exec("ALTER TABLE jobs ADD COLUMN stage TEXT NOT NULL DEFAULT 'DRAFT'");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "primary_drawing_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN primary_drawing_id TEXT");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "commercial_inputs_json")) {
    database.exec(
      `ALTER TABLE jobs ADD COLUMN commercial_inputs_json TEXT NOT NULL DEFAULT '${defaultCommercialInputsJson.replace(/'/g, "''")}'`,
    );
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "notes")) {
    database.exec("ALTER TABLE jobs ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "owner_user_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN owner_user_id TEXT");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "is_archived")) {
    database.exec("ALTER TABLE jobs ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "archived_at_iso")) {
    database.exec("ALTER TABLE jobs ADD COLUMN archived_at_iso TEXT");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "archived_by_user_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN archived_by_user_id TEXT");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "stage_changed_at_iso")) {
    database.exec("ALTER TABLE jobs ADD COLUMN stage_changed_at_iso TEXT");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "stage_changed_by_user_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN stage_changed_by_user_id TEXT");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "created_by_user_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN created_by_user_id TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "updated_by_user_id")) {
    database.exec("ALTER TABLE jobs ADD COLUMN updated_by_user_id TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "created_at_iso")) {
    database.exec("ALTER TABLE jobs ADD COLUMN created_at_iso TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "jobs") && !hasColumn(database, "jobs", "updated_at_iso")) {
    database.exec("ALTER TABLE jobs ADD COLUMN updated_at_iso TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "jobs")) {
    database.exec(`
      UPDATE jobs
      SET customer_name = COALESCE(
        NULLIF(TRIM(customer_name), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(d.customer_name), ''), 'Unknown customer')
          FROM drawings d
          LEFT JOIN customers c ON c.id = jobs.customer_id AND c.company_id = jobs.company_id
          WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
          ORDER BY CASE WHEN d.job_role = 'PRIMARY' THEN 0 ELSE 1 END, COALESCE(d.updated_at_iso, d.created_at_iso) DESC
          LIMIT 1
        ),
        (
          SELECT COALESCE(NULLIF(TRIM(c.name), ''), 'Unknown customer')
          FROM customers c
          WHERE c.id = jobs.customer_id AND c.company_id = jobs.company_id
          LIMIT 1
        ),
        'Unknown customer'
      )
      WHERE TRIM(COALESCE(customer_name, '')) = ''
    `);
    database.exec(`
      UPDATE jobs
      SET stage = CASE
        WHEN stage IN ('DRAFT', 'DESIGNING', 'ESTIMATING', 'READY_TO_QUOTE', 'QUOTED', 'FOLLOW_UP', 'WON', 'LOST', 'ON_HOLD') THEN stage
        ELSE 'DRAFT'
      END
    `);
    database
      .prepare(
        "UPDATE jobs SET commercial_inputs_json = ? WHERE TRIM(COALESCE(commercial_inputs_json, '')) = ''",
      )
      .run(defaultCommercialInputsJson);
    database.exec(`
      UPDATE jobs
      SET primary_drawing_id = (
        SELECT d.id
        FROM drawings d
        WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
        ORDER BY CASE WHEN d.job_role = 'PRIMARY' THEN 0 ELSE 1 END, COALESCE(d.updated_at_iso, d.created_at_iso) DESC
        LIMIT 1
      )
      WHERE TRIM(COALESCE(primary_drawing_id, '')) = ''
    `);
    database.exec(`
      UPDATE jobs
      SET owner_user_id = (
        SELECT COALESCE(NULLIF(TRIM(d.updated_by_user_id), ''), NULLIF(TRIM(d.created_by_user_id), ''))
        FROM drawings d
        WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
        ORDER BY COALESCE(d.updated_at_iso, d.created_at_iso) DESC
        LIMIT 1
      )
      WHERE TRIM(COALESCE(owner_user_id, '')) = ''
    `);
    database.exec(`
      UPDATE jobs
      SET created_by_user_id = COALESCE(
        NULLIF(TRIM(created_by_user_id), ''),
        NULLIF(TRIM(owner_user_id), ''),
        (
          SELECT NULLIF(TRIM(d.created_by_user_id), '')
          FROM drawings d
          WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
          ORDER BY COALESCE(d.created_at_iso, d.updated_at_iso) ASC
          LIMIT 1
        ),
        (
          SELECT u.id
          FROM users u
          WHERE u.company_id = jobs.company_id
          ORDER BY u.created_at_iso ASC
          LIMIT 1
        ),
        'system:migration'
      )
      WHERE TRIM(COALESCE(created_by_user_id, '')) = ''
    `);
    database.exec(`
      UPDATE jobs
      SET updated_by_user_id = COALESCE(
        NULLIF(TRIM(updated_by_user_id), ''),
        NULLIF(TRIM(owner_user_id), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(d.updated_by_user_id), ''), NULLIF(TRIM(d.created_by_user_id), ''))
          FROM drawings d
          WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
          ORDER BY COALESCE(d.updated_at_iso, d.created_at_iso) DESC
          LIMIT 1
        ),
        (
          SELECT u.id
          FROM users u
          WHERE u.company_id = jobs.company_id
          ORDER BY u.created_at_iso ASC
          LIMIT 1
        ),
        'system:migration'
      )
      WHERE TRIM(COALESCE(updated_by_user_id, '')) = ''
    `);
    database.exec(`
      UPDATE jobs
      SET created_at_iso = COALESCE(
        NULLIF(TRIM(created_at_iso), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(d.created_at_iso), ''), NULLIF(TRIM(d.updated_at_iso), ''))
          FROM drawings d
          WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
          ORDER BY COALESCE(d.created_at_iso, d.updated_at_iso) ASC
          LIMIT 1
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      WHERE TRIM(COALESCE(created_at_iso, '')) = ''
    `);
    database.exec(`
      UPDATE jobs
      SET updated_at_iso = COALESCE(
        NULLIF(TRIM(updated_at_iso), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(d.updated_at_iso), ''), NULLIF(TRIM(d.created_at_iso), ''))
          FROM drawings d
          WHERE d.company_id = jobs.company_id AND d.job_id = jobs.id
          ORDER BY COALESCE(d.updated_at_iso, d.created_at_iso) DESC
          LIMIT 1
        ),
        NULLIF(TRIM(created_at_iso), ''),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      WHERE TRIM(COALESCE(updated_at_iso, '')) = ''
    `);
    database.exec("UPDATE jobs SET notes = '' WHERE notes IS NULL");
    database.exec("UPDATE jobs SET is_archived = 0 WHERE is_archived IS NULL");
    database.exec(
      "UPDATE jobs SET stage_changed_at_iso = NULLIF(TRIM(stage_changed_at_iso), '') WHERE stage_changed_at_iso IS NOT NULL",
    );
    database.exec(
      "UPDATE jobs SET stage_changed_by_user_id = NULLIF(TRIM(stage_changed_by_user_id), '') WHERE stage_changed_by_user_id IS NOT NULL",
    );
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_company_customer_updated
    ON jobs(company_id, customer_id, is_archived, updated_at_iso DESC)
  `);
  if (!tableExists(database, "job_tasks")) {
    database.exec(`
      CREATE TABLE job_tasks (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        drawing_id TEXT,
        title TEXT NOT NULL,
        is_completed INTEGER NOT NULL DEFAULT 0,
        assigned_user_id TEXT,
        due_at_iso TEXT,
        completed_at_iso TEXT,
        completed_by_user_id TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (drawing_id) REFERENCES drawings(id),
        FOREIGN KEY (assigned_user_id) REFERENCES users(id),
        FOREIGN KEY (completed_by_user_id) REFERENCES users(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      )
    `);
  }
  if (tableExists(database, "job_tasks") && !hasColumn(database, "job_tasks", "drawing_id")) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN drawing_id TEXT");
  }
  if (
    tableExists(database, "job_tasks") &&
    !hasColumn(database, "job_tasks", "revision_drawing_id")
  ) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN revision_drawing_id TEXT");
  }
  if (tableExists(database, "job_tasks") && !hasColumn(database, "job_tasks", "assigned_user_id")) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN assigned_user_id TEXT");
  }
  if (tableExists(database, "job_tasks") && !hasColumn(database, "job_tasks", "due_at_iso")) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN due_at_iso TEXT");
  }
  if (tableExists(database, "job_tasks") && !hasColumn(database, "job_tasks", "completed_at_iso")) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN completed_at_iso TEXT");
  }
  if (
    tableExists(database, "job_tasks") &&
    !hasColumn(database, "job_tasks", "completed_by_user_id")
  ) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN completed_by_user_id TEXT");
  }
  if (
    tableExists(database, "job_tasks") &&
    !hasColumn(database, "job_tasks", "created_by_user_id")
  ) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN created_by_user_id TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "job_tasks") && !hasColumn(database, "job_tasks", "created_at_iso")) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN created_at_iso TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "job_tasks") && !hasColumn(database, "job_tasks", "updated_at_iso")) {
    database.exec("ALTER TABLE job_tasks ADD COLUMN updated_at_iso TEXT NOT NULL DEFAULT ''");
  }
  if (tableExists(database, "job_tasks")) {
    database.exec(`
      UPDATE job_tasks
      SET drawing_id = (
        SELECT COALESCE(d.parent_drawing_id, d.id)
        FROM drawings d
        WHERE d.id = job_tasks.drawing_id AND d.company_id = job_tasks.company_id
        LIMIT 1
      )
      WHERE drawing_id IS NOT NULL
    `);
    database.exec(`
      UPDATE job_tasks
      SET drawing_id = COALESCE(
        NULLIF(TRIM(drawing_id), ''),
        (
          SELECT COALESCE(primary_drawing.parent_drawing_id, primary_drawing.id)
          FROM jobs j
          LEFT JOIN drawings primary_drawing
            ON primary_drawing.id = j.primary_drawing_id
           AND primary_drawing.company_id = j.company_id
          WHERE j.id = job_tasks.job_id AND j.company_id = job_tasks.company_id
          LIMIT 1
        ),
        (
          SELECT d.id
          FROM drawings d
          WHERE d.company_id = job_tasks.company_id
            AND d.job_id = job_tasks.job_id
            AND d.parent_drawing_id IS NULL
          ORDER BY CASE WHEN d.job_role = 'PRIMARY' THEN 0 ELSE 1 END, d.created_at_iso ASC
          LIMIT 1
        )
      )
      WHERE TRIM(COALESCE(drawing_id, '')) = ''
    `);
    database.exec(`
      UPDATE job_tasks
      SET created_by_user_id = COALESCE(
        NULLIF(TRIM(created_by_user_id), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(j.updated_by_user_id), ''), NULLIF(TRIM(j.created_by_user_id), ''))
          FROM jobs j
          WHERE j.id = job_tasks.job_id AND j.company_id = job_tasks.company_id
          LIMIT 1
        ),
        (
          SELECT u.id
          FROM users u
          WHERE u.company_id = job_tasks.company_id
          ORDER BY u.created_at_iso ASC
          LIMIT 1
        ),
        'system:migration'
      )
      WHERE TRIM(COALESCE(created_by_user_id, '')) = ''
    `);
    database.exec(`
      UPDATE job_tasks
      SET created_at_iso = COALESCE(
        NULLIF(TRIM(created_at_iso), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(j.created_at_iso), ''), NULLIF(TRIM(j.updated_at_iso), ''))
          FROM jobs j
          WHERE j.id = job_tasks.job_id AND j.company_id = job_tasks.company_id
          LIMIT 1
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      WHERE TRIM(COALESCE(created_at_iso, '')) = ''
    `);
    database.exec(`
      UPDATE job_tasks
      SET updated_at_iso = COALESCE(
        NULLIF(TRIM(updated_at_iso), ''),
        NULLIF(TRIM(completed_at_iso), ''),
        NULLIF(TRIM(created_at_iso), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(j.updated_at_iso), ''), NULLIF(TRIM(j.created_at_iso), ''))
          FROM jobs j
          WHERE j.id = job_tasks.job_id AND j.company_id = job_tasks.company_id
          LIMIT 1
        ),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      WHERE TRIM(COALESCE(updated_at_iso, '')) = ''
    `);
    database.exec(
      "UPDATE job_tasks SET due_at_iso = NULLIF(TRIM(due_at_iso), '') WHERE due_at_iso IS NOT NULL",
    );
    database.exec(
      "UPDATE job_tasks SET completed_at_iso = NULLIF(TRIM(completed_at_iso), '') WHERE completed_at_iso IS NOT NULL",
    );
    database.exec(
      "UPDATE job_tasks SET completed_by_user_id = NULLIF(TRIM(completed_by_user_id), '') WHERE completed_by_user_id IS NOT NULL",
    );
    database.exec(
      "UPDATE job_tasks SET drawing_id = NULLIF(TRIM(drawing_id), '') WHERE drawing_id IS NOT NULL",
    );
    database.exec(
      "UPDATE job_tasks SET revision_drawing_id = NULLIF(TRIM(revision_drawing_id), '') WHERE revision_drawing_id IS NOT NULL",
    );
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_job_tasks_job_updated
    ON job_tasks(company_id, job_id, updated_at_iso DESC)
  `);
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "job_id")) {
    database.exec("ALTER TABLE drawings ADD COLUMN job_id TEXT");
  }
  if (tableExists(database, "drawings") && !hasColumn(database, "drawings", "job_role")) {
    database.exec("ALTER TABLE drawings ADD COLUMN job_role TEXT");
  }
  if (tableExists(database, "quotes") && !hasColumn(database, "quotes", "job_id")) {
    database.exec("ALTER TABLE quotes ADD COLUMN job_id TEXT");
  }
  if (tableExists(database, "quotes") && !hasColumn(database, "quotes", "source_drawing_id")) {
    database.exec("ALTER TABLE quotes ADD COLUMN source_drawing_id TEXT");
  }
  if (
    tableExists(database, "quotes") &&
    !hasColumn(database, "quotes", "source_drawing_version_number")
  ) {
    database.exec("ALTER TABLE quotes ADD COLUMN source_drawing_version_number INTEGER");
  }

  if (tableExists(database, "quotes")) {
    database.exec(`
      UPDATE quotes
      SET source_drawing_id = drawing_id
      WHERE TRIM(COALESCE(source_drawing_id, '')) = ''
    `);
    database.exec(`
      UPDATE quotes
      SET source_drawing_version_number = drawing_version_number
      WHERE source_drawing_version_number IS NULL
    `);
  }
}

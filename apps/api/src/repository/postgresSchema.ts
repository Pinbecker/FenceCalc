import type { PoolClient } from "pg";

export const POSTGRES_SCHEMA_VERSION = 1;

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE companies (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at_iso TEXT NOT NULL
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
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
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at_iso TEXT NOT NULL,
        expires_at_iso TEXT NOT NULL,
        revoked_at_iso TEXT NULL
      );
      CREATE INDEX sessions_user_idx ON sessions (user_id);
      CREATE INDEX sessions_expiry_idx ON sessions (expires_at_iso) WHERE revoked_at_iso IS NULL;
      CREATE TABLE password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at_iso TEXT NOT NULL,
        expires_at_iso TEXT NOT NULL,
        consumed_at_iso TEXT NULL
      );
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_name TEXT NULL,
        contact_email TEXT NULL,
        contact_phone TEXT NULL,
        site_address TEXT NULL,
        notes TEXT NULL,
        is_archived SMALLINT NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
      CREATE INDEX customers_company_idx ON customers (company_id);
      CREATE INDEX customers_name_idx ON customers (company_id, lower(name));
      CREATE TABLE sites (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address_line_1 TEXT NULL,
        address_line_2 TEXT NULL,
        city TEXT NULL,
        county TEXT NULL,
        postcode TEXT NULL,
        country_code TEXT NOT NULL DEFAULT 'GB',
        notes TEXT NULL,
        is_archived SMALLINT NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
      CREATE INDEX sites_company_idx ON sites (company_id);
      CREATE INDEX sites_customer_idx ON sites (customer_id);
      CREATE UNIQUE INDEX sites_active_name_idx
        ON sites (company_id, customer_id, lower(name)) WHERE is_archived = 0;
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        site_id TEXT NULL REFERENCES sites(id) ON DELETE RESTRICT,
        reference TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ENQUIRY', 'SURVEY', 'ESTIMATING', 'QUOTED', 'WON', 'LOST', 'ON_HOLD')),
        scope TEXT NULL,
        target_date_iso TEXT NULL,
        notes TEXT NULL,
        is_archived SMALLINT NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        status_changed_at_iso TEXT NULL,
        status_changed_by_user_id TEXT NULL,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        UNIQUE (company_id, reference)
      );
      CREATE INDEX projects_company_idx ON projects (company_id);
      CREATE INDEX projects_customer_idx ON projects (customer_id);
      CREATE INDEX projects_site_idx ON projects (site_id);
      CREATE TABLE drawings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'WORKING' CHECK (status IN ('WORKING', 'READY', 'SUPERSEDED')),
        current_revision_id TEXT NULL,
        latest_revision_number INTEGER NOT NULL DEFAULT 0,
        is_archived SMALLINT NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
      CREATE INDEX drawings_project_idx ON drawings (project_id);
      CREATE TABLE drawing_revisions (
        id TEXT PRIMARY KEY,
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
      CREATE TABLE estimates (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        reference TEXT NOT NULL,
        name TEXT NOT NULL,
        current_version_id TEXT NULL,
        latest_version_number INTEGER NOT NULL DEFAULT 0,
        is_archived SMALLINT NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        UNIQUE (company_id, reference)
      );
      CREATE INDEX estimates_project_idx ON estimates (project_id);
      CREATE TABLE estimate_versions (
        id TEXT PRIMARY KEY,
        estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        parent_version_id TEXT NULL REFERENCES estimate_versions(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED')),
        notes TEXT NULL,
        commercial_draft_json TEXT NOT NULL DEFAULT '{"ancillaryItems":[],"manualEntries":[],"externalCornersEnabled":true}',
        calculation_json TEXT NULL,
        calculated_at_iso TEXT NULL,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        UNIQUE (estimate_id, version_number)
      );
      CREATE INDEX estimate_versions_estimate_idx ON estimate_versions (estimate_id);
      CREATE TABLE estimate_version_design_revisions (
        estimate_version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
        drawing_revision_id TEXT NOT NULL REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL,
        PRIMARY KEY (estimate_version_id, drawing_revision_id),
        UNIQUE (estimate_version_id, position)
      );
      CREATE INDEX estimate_design_revision_idx ON estimate_version_design_revisions (drawing_revision_id);
      CREATE TABLE quotes (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
        reference TEXT NOT NULL,
        name TEXT NOT NULL,
        current_version_id TEXT NULL,
        latest_version_number INTEGER NOT NULL DEFAULT 0,
        is_archived SMALLINT NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        UNIQUE (company_id, reference)
      );
      CREATE INDEX quotes_project_idx ON quotes (project_id);
      CREATE INDEX quotes_estimate_idx ON quotes (estimate_id);
      CREATE TABLE quote_versions (
        id TEXT PRIMARY KEY,
        quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        parent_version_id TEXT NULL REFERENCES quote_versions(id) ON DELETE SET NULL,
        estimate_version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')),
        title TEXT NOT NULL,
        customer_message TEXT NULL,
        valid_until_iso TEXT NULL,
        issued_at_iso TEXT NULL,
        decided_at_iso TEXT NULL,
        presentation_json TEXT NOT NULL DEFAULT '{"displayMode":"SUMMARY","currencyCode":"GBP","sections":[],"netTotal":0,"vatRate":20,"vatAmount":0,"grossTotal":0}',
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        UNIQUE (quote_id, version_number)
      );
      CREATE INDEX quote_versions_quote_idx ON quote_versions (quote_id);
      CREATE INDEX quote_versions_estimate_version_idx ON quote_versions (estimate_version_id);
      CREATE TABLE company_sequences (
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sequence_key TEXT NOT NULL,
        current_value INTEGER NOT NULL,
        PRIMARY KEY (company_id, sequence_key)
      );
      CREATE TABLE pricing_config (
        company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        items_json TEXT NOT NULL,
        workbook_json TEXT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL
      );
      CREATE TABLE company_configuration_versions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
        definition_json TEXT NOT NULL,
        compiled_workbook_json TEXT NOT NULL,
        change_note TEXT NULL,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        published_by_user_id TEXT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        published_at_iso TEXT NULL,
        UNIQUE (company_id, version_number)
      );
      CREATE INDEX company_configuration_history_idx ON company_configuration_versions (company_id, version_number DESC);
      CREATE UNIQUE INDEX company_configuration_one_draft_idx ON company_configuration_versions (company_id) WHERE status = 'DRAFT';
      CREATE UNIQUE INDEX company_configuration_one_published_idx ON company_configuration_versions (company_id) WHERE status = 'PUBLISHED';
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
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
    `,
  },
];

export async function migratePostgresDatabase(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [1_768_321_995]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at_iso TEXT NOT NULL
    )
  `);
  const versionResult = await client.query<{ version: number | null }>(
    "SELECT MAX(version)::int AS version FROM schema_migrations",
  );
  const currentVersion = versionResult.rows[0]?.version ?? 0;
  if (currentVersion > POSTGRES_SCHEMA_VERSION) {
    throw new Error(
      `PostgreSQL schema version ${currentVersion} is newer than supported version ${POSTGRES_SCHEMA_VERSION}`,
    );
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (version, applied_at_iso) VALUES ($1, $2)", [
      migration.version,
      new Date().toISOString(),
    ]);
  }
}

export async function getPostgresSchemaVersion(client: PoolClient): Promise<number> {
  const result = await client.query<{ version: number | null }>(
    "SELECT MAX(version)::int AS version FROM schema_migrations",
  );
  return result.rows[0]?.version ?? 0;
}

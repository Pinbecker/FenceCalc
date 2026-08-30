import type Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 5;

function tableExists(database: Database.Database, table: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function columnExists(database: Database.Database, table: string, column: string): boolean {
  if (!tableExists(database, table)) return false;
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((candidate) => candidate.name === column);
}

function getCurrentSchemaVersion(database: Database.Database): number {
  if (!tableExists(database, "schema_migrations")) return 0;
  if (!columnExists(database, "schema_migrations", "version")) return 0;
  const row = database
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version: number | null };
  return row.version ?? 0;
}

function isEmptyDatabase(database: Database.Database): boolean {
  const row = database
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { count: number };
  return row.count === 0;
}

function createSchemaV3(database: Database.Database): void {
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at_iso TEXT NOT NULL
    );

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

    CREATE TABLE sites (
      id TEXT PRIMARY KEY NOT NULL,
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
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );
    CREATE INDEX sites_company_idx ON sites (company_id);
    CREATE INDEX sites_customer_idx ON sites (customer_id);
    CREATE UNIQUE INDEX sites_active_name_idx
      ON sites (company_id, customer_id, name COLLATE NOCASE) WHERE is_archived = 0;

    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      site_id TEXT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ENQUIRY', 'SURVEY', 'ESTIMATING', 'QUOTED', 'WON', 'LOST', 'ON_HOLD')),
      scope TEXT NULL,
      target_date_iso TEXT NULL,
      notes TEXT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
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
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'WORKING' CHECK (status IN ('WORKING', 'READY', 'SUPERSEDED')),
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

    CREATE TABLE estimates (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version_id TEXT NULL,
      latest_version_number INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE (company_id, reference)
    );
    CREATE INDEX estimates_project_idx ON estimates (project_id);

    CREATE TABLE estimate_versions (
      id TEXT PRIMARY KEY NOT NULL,
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
    CREATE INDEX estimate_design_revision_idx
      ON estimate_version_design_revisions (drawing_revision_id);

    CREATE TABLE quotes (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version_id TEXT NULL,
      latest_version_number INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE (company_id, reference)
    );
    CREATE INDEX quotes_project_idx ON quotes (project_id);
    CREATE INDEX quotes_estimate_idx ON quotes (estimate_id);

    CREATE TABLE quote_versions (
      id TEXT PRIMARY KEY NOT NULL,
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
      company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      items_json TEXT NOT NULL,
      workbook_json TEXT NULL,
      updated_at_iso TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL
    );

    CREATE TABLE company_configuration_versions (
      id TEXT PRIMARY KEY NOT NULL,
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
    CREATE INDEX company_configuration_history_idx
      ON company_configuration_versions (company_id, version_number DESC);
    CREATE UNIQUE INDEX company_configuration_one_draft_idx
      ON company_configuration_versions (company_id) WHERE status = 'DRAFT';
    CREATE UNIQUE INDEX company_configuration_one_published_idx
      ON company_configuration_versions (company_id) WHERE status = 'PUBLISHED';

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

function migrateLegacyPricingConfig(database: Database.Database): void {
  if (!tableExists(database, "pricing_configs") || !columnExists(database, "pricing_configs", "config_json")) {
    return;
  }
  const rows = database.prepare("SELECT * FROM pricing_configs").all() as Array<{
    company_id: string;
    config_json: string;
    updated_at_iso: string;
    updated_by_user_id: string | null;
  }>;
  const companies = database.prepare("SELECT id FROM companies ORDER BY created_at_iso").all() as Array<{
    id: string;
  }>;
  const users = database.prepare("SELECT id, company_id FROM users ORDER BY created_at_iso").all() as Array<{
    id: string;
    company_id: string;
  }>;
  database.exec(`
    CREATE TABLE IF NOT EXISTS legacy_pricing_config_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_company_id TEXT NULL,
      original_updated_by_user_id TEXT NULL,
      config_json TEXT NOT NULL,
      original_updated_at_iso TEXT NOT NULL,
      migrated_to_company_id TEXT NULL,
      archived_at_iso TEXT NOT NULL
    )
  `);
  const insert = database.prepare(`
    INSERT OR IGNORE INTO pricing_config (
      company_id, items_json, workbook_json, updated_at_iso, updated_by_user_id
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const archive = database.prepare(`
    INSERT INTO legacy_pricing_config_archive (
      original_company_id, original_updated_by_user_id, config_json, original_updated_at_iso,
      migrated_to_company_id, archived_at_iso
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const canRecoverSingleTenantOrphan = rows.length === 1 && companies.length === 1;
  for (const row of rows) {
    const matchingCompany = companies.find((company) => company.id === row.company_id);
    const targetCompany = matchingCompany ?? (canRecoverSingleTenantOrphan ? companies[0] : undefined);
    const matchingUser = users.find(
      (user) => user.id === row.updated_by_user_id && user.company_id === targetCompany?.id,
    );
    const targetUser = matchingUser ?? users.find((user) => user.company_id === targetCompany?.id);
    let migratedToCompanyId: string | null = null;
    try {
      const parsed = JSON.parse(row.config_json) as { items?: unknown; workbook?: unknown };
      if (Array.isArray(parsed.items) && targetCompany && targetUser) {
        const result = insert.run(
          targetCompany.id,
          JSON.stringify(parsed.items),
          parsed.workbook === undefined ? null : JSON.stringify(parsed.workbook),
          row.updated_at_iso,
          targetUser.id,
        );
        if (result.changes > 0) migratedToCompanyId = targetCompany.id;
      }
    } catch {
      // Preserve malformed legacy rows for a deliberate manual recovery.
    }
    archive.run(
      row.company_id,
      row.updated_by_user_id,
      row.config_json,
      row.updated_at_iso,
      migratedToCompanyId,
      new Date().toISOString(),
    );
  }
  database.exec("DROP TABLE pricing_configs");
}

function migrateV2ToV3(database: Database.Database): void {
  database.exec(`
    CREATE TABLE sites (
      id TEXT PRIMARY KEY NOT NULL,
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
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );
    CREATE INDEX sites_company_idx ON sites (company_id);
    CREATE INDEX sites_customer_idx ON sites (customer_id);
    CREATE UNIQUE INDEX sites_active_name_idx
      ON sites (company_id, customer_id, name COLLATE NOCASE) WHERE is_archived = 0;

    INSERT INTO sites (
      id, company_id, customer_id, name, address_line_1, address_line_2, city, county,
      postcode, country_code, notes, is_archived, created_by_user_id, updated_by_user_id,
      created_at_iso, updated_at_iso
    )
    SELECT
      'legacy-site-' || id, company_id, id, 'Primary site', site_address, NULL, NULL, NULL,
      NULL, 'GB', NULL, 0, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
    FROM customers
    WHERE site_address IS NOT NULL AND LENGTH(TRIM(site_address)) > 0;

    CREATE TABLE projects_v3 (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      site_id TEXT NULL REFERENCES sites(id) ON DELETE RESTRICT,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ENQUIRY', 'SURVEY', 'ESTIMATING', 'QUOTED', 'WON', 'LOST', 'ON_HOLD')),
      scope TEXT NULL,
      target_date_iso TEXT NULL,
      notes TEXT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      status_changed_at_iso TEXT NULL,
      status_changed_by_user_id TEXT NULL,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE (company_id, reference)
    );

    INSERT INTO projects_v3 (
      id, company_id, customer_id, site_id, reference, name, status, scope, target_date_iso,
      notes, is_archived, status_changed_at_iso, status_changed_by_user_id,
      created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
    )
    SELECT
      p.id,
      p.company_id,
      p.customer_id,
      CASE WHEN c.site_address IS NOT NULL AND LENGTH(TRIM(c.site_address)) > 0
        THEN 'legacy-site-' || c.id ELSE NULL END,
      'P-LEGACY-' || UPPER(REPLACE(p.id, '-', '')),
      p.name,
      CASE p.status WHEN 'DRAFT' THEN 'ENQUIRY' ELSE p.status END,
      NULL,
      NULL,
      p.notes,
      p.is_archived,
      p.status_changed_at_iso,
      p.status_changed_by_user_id,
      p.created_by_user_id,
      p.updated_by_user_id,
      p.created_at_iso,
      p.updated_at_iso
    FROM projects p
    INNER JOIN customers c ON c.id = p.customer_id;

    DROP TABLE projects;
    ALTER TABLE projects_v3 RENAME TO projects;
    CREATE INDEX projects_company_idx ON projects (company_id);
    CREATE INDEX projects_customer_idx ON projects (customer_id);
    CREATE INDEX projects_site_idx ON projects (site_id);

    ALTER TABLE drawings ADD COLUMN status TEXT NOT NULL DEFAULT 'WORKING'
      CHECK (status IN ('WORKING', 'READY', 'SUPERSEDED'));

    CREATE TABLE estimates (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version_id TEXT NULL,
      latest_version_number INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE (company_id, reference)
    );
    CREATE INDEX estimates_project_idx ON estimates (project_id);

    CREATE TABLE estimate_versions (
      id TEXT PRIMARY KEY NOT NULL,
      estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      parent_version_id TEXT NULL REFERENCES estimate_versions(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED')),
      notes TEXT NULL,
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
    CREATE INDEX estimate_design_revision_idx
      ON estimate_version_design_revisions (drawing_revision_id);

    CREATE TABLE quotes (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
      reference TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version_id TEXT NULL,
      latest_version_number INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL,
      UNIQUE (company_id, reference)
    );
    CREATE INDEX quotes_project_idx ON quotes (project_id);
    CREATE INDEX quotes_estimate_idx ON quotes (estimate_id);

    CREATE TABLE quote_versions (
      id TEXT PRIMARY KEY NOT NULL,
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
  `);

  migrateLegacyPricingConfig(database);
  database
    .prepare("INSERT INTO schema_migrations (version) VALUES (?)")
    .run(3);
}

function migrateV3ToV4(database: Database.Database): void {
  database.exec(`
    ALTER TABLE estimate_versions ADD COLUMN commercial_draft_json TEXT NOT NULL
      DEFAULT '{"ancillaryItems":[],"manualEntries":[],"externalCornersEnabled":true}';
    ALTER TABLE estimate_versions ADD COLUMN calculation_json TEXT NULL;
    ALTER TABLE estimate_versions ADD COLUMN calculated_at_iso TEXT NULL;
    ALTER TABLE quote_versions ADD COLUMN presentation_json TEXT NOT NULL
      DEFAULT '{"displayMode":"SUMMARY","currencyCode":"GBP","sections":[],"netTotal":0,"vatRate":20,"vatAmount":0,"grossTotal":0}';
  `);
  if (columnExists(database, "schema_migrations", "applied_at_iso")) {
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at_iso) VALUES (?, ?)")
      .run(4, new Date().toISOString());
  } else {
    database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(4);
  }
}

function migrateV4ToV5(database: Database.Database): void {
  database.exec(`
    CREATE TABLE company_configuration_versions (
      id TEXT PRIMARY KEY NOT NULL,
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
    CREATE INDEX company_configuration_history_idx
      ON company_configuration_versions (company_id, version_number DESC);
    CREATE UNIQUE INDEX company_configuration_one_draft_idx
      ON company_configuration_versions (company_id) WHERE status = 'DRAFT';
    CREATE UNIQUE INDEX company_configuration_one_published_idx
      ON company_configuration_versions (company_id) WHERE status = 'PUBLISHED';
  `);
  if (columnExists(database, "schema_migrations", "applied_at_iso")) {
    database.prepare("INSERT INTO schema_migrations (version, applied_at_iso) VALUES (?, ?)")
      .run(5, new Date().toISOString());
  } else {
    database.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(5);
  }
}

export function migrateSqliteDatabase(database: Database.Database): void {
  const currentVersion = getCurrentSchemaVersion(database);
  if (currentVersion === CURRENT_SCHEMA_VERSION) return;
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${currentVersion} is newer than this application supports (${CURRENT_SCHEMA_VERSION})`,
    );
  }

  if (currentVersion === 0) {
    if (!isEmptyDatabase(database)) {
      throw new Error(
        "Refusing to replace an unversioned non-empty database. Back it up and run an explicit legacy import.",
      );
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      createSchemaV3(database);
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at_iso) VALUES (?, ?)")
        .run(CURRENT_SCHEMA_VERSION, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
    return;
  }

  if (currentVersion !== 2 && currentVersion !== 3 && currentVersion !== 4) {
    throw new Error(
      `No safe automatic migration is available from schema ${currentVersion}; the database was not changed`,
    );
  }

  let migratedVersion = currentVersion;
  if (migratedVersion === 2) {
    database.exec("PRAGMA foreign_keys = OFF");
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        migrateV2ToV3(database);
        database.exec("COMMIT");
      } catch (error) {
        if (database.inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.exec("PRAGMA foreign_keys = ON");
    }
    migratedVersion = 3;
  }

  if (migratedVersion === 3) {
    database.exec("BEGIN IMMEDIATE");
    try {
      migrateV3ToV4(database);
      database.exec("COMMIT");
      migratedVersion = 4;
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }

  if (migratedVersion === 4) {
    database.exec("BEGIN IMMEDIATE");
    try {
      migrateV4ToV5(database);
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }

  const violations = database.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    throw new Error(`Database migration completed with ${violations.length} foreign-key violation(s)`);
  }
}

export const SQLITE_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

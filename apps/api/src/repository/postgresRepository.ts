import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  CompanyRecord,
  CompanyConfigurationVersionRecord,
  CompanyUserRecord,
  CustomerRecord,
  ProjectRecord,
  SiteRecord,
  UserRole,
} from "@fence-estimator/contracts";
import {
  companyConfigurationDefinitionSchema,
  pricingWorkbookConfigSchema,
} from "@fence-estimator/contracts";

import { getPostgresSchemaVersion, migratePostgresDatabase } from "./postgresSchema.js";
import {
  type AuditLogRow,
  type CompanyRow,
  type CustomerRow,
  type CustomerSummaryRow,
  type DrawingRevisionRow,
  type DrawingRevisionSummaryRow,
  type DrawingRow,
  type DrawingSummaryRow,
  type EstimateRow,
  type EstimateSelectionRow,
  type EstimateSummaryRow,
  type EstimateVersionRow,
  type PasswordResetTokenRow,
  type ProjectRow,
  type ProjectSummaryRow,
  type PricingConfigRow,
  type QuoteRow,
  type QuoteSummaryRow,
  type QuoteVersionRow,
  type SiteRow,
  type SiteSummaryRow,
  type UserRow,
  toAuditLog,
  toCompany,
  toCustomer,
  toCustomerSummary,
  serializeEstimate,
  serializeLayout,
  serializeViewport,
  toDrawing,
  toDrawingRevision,
  toDrawingRevisionSummary,
  toDrawingSummary,
  toEstimate,
  toEstimateSelection,
  toEstimateSummary,
  toEstimateVersion,
  toProject,
  toProjectSummary,
  toPricingConfig,
  toQuote,
  toQuoteSummary,
  toQuoteVersion,
  toPublicUser,
  toSite,
  toSiteSummary,
} from "./shared.js";
import type {
  AppRepository,
  AuditLogQueryOptions,
  BootstrapOwnerAccountInput,
  CreateAuditLogInput,
  CreateCustomerInput,
  CreateCompanyConfigurationVersionInput,
  CreateDrawingInput,
  CreateEstimateInput,
  CreateEstimateVersionInput,
  CreatePasswordResetTokenInput,
  CreateProjectInput,
  CreateQuoteInput,
  CreateQuoteVersionInput,
  CreateSessionInput,
  CreateRevisionInput,
  CreateSiteInput,
  CreateUserInput,
  DeleteCustomerInput,
  DeleteDrawingInput,
  DeleteProjectInput,
  DeleteRevisionInput,
  DeleteSiteInput,
  PasswordResetConsumption,
  RenameDrawingInput,
  ScopeFilter,
  SessionRecord,
  SetCustomerArchivedStateInput,
  SetCompanyConfigurationVersionStatusInput,
  SetDrawingArchivedStateInput,
  SetDrawingStatusInput,
  SetEstimateArchivedStateInput,
  SetEstimateVersionCalculationInput,
  SetEstimateVersionStatusInput,
  SetProjectArchivedStateInput,
  SetProjectStatusInput,
  SetQuoteArchivedStateInput,
  SetQuoteVersionStatusInput,
  SetSiteArchivedStateInput,
  StoredUser,
  UpdateCustomerInput,
  UpdateCompanyConfigurationDraftInput,
  UpdateEstimateVersionInput,
  UpdateProjectInput,
  UpdateRevisionLayoutInput,
  UpdateRevisionNotesInput,
  UpdateQuoteVersionInput,
  UpdateSiteInput,
  UpsertPricingConfigInput,
} from "./types.js";

interface CompanyConfigurationVersionRow extends QueryResultRow {
  id: string;
  company_id: string;
  version_number: number;
  status: CompanyConfigurationVersionRecord["status"];
  definition_json: string;
  compiled_workbook_json: string;
  change_note: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  published_by_user_id: string | null;
  created_at_iso: string;
  updated_at_iso: string;
  published_at_iso: string | null;
}

function toCompanyConfigurationVersion(
  row: CompanyConfigurationVersionRow,
): CompanyConfigurationVersionRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    versionNumber: row.version_number,
    status: row.status,
    definition: companyConfigurationDefinitionSchema.parse(JSON.parse(row.definition_json)),
    compiledWorkbook: pricingWorkbookConfigSchema.parse(JSON.parse(row.compiled_workbook_json)),
    changeNote: row.change_note,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    publishedByUserId: row.published_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso,
    publishedAtIso: row.published_at_iso,
  };
}

interface PostgresRepositoryOptions {
  pool?: Pool;
  compatibilityMode?: boolean;
  poolMax?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  auditLogRetentionDays?: number;
  skipMigration?: boolean;
}

const CUSTOMER_SUMMARY_SELECT = `
  SELECT c.*,
    COALESCE(site_stats.site_count, 0)::int AS site_count,
    COALESCE(project_stats.project_count, 0)::int AS project_count,
    COALESCE(project_stats.active_project_count, 0)::int AS active_project_count,
    project_stats.last_activity_at_iso
  FROM customers c
  LEFT JOIN (SELECT customer_id, COUNT(*)::int AS site_count FROM sites GROUP BY customer_id) site_stats
    ON site_stats.customer_id = c.id
  LEFT JOIN (
    SELECT customer_id, COUNT(*)::int AS project_count,
      SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END)::int AS active_project_count,
      MAX(updated_at_iso) AS last_activity_at_iso
    FROM projects GROUP BY customer_id
  ) project_stats ON project_stats.customer_id = c.id`;

const SITE_SUMMARY_SELECT = `
  SELECT s.*,
    COALESCE(project_stats.project_count, 0)::int AS project_count,
    COALESCE(project_stats.active_project_count, 0)::int AS active_project_count,
    project_stats.last_activity_at_iso
  FROM sites s
  LEFT JOIN (
    SELECT site_id, COUNT(*)::int AS project_count,
      SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END)::int AS active_project_count,
      MAX(updated_at_iso) AS last_activity_at_iso
    FROM projects GROUP BY site_id
  ) project_stats ON project_stats.site_id = s.id`;

const PROJECT_SUMMARY_SELECT = `
  SELECT p.*, c.name AS customer_name, s.name AS site_name,
    COALESCE(drawing_stats.design_count, 0)::int AS design_count,
    COALESCE(drawing_stats.design_count, 0)::int AS drawing_count,
    COALESCE(estimate_stats.estimate_count, 0)::int AS estimate_count,
    COALESCE(quote_stats.quote_count, 0)::int AS quote_count,
    drawing_stats.last_activity_at_iso
  FROM projects p
  INNER JOIN customers c ON c.id = p.customer_id
  LEFT JOIN sites s ON s.id = p.site_id
  LEFT JOIN (
    SELECT project_id, SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END)::int AS design_count,
      MAX(updated_at_iso) AS last_activity_at_iso FROM drawings GROUP BY project_id
  ) drawing_stats ON drawing_stats.project_id = p.id
  LEFT JOIN (
    SELECT project_id, SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END)::int AS estimate_count
    FROM estimates GROUP BY project_id
  ) estimate_stats ON estimate_stats.project_id = p.id
  LEFT JOIN (
    SELECT project_id, SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END)::int AS quote_count
    FROM quotes GROUP BY project_id
  ) quote_stats ON quote_stats.project_id = p.id`;

export class PostgresAppRepository implements AppRepository {
  private readonly pool: Pool;
  private readonly transactionContext = new AsyncLocalStorage<PoolClient>();
  private readonly auditLogRetentionDays: number;
  private readonly compatibilityMode: boolean;
  private readonly readyPromise: Promise<void>;

  public constructor(databaseUrl: string, options: PostgresRepositoryOptions = {}) {
    this.pool =
      options.pool ??
      new Pool({
        connectionString: databaseUrl,
        max: options.poolMax ?? 10,
        connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
        statement_timeout: options.statementTimeoutMs ?? 30_000,
        application_name: "fence-estimator-api",
      });
    this.auditLogRetentionDays = options.auditLogRetentionDays ?? 365;
    this.compatibilityMode = options.compatibilityMode ?? false;
    this.readyPromise = this.initialize(options.skipMigration ?? false);
  }

  private async initialize(skipMigration: boolean): Promise<void> {
    const client = await this.pool.connect();
    try {
      if (skipMigration) {
        await client.query("SELECT 1 FROM schema_migrations LIMIT 1");
        return;
      }
      await client.query("BEGIN");
      await migratePostgresDatabase(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async many<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    await this.readyPromise;
    const executor = this.transactionContext.getStore() ?? this.pool;
    return (await executor.query<T>(sql, values)).rows;
  }

  private async one<T extends QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ): Promise<T | null> {
    return (await this.many<T>(sql, values))[0] ?? null;
  }

  private async execute(sql: string, values: unknown[] = []): Promise<number> {
    await this.readyPromise;
    const executor = this.transactionContext.getStore() ?? this.pool;
    return (await executor.query(sql, values)).rowCount ?? 0;
  }

  public async close(): Promise<void> {
    await this.readyPromise.catch(() => undefined);
    await this.pool.end();
  }

  public async checkHealth(): Promise<void> {
    await this.readyPromise;
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
      await getPostgresSchemaVersion(client);
    } finally {
      client.release();
    }
  }

  public async getHealthDetails(): Promise<{ provider: "postgresql"; schemaVersion: number }> {
    await this.readyPromise;
    const client = await this.pool.connect();
    try {
      return { provider: "postgresql", schemaVersion: await getPostgresSchemaVersion(client) };
    } finally {
      client.release();
    }
  }

  public async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.readyPromise;
    if (this.transactionContext.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.transactionContext.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async getUserCount(): Promise<number> {
    return (
      (await this.one<{ count: number }>("SELECT COUNT(*)::int AS count FROM users"))?.count ?? 0
    );
  }

  public async bootstrapOwnerAccount(input: BootstrapOwnerAccountInput) {
    return this.runInTransaction(async () => {
      if (!this.compatibilityMode) await this.execute("LOCK TABLE users IN EXCLUSIVE MODE");
      if ((await this.getUserCount()) > 0) return null;
      await this.execute("INSERT INTO companies (id, name, created_at_iso) VALUES ($1, $2, $3)", [
        input.companyId,
        input.companyName,
        input.createdAtIso,
      ]);
      await this.execute(
        `INSERT INTO users (id, company_id, email, display_name, role, password_hash, password_salt, created_at_iso)
         VALUES ($1, $2, $3, $4, 'ADMIN', $5, $6, $7)`,
        [
          input.userId,
          input.companyId,
          input.email,
          input.displayName,
          input.passwordHash,
          input.passwordSalt,
          input.createdAtIso,
        ],
      );
      return {
        company: { id: input.companyId, name: input.companyName, createdAtIso: input.createdAtIso },
        user: {
          id: input.userId,
          companyId: input.companyId,
          email: input.email,
          displayName: input.displayName,
          role: "ADMIN" as const,
          createdAtIso: input.createdAtIso,
        },
      };
    });
  }

  public async createUser(input: CreateUserInput): Promise<CompanyUserRecord> {
    await this.execute(
      `INSERT INTO users (id, company_id, email, display_name, role, password_hash, password_salt, created_at_iso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.companyId,
        input.email,
        input.displayName,
        input.role,
        input.passwordHash,
        input.passwordSalt,
        input.createdAtIso,
      ],
    );
    return {
      id: input.id,
      companyId: input.companyId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      createdAtIso: input.createdAtIso,
    };
  }

  public async getCompanyById(companyId: string): Promise<CompanyRecord | null> {
    const row = await this.one<CompanyRow>("SELECT * FROM companies WHERE id = $1", [companyId]);
    return row ? toCompany(row) : null;
  }

  public async getUserById(userId: string, companyId: string): Promise<CompanyUserRecord | null> {
    const row = await this.one<UserRow>("SELECT * FROM users WHERE id = $1 AND company_id = $2", [
      userId,
      companyId,
    ]);
    return row ? toPublicUser(row) : null;
  }

  public async getUserByEmail(email: string): Promise<StoredUser | null> {
    const row = await this.one<UserRow>("SELECT * FROM users WHERE lower(email) = lower($1)", [
      email,
    ]);
    return row
      ? { ...toPublicUser(row), passwordHash: row.password_hash, passwordSalt: row.password_salt }
      : null;
  }

  public async listUsers(companyId: string): Promise<CompanyUserRecord[]> {
    return (
      await this.many<UserRow>(
        "SELECT * FROM users WHERE company_id = $1 ORDER BY created_at_iso",
        [companyId],
      )
    ).map(toPublicUser);
  }

  public async updateUserPassword(
    userId: string,
    companyId: string,
    passwordHash: string,
    passwordSalt: string,
  ): Promise<void> {
    await this.execute(
      "UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3 AND company_id = $4",
      [passwordHash, passwordSalt, userId, companyId],
    );
  }

  public async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    await this.execute(
      `INSERT INTO sessions (id, company_id, user_id, token_hash, created_at_iso, expires_at_iso, revoked_at_iso)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.companyId,
        input.userId,
        input.tokenHash,
        input.createdAtIso,
        input.expiresAtIso,
        input.revokedAtIso ?? null,
      ],
    );
    return { ...input, revokedAtIso: input.revokedAtIso ?? null };
  }

  public async revokeSession(tokenHash: string, revokedAtIso: string): Promise<void> {
    await this.execute("UPDATE sessions SET revoked_at_iso = $1 WHERE token_hash = $2", [
      revokedAtIso,
      tokenHash,
    ]);
  }

  public async revokeSessionsForUser(
    userId: string,
    companyId: string,
    revokedAtIso: string,
  ): Promise<void> {
    await this.execute(
      "UPDATE sessions SET revoked_at_iso = $1 WHERE user_id = $2 AND company_id = $3 AND revoked_at_iso IS NULL",
      [revokedAtIso, userId, companyId],
    );
  }

  public async getAuthenticatedSession(tokenHash: string) {
    const row = await this.one<{
      session_id: string;
      session_company_id: string;
      session_user_id: string;
      session_token_hash: string;
      session_created_at_iso: string;
      session_expires_at_iso: string;
      session_revoked_at_iso: string | null;
      company_id: string;
      company_name: string;
      company_created_at_iso: string;
      user_id: string;
      user_company_id: string;
      user_email: string;
      user_display_name: string;
      user_role: UserRole;
      user_created_at_iso: string;
    }>(
      `SELECT s.id AS session_id, s.company_id AS session_company_id, s.user_id AS session_user_id,
        s.token_hash AS session_token_hash, s.created_at_iso AS session_created_at_iso,
        s.expires_at_iso AS session_expires_at_iso, s.revoked_at_iso AS session_revoked_at_iso,
        c.id AS company_id, c.name AS company_name, c.created_at_iso AS company_created_at_iso,
        u.id AS user_id, u.company_id AS user_company_id, u.email AS user_email,
        u.display_name AS user_display_name, u.role AS user_role, u.created_at_iso AS user_created_at_iso
      FROM sessions s JOIN companies c ON c.id = s.company_id JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
      [tokenHash],
    );
    if (!row || row.session_revoked_at_iso) return null;
    return {
      session: {
        id: row.session_id,
        companyId: row.session_company_id,
        userId: row.session_user_id,
        tokenHash: row.session_token_hash,
        createdAtIso: row.session_created_at_iso,
        expiresAtIso: row.session_expires_at_iso,
        revokedAtIso: row.session_revoked_at_iso,
      },
      company: {
        id: row.company_id,
        name: row.company_name,
        createdAtIso: row.company_created_at_iso,
      },
      user: {
        id: row.user_id,
        companyId: row.user_company_id,
        email: row.user_email,
        displayName: row.user_display_name,
        role: row.user_role,
        createdAtIso: row.user_created_at_iso,
      },
    };
  }

  private async pruneStaleRecords(nowIso: string): Promise<void> {
    const cutoff = new Date(
      new Date(nowIso).getTime() - this.auditLogRetentionDays * 86_400_000,
    ).toISOString();
    await this.execute("DELETE FROM audit_log WHERE created_at_iso < $1", [cutoff]);
    await this.execute(
      "DELETE FROM password_reset_tokens WHERE consumed_at_iso IS NOT NULL OR expires_at_iso <= $1",
      [nowIso],
    );
    await this.execute(
      "DELETE FROM sessions WHERE revoked_at_iso IS NOT NULL OR expires_at_iso <= $1",
      [nowIso],
    );
  }

  public async createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void> {
    await this.pruneStaleRecords(new Date().toISOString());
    await this.execute(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at_iso, expires_at_iso, consumed_at_iso)
      VALUES ($1, $2, $3, $4, $5, NULL)`,
      [input.id, input.userId, input.tokenHash, input.createdAtIso, input.expiresAtIso],
    );
  }

  public async consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ): Promise<PasswordResetConsumption | null> {
    await this.pruneStaleRecords(consumedAtIso);
    return this.runInTransaction(async () => {
      const token = await this.one<PasswordResetTokenRow>(
        "SELECT * FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE",
        [tokenHash],
      );
      if (!token || token.consumed_at_iso || token.expires_at_iso <= consumedAtIso) return null;
      const user = await this.one<UserRow>("SELECT * FROM users WHERE id = $1", [token.user_id]);
      if (!user) return null;
      const company = await this.one<CompanyRow>("SELECT * FROM companies WHERE id = $1", [
        user.company_id,
      ]);
      if (!company) return null;
      await this.execute("UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3", [
        passwordHash,
        passwordSalt,
        token.user_id,
      ]);
      await this.execute(
        "UPDATE password_reset_tokens SET consumed_at_iso = $1 WHERE token_hash = $2",
        [consumedAtIso, tokenHash],
      );
      return { user: toPublicUser(user), company: toCompany(company) };
    });
  }

  public async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    await this.execute(
      `INSERT INTO customers (id, company_id, name, contact_name, contact_email, contact_phone, site_address, notes,
      is_archived, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12)`,
      [
        input.id,
        input.companyId,
        input.name,
        input.contactName,
        input.contactEmail,
        input.contactPhone,
        input.siteAddress,
        input.notes,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      ],
    );
    return { ...input, isArchived: false };
  }

  public async listCustomers(companyId: string, scope: ScopeFilter = "ACTIVE", search = "") {
    const where = ["c.company_id = $1"];
    const values: unknown[] = [companyId];
    if (scope === "ACTIVE") where.push("c.is_archived = 0");
    if (scope === "ARCHIVED") where.push("c.is_archived = 1");
    if (search.trim()) {
      values.push(`%${search.trim().toLowerCase()}%`);
      where.push(`lower(c.name) LIKE $${values.length}`);
    }
    return (
      await this.many<CustomerSummaryRow>(
        `${CUSTOMER_SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY lower(c.name)`,
        values,
      )
    ).map(toCustomerSummary);
  }

  public async getCustomerById(
    customerId: string,
    companyId: string,
  ): Promise<CustomerRecord | null> {
    const row = await this.one<CustomerRow>(
      "SELECT * FROM customers WHERE id = $1 AND company_id = $2",
      [customerId, companyId],
    );
    return row ? toCustomer(row) : null;
  }

  public async updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord | null> {
    const existing = await this.getCustomerById(input.customerId, input.companyId);
    if (!existing) return null;
    const next = {
      ...existing,
      name: input.name ?? existing.name,
      contactName: input.contactName !== undefined ? input.contactName : existing.contactName,
      contactEmail: input.contactEmail !== undefined ? input.contactEmail : existing.contactEmail,
      contactPhone: input.contactPhone !== undefined ? input.contactPhone : existing.contactPhone,
      siteAddress: input.siteAddress !== undefined ? input.siteAddress : existing.siteAddress,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    await this.execute(
      `UPDATE customers SET name=$1, contact_name=$2, contact_email=$3, contact_phone=$4, site_address=$5, notes=$6,
      updated_by_user_id=$7, updated_at_iso=$8 WHERE id=$9 AND company_id=$10`,
      [
        next.name,
        next.contactName,
        next.contactEmail,
        next.contactPhone,
        next.siteAddress,
        next.notes,
        next.updatedByUserId,
        next.updatedAtIso,
        input.customerId,
        input.companyId,
      ],
    );
    return next;
  }

  public async setCustomerArchivedState(
    input: SetCustomerArchivedStateInput,
  ): Promise<CustomerRecord | null> {
    const existing = await this.getCustomerById(input.customerId, input.companyId);
    if (!existing) return null;
    await this.execute(
      "UPDATE customers SET is_archived=$1, updated_by_user_id=$2, updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.customerId,
        input.companyId,
      ],
    );
    return {
      ...existing,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }

  public async deleteCustomer(input: DeleteCustomerInput): Promise<boolean> {
    return (
      (await this.execute("DELETE FROM customers WHERE id=$1 AND company_id=$2 AND is_archived=1", [
        input.customerId,
        input.companyId,
      ])) > 0
    );
  }

  public async createSite(input: CreateSiteInput): Promise<SiteRecord> {
    await this.execute(
      `INSERT INTO sites (id,company_id,customer_id,name,address_line_1,address_line_2,city,county,postcode,country_code,notes,is_archived,
      created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15)`,
      [
        input.id,
        input.companyId,
        input.customerId,
        input.name,
        input.addressLine1,
        input.addressLine2,
        input.city,
        input.county,
        input.postcode,
        input.countryCode,
        input.notes,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      ],
    );
    return (await this.getSiteById(input.id, input.companyId))!;
  }

  public async listSites(
    companyId: string,
    options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
  ) {
    const { scope = "ACTIVE", customerId, search } = options;
    const where = ["s.company_id = $1"];
    const values: unknown[] = [companyId];
    if (scope === "ACTIVE") where.push("s.is_archived=0");
    if (scope === "ARCHIVED") where.push("s.is_archived=1");
    if (customerId) {
      values.push(customerId);
      where.push(`s.customer_id=$${values.length}`);
    }
    if (search?.trim()) {
      const pattern = `%${search.trim().toLowerCase()}%`;
      const indexes = [1, 2, 3, 4].map(() => {
        values.push(pattern);
        return `$${values.length}`;
      });
      where.push(
        `(lower(s.name) LIKE ${indexes[0]} OR lower(coalesce(s.address_line_1,'')) LIKE ${indexes[1]} OR lower(coalesce(s.city,'')) LIKE ${indexes[2]} OR lower(coalesce(s.postcode,'')) LIKE ${indexes[3]})`,
      );
    }
    return (
      await this.many<SiteSummaryRow>(
        `${SITE_SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY lower(s.name)`,
        values,
      )
    ).map(toSiteSummary);
  }

  public async getSiteById(siteId: string, companyId: string): Promise<SiteRecord | null> {
    const row = await this.one<SiteRow>("SELECT * FROM sites WHERE id=$1 AND company_id=$2", [
      siteId,
      companyId,
    ]);
    return row ? toSite(row) : null;
  }
  public async updateSite(input: UpdateSiteInput): Promise<SiteRecord | null> {
    const e = await this.getSiteById(input.siteId, input.companyId);
    if (!e) return null;
    const n = {
      ...e,
      name: input.name ?? e.name,
      addressLine1: input.addressLine1 !== undefined ? input.addressLine1 : e.addressLine1,
      addressLine2: input.addressLine2 !== undefined ? input.addressLine2 : e.addressLine2,
      city: input.city !== undefined ? input.city : e.city,
      county: input.county !== undefined ? input.county : e.county,
      postcode: input.postcode !== undefined ? input.postcode : e.postcode,
      countryCode: input.countryCode ?? e.countryCode,
      notes: input.notes !== undefined ? input.notes : e.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    await this.execute(
      `UPDATE sites SET name=$1,address_line_1=$2,address_line_2=$3,city=$4,county=$5,postcode=$6,country_code=$7,notes=$8,updated_by_user_id=$9,updated_at_iso=$10 WHERE id=$11 AND company_id=$12`,
      [
        n.name,
        n.addressLine1,
        n.addressLine2,
        n.city,
        n.county,
        n.postcode,
        n.countryCode,
        n.notes,
        n.updatedByUserId,
        n.updatedAtIso,
        input.siteId,
        input.companyId,
      ],
    );
    return n;
  }
  public async setSiteArchivedState(input: SetSiteArchivedStateInput): Promise<SiteRecord | null> {
    const e = await this.getSiteById(input.siteId, input.companyId);
    if (!e) return null;
    if (input.archived) {
      const row = await this.one<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM projects WHERE site_id=$1 AND is_archived=0",
        [input.siteId],
      );
      if ((row?.count ?? 0) > 0) return null;
    }
    await this.execute(
      "UPDATE sites SET is_archived=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.siteId,
        input.companyId,
      ],
    );
    return {
      ...e,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async deleteSite(input: DeleteSiteInput): Promise<boolean> {
    return (
      (await this.execute(
        `DELETE FROM sites WHERE id=$1 AND company_id=$2 AND is_archived=1 AND NOT EXISTS (SELECT 1 FROM projects WHERE site_id=sites.id)`,
        [input.siteId, input.companyId],
      )) > 0
    );
  }

  public async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    await this.execute(
      `INSERT INTO projects (id,company_id,customer_id,site_id,reference,name,status,scope,target_date_iso,notes,is_archived,status_changed_at_iso,status_changed_by_user_id,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$15,$16)`,
      [
        input.id,
        input.companyId,
        input.customerId,
        input.siteId,
        input.reference,
        input.name,
        input.status,
        input.scope,
        input.targetDateIso,
        input.notes,
        input.createdAtIso,
        input.createdByUserId,
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      ],
    );
    return {
      id: input.id,
      companyId: input.companyId,
      customerId: input.customerId,
      siteId: input.siteId,
      reference: input.reference,
      name: input.name,
      status: input.status,
      scope: input.scope,
      targetDateIso: input.targetDateIso,
      notes: input.notes,
      isArchived: false,
      statusChangedAtIso: input.createdAtIso,
      statusChangedByUserId: input.createdByUserId,
      createdByUserId: input.createdByUserId,
      updatedByUserId: input.updatedByUserId,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async listProjects(
    companyId: string,
    options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
  ) {
    const { scope = "ACTIVE", customerId, search } = options;
    const where = ["p.company_id=$1"];
    const values: unknown[] = [companyId];
    if (scope === "ACTIVE") where.push("p.is_archived=0");
    if (scope === "ARCHIVED") where.push("p.is_archived=1");
    if (customerId) {
      values.push(customerId);
      where.push(`p.customer_id=$${values.length}`);
    }
    if (search?.trim()) {
      const pattern = `%${search.trim().toLowerCase()}%`;
      values.push(pattern, pattern);
      where.push(
        `(lower(p.name) LIKE $${values.length - 1} OR lower(c.name) LIKE $${values.length})`,
      );
    }
    return (
      await this.many<ProjectSummaryRow>(
        `${PROJECT_SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.updated_at_iso DESC`,
        values,
      )
    ).map(toProjectSummary);
  }
  public async getProjectById(projectId: string, companyId: string): Promise<ProjectRecord | null> {
    const row = await this.one<ProjectRow>("SELECT * FROM projects WHERE id=$1 AND company_id=$2", [
      projectId,
      companyId,
    ]);
    return row ? toProject(row) : null;
  }
  public async updateProject(input: UpdateProjectInput): Promise<ProjectRecord | null> {
    const e = await this.getProjectById(input.projectId, input.companyId);
    if (!e) return null;
    const n = {
      ...e,
      name: input.name ?? e.name,
      siteId: input.siteId ?? e.siteId,
      scope: input.scope !== undefined ? input.scope : e.scope,
      targetDateIso: input.targetDateIso !== undefined ? input.targetDateIso : e.targetDateIso,
      notes: input.notes !== undefined ? input.notes : e.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
    await this.execute(
      "UPDATE projects SET name=$1,site_id=$2,scope=$3,target_date_iso=$4,notes=$5,updated_by_user_id=$6,updated_at_iso=$7 WHERE id=$8 AND company_id=$9",
      [
        n.name,
        n.siteId,
        n.scope,
        n.targetDateIso,
        n.notes,
        n.updatedByUserId,
        n.updatedAtIso,
        input.projectId,
        input.companyId,
      ],
    );
    return n;
  }
  public async setProjectStatus(input: SetProjectStatusInput): Promise<ProjectRecord | null> {
    const e = await this.getProjectById(input.projectId, input.companyId);
    if (!e) return null;
    await this.execute(
      "UPDATE projects SET status=$1,status_changed_at_iso=$2,status_changed_by_user_id=$3,updated_by_user_id=$4,updated_at_iso=$5 WHERE id=$6 AND company_id=$7",
      [
        input.status,
        input.statusChangedAtIso,
        input.statusChangedByUserId,
        input.updatedByUserId,
        input.updatedAtIso,
        input.projectId,
        input.companyId,
      ],
    );
    return {
      ...e,
      status: input.status,
      statusChangedAtIso: input.statusChangedAtIso,
      statusChangedByUserId: input.statusChangedByUserId,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async setProjectArchivedState(
    input: SetProjectArchivedStateInput,
  ): Promise<ProjectRecord | null> {
    const e = await this.getProjectById(input.projectId, input.companyId);
    if (!e) return null;
    await this.execute(
      "UPDATE projects SET is_archived=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.projectId,
        input.companyId,
      ],
    );
    return {
      ...e,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async deleteProject(input: DeleteProjectInput): Promise<boolean> {
    return (
      (await this.execute("DELETE FROM projects WHERE id=$1 AND company_id=$2 AND is_archived=1", [
        input.projectId,
        input.companyId,
      ])) > 0
    );
  }

  public async addAuditLog(input: CreateAuditLogInput) {
    await this.pruneStaleRecords(input.createdAtIso);
    await this.execute(
      `INSERT INTO audit_log (id,company_id,actor_user_id,entity_type,entity_id,action,summary,metadata_json,created_at_iso) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.id,
        input.companyId,
        input.actorUserId,
        input.entityType,
        input.entityId,
        input.action,
        input.summary,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdAtIso,
      ],
    );
    return { ...input };
  }
  public async listAuditLog(companyId: string, options: number | AuditLogQueryOptions = {}) {
    await this.pruneStaleRecords(new Date().toISOString());
    const o = typeof options === "number" ? { limit: options } : options;
    const where = ["company_id=$1"];
    const values: unknown[] = [companyId];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      where.push(condition.replace("?", `$${values.length}`));
    };
    if (o.beforeCreatedAtIso) add("created_at_iso < ?", o.beforeCreatedAtIso);
    if (o.fromCreatedAtIso) add("created_at_iso >= ?", o.fromCreatedAtIso);
    if (o.toCreatedAtIso) add("created_at_iso <= ?", o.toCreatedAtIso);
    if (o.entityType) add("entity_type = ?", o.entityType);
    if (o.search?.trim()) {
      const p = `%${o.search.trim().toLowerCase()}%`;
      values.push(p, p, p);
      where.push(
        `(lower(summary) LIKE $${values.length - 2} OR lower(action) LIKE $${values.length - 1} OR lower(entity_type) LIKE $${values.length})`,
      );
    }
    values.push(o.limit ?? 100);
    return (
      await this.many<AuditLogRow>(
        `SELECT * FROM audit_log WHERE ${where.join(" AND ")} ORDER BY created_at_iso DESC LIMIT $${values.length}`,
        values,
      )
    ).map(toAuditLog);
  }

  public async createDrawing(input: CreateDrawingInput) {
    return this.runInTransaction(async () => {
      await this.execute(
        `INSERT INTO drawings (id,company_id,project_id,name,current_revision_id,latest_revision_number,is_archived,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,1,0,$6,$7,$8,$9)`,
        [
          input.drawingId,
          input.companyId,
          input.projectId,
          input.name,
          input.initialRevisionId,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.execute(
        `INSERT INTO drawing_revisions (id,drawing_id,company_id,revision_number,parent_revision_id,notes,layout_json,saved_viewport_json,estimate_json,schema_version,rules_version,version_number,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,1,NULL,NULL,$4,$5,$6,$7,$8,0,$9,$10,$11,$12)`,
        [
          input.initialRevisionId,
          input.drawingId,
          input.companyId,
          serializeLayout(input.initialLayout),
          serializeViewport(input.initialViewport),
          serializeEstimate(input.initialEstimate),
          input.schemaVersion,
          input.rulesVersion,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      return {
        id: input.drawingId,
        companyId: input.companyId,
        projectId: input.projectId,
        name: input.name,
        status: "WORKING" as const,
        currentRevisionId: input.initialRevisionId,
        latestRevisionNumber: 1,
        isArchived: false,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.updatedByUserId,
        createdAtIso: input.createdAtIso,
        updatedAtIso: input.updatedAtIso,
      };
    });
  }
  public async listDrawingsForProject(projectId: string, companyId: string) {
    const rows = await this.many<DrawingSummaryRow>(
      `SELECT d.*,r.layout_json,u_created.display_name AS created_by_display_name,u_updated.display_name AS updated_by_display_name FROM drawings d LEFT JOIN drawing_revisions r ON r.id=d.current_revision_id LEFT JOIN users u_created ON u_created.id=d.created_by_user_id LEFT JOIN users u_updated ON u_updated.id=d.updated_by_user_id WHERE d.project_id=$1 AND d.company_id=$2 ORDER BY d.updated_at_iso DESC`,
      [projectId, companyId],
    );
    return rows.map(toDrawingSummary);
  }
  public async getDrawingById(drawingId: string, companyId: string) {
    const row = await this.one<DrawingRow>("SELECT * FROM drawings WHERE id=$1 AND company_id=$2", [
      drawingId,
      companyId,
    ]);
    return row ? toDrawing(row) : null;
  }
  public async renameDrawing(input: RenameDrawingInput) {
    const e = await this.getDrawingById(input.drawingId, input.companyId);
    if (!e) return null;
    await this.execute(
      "UPDATE drawings SET name=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [input.name, input.updatedByUserId, input.updatedAtIso, input.drawingId, input.companyId],
    );
    return {
      ...e,
      name: input.name,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async setDrawingStatus(input: SetDrawingStatusInput) {
    const e = await this.getDrawingById(input.drawingId, input.companyId);
    if (!e) return null;
    await this.execute(
      "UPDATE drawings SET status=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [input.status, input.updatedByUserId, input.updatedAtIso, input.drawingId, input.companyId],
    );
    return {
      ...e,
      status: input.status,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async setDrawingArchivedState(input: SetDrawingArchivedStateInput) {
    const e = await this.getDrawingById(input.drawingId, input.companyId);
    if (!e) return null;
    await this.execute(
      "UPDATE drawings SET is_archived=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.drawingId,
        input.companyId,
      ],
    );
    return {
      ...e,
      isArchived: input.archived,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async deleteDrawing(input: DeleteDrawingInput) {
    return (
      (await this.execute("DELETE FROM drawings WHERE id=$1 AND company_id=$2 AND is_archived=1", [
        input.drawingId,
        input.companyId,
      ])) > 0
    );
  }
  public async createRevision(input: CreateRevisionInput) {
    return this.runInTransaction(async () => {
      await this.execute(
        `INSERT INTO drawing_revisions (id,drawing_id,company_id,revision_number,parent_revision_id,notes,layout_json,saved_viewport_json,estimate_json,schema_version,rules_version,version_number,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15)`,
        [
          input.revisionId,
          input.drawingId,
          input.companyId,
          input.revisionNumber,
          input.parentRevisionId,
          input.notes,
          serializeLayout(input.layout),
          serializeViewport(input.savedViewport),
          serializeEstimate(input.estimate),
          input.schemaVersion,
          input.rulesVersion,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.execute(
        "UPDATE drawings SET current_revision_id=$1,latest_revision_number=$2,updated_by_user_id=$3,updated_at_iso=$4 WHERE id=$5 AND company_id=$6",
        [
          input.revisionId,
          input.revisionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.drawingId,
          input.companyId,
        ],
      );
      return {
        id: input.revisionId,
        drawingId: input.drawingId,
        companyId: input.companyId,
        revisionNumber: input.revisionNumber,
        parentRevisionId: input.parentRevisionId,
        notes: input.notes,
        layout: input.layout,
        savedViewport: input.savedViewport,
        estimate: input.estimate,
        schemaVersion: input.schemaVersion,
        rulesVersion: input.rulesVersion,
        versionNumber: 0,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.updatedByUserId,
        createdAtIso: input.createdAtIso,
        updatedAtIso: input.updatedAtIso,
      };
    });
  }
  public async listRevisionsForDrawing(drawingId: string, companyId: string) {
    const rows = await this.many<DrawingRevisionSummaryRow>(
      `SELECT r.*,u_created.display_name AS created_by_display_name,u_updated.display_name AS updated_by_display_name FROM drawing_revisions r LEFT JOIN users u_created ON u_created.id=r.created_by_user_id LEFT JOIN users u_updated ON u_updated.id=r.updated_by_user_id WHERE r.drawing_id=$1 AND r.company_id=$2 ORDER BY r.revision_number DESC`,
      [drawingId, companyId],
    );
    return rows.map(toDrawingRevisionSummary);
  }
  public async getRevisionById(revisionId: string, companyId: string) {
    const row = await this.one<DrawingRevisionRow>(
      "SELECT * FROM drawing_revisions WHERE id=$1 AND company_id=$2",
      [revisionId, companyId],
    );
    return row ? toDrawingRevision(row) : null;
  }
  public async updateRevisionLayout(input: UpdateRevisionLayoutInput) {
    return this.runInTransaction(async () => {
      const e = await this.getRevisionById(input.revisionId, input.companyId);
      if (!e) return null;
      if (e.versionNumber !== input.expectedVersionNumber) {
        const error = new Error("Drawing revision has been modified by another user") as Error & {
          code?: string;
        };
        error.code = "VERSION_CONFLICT";
        throw error;
      }
      const nextVersion = e.versionNumber + 1;
      const changed = await this.execute(
        `UPDATE drawing_revisions SET layout_json=$1,saved_viewport_json=$2,estimate_json=$3,schema_version=$4,rules_version=$5,version_number=$6,updated_by_user_id=$7,updated_at_iso=$8 WHERE id=$9 AND company_id=$10 AND version_number=$11`,
        [
          serializeLayout(input.layout),
          serializeViewport(input.savedViewport),
          serializeEstimate(input.estimate),
          input.schemaVersion,
          input.rulesVersion,
          nextVersion,
          input.updatedByUserId,
          input.updatedAtIso,
          input.revisionId,
          input.companyId,
          input.expectedVersionNumber,
        ],
      );
      if (changed !== 1) {
        const error = new Error("Drawing revision has been modified by another user") as Error & {
          code?: string;
        };
        error.code = "VERSION_CONFLICT";
        throw error;
      }
      await this.execute(
        "UPDATE drawings SET updated_by_user_id=$1,updated_at_iso=$2 WHERE id=$3 AND company_id=$4",
        [input.updatedByUserId, input.updatedAtIso, e.drawingId, input.companyId],
      );
      return {
        ...e,
        layout: input.layout,
        savedViewport: input.savedViewport,
        estimate: input.estimate,
        schemaVersion: input.schemaVersion,
        rulesVersion: input.rulesVersion,
        versionNumber: nextVersion,
        updatedByUserId: input.updatedByUserId,
        updatedAtIso: input.updatedAtIso,
      };
    });
  }
  public async updateRevisionNotes(input: UpdateRevisionNotesInput) {
    const e = await this.getRevisionById(input.revisionId, input.companyId);
    if (!e) return null;
    await this.execute(
      "UPDATE drawing_revisions SET notes=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [input.notes, input.updatedByUserId, input.updatedAtIso, input.revisionId, input.companyId],
    );
    return {
      ...e,
      notes: input.notes,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso,
    };
  }
  public async deleteRevision(input: DeleteRevisionInput) {
    return this.runInTransaction(async () => {
      const e = await this.getRevisionById(input.revisionId, input.companyId);
      if (!e || e.revisionNumber === 1) return false;
      const d = await this.one<DrawingRow>(
        "SELECT * FROM drawings WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [e.drawingId, input.companyId],
      );
      if (!d || e.id !== d.current_revision_id) return false;
      const fallback = await this.one<{ id: string; revision_number: number }>(
        "SELECT id,revision_number FROM drawing_revisions WHERE drawing_id=$1 AND company_id=$2 AND id<>$3 ORDER BY revision_number DESC LIMIT 1",
        [e.drawingId, input.companyId, e.id],
      );
      if (!fallback) return false;
      try {
        await this.execute("DELETE FROM drawing_revisions WHERE id=$1 AND company_id=$2", [
          e.id,
          input.companyId,
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === "23503") return false;
        throw error;
      }
      await this.execute(
        "UPDATE drawings SET current_revision_id=$1,latest_revision_number=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
        [
          fallback.id,
          fallback.revision_number,
          new Date().toISOString(),
          e.drawingId,
          input.companyId,
        ],
      );
      return true;
    });
  }

  public async nextCompanySequence(companyId: string, sequenceKey: string) {
    const row = await this.one<{ current_value: number }>(
      `INSERT INTO company_sequences (company_id,sequence_key,current_value) VALUES ($1,$2,1) ON CONFLICT(company_id,sequence_key) DO UPDATE SET current_value=company_sequences.current_value+1 RETURNING current_value`,
      [companyId, sequenceKey],
    );
    return row!.current_value;
  }
  private async replaceEstimateSelections(versionId: string, revisionIds: string[]) {
    await this.execute(
      "DELETE FROM estimate_version_design_revisions WHERE estimate_version_id=$1",
      [versionId],
    );
    for (let position = 0; position < revisionIds.length; position += 1) {
      await this.execute(
        "INSERT INTO estimate_version_design_revisions (estimate_version_id,drawing_revision_id,position) VALUES ($1,$2,$3)",
        [versionId, revisionIds[position], position],
      );
    }
  }
  private async getEstimateSelections(versionId: string) {
    const rows = await this.many<EstimateSelectionRow>(
      `SELECT d.id AS drawing_id,d.name AS drawing_name,r.id AS drawing_revision_id,r.revision_number,link.position FROM estimate_version_design_revisions link JOIN drawing_revisions r ON r.id=link.drawing_revision_id JOIN drawings d ON d.id=r.drawing_id WHERE link.estimate_version_id=$1 ORDER BY link.position`,
      [versionId],
    );
    return rows.map(toEstimateSelection);
  }
  public async createEstimate(input: CreateEstimateInput) {
    return this.runInTransaction(async () => {
      await this.execute(
        `INSERT INTO estimates (id,company_id,project_id,reference,name,current_version_id,latest_version_number,is_archived,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,$6,1,0,$7,$8,$9,$10)`,
        [
          input.estimateId,
          input.companyId,
          input.projectId,
          input.reference,
          input.name,
          input.versionId,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.execute(
        `INSERT INTO estimate_versions (id,estimate_id,company_id,version_number,parent_version_id,status,notes,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,1,NULL,'DRAFT',$4,$5,$6,$7,$8)`,
        [
          input.versionId,
          input.estimateId,
          input.companyId,
          input.notes,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.replaceEstimateSelections(input.versionId, input.designRevisionIds);
      return (await this.getEstimateById(input.estimateId, input.companyId))!;
    });
  }
  public async listEstimatesForProject(projectId: string, companyId: string) {
    const rows = await this.many<EstimateSummaryRow>(
      `SELECT e.*,v.status AS current_status,(SELECT COUNT(*)::int FROM estimate_version_design_revisions l WHERE l.estimate_version_id=e.current_version_id) AS selected_design_count FROM estimates e JOIN estimate_versions v ON v.id=e.current_version_id WHERE e.project_id=$1 AND e.company_id=$2 ORDER BY e.updated_at_iso DESC`,
      [projectId, companyId],
    );
    return rows.map(toEstimateSummary);
  }
  public async getEstimateById(estimateId: string, companyId: string) {
    const row = await this.one<EstimateRow>(
      "SELECT * FROM estimates WHERE id=$1 AND company_id=$2",
      [estimateId, companyId],
    );
    return row ? toEstimate(row) : null;
  }
  public async listEstimateVersions(estimateId: string, companyId: string) {
    const rows = await this.many<EstimateVersionRow>(
      "SELECT * FROM estimate_versions WHERE estimate_id=$1 AND company_id=$2 ORDER BY version_number DESC",
      [estimateId, companyId],
    );
    return Promise.all(
      rows.map(async (row) => toEstimateVersion(row, await this.getEstimateSelections(row.id))),
    );
  }
  public async getEstimateVersionById(versionId: string, companyId: string) {
    const row = await this.one<EstimateVersionRow>(
      "SELECT * FROM estimate_versions WHERE id=$1 AND company_id=$2",
      [versionId, companyId],
    );
    return row ? toEstimateVersion(row, await this.getEstimateSelections(row.id)) : null;
  }
  public async updateEstimateVersion(input: UpdateEstimateVersionInput) {
    return this.runInTransaction(async () => {
      const e = await this.getEstimateVersionById(input.estimateVersionId, input.companyId);
      if (!e || e.status !== "DRAFT") return null;
      await this.execute(
        "UPDATE estimate_versions SET notes=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
        [
          input.notes !== undefined ? input.notes : e.notes,
          input.updatedByUserId,
          input.updatedAtIso,
          input.estimateVersionId,
          input.companyId,
        ],
      );
      if (input.designRevisionIds) {
        await this.replaceEstimateSelections(input.estimateVersionId, input.designRevisionIds);
        await this.execute(
          "UPDATE estimate_versions SET calculation_json=NULL,calculated_at_iso=NULL WHERE id=$1",
          [input.estimateVersionId],
        );
      }
      await this.execute(
        "UPDATE estimates SET updated_by_user_id=$1,updated_at_iso=$2 WHERE id=$3 AND company_id=$4 AND current_version_id=$5",
        [
          input.updatedByUserId,
          input.updatedAtIso,
          e.estimateId,
          input.companyId,
          input.estimateVersionId,
        ],
      );
      return this.getEstimateVersionById(input.estimateVersionId, input.companyId);
    });
  }
  public async setEstimateVersionCalculation(input: SetEstimateVersionCalculationInput) {
    const changed = await this.execute(
      `UPDATE estimate_versions SET commercial_draft_json=$1,calculation_json=$2,calculated_at_iso=$3,updated_by_user_id=$4,updated_at_iso=$5 WHERE id=$6 AND company_id=$7 AND status='DRAFT'`,
      [
        JSON.stringify(input.commercialDraft),
        JSON.stringify(input.calculation),
        input.calculatedAtIso,
        input.updatedByUserId,
        input.updatedAtIso,
        input.estimateVersionId,
        input.companyId,
      ],
    );
    return changed ? this.getEstimateVersionById(input.estimateVersionId, input.companyId) : null;
  }
  public async setEstimateVersionStatus(input: SetEstimateVersionStatusInput) {
    const changed = await this.execute(
      "UPDATE estimate_versions SET status=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.status,
        input.updatedByUserId,
        input.updatedAtIso,
        input.estimateVersionId,
        input.companyId,
      ],
    );
    return changed ? this.getEstimateVersionById(input.estimateVersionId, input.companyId) : null;
  }
  public async createEstimateVersion(input: CreateEstimateVersionInput) {
    return this.runInTransaction(async () => {
      await this.execute(
        "UPDATE estimate_versions SET status='SUPERSEDED',updated_by_user_id=$1,updated_at_iso=$2 WHERE id=$3 AND company_id=$4",
        [input.updatedByUserId, input.updatedAtIso, input.parentVersionId, input.companyId],
      );
      await this.execute(
        `INSERT INTO estimate_versions (id,estimate_id,company_id,version_number,parent_version_id,status,notes,commercial_draft_json,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10,$11)`,
        [
          input.versionId,
          input.estimateId,
          input.companyId,
          input.versionNumber,
          input.parentVersionId,
          input.notes,
          JSON.stringify(input.commercialDraft),
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.replaceEstimateSelections(input.versionId, input.designRevisionIds);
      await this.execute(
        "UPDATE estimates SET current_version_id=$1,latest_version_number=$2,updated_by_user_id=$3,updated_at_iso=$4 WHERE id=$5 AND company_id=$6",
        [
          input.versionId,
          input.versionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.estimateId,
          input.companyId,
        ],
      );
      return (await this.getEstimateVersionById(input.versionId, input.companyId))!;
    });
  }
  public async setEstimateArchivedState(input: SetEstimateArchivedStateInput) {
    const changed = await this.execute(
      "UPDATE estimates SET is_archived=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.estimateId,
        input.companyId,
      ],
    );
    return changed ? this.getEstimateById(input.estimateId, input.companyId) : null;
  }

  public async createQuote(input: CreateQuoteInput) {
    return this.runInTransaction(async () => {
      await this.execute(
        `INSERT INTO quotes (id,company_id,project_id,estimate_id,reference,name,current_version_id,latest_version_number,is_archived,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,$6,$7,1,0,$8,$9,$10,$11)`,
        [
          input.quoteId,
          input.companyId,
          input.projectId,
          input.estimateId,
          input.reference,
          input.name,
          input.versionId,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.execute(
        `INSERT INTO quote_versions (id,quote_id,company_id,version_number,parent_version_id,estimate_version_id,status,title,customer_message,valid_until_iso,issued_at_iso,decided_at_iso,presentation_json,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,1,NULL,$4,'DRAFT',$5,$6,$7,NULL,NULL,$8,$9,$10,$11,$12)`,
        [
          input.versionId,
          input.quoteId,
          input.companyId,
          input.estimateVersionId,
          input.title,
          input.customerMessage,
          input.validUntilIso,
          JSON.stringify(input.presentation),
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      return (await this.getQuoteById(input.quoteId, input.companyId))!;
    });
  }
  public async listQuotesForProject(projectId: string, companyId: string) {
    const rows = await this.many<QuoteSummaryRow>(
      `SELECT q.*,qv.status AS current_status,e.reference AS estimate_reference,ev.version_number AS estimate_version_number,qv.valid_until_iso FROM quotes q JOIN quote_versions qv ON qv.id=q.current_version_id JOIN estimates e ON e.id=q.estimate_id JOIN estimate_versions ev ON ev.id=qv.estimate_version_id WHERE q.project_id=$1 AND q.company_id=$2 ORDER BY q.updated_at_iso DESC`,
      [projectId, companyId],
    );
    return rows.map(toQuoteSummary);
  }
  public async getQuoteById(quoteId: string, companyId: string) {
    const row = await this.one<QuoteRow>("SELECT * FROM quotes WHERE id=$1 AND company_id=$2", [
      quoteId,
      companyId,
    ]);
    return row ? toQuote(row) : null;
  }
  public async listQuoteVersions(quoteId: string, companyId: string) {
    return (
      await this.many<QuoteVersionRow>(
        "SELECT * FROM quote_versions WHERE quote_id=$1 AND company_id=$2 ORDER BY version_number DESC",
        [quoteId, companyId],
      )
    ).map(toQuoteVersion);
  }
  public async getQuoteVersionById(versionId: string, companyId: string) {
    const row = await this.one<QuoteVersionRow>(
      "SELECT * FROM quote_versions WHERE id=$1 AND company_id=$2",
      [versionId, companyId],
    );
    return row ? toQuoteVersion(row) : null;
  }
  public async updateQuoteVersion(input: UpdateQuoteVersionInput) {
    const e = await this.getQuoteVersionById(input.quoteVersionId, input.companyId);
    if (!e || e.status !== "DRAFT") return null;
    const changed = await this.execute(
      `UPDATE quote_versions SET estimate_version_id=$1,title=$2,customer_message=$3,valid_until_iso=$4,presentation_json=$5,updated_by_user_id=$6,updated_at_iso=$7 WHERE id=$8 AND company_id=$9 AND status='DRAFT'`,
      [
        input.estimateVersionId ?? e.estimateVersionId,
        input.title ?? e.title,
        input.customerMessage !== undefined ? input.customerMessage : e.customerMessage,
        input.validUntilIso !== undefined ? input.validUntilIso : e.validUntilIso,
        JSON.stringify(input.presentation ?? e.presentation),
        input.updatedByUserId,
        input.updatedAtIso,
        input.quoteVersionId,
        input.companyId,
      ],
    );
    return changed ? this.getQuoteVersionById(input.quoteVersionId, input.companyId) : null;
  }
  public async setQuoteVersionStatus(input: SetQuoteVersionStatusInput) {
    const changed = await this.execute(
      "UPDATE quote_versions SET status=$1,issued_at_iso=$2,decided_at_iso=$3,updated_by_user_id=$4,updated_at_iso=$5 WHERE id=$6 AND company_id=$7",
      [
        input.status,
        input.issuedAtIso,
        input.decidedAtIso,
        input.updatedByUserId,
        input.updatedAtIso,
        input.quoteVersionId,
        input.companyId,
      ],
    );
    return changed ? this.getQuoteVersionById(input.quoteVersionId, input.companyId) : null;
  }
  public async createQuoteVersion(input: CreateQuoteVersionInput) {
    return this.runInTransaction(async () => {
      await this.execute(
        "UPDATE quote_versions SET status='SUPERSEDED',updated_by_user_id=$1,updated_at_iso=$2 WHERE id=$3 AND company_id=$4",
        [input.updatedByUserId, input.updatedAtIso, input.parentVersionId, input.companyId],
      );
      await this.execute(
        `INSERT INTO quote_versions (id,quote_id,company_id,version_number,parent_version_id,estimate_version_id,status,title,customer_message,valid_until_iso,issued_at_iso,decided_at_iso,presentation_json,created_by_user_id,updated_by_user_id,created_at_iso,updated_at_iso) VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9,NULL,NULL,$10,$11,$12,$13,$14)`,
        [
          input.versionId,
          input.quoteId,
          input.companyId,
          input.versionNumber,
          input.parentVersionId,
          input.estimateVersionId,
          input.title,
          input.customerMessage,
          input.validUntilIso,
          JSON.stringify(input.presentation),
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        ],
      );
      await this.execute(
        "UPDATE quotes SET current_version_id=$1,latest_version_number=$2,updated_by_user_id=$3,updated_at_iso=$4 WHERE id=$5 AND company_id=$6",
        [
          input.versionId,
          input.versionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.quoteId,
          input.companyId,
        ],
      );
      return (await this.getQuoteVersionById(input.versionId, input.companyId))!;
    });
  }
  public async setQuoteArchivedState(input: SetQuoteArchivedStateInput) {
    const changed = await this.execute(
      "UPDATE quotes SET is_archived=$1,updated_by_user_id=$2,updated_at_iso=$3 WHERE id=$4 AND company_id=$5",
      [
        input.archived ? 1 : 0,
        input.updatedByUserId,
        input.updatedAtIso,
        input.quoteId,
        input.companyId,
      ],
    );
    return changed ? this.getQuoteById(input.quoteId, input.companyId) : null;
  }

  public async getPricingConfig(companyId: string) {
    const row = await this.one<PricingConfigRow>(
      "SELECT * FROM pricing_config WHERE company_id=$1",
      [companyId],
    );
    return row ? toPricingConfig(row) : null;
  }
  public async upsertPricingConfig(input: UpsertPricingConfigInput) {
    const record = {
      companyId: input.companyId,
      items: input.items,
      ...(input.workbook ? { workbook: input.workbook } : {}),
      updatedAtIso: input.updatedAtIso,
      updatedByUserId: input.updatedByUserId,
    };
    await this.execute(
      `INSERT INTO pricing_config (company_id,items_json,workbook_json,updated_at_iso,updated_by_user_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(company_id) DO UPDATE SET items_json=excluded.items_json,workbook_json=excluded.workbook_json,updated_at_iso=excluded.updated_at_iso,updated_by_user_id=excluded.updated_by_user_id`,
      [
        input.companyId,
        JSON.stringify(record.items),
        record.workbook ? JSON.stringify(record.workbook) : null,
        input.updatedAtIso,
        input.updatedByUserId,
      ],
    );
    return record;
  }
  public async listCompanyConfigurationVersions(companyId: string) {
    return (
      await this.many<CompanyConfigurationVersionRow>(
        "SELECT * FROM company_configuration_versions WHERE company_id=$1 ORDER BY version_number DESC",
        [companyId],
      )
    ).map(toCompanyConfigurationVersion);
  }
  public async getCompanyConfigurationVersionByStatus(
    companyId: string,
    status: "DRAFT" | "PUBLISHED",
  ) {
    const row = await this.one<CompanyConfigurationVersionRow>(
      "SELECT * FROM company_configuration_versions WHERE company_id=$1 AND status=$2 LIMIT 1",
      [companyId, status],
    );
    return row ? toCompanyConfigurationVersion(row) : null;
  }
  public async createCompanyConfigurationVersion(input: CreateCompanyConfigurationVersionInput) {
    await this.execute(
      `INSERT INTO company_configuration_versions (id,company_id,version_number,status,definition_json,compiled_workbook_json,change_note,created_by_user_id,updated_by_user_id,published_by_user_id,created_at_iso,updated_at_iso,published_at_iso) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.id,
        input.companyId,
        input.versionNumber,
        input.status,
        JSON.stringify(input.definition),
        JSON.stringify(input.compiledWorkbook),
        input.changeNote,
        input.createdByUserId,
        input.updatedByUserId,
        input.publishedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
        input.publishedAtIso,
      ],
    );
    const row = await this.one<CompanyConfigurationVersionRow>(
      "SELECT * FROM company_configuration_versions WHERE id=$1 AND company_id=$2",
      [input.id, input.companyId],
    );
    return toCompanyConfigurationVersion(row!);
  }
  public async updateCompanyConfigurationDraft(input: UpdateCompanyConfigurationDraftInput) {
    const changed = await this.execute(
      `UPDATE company_configuration_versions SET definition_json=$1,compiled_workbook_json=$2,change_note=$3,updated_by_user_id=$4,updated_at_iso=$5 WHERE id=$6 AND company_id=$7 AND status='DRAFT'`,
      [
        JSON.stringify(input.definition),
        JSON.stringify(input.compiledWorkbook),
        input.changeNote,
        input.updatedByUserId,
        input.updatedAtIso,
        input.id,
        input.companyId,
      ],
    );
    return changed ? this.getCompanyConfigurationVersionByStatus(input.companyId, "DRAFT") : null;
  }
  public async setCompanyConfigurationVersionStatus(
    input: SetCompanyConfigurationVersionStatusInput,
  ) {
    const changed = await this.execute(
      `UPDATE company_configuration_versions SET status=$1,change_note=$2,updated_by_user_id=$3,updated_at_iso=$4,published_by_user_id=$5,published_at_iso=$6 WHERE id=$7 AND company_id=$8`,
      [
        input.status,
        input.changeNote,
        input.updatedByUserId,
        input.updatedAtIso,
        input.publishedByUserId,
        input.publishedAtIso,
        input.id,
        input.companyId,
      ],
    );
    if (!changed) return null;
    const row = await this.one<CompanyConfigurationVersionRow>(
      "SELECT * FROM company_configuration_versions WHERE id=$1 AND company_id=$2",
      [input.id, input.companyId],
    );
    return row ? toCompanyConfigurationVersion(row) : null;
  }
}

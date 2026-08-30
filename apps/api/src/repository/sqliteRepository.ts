import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import { migrateSqliteDatabase } from "./sqliteSchema.js";
import { SqliteCustomerStore } from "./sqliteCustomerStore.js";
import { SqliteDrawingStore } from "./sqliteDrawingStore.js";
import { SqliteLifecycleStore } from "./sqliteLifecycleStore.js";
import { SqlitePricingStore } from "./sqlitePricingStore.js";
import { SqliteProjectStore } from "./sqliteProjectStore.js";
import { SqliteSiteStore } from "./sqliteSiteStore.js";
import { SqliteSupportStore } from "./sqliteSupportStore.js";
import { SqliteUserSessionStore } from "./sqliteUserSessionStore.js";
import type {
  AppRepository,
  AuditLogQueryOptions,
  BootstrapOwnerAccountInput,
  CreateAuditLogInput,
  CreateCompanyConfigurationVersionInput,
  CreateCustomerInput,
  CreateDrawingInput,
  CreateEstimateInput,
  CreateEstimateVersionInput,
  CreatePasswordResetTokenInput,
  CreateProjectInput,
  CreateQuoteInput,
  CreateQuoteVersionInput,
  CreateRevisionInput,
  CreateSessionInput,
  CreateUserInput,
  CreateSiteInput,
  DeleteCustomerInput,
  DeleteDrawingInput,
  DeleteProjectInput,
  DeleteRevisionInput,
  DeleteSiteInput,
  RenameDrawingInput,
  ScopeFilter,
  SetDrawingStatusInput,
  SetCompanyConfigurationVersionStatusInput,
  SetEstimateArchivedStateInput,
  SetEstimateVersionCalculationInput,
  SetEstimateVersionStatusInput,
  SetQuoteArchivedStateInput,
  SetQuoteVersionStatusInput,
  SetSiteArchivedStateInput,
  SetCustomerArchivedStateInput,
  SetDrawingArchivedStateInput,
  SetProjectArchivedStateInput,
  SetProjectStatusInput,
  UpdateCustomerInput,
  UpdateCompanyConfigurationDraftInput,
  UpdateProjectInput,
  UpdateEstimateVersionInput,
  UpdateQuoteVersionInput,
  UpdateRevisionLayoutInput,
  UpdateRevisionNotesInput,
  UpdateSiteInput,
  UpsertPricingConfigInput,
} from "./types.js";

export class SqliteAppRepository implements AppRepository {
  private readonly database: Database.Database;
  private readonly userSessions: SqliteUserSessionStore;
  private readonly customers: SqliteCustomerStore;
  private readonly projects: SqliteProjectStore;
  private readonly sites: SqliteSiteStore;
  private readonly drawings: SqliteDrawingStore;
  private readonly lifecycle: SqliteLifecycleStore;
  private readonly pricing: SqlitePricingStore;
  private readonly support: SqliteSupportStore;
  private readonly auditLogRetentionDays: number;

  public constructor(
    databasePath: string,
    options: { auditLogRetentionDays?: number; skipMigration?: boolean } = {},
  ) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    if (!options.skipMigration) {
      migrateSqliteDatabase(this.database);
    }
    this.userSessions = new SqliteUserSessionStore(this.database);
    this.customers = new SqliteCustomerStore(this.database);
    this.projects = new SqliteProjectStore(this.database);
    this.sites = new SqliteSiteStore(this.database);
    this.drawings = new SqliteDrawingStore(this.database);
    this.lifecycle = new SqliteLifecycleStore(this.database);
    this.pricing = new SqlitePricingStore(this.database);
    this.support = new SqliteSupportStore(this.database);
    this.auditLogRetentionDays = options.auditLogRetentionDays ?? 365;
  }

  public close(): Promise<void> {
    this.database.close();
    return Promise.resolve();
  }

  public checkHealth(): Promise<void> {
    this.database.prepare("SELECT 1").get();
    return Promise.resolve();
  }

  public async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  // ----- Identity -----

  public getUserCount() {
    return Promise.resolve(this.userSessions.getUserCount());
  }
  public bootstrapOwnerAccount(input: BootstrapOwnerAccountInput) {
    return Promise.resolve(this.userSessions.bootstrapOwnerAccount(input));
  }
  public createUser(input: CreateUserInput) {
    return Promise.resolve(this.userSessions.createUser(input));
  }
  public getCompanyById(companyId: string) {
    return Promise.resolve(this.userSessions.getCompanyById(companyId));
  }
  public getUserById(userId: string, companyId: string) {
    return Promise.resolve(this.userSessions.getUserById(userId, companyId));
  }
  public getUserByEmail(email: string) {
    return Promise.resolve(this.userSessions.getUserByEmail(email));
  }
  public listUsers(companyId: string) {
    return Promise.resolve(this.userSessions.listUsers(companyId));
  }
  public updateUserPassword(
    userId: string,
    companyId: string,
    passwordHash: string,
    passwordSalt: string,
  ): Promise<void> {
    this.userSessions.updateUserPassword(userId, companyId, passwordHash, passwordSalt);
    return Promise.resolve();
  }
  public createSession(input: CreateSessionInput) {
    return Promise.resolve(this.userSessions.createSession(input));
  }
  public revokeSession(tokenHash: string, revokedAtIso: string): Promise<void> {
    this.userSessions.revokeSession(tokenHash, revokedAtIso);
    return Promise.resolve();
  }
  public revokeSessionsForUser(
    userId: string,
    companyId: string,
    revokedAtIso: string,
  ): Promise<void> {
    this.userSessions.revokeSessionsForUser(userId, companyId, revokedAtIso);
    return Promise.resolve();
  }
  public getAuthenticatedSession(tokenHash: string) {
    return Promise.resolve(this.userSessions.getAuthenticatedSession(tokenHash));
  }
  public createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void> {
    this.support.pruneStaleRecords(new Date().toISOString(), this.auditLogRetentionDays);
    this.support.createPasswordResetToken(input);
    return Promise.resolve();
  }
  public consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ) {
    this.support.pruneStaleRecords(consumedAtIso, this.auditLogRetentionDays);
    return Promise.resolve(
      this.support.consumePasswordResetToken(tokenHash, passwordHash, passwordSalt, consumedAtIso),
    );
  }

  // ----- Customers -----

  public createCustomer(input: CreateCustomerInput) {
    return Promise.resolve(this.customers.createCustomer(input));
  }
  public listCustomers(companyId: string, scope: ScopeFilter = "ACTIVE", search = "") {
    return Promise.resolve(this.customers.listCustomers(companyId, scope, search));
  }
  public getCustomerById(customerId: string, companyId: string) {
    return Promise.resolve(this.customers.getCustomerById(customerId, companyId));
  }
  public updateCustomer(input: UpdateCustomerInput) {
    return Promise.resolve(this.customers.updateCustomer(input));
  }
  public setCustomerArchivedState(input: SetCustomerArchivedStateInput) {
    return Promise.resolve(this.customers.setCustomerArchivedState(input));
  }
  public deleteCustomer(input: DeleteCustomerInput) {
    return Promise.resolve(this.customers.deleteCustomer(input));
  }

  // ----- Sites -----

  public createSite(input: CreateSiteInput) {
    return Promise.resolve(this.sites.createSite(input));
  }
  public listSites(
    companyId: string,
    options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
  ) {
    return Promise.resolve(this.sites.listSites(companyId, options));
  }
  public getSiteById(siteId: string, companyId: string) {
    return Promise.resolve(this.sites.getSiteById(siteId, companyId));
  }
  public updateSite(input: UpdateSiteInput) {
    return Promise.resolve(this.sites.updateSite(input));
  }
  public setSiteArchivedState(input: SetSiteArchivedStateInput) {
    return Promise.resolve(this.sites.setSiteArchivedState(input));
  }
  public deleteSite(input: DeleteSiteInput) {
    return Promise.resolve(this.sites.deleteSite(input));
  }

  // ----- Projects -----

  public createProject(input: CreateProjectInput) {
    return Promise.resolve(this.projects.createProject(input));
  }
  public listProjects(
    companyId: string,
    options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
  ) {
    return Promise.resolve(this.projects.listProjects(companyId, options));
  }
  public getProjectById(projectId: string, companyId: string) {
    return Promise.resolve(this.projects.getProjectById(projectId, companyId));
  }
  public updateProject(input: UpdateProjectInput) {
    return Promise.resolve(this.projects.updateProject(input));
  }
  public setProjectStatus(input: SetProjectStatusInput) {
    return Promise.resolve(this.projects.setProjectStatus(input));
  }
  public setProjectArchivedState(input: SetProjectArchivedStateInput) {
    return Promise.resolve(this.projects.setProjectArchivedState(input));
  }
  public deleteProject(input: DeleteProjectInput) {
    return Promise.resolve(this.projects.deleteProject(input));
  }

  // ----- Drawings -----

  public createDrawing(input: CreateDrawingInput) {
    return Promise.resolve(this.drawings.createDrawing(input));
  }
  public listDrawingsForProject(projectId: string, companyId: string) {
    return Promise.resolve(this.drawings.listDrawingsForProject(projectId, companyId));
  }
  public getDrawingById(drawingId: string, companyId: string) {
    return Promise.resolve(this.drawings.getDrawingById(drawingId, companyId));
  }
  public renameDrawing(input: RenameDrawingInput) {
    return Promise.resolve(this.drawings.renameDrawing(input));
  }
  public setDrawingArchivedState(input: SetDrawingArchivedStateInput) {
    return Promise.resolve(this.drawings.setDrawingArchivedState(input));
  }
  public deleteDrawing(input: DeleteDrawingInput) {
    return Promise.resolve(this.drawings.deleteDrawing(input));
  }
  public createRevision(input: CreateRevisionInput) {
    return Promise.resolve(this.drawings.createRevision(input));
  }
  public listRevisionsForDrawing(drawingId: string, companyId: string) {
    return Promise.resolve(this.drawings.listRevisionsForDrawing(drawingId, companyId));
  }
  public getRevisionById(revisionId: string, companyId: string) {
    return Promise.resolve(this.drawings.getRevisionById(revisionId, companyId));
  }
  public updateRevisionLayout(input: UpdateRevisionLayoutInput) {
    return Promise.resolve(this.drawings.updateRevisionLayout(input));
  }
  public updateRevisionNotes(input: UpdateRevisionNotesInput) {
    return Promise.resolve(this.drawings.updateRevisionNotes(input));
  }
  public deleteRevision(input: DeleteRevisionInput) {
    return Promise.resolve(this.drawings.deleteRevision(input));
  }
  public setDrawingStatus(input: SetDrawingStatusInput) {
    return Promise.resolve(this.drawings.setDrawingStatus(input));
  }

  // ----- Estimate lifecycle -----

  public createEstimate(input: CreateEstimateInput) {
    return Promise.resolve(this.lifecycle.createEstimate(input));
  }
  public listEstimatesForProject(projectId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.listEstimatesForProject(projectId, companyId));
  }
  public getEstimateById(estimateId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.getEstimateById(estimateId, companyId));
  }
  public listEstimateVersions(estimateId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.listEstimateVersions(estimateId, companyId));
  }
  public getEstimateVersionById(versionId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.getEstimateVersionById(versionId, companyId));
  }
  public updateEstimateVersion(input: UpdateEstimateVersionInput) {
    return Promise.resolve(this.lifecycle.updateEstimateVersion(input));
  }
  public setEstimateVersionCalculation(input: SetEstimateVersionCalculationInput) {
    return Promise.resolve(this.lifecycle.setEstimateVersionCalculation(input));
  }
  public setEstimateVersionStatus(input: SetEstimateVersionStatusInput) {
    return Promise.resolve(this.lifecycle.setEstimateVersionStatus(input));
  }
  public createEstimateVersion(input: CreateEstimateVersionInput) {
    return Promise.resolve(this.lifecycle.createEstimateVersion(input));
  }
  public setEstimateArchivedState(input: SetEstimateArchivedStateInput) {
    return Promise.resolve(this.lifecycle.setEstimateArchivedState(input));
  }

  // ----- Quote lifecycle -----

  public createQuote(input: CreateQuoteInput) {
    return Promise.resolve(this.lifecycle.createQuote(input));
  }
  public listQuotesForProject(projectId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.listQuotesForProject(projectId, companyId));
  }
  public getQuoteById(quoteId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.getQuoteById(quoteId, companyId));
  }
  public listQuoteVersions(quoteId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.listQuoteVersions(quoteId, companyId));
  }
  public getQuoteVersionById(versionId: string, companyId: string) {
    return Promise.resolve(this.lifecycle.getQuoteVersionById(versionId, companyId));
  }
  public updateQuoteVersion(input: UpdateQuoteVersionInput) {
    return Promise.resolve(this.lifecycle.updateQuoteVersion(input));
  }
  public setQuoteVersionStatus(input: SetQuoteVersionStatusInput) {
    return Promise.resolve(this.lifecycle.setQuoteVersionStatus(input));
  }
  public createQuoteVersion(input: CreateQuoteVersionInput) {
    return Promise.resolve(this.lifecycle.createQuoteVersion(input));
  }
  public setQuoteArchivedState(input: SetQuoteArchivedStateInput) {
    return Promise.resolve(this.lifecycle.setQuoteArchivedState(input));
  }
  public nextCompanySequence(companyId: string, sequenceKey: string) {
    return Promise.resolve(this.lifecycle.nextCompanySequence(companyId, sequenceKey));
  }

  // ----- Pricing -----

  public getPricingConfig(companyId: string) {
    return Promise.resolve(this.pricing.getPricingConfig(companyId));
  }
  public upsertPricingConfig(input: UpsertPricingConfigInput) {
    return Promise.resolve(this.pricing.upsertPricingConfig(input));
  }
  public listCompanyConfigurationVersions(companyId: string) {
    return Promise.resolve(this.pricing.listCompanyConfigurationVersions(companyId));
  }
  public getCompanyConfigurationVersionByStatus(
    companyId: string,
    status: "DRAFT" | "PUBLISHED",
  ) {
    return Promise.resolve(this.pricing.getCompanyConfigurationVersionByStatus(companyId, status));
  }
  public createCompanyConfigurationVersion(input: CreateCompanyConfigurationVersionInput) {
    return Promise.resolve(this.pricing.createCompanyConfigurationVersion(input));
  }
  public updateCompanyConfigurationDraft(input: UpdateCompanyConfigurationDraftInput) {
    return Promise.resolve(this.pricing.updateCompanyConfigurationDraft(input));
  }
  public setCompanyConfigurationVersionStatus(input: SetCompanyConfigurationVersionStatusInput) {
    return Promise.resolve(this.pricing.setCompanyConfigurationVersionStatus(input));
  }

  // ----- Audit -----

  public addAuditLog(input: CreateAuditLogInput) {
    this.support.pruneStaleRecords(input.createdAtIso, this.auditLogRetentionDays);
    return Promise.resolve(this.support.addAuditLog(input));
  }
  public listAuditLog(
    companyId: string,
    options: number | AuditLogQueryOptions = {},
  ) {
    this.support.pruneStaleRecords(new Date().toISOString(), this.auditLogRetentionDays);
    return Promise.resolve(this.support.listAuditLog(companyId, options));
  }
}

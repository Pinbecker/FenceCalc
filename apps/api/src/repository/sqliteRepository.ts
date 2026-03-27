import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import { migrateSqliteDatabase } from "./sqliteSchema.js";
import { SqliteCustomerStore } from "./sqliteCustomerStore.js";
import { SqliteDrawingStore } from "./sqliteDrawingStore.js";
import { SqliteJobStore } from "./sqliteJobStore.js";
import { SqlitePricingStore } from "./sqlitePricingStore.js";
import { SqliteQuoteStore } from "./sqliteQuoteStore.js";
import { SqliteSupportStore } from "./sqliteSupportStore.js";
import { SqliteUserSessionStore } from "./sqliteUserSessionStore.js";
import type {
  AppRepository,
  BootstrapOwnerAccountInput,
  CreateAuditLogInput,
  CreateCustomerInput,
  CreateDrawingInput,
  CreateJobInput,
  CreateJobTaskInput,
  CreatePasswordResetTokenInput,
  CreateQuoteInput,
  CreateSessionInput,
  CreateUserInput,
  DeleteCustomerInput,
  DeleteJobInput,
  DeleteDrawingInput,
  RestoreDrawingVersionInput,
  CustomerScope,
  SetJobPrimaryDrawingInput,
  SetCustomerArchivedStateInput,
  SetDrawingArchivedStateInput,
  SetDrawingStatusInput,
  UpdateJobInput,
  UpdateJobTaskInput,
  UpsertPricingConfigInput,
  UpdateCustomerInput,
  UpdateDrawingInput
} from "./types.js";

export class SqliteAppRepository implements AppRepository {
  private readonly database: Database.Database;
  private readonly userSessions: SqliteUserSessionStore;
  private readonly customers: SqliteCustomerStore;
  private readonly jobs: SqliteJobStore;
  private readonly drawings: SqliteDrawingStore;
  private readonly pricing: SqlitePricingStore;
  private readonly quotes: SqliteQuoteStore;
  private readonly support: SqliteSupportStore;
  private readonly auditLogRetentionDays: number;

  public constructor(databasePath: string, options: { auditLogRetentionDays?: number; skipMigration?: boolean } = {}) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    if (!options.skipMigration) {
      migrateSqliteDatabase(this.database);
    }
    this.userSessions = new SqliteUserSessionStore(this.database);
    this.customers = new SqliteCustomerStore(this.database);
    this.jobs = new SqliteJobStore(this.database);
    this.drawings = new SqliteDrawingStore(this.database);
    this.pricing = new SqlitePricingStore(this.database);
    this.quotes = new SqliteQuoteStore(this.database);
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

  public getUserCount(): Promise<number> {
    return Promise.resolve(this.userSessions.getUserCount());
  }

  public bootstrapOwnerAccount(input: BootstrapOwnerAccountInput) {
    return Promise.resolve(this.userSessions.bootstrapOwnerAccount(input));
  }

  public createUser(input: CreateUserInput) {
    return Promise.resolve(this.userSessions.createUser(input));
  }

  public getUserByEmail(email: string) {
    return Promise.resolve(this.userSessions.getUserByEmail(email));
  }

  public getUserById(userId: string, companyId: string) {
    return Promise.resolve(this.userSessions.getUserById(userId, companyId));
  }

  public listUsers(companyId: string) {
    return Promise.resolve(this.userSessions.listUsers(companyId));
  }

  public updateUserPassword(userId: string, companyId: string, passwordHash: string, passwordSalt: string): Promise<void> {
    this.userSessions.updateUserPassword(userId, companyId, passwordHash, passwordSalt);
    return Promise.resolve();
  }

  public getCompanyById(companyId: string) {
    return Promise.resolve(this.userSessions.getCompanyById(companyId));
  }

  public createSession(input: CreateSessionInput) {
    return Promise.resolve(this.userSessions.createSession(input));
  }

  public revokeSession(tokenHash: string, revokedAtIso: string): Promise<void> {
    this.userSessions.revokeSession(tokenHash, revokedAtIso);
    return Promise.resolve();
  }

  public revokeSessionsForUser(userId: string, companyId: string, revokedAtIso: string): Promise<void> {
    this.userSessions.revokeSessionsForUser(userId, companyId, revokedAtIso);
    return Promise.resolve();
  }

  public getAuthenticatedSession(tokenHash: string) {
    return Promise.resolve(this.userSessions.getAuthenticatedSession(tokenHash));
  }

  public createCustomer(input: CreateCustomerInput) {
    return Promise.resolve(this.customers.createCustomer(input));
  }

  public listCustomers(companyId: string, scope: CustomerScope = "ACTIVE", search = "") {
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

  public deleteJob(input: DeleteJobInput) {
    return Promise.resolve(this.jobs.deleteJob(input));
  }

  public createJob(input: CreateJobInput) {
    return Promise.resolve(this.jobs.createJob(input));
  }

  public listJobs(companyId: string, scope: CustomerScope = "ACTIVE", search = "", customerId?: string) {
    return Promise.resolve(this.jobs.listJobs(companyId, scope, search, customerId));
  }

  public listJobsForCustomer(customerId: string, companyId: string) {
    return Promise.resolve(this.jobs.listJobsForCustomer(customerId, companyId));
  }

  public getJobById(jobId: string, companyId: string) {
    return Promise.resolve(this.jobs.getJobById(jobId, companyId));
  }

  public updateJob(input: UpdateJobInput) {
    return Promise.resolve(this.jobs.updateJob(input));
  }

  public setJobPrimaryDrawing(input: SetJobPrimaryDrawingInput) {
    return Promise.resolve(this.jobs.setJobPrimaryDrawing(input));
  }

  public listJobTasks(jobId: string, companyId: string) {
    return Promise.resolve(this.jobs.listJobTasks(jobId, companyId));
  }

  public createJobTask(input: CreateJobTaskInput) {
    return Promise.resolve(this.jobs.createJobTask(input));
  }

  public updateJobTask(input: UpdateJobTaskInput) {
    return Promise.resolve(this.jobs.updateJobTask(input));
  }

  public listDrawingsForCustomer(customerId: string, companyId: string) {
    return Promise.resolve(this.drawings.listDrawingsForCustomer(customerId, companyId));
  }

  public listDrawingsForJob(jobId: string, companyId: string) {
    return Promise.resolve(this.drawings.listDrawingsForJob(jobId, companyId));
  }

  public createDrawing(input: CreateDrawingInput) {
    return Promise.resolve(this.drawings.createDrawing(input));
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE", search = "") {
    return Promise.resolve(this.drawings.listDrawings(companyId, scope, search));
  }

  public getDrawingById(drawingId: string, companyId: string) {
    return Promise.resolve(this.drawings.getDrawingById(drawingId, companyId));
  }

  public updateDrawing(input: UpdateDrawingInput) {
    return Promise.resolve(this.drawings.updateDrawing(input));
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput) {
    return Promise.resolve(this.drawings.setDrawingArchivedState(input));
  }

  public setDrawingStatus(input: SetDrawingStatusInput) {
    return Promise.resolve(this.drawings.setDrawingStatus(input));
  }

  public deleteDrawing(input: DeleteDrawingInput) {
    return Promise.resolve(this.drawings.deleteDrawing(input));
  }

  public listDrawingVersions(drawingId: string, companyId: string) {
    return Promise.resolve(this.drawings.listDrawingVersions(drawingId, companyId));
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput) {
    return Promise.resolve(this.drawings.restoreDrawingVersion(input));
  }

  public createQuote(input: CreateQuoteInput) {
    return Promise.resolve(this.quotes.createQuote(input));
  }

  public listQuotesForJob(jobId: string, companyId: string) {
    return Promise.resolve(this.quotes.listQuotesForJob(jobId, companyId));
  }

  public listQuotesForDrawing(drawingId: string, companyId: string) {
    return Promise.resolve(this.quotes.listQuotesForDrawing(drawingId, companyId));
  }

  public getPricingConfig(companyId: string) {
    return Promise.resolve(this.pricing.getPricingConfig(companyId));
  }

  public upsertPricingConfig(input: UpsertPricingConfigInput) {
    return Promise.resolve(this.pricing.upsertPricingConfig(input));
  }

  public createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void> {
    this.support.pruneStaleRecords(new Date().toISOString(), this.auditLogRetentionDays);
    this.support.createPasswordResetToken(input);
    return Promise.resolve();
  }

  public consumePasswordResetToken(tokenHash: string, passwordHash: string, passwordSalt: string, consumedAtIso: string) {
    this.support.pruneStaleRecords(consumedAtIso, this.auditLogRetentionDays);
    return Promise.resolve(this.support.consumePasswordResetToken(tokenHash, passwordHash, passwordSalt, consumedAtIso));
  }

  public addAuditLog(input: CreateAuditLogInput) {
    this.support.pruneStaleRecords(input.createdAtIso, this.auditLogRetentionDays);
    return Promise.resolve(this.support.addAuditLog(input));
  }

  public listAuditLog(companyId: string, options: number | { limit?: number; beforeCreatedAtIso?: string | null } = {}) {
    this.support.pruneStaleRecords(new Date().toISOString(), this.auditLogRetentionDays);
    return Promise.resolve(this.support.listAuditLog(companyId, options));
  }
}

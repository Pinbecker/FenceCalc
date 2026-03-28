import type {
  AuditLogRecord,
  CompanyRecord,
  CustomerRecord,
  CustomerSummary,
  DrawingRecord,
  DrawingVersionRecord,
  JobRecord,
  JobTaskRecord,
  PricingConfigRecord,
  QuoteRecord
} from "@fence-estimator/contracts";

import { InMemoryCustomerStore } from "./inMemoryCustomerStore.js";
import { InMemoryDrawingStore } from "./inMemoryDrawingStore.js";
import { InMemoryJobStore } from "./inMemoryJobStore.js";
import { InMemoryPricingStore } from "./inMemoryPricingStore.js";
import { InMemoryQuoteStore } from "./inMemoryQuoteStore.js";
import {
  InMemorySupportStore,
  type InMemoryPasswordResetTokenRecord
} from "./inMemorySupportStore.js";
import { InMemoryUserSessionStore } from "./inMemoryUserSessionStore.js";
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
  SessionRecord,
  SetJobPrimaryDrawingInput,
  SetCustomerArchivedStateInput,
  SetDrawingArchivedStateInput,
  SetDrawingStatusInput,
  StoredUser,
  UpdateJobInput,
  UpdateJobTaskInput,
  UpsertPricingConfigInput,
  UpdateCustomerInput,
  UpdateDrawingInput
} from "./types.js";

export class InMemoryAppRepository implements AppRepository {
  private readonly companies = new Map<string, CompanyRecord>();
  private readonly customersMap = new Map<string, CustomerRecord>();
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly drawingsMap = new Map<string, DrawingRecord>();
  private readonly drawingVersionsMap = new Map<string, DrawingVersionRecord[]>();
  private readonly jobsMap = new Map<string, JobRecord>();
  private readonly jobTasksMap = new Map<string, JobTaskRecord[]>();
  private readonly quotesByJobId = new Map<string, QuoteRecord[]>();
  private readonly pricingConfigs = new Map<string, PricingConfigRecord>();
  private readonly auditLog: AuditLogRecord[] = [];
  private readonly passwordResetTokens = new Map<string, InMemoryPasswordResetTokenRecord>();
  private readonly userSessions = new InMemoryUserSessionStore({
    companies: this.companies,
    users: this.users,
    sessions: this.sessions
  });
  private readonly customers = new InMemoryCustomerStore({
    customers: this.customersMap,
    drawings: this.drawingsMap
  });
  private readonly jobs = new InMemoryJobStore({
    customers: this.customersMap,
    drawings: this.drawingsMap,
    drawingVersions: this.drawingVersionsMap,
    jobs: this.jobsMap,
    jobTasks: this.jobTasksMap,
    quotesByJobId: this.quotesByJobId,
    users: this.users
  });
  private readonly drawings = new InMemoryDrawingStore({
    drawings: this.drawingsMap,
    drawingVersions: this.drawingVersionsMap,
    jobs: this.jobsMap,
    jobTasks: this.jobTasksMap,
    quotesByJobId: this.quotesByJobId,
    users: this.users,
    customers: this.customersMap
  });
  private readonly pricing = new InMemoryPricingStore({
    pricingConfigs: this.pricingConfigs
  });
  private readonly quotes = new InMemoryQuoteStore({
    quotesByJobId: this.quotesByJobId
  });
  private readonly support = new InMemorySupportStore({
    companies: this.companies,
    users: this.users,
    auditLog: this.auditLog,
    passwordResetTokens: this.passwordResetTokens
  });
  private readonly auditLogRetentionDays: number;

  public constructor(options: { auditLogRetentionDays?: number } = {}) {
    this.auditLogRetentionDays = options.auditLogRetentionDays ?? 365;
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  public async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
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

  public updateUserPassword(userId: string, companyId: string, passwordHash: string, passwordSalt: string): Promise<void> {
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

  public listCustomers(companyId: string, scope: CustomerScope = "ACTIVE", search = ""): Promise<CustomerSummary[]> {
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

  public listCompanyTasks(companyId: string) {
    return Promise.resolve(this.jobs.listCompanyTasks(companyId));
  }

  public createJobTask(input: CreateJobTaskInput) {
    return Promise.resolve(this.jobs.createJobTask(input));
  }

  public updateJobTask(input: UpdateJobTaskInput) {
    return Promise.resolve(this.jobs.updateJobTask(input));
  }

  public deleteJobTask(taskId: string, jobId: string, companyId: string) {
    return Promise.resolve(this.jobs.deleteJobTask(taskId, jobId, companyId));
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

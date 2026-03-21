import type {
  AuditLogRecord,
  CompanyRecord,
  CustomerRecord,
  CustomerSummary,
  DrawingRecord,
  DrawingVersionRecord,
  PricingConfigRecord,
  QuoteRecord
} from "@fence-estimator/contracts";

import { InMemoryCustomerStore } from "./inMemoryCustomerStore.js";
import { InMemoryDrawingStore } from "./inMemoryDrawingStore.js";
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
  CreatePasswordResetTokenInput,
  CreateQuoteInput,
  CreateSessionInput,
  CreateUserInput,
  RestoreDrawingVersionInput,
  CustomerScope,
  SessionRecord,
  SetCustomerArchivedStateInput,
  SetDrawingArchivedStateInput,
  StoredUser,
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
  private readonly quotesByDrawingId = new Map<string, QuoteRecord[]>();
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
  private readonly drawings = new InMemoryDrawingStore({
    drawings: this.drawingsMap,
    drawingVersions: this.drawingVersionsMap,
    users: this.users,
    customers: this.customersMap
  });
  private readonly pricing = new InMemoryPricingStore({
    pricingConfigs: this.pricingConfigs
  });
  private readonly quotes = new InMemoryQuoteStore({
    quotesByDrawingId: this.quotesByDrawingId
  });
  private readonly support = new InMemorySupportStore({
    companies: this.companies,
    users: this.users,
    auditLog: this.auditLog,
    passwordResetTokens: this.passwordResetTokens
  });

  public checkHealth(): Promise<void> {
    return Promise.resolve();
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

  public createDrawing(input: CreateDrawingInput) {
    return Promise.resolve(this.drawings.createDrawing(input));
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    return Promise.resolve(this.drawings.listDrawings(companyId, scope));
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

  public listDrawingVersions(drawingId: string, companyId: string) {
    return Promise.resolve(this.drawings.listDrawingVersions(drawingId, companyId));
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput) {
    return Promise.resolve(this.drawings.restoreDrawingVersion(input));
  }

  public createQuote(input: CreateQuoteInput) {
    return Promise.resolve(this.quotes.createQuote(input));
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
    this.support.createPasswordResetToken(input);
    return Promise.resolve();
  }

  public consumePasswordResetToken(tokenHash: string, passwordHash: string, passwordSalt: string, consumedAtIso: string) {
    return Promise.resolve(this.support.consumePasswordResetToken(tokenHash, passwordHash, passwordSalt, consumedAtIso));
  }

  public addAuditLog(input: CreateAuditLogInput) {
    return Promise.resolve(this.support.addAuditLog(input));
  }

  public listAuditLog(companyId: string, limit = 100) {
    return Promise.resolve(this.support.listAuditLog(companyId, limit));
  }
}

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import { migrateSqliteDatabase } from "./sqliteSchema.js";
import { SqliteDrawingStore } from "./sqliteDrawingStore.js";
import { SqlitePricingStore } from "./sqlitePricingStore.js";
import { SqliteQuoteStore } from "./sqliteQuoteStore.js";
import { SqliteSupportStore } from "./sqliteSupportStore.js";
import { SqliteUserSessionStore } from "./sqliteUserSessionStore.js";
import type {
  AppRepository,
  BootstrapOwnerAccountInput,
  CreateAuditLogInput,
  CreateDrawingInput,
  CreatePasswordResetTokenInput,
  CreateQuoteInput,
  CreateSessionInput,
  CreateUserInput,
  RestoreDrawingVersionInput,
  SetDrawingArchivedStateInput,
  UpsertPricingConfigInput,
  UpdateDrawingInput
} from "./types.js";

export class SqliteAppRepository implements AppRepository {
  private readonly database: Database.Database;
  private readonly userSessions: SqliteUserSessionStore;
  private readonly drawings: SqliteDrawingStore;
  private readonly pricing: SqlitePricingStore;
  private readonly quotes: SqliteQuoteStore;
  private readonly support: SqliteSupportStore;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    migrateSqliteDatabase(this.database);
    this.userSessions = new SqliteUserSessionStore(this.database);
    this.drawings = new SqliteDrawingStore(this.database);
    this.pricing = new SqlitePricingStore(this.database);
    this.quotes = new SqliteQuoteStore(this.database);
    this.support = new SqliteSupportStore(this.database);
  }

  public checkHealth(): Promise<void> {
    this.database.prepare("SELECT 1").get();
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

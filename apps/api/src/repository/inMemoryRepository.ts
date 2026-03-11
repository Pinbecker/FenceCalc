import type {
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  DrawingRecord,
  DrawingVersionRecord
} from "@fence-estimator/contracts";

import { toDrawingSummary, toPublicUser } from "./shared.js";
import type {
  AppRepository,
  AuthenticatedSession,
  CreateAuditLogInput,
  CreateDrawingInput,
  CreateOwnerAccountInput,
  CreatePasswordResetTokenInput,
  CreateSessionInput,
  CreateUserInput,
  PasswordResetConsumption,
  RestoreDrawingVersionInput,
  SessionRecord,
  SetDrawingArchivedStateInput,
  StoredUser,
  UpdateDrawingInput
} from "./types.js";

export class InMemoryAppRepository implements AppRepository {
  private readonly companies = new Map<string, CompanyRecord>();
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly drawings = new Map<string, DrawingRecord>();
  private readonly drawingVersions = new Map<string, DrawingVersionRecord[]>();
  private readonly auditLog: AuditLogRecord[] = [];
  private readonly passwordResetTokens = new Map<
    string,
    {
      id: string;
      userId: string;
      tokenHash: string;
      createdAtIso: string;
      expiresAtIso: string;
      consumedAtIso: string | null;
    }
  >();

  public getUserCount(): Promise<number> {
    return Promise.resolve(this.users.size);
  }

  public createOwnerAccount(input: CreateOwnerAccountInput): Promise<{ company: CompanyRecord; user: CompanyUserRecord }> {
    const company: CompanyRecord = {
      id: input.companyId,
      name: input.companyName,
      createdAtIso: input.createdAtIso
    };
    const user: StoredUser = {
      id: input.userId,
      companyId: input.companyId,
      email: input.email,
      displayName: input.displayName,
      role: "OWNER",
      createdAtIso: input.createdAtIso,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt
    };

    this.companies.set(company.id, company);
    this.users.set(user.id, user);

    return Promise.resolve({
      company,
      user: toPublicUser(user)
    });
  }

  public createUser(input: CreateUserInput): Promise<CompanyUserRecord> {
    const user: StoredUser = {
      id: input.id,
      companyId: input.companyId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      createdAtIso: input.createdAtIso,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt
    };

    this.users.set(user.id, user);
    return Promise.resolve(toPublicUser(user));
  }

  public getCompanyById(companyId: string): Promise<CompanyRecord | null> {
    return Promise.resolve(this.companies.get(companyId) ?? null);
  }

  public getUserByEmail(email: string): Promise<StoredUser | null> {
    const found = [...this.users.values()].find((user) => user.email === email) ?? null;
    return Promise.resolve(found);
  }

  public listUsers(companyId: string): Promise<CompanyUserRecord[]> {
    return Promise.resolve(
      [...this.users.values()]
        .filter((user) => user.companyId === companyId)
        .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso))
        .map((user) => toPublicUser(user)),
    );
  }

  public createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const session = { ...input, revokedAtIso: input.revokedAtIso ?? null };
    this.sessions.set(input.id, session);
    return Promise.resolve(session);
  }

  public revokeSession(tokenHash: string, revokedAtIso: string): Promise<void> {
    const session = [...this.sessions.values()].find((entry) => entry.tokenHash === tokenHash) ?? null;
    if (session) {
      session.revokedAtIso = revokedAtIso;
      this.sessions.set(session.id, session);
    }
    return Promise.resolve();
  }

  public getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null> {
    const session = [...this.sessions.values()].find((entry) => entry.tokenHash === tokenHash) ?? null;
    if (!session || session.revokedAtIso) {
      return Promise.resolve(null);
    }
    const company = this.companies.get(session.companyId);
    const user = this.users.get(session.userId);
    if (!company || !user) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      session,
      company,
      user: toPublicUser(user)
    });
  }

  public createDrawing(input: CreateDrawingInput): Promise<DrawingRecord> {
    const drawing: DrawingRecord = {
      ...input,
      versionNumber: 1,
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null
    };
    this.drawings.set(drawing.id, drawing);
    this.drawingVersions.set(drawing.id, [
      {
        id: `${drawing.id}:1`,
        drawingId: drawing.id,
        companyId: drawing.companyId,
        versionNumber: 1,
        source: "CREATE",
        name: drawing.name,
        layout: drawing.layout,
        estimate: drawing.estimate,
        createdByUserId: drawing.createdByUserId,
        createdAtIso: drawing.createdAtIso
      }
    ]);
    return Promise.resolve(drawing);
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    return Promise.resolve(
      [...this.drawings.values()]
        .filter((drawing) => drawing.companyId === companyId)
        .filter((drawing) => {
          if (scope === "ACTIVE") {
            return !drawing.isArchived;
          }
          if (scope === "ARCHIVED") {
            return drawing.isArchived;
          }
          return true;
        })
        .sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso))
        .map(toDrawingSummary),
    );
  }

  public getDrawingById(drawingId: string, companyId: string): Promise<DrawingRecord | null> {
    const drawing = this.drawings.get(drawingId);
    if (!drawing || drawing.companyId !== companyId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(drawing);
  }

  public updateDrawing(input: UpdateDrawingInput): Promise<DrawingRecord | null> {
    const existing = this.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return Promise.resolve(null);
    }
    const updated: DrawingRecord = {
      ...existing,
      name: input.name,
      layout: input.layout,
      estimate: input.estimate,
      versionNumber: existing.versionNumber + 1,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.drawings.set(updated.id, updated);
    const versions = this.drawingVersions.get(updated.id) ?? [];
    versions.push({
      id: `${updated.id}:${updated.versionNumber}`,
      drawingId: updated.id,
      companyId: updated.companyId,
      versionNumber: updated.versionNumber,
      source: "UPDATE",
      name: updated.name,
      layout: updated.layout,
      estimate: updated.estimate,
      createdByUserId: input.updatedByUserId,
      createdAtIso: input.updatedAtIso
    });
    this.drawingVersions.set(updated.id, versions);
    return Promise.resolve(updated);
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): Promise<DrawingRecord | null> {
    const existing = this.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return Promise.resolve(null);
    }

    const updated: DrawingRecord = {
      ...existing,
      isArchived: input.archived,
      archivedAtIso: input.archived ? input.archivedAtIso : null,
      archivedByUserId: input.archived ? input.archivedByUserId : null,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.drawings.set(updated.id, updated);
    return Promise.resolve(updated);
  }

  public listDrawingVersions(drawingId: string, companyId: string): Promise<DrawingVersionRecord[]> {
    const versions = this.drawingVersions.get(drawingId) ?? [];
    return Promise.resolve(versions.filter((version) => version.companyId === companyId).slice().sort((a, b) => b.versionNumber - a.versionNumber));
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput): Promise<DrawingRecord | null> {
    const existing = this.drawings.get(input.drawingId);
    if (!existing || existing.companyId !== input.companyId) {
      return Promise.resolve(null);
    }
    const version = (this.drawingVersions.get(input.drawingId) ?? []).find((entry) => entry.versionNumber === input.versionNumber);
    if (!version) {
      return Promise.resolve(null);
    }
    const restored: DrawingRecord = {
      ...existing,
      name: version.name,
      layout: version.layout,
      estimate: version.estimate,
      versionNumber: existing.versionNumber + 1,
      updatedByUserId: input.restoredByUserId,
      updatedAtIso: input.restoredAtIso
    };
    this.drawings.set(restored.id, restored);
    const versions = this.drawingVersions.get(restored.id) ?? [];
    versions.push({
      id: `${restored.id}:${restored.versionNumber}`,
      drawingId: restored.id,
      companyId: restored.companyId,
      versionNumber: restored.versionNumber,
      source: "RESTORE",
      name: restored.name,
      layout: restored.layout,
      estimate: restored.estimate,
      createdByUserId: input.restoredByUserId,
      createdAtIso: input.restoredAtIso
    });
    this.drawingVersions.set(restored.id, versions);
    return Promise.resolve(restored);
  }

  public createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void> {
    this.passwordResetTokens.set(input.tokenHash, {
      ...input,
      consumedAtIso: null
    });
    return Promise.resolve();
  }

  public consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ): Promise<PasswordResetConsumption | null> {
    const token = this.passwordResetTokens.get(tokenHash);
    if (!token || token.consumedAtIso || new Date(token.expiresAtIso).getTime() <= Date.now()) {
      return Promise.resolve(null);
    }
    const user = this.users.get(token.userId);
    if (!user) {
      return Promise.resolve(null);
    }
    const company = this.companies.get(user.companyId);
    if (!company) {
      return Promise.resolve(null);
    }

    user.passwordHash = passwordHash;
    user.passwordSalt = passwordSalt;
    this.users.set(user.id, user);
    this.passwordResetTokens.set(tokenHash, { ...token, consumedAtIso });
    return Promise.resolve({
      user: toPublicUser(user),
      company
    });
  }

  public addAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const record: AuditLogRecord = { ...input };
    this.auditLog.unshift(record);
    return Promise.resolve(record);
  }

  public listAuditLog(companyId: string, limit = 100): Promise<AuditLogRecord[]> {
    return Promise.resolve(this.auditLog.filter((entry) => entry.companyId === companyId).slice(0, limit));
  }
}

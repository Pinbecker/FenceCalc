import type { AuditLogRecord, CompanyRecord } from "@fence-estimator/contracts";

import { toPublicUser } from "./shared.js";
import type { CreateAuditLogInput, CreatePasswordResetTokenInput, PasswordResetConsumption, StoredUser } from "./types.js";

export interface InMemoryPasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAtIso: string;
  expiresAtIso: string;
  consumedAtIso: string | null;
}

export interface InMemorySupportState {
  companies: Map<string, CompanyRecord>;
  users: Map<string, StoredUser>;
  auditLog: AuditLogRecord[];
  passwordResetTokens: Map<string, InMemoryPasswordResetTokenRecord>;
}

export class InMemorySupportStore {
  public constructor(private readonly state: InMemorySupportState) {}

  public pruneStaleRecords(nowIso: string, auditLogRetentionDays: number): void {
    const nowMs = new Date(nowIso).getTime();
    const retentionCutoffMs = nowMs - auditLogRetentionDays * 24 * 60 * 60 * 1000;

    for (const [tokenHash, token] of this.state.passwordResetTokens.entries()) {
      if (token.consumedAtIso || new Date(token.expiresAtIso).getTime() <= nowMs) {
        this.state.passwordResetTokens.delete(tokenHash);
      }
    }

    const retainedAuditLog = this.state.auditLog.filter((entry) => new Date(entry.createdAtIso).getTime() >= retentionCutoffMs);
    this.state.auditLog.splice(0, this.state.auditLog.length, ...retainedAuditLog);
  }

  public createPasswordResetToken(input: CreatePasswordResetTokenInput): void {
    this.state.passwordResetTokens.set(input.tokenHash, {
      ...input,
      consumedAtIso: null
    });
  }

  public consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ): PasswordResetConsumption | null {
    const token = this.state.passwordResetTokens.get(tokenHash);
    if (!token || token.consumedAtIso || new Date(token.expiresAtIso).getTime() <= Date.now()) {
      return null;
    }
    const user = this.state.users.get(token.userId);
    if (!user) {
      return null;
    }
    const company = this.state.companies.get(user.companyId);
    if (!company) {
      return null;
    }

    user.passwordHash = passwordHash;
    user.passwordSalt = passwordSalt;
    this.state.users.set(user.id, user);
    this.state.passwordResetTokens.set(tokenHash, { ...token, consumedAtIso });
    return {
      user: toPublicUser(user),
      company
    };
  }

  public addAuditLog(input: CreateAuditLogInput): AuditLogRecord {
    const record: AuditLogRecord = { ...input };
    this.state.auditLog.unshift(record);
    return record;
  }

  public listAuditLog(
    companyId: string,
    options:
      | number
      | {
          limit?: number;
          beforeCreatedAtIso?: string | null;
          fromCreatedAtIso?: string | null;
          toCreatedAtIso?: string | null;
          entityType?: AuditLogRecord["entityType"] | null;
          search?: string | null;
        } = {}
  ): AuditLogRecord[] {
    const normalizedOptions = typeof options === "number" ? { limit: options } : options;
    const limit = normalizedOptions.limit ?? 100;
    const beforeCreatedAtIso = normalizedOptions.beforeCreatedAtIso ?? null;
    const fromCreatedAtIso = normalizedOptions.fromCreatedAtIso ?? null;
    const toCreatedAtIso = normalizedOptions.toCreatedAtIso ?? null;
    const entityType = normalizedOptions.entityType ?? null;
    const search = normalizedOptions.search?.trim().toLowerCase() ?? "";

    return this.state.auditLog
      .filter((entry) => entry.companyId === companyId)
      .filter((entry) => beforeCreatedAtIso === null || entry.createdAtIso < beforeCreatedAtIso)
      .filter((entry) => fromCreatedAtIso === null || entry.createdAtIso >= fromCreatedAtIso)
      .filter((entry) => toCreatedAtIso === null || entry.createdAtIso <= toCreatedAtIso)
      .filter((entry) => entityType === null || entry.entityType === entityType)
      .filter((entry) => {
        if (!search) {
          return true;
        }

        return (
          entry.summary.toLowerCase().includes(search) ||
          entry.action.toLowerCase().includes(search) ||
          entry.entityType.toLowerCase().includes(search)
        );
      })
      .slice(0, limit);
  }
}

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

  public listAuditLog(companyId: string, limit = 100): AuditLogRecord[] {
    return this.state.auditLog.filter((entry) => entry.companyId === companyId).slice(0, limit);
  }
}

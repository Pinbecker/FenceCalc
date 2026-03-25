import Database from "better-sqlite3";
import type { AuditLogRecord } from "@fence-estimator/contracts";

import type { AuditLogRow, CompanyRow, PasswordResetTokenRow, UserRow } from "./shared.js";
import { toAuditLog, toCompany, toPublicUser } from "./shared.js";
import type { CreateAuditLogInput, CreatePasswordResetTokenInput, PasswordResetConsumption } from "./types.js";

export class SqliteSupportStore {
  public constructor(private readonly database: Database.Database) {}

  public pruneStaleRecords(nowIso: string, auditLogRetentionDays: number): void {
    const nowMs = new Date(nowIso).getTime();
    const retentionCutoffIso = new Date(nowMs - auditLogRetentionDays * 24 * 60 * 60 * 1000).toISOString();

    this.database.prepare("DELETE FROM audit_log WHERE created_at_iso < ?").run(retentionCutoffIso);
    this.database
      .prepare("DELETE FROM password_reset_tokens WHERE consumed_at_iso IS NOT NULL OR expires_at_iso <= ?")
      .run(nowIso);
  }

  public createPasswordResetToken(input: CreatePasswordResetTokenInput): void {
    this.database
      .prepare(
        `
          INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at_iso, expires_at_iso, consumed_at_iso)
          VALUES (?, ?, ?, ?, ?, NULL)
        `,
      )
      .run(input.id, input.userId, input.tokenHash, input.createdAtIso, input.expiresAtIso);
  }

  public consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ): PasswordResetConsumption | null {
    const token = this.database
      .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?")
      .get(tokenHash) as PasswordResetTokenRow | undefined;
    if (!token || token.consumed_at_iso || new Date(token.expires_at_iso).getTime() <= Date.now()) {
      return null;
    }

    const user = this.database.prepare("SELECT * FROM users WHERE id = ?").get(token.user_id) as UserRow | undefined;
    if (!user) {
      return null;
    }
    const company = this.database.prepare("SELECT * FROM companies WHERE id = ?").get(user.company_id) as CompanyRow | undefined;
    if (!company) {
      return null;
    }

    const consume = this.database.transaction(() => {
      this.database.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(passwordHash, passwordSalt, token.user_id);
      this.database.prepare("UPDATE password_reset_tokens SET consumed_at_iso = ? WHERE token_hash = ?").run(consumedAtIso, tokenHash);
    });
    consume();

    return {
      user: toPublicUser(user),
      company: toCompany(company)
    };
  }

  public addAuditLog(input: CreateAuditLogInput): AuditLogRecord {
    this.database
      .prepare(
        `
          INSERT INTO audit_log (
            id, company_id, actor_user_id, entity_type, entity_id, action, summary, metadata_json, created_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.id,
        input.companyId,
        input.actorUserId,
        input.entityType,
        input.entityId,
        input.action,
        input.summary,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdAtIso,
      );
    return { ...input };
  }

  public listAuditLog(companyId: string, options: number | { limit?: number; beforeCreatedAtIso?: string | null } = {}): AuditLogRecord[] {
    const normalizedOptions = typeof options === "number" ? { limit: options } : options;
    const limit = normalizedOptions.limit ?? 100;
    const beforeCreatedAtIso = normalizedOptions.beforeCreatedAtIso ?? null;
    const rows = (beforeCreatedAtIso
      ? this.database
          .prepare(
            "SELECT * FROM audit_log WHERE company_id = ? AND created_at_iso < ? ORDER BY created_at_iso DESC LIMIT ?",
          )
          .all(companyId, beforeCreatedAtIso, limit)
      : this.database
          .prepare("SELECT * FROM audit_log WHERE company_id = ? ORDER BY created_at_iso DESC LIMIT ?")
          .all(companyId, limit)) as AuditLogRow[];
    return rows.map((row) => toAuditLog(row));
  }
}

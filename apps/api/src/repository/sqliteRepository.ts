import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import type {
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CompanyUserRole,
  DrawingRecord,
  DrawingVersionRecord,
  EstimateResult,
  LayoutModel
} from "@fence-estimator/contracts";

import {
  type AuditLogRow,
  type CompanyRow,
  type DrawingRow,
  type DrawingVersionRow,
  type PasswordResetTokenRow,
  type UserRow,
  toAuditLog,
  toCompany,
  toDrawing,
  toDrawingSummary,
  toDrawingVersion,
  toPublicUser
} from "./shared.js";
import { migrateSqliteDatabase } from "./sqliteSchema.js";
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

export class SqliteAppRepository implements AppRepository {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    migrateSqliteDatabase(this.database);
  }

  public getUserCount(): Promise<number> {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return Promise.resolve(row.count);
  }

  public createOwnerAccount(input: CreateOwnerAccountInput): Promise<{ company: CompanyRecord; user: CompanyUserRecord }> {
    const insert = this.database.transaction(() => {
      this.database
        .prepare("INSERT INTO companies (id, name, created_at_iso) VALUES (?, ?, ?)")
        .run(input.companyId, input.companyName, input.createdAtIso);
      this.database
        .prepare(
          `
            INSERT INTO users (
              id, company_id, email, display_name, role, password_hash, password_salt, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(input.userId, input.companyId, input.email, input.displayName, "OWNER", input.passwordHash, input.passwordSalt, input.createdAtIso);
    });
    insert();

    return Promise.resolve({
      company: {
        id: input.companyId,
        name: input.companyName,
        createdAtIso: input.createdAtIso
      },
      user: {
        id: input.userId,
        companyId: input.companyId,
        email: input.email,
        displayName: input.displayName,
        role: "OWNER",
        createdAtIso: input.createdAtIso
      }
    });
  }

  public createUser(input: CreateUserInput): Promise<CompanyUserRecord> {
    this.database
      .prepare(
        `
          INSERT INTO users (
            id, company_id, email, display_name, role, password_hash, password_salt, created_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.id,
        input.companyId,
        input.email,
        input.displayName,
        input.role,
        input.passwordHash,
        input.passwordSalt,
        input.createdAtIso,
      );

    return Promise.resolve({
      id: input.id,
      companyId: input.companyId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      createdAtIso: input.createdAtIso
    });
  }

  public getUserByEmail(email: string): Promise<StoredUser | null> {
    const row = this.database.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...toPublicUser(row),
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt
    });
  }

  public listUsers(companyId: string): Promise<CompanyUserRecord[]> {
    const rows = this.database
      .prepare("SELECT * FROM users WHERE company_id = ? ORDER BY created_at_iso ASC")
      .all(companyId) as UserRow[];
    return Promise.resolve(rows.map((row) => toPublicUser(row)));
  }

  public getCompanyById(companyId: string): Promise<CompanyRecord | null> {
    const row = this.database.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as CompanyRow | undefined;
    return Promise.resolve(row ? toCompany(row) : null);
  }

  public createSession(input: CreateSessionInput): Promise<SessionRecord> {
    this.database
      .prepare(
        `
          INSERT INTO sessions (id, company_id, user_id, token_hash, created_at_iso, expires_at_iso, revoked_at_iso)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.id,
        input.companyId,
        input.userId,
        input.tokenHash,
        input.createdAtIso,
        input.expiresAtIso,
        input.revokedAtIso ?? null,
      );
    return Promise.resolve({ ...input, revokedAtIso: input.revokedAtIso ?? null });
  }

  public revokeSession(tokenHash: string, revokedAtIso: string): Promise<void> {
    this.database.prepare("UPDATE sessions SET revoked_at_iso = ? WHERE token_hash = ?").run(revokedAtIso, tokenHash);
    return Promise.resolve();
  }

  public getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null> {
    const row = this.database
      .prepare(
        `
          SELECT
            s.id as session_id,
            s.company_id as session_company_id,
            s.user_id as session_user_id,
            s.token_hash as session_token_hash,
            s.created_at_iso as session_created_at_iso,
            s.expires_at_iso as session_expires_at_iso,
            s.revoked_at_iso as session_revoked_at_iso,
            c.id as company_id,
            c.name as company_name,
            c.created_at_iso as company_created_at_iso,
            u.id as user_id,
            u.company_id as user_company_id,
            u.email as user_email,
            u.display_name as user_display_name,
            u.role as user_role,
            u.created_at_iso as user_created_at_iso
          FROM sessions s
          INNER JOIN companies c ON c.id = s.company_id
          INNER JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?
        `,
      )
      .get(tokenHash) as
      | {
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
          user_role: CompanyUserRole;
          user_created_at_iso: string;
        }
      | undefined;

    if (!row || row.session_revoked_at_iso) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      session: {
        id: row.session_id,
        companyId: row.session_company_id,
        userId: row.session_user_id,
        tokenHash: row.session_token_hash,
        createdAtIso: row.session_created_at_iso,
        expiresAtIso: row.session_expires_at_iso,
        revokedAtIso: row.session_revoked_at_iso
      },
      company: {
        id: row.company_id,
        name: row.company_name,
        createdAtIso: row.company_created_at_iso
      },
      user: {
        id: row.user_id,
        companyId: row.user_company_id,
        email: row.user_email,
        displayName: row.user_display_name,
        role: row.user_role,
        createdAtIso: row.user_created_at_iso
      }
    });
  }

  public createDrawing(input: CreateDrawingInput): Promise<DrawingRecord> {
    const insert = this.database.transaction(() => {
      this.database
        .prepare(
          `
            INSERT INTO drawings (
              id, company_id, name, layout_json, estimate_json, version_number, is_archived, archived_at_iso, archived_by_user_id,
              created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          input.id,
          input.companyId,
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          1,
          0,
          null,
          null,
          input.createdByUserId,
          input.updatedByUserId,
          input.createdAtIso,
          input.updatedAtIso,
        );
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, version_number, source, name, layout_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          `${input.id}:1`,
          input.id,
          input.companyId,
          1,
          "CREATE",
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          input.createdByUserId,
          input.createdAtIso,
        );
    });
    insert();
    return Promise.resolve({
      ...input,
      versionNumber: 1,
      isArchived: false,
      archivedAtIso: null,
      archivedByUserId: null
    });
  }

  public listDrawings(companyId: string, scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    const whereClause = scope === "ACTIVE" ? "AND is_archived = 0" : scope === "ARCHIVED" ? "AND is_archived = 1" : "";
    const rows = this.database
      .prepare(`SELECT * FROM drawings WHERE company_id = ? ${whereClause} ORDER BY updated_at_iso DESC`)
      .all(companyId) as DrawingRow[];
    return Promise.resolve(rows.map((row) => toDrawingSummary(toDrawing(row))));
  }

  public getDrawingById(drawingId: string, companyId: string): Promise<DrawingRecord | null> {
    const row = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(drawingId, companyId) as DrawingRow | undefined;
    return Promise.resolve(row ? toDrawing(row) : null);
  }

  public updateDrawing(input: UpdateDrawingInput): Promise<DrawingRecord | null> {
    const existing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return Promise.resolve(null);
    }

    const current = toDrawing(existing);
    const nextVersionNumber = current.versionNumber + 1;
    const update = this.database.transaction(() => {
      this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, layout_json = ?, estimate_json = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          nextVersionNumber,
          input.updatedByUserId,
          input.updatedAtIso,
          input.drawingId,
          input.companyId,
        );
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, version_number, source, name, layout_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          `${input.drawingId}:${nextVersionNumber}`,
          input.drawingId,
          input.companyId,
          nextVersionNumber,
          "UPDATE",
          input.name,
          JSON.stringify(input.layout),
          JSON.stringify(input.estimate),
          input.updatedByUserId,
          input.updatedAtIso,
        );
    });
    update();

    return Promise.resolve({
      ...current,
      name: input.name,
      layout: input.layout,
      estimate: input.estimate,
      versionNumber: nextVersionNumber,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    });
  }

  public setDrawingArchivedState(input: SetDrawingArchivedStateInput): Promise<DrawingRecord | null> {
    const existing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return Promise.resolve(null);
    }

    this.database
      .prepare(
        `
          UPDATE drawings
          SET is_archived = ?, archived_at_iso = ?, archived_by_user_id = ?, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `,
      )
      .run(
        input.archived ? 1 : 0,
        input.archived ? input.archivedAtIso : null,
        input.archived ? input.archivedByUserId : null,
        input.updatedByUserId,
        input.updatedAtIso,
        input.drawingId,
        input.companyId,
      );

    return Promise.resolve({
      ...toDrawing(existing),
      isArchived: input.archived,
      archivedAtIso: input.archived ? input.archivedAtIso : null,
      archivedByUserId: input.archived ? input.archivedByUserId : null,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    });
  }

  public listDrawingVersions(drawingId: string, companyId: string): Promise<DrawingVersionRecord[]> {
    const rows = this.database
      .prepare(
        `
          SELECT dv.*
          FROM drawing_versions dv
          INNER JOIN drawings d ON d.id = dv.drawing_id
          WHERE dv.drawing_id = ? AND dv.company_id = ? AND d.company_id = ?
          ORDER BY dv.version_number DESC
        `,
      )
      .all(drawingId, companyId, companyId) as DrawingVersionRow[];
    return Promise.resolve(rows.map((row) => toDrawingVersion(row)));
  }

  public restoreDrawingVersion(input: RestoreDrawingVersionInput): Promise<DrawingRecord | null> {
    const existing = this.database
      .prepare("SELECT * FROM drawings WHERE id = ? AND company_id = ?")
      .get(input.drawingId, input.companyId) as DrawingRow | undefined;
    if (!existing) {
      return Promise.resolve(null);
    }

    const version = this.database
      .prepare("SELECT * FROM drawing_versions WHERE drawing_id = ? AND company_id = ? AND version_number = ?")
      .get(input.drawingId, input.companyId, input.versionNumber) as DrawingVersionRow | undefined;
    if (!version) {
      return Promise.resolve(null);
    }

    const current = toDrawing(existing);
    const restoredVersionNumber = current.versionNumber + 1;
    const restoredLayout = JSON.parse(version.layout_json) as LayoutModel;
    const restoredEstimate = JSON.parse(version.estimate_json) as EstimateResult;

    const restore = this.database.transaction(() => {
      this.database
        .prepare(
          `
            UPDATE drawings
            SET name = ?, layout_json = ?, estimate_json = ?, version_number = ?, updated_by_user_id = ?, updated_at_iso = ?
            WHERE id = ? AND company_id = ?
          `,
        )
        .run(
          version.name,
          version.layout_json,
          version.estimate_json,
          restoredVersionNumber,
          input.restoredByUserId,
          input.restoredAtIso,
          input.drawingId,
          input.companyId,
        );
      this.database
        .prepare(
          `
            INSERT INTO drawing_versions (
              id, drawing_id, company_id, version_number, source, name, layout_json, estimate_json, created_by_user_id, created_at_iso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          `${input.drawingId}:${restoredVersionNumber}`,
          input.drawingId,
          input.companyId,
          restoredVersionNumber,
          "RESTORE",
          version.name,
          version.layout_json,
          version.estimate_json,
          input.restoredByUserId,
          input.restoredAtIso,
        );
    });
    restore();

    return Promise.resolve({
      ...current,
      name: version.name,
      layout: restoredLayout,
      estimate: restoredEstimate,
      versionNumber: restoredVersionNumber,
      updatedByUserId: input.restoredByUserId,
      updatedAtIso: input.restoredAtIso
    });
  }

  public createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void> {
    this.database
      .prepare(
        `
          INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at_iso, expires_at_iso, consumed_at_iso)
          VALUES (?, ?, ?, ?, ?, NULL)
        `,
      )
      .run(input.id, input.userId, input.tokenHash, input.createdAtIso, input.expiresAtIso);
    return Promise.resolve();
  }

  public consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ): Promise<PasswordResetConsumption | null> {
    const token = this.database
      .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?")
      .get(tokenHash) as PasswordResetTokenRow | undefined;
    if (!token || token.consumed_at_iso || new Date(token.expires_at_iso).getTime() <= Date.now()) {
      return Promise.resolve(null);
    }

    const user = this.database.prepare("SELECT * FROM users WHERE id = ?").get(token.user_id) as UserRow | undefined;
    if (!user) {
      return Promise.resolve(null);
    }
    const company = this.database.prepare("SELECT * FROM companies WHERE id = ?").get(user.company_id) as CompanyRow | undefined;
    if (!company) {
      return Promise.resolve(null);
    }

    const consume = this.database.transaction(() => {
      this.database.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(passwordHash, passwordSalt, token.user_id);
      this.database.prepare("UPDATE password_reset_tokens SET consumed_at_iso = ? WHERE token_hash = ?").run(consumedAtIso, tokenHash);
    });
    consume();

    return Promise.resolve({
      user: toPublicUser(user),
      company: toCompany(company)
    });
  }

  public addAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
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
    return Promise.resolve({ ...input });
  }

  public listAuditLog(companyId: string, limit = 100): Promise<AuditLogRecord[]> {
    const rows = this.database
      .prepare("SELECT * FROM audit_log WHERE company_id = ? ORDER BY created_at_iso DESC LIMIT ?")
      .all(companyId, limit) as AuditLogRow[];
    return Promise.resolve(rows.map((row) => toAuditLog(row)));
  }
}

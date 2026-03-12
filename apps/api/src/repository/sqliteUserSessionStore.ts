import Database from "better-sqlite3";
import type { CompanyRecord, CompanyUserRecord, CompanyUserRole } from "@fence-estimator/contracts";

import type { CompanyRow, UserRow } from "./shared.js";
import { toCompany, toPublicUser } from "./shared.js";
import type {
  AuthenticatedSession,
  BootstrapOwnerAccountInput,
  CreateSessionInput,
  CreateUserInput,
  SessionRecord,
  StoredUser
} from "./types.js";

export class SqliteUserSessionStore {
  public constructor(private readonly database: Database.Database) {}

  public getUserCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return row.count;
  }

  public bootstrapOwnerAccount(input: BootstrapOwnerAccountInput): { company: CompanyRecord; user: CompanyUserRecord } | null {
    let account: { company: CompanyRecord; user: CompanyUserRecord } | null = null;

    try {
      this.database.exec("BEGIN IMMEDIATE");
      if (this.getUserCount() > 0) {
        this.database.exec("ROLLBACK");
        return null;
      }

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
      this.database.exec("COMMIT");

      account = {
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
      };
    } catch (error) {
      if (this.database.inTransaction) {
        this.database.exec("ROLLBACK");
      }
      throw error;
    }

    return account;
  }

  public createUser(input: CreateUserInput): CompanyUserRecord {
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

    return {
      id: input.id,
      companyId: input.companyId,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      createdAtIso: input.createdAtIso
    };
  }

  public getUserByEmail(email: string): StoredUser | null {
    const row = this.database.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!row) {
      return null;
    }

    return {
      ...toPublicUser(row),
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt
    };
  }

  public getUserById(userId: string, companyId: string): CompanyUserRecord | null {
    const row = this.database
      .prepare("SELECT * FROM users WHERE id = ? AND company_id = ?")
      .get(userId, companyId) as UserRow | undefined;
    return row ? toPublicUser(row) : null;
  }

  public listUsers(companyId: string): CompanyUserRecord[] {
    const rows = this.database
      .prepare("SELECT * FROM users WHERE company_id = ? ORDER BY created_at_iso ASC")
      .all(companyId) as UserRow[];
    return rows.map((row) => toPublicUser(row));
  }

  public updateUserPassword(userId: string, companyId: string, passwordHash: string, passwordSalt: string): void {
    this.database
      .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ? AND company_id = ?")
      .run(passwordHash, passwordSalt, userId, companyId);
  }

  public getCompanyById(companyId: string): CompanyRecord | null {
    const row = this.database.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as CompanyRow | undefined;
    return row ? toCompany(row) : null;
  }

  public createSession(input: CreateSessionInput): SessionRecord {
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
    return { ...input, revokedAtIso: input.revokedAtIso ?? null };
  }

  public revokeSession(tokenHash: string, revokedAtIso: string): void {
    this.database.prepare("UPDATE sessions SET revoked_at_iso = ? WHERE token_hash = ?").run(revokedAtIso, tokenHash);
  }

  public revokeSessionsForUser(userId: string, companyId: string, revokedAtIso: string): void {
    this.database
      .prepare("UPDATE sessions SET revoked_at_iso = ? WHERE user_id = ? AND company_id = ? AND revoked_at_iso IS NULL")
      .run(revokedAtIso, userId, companyId);
  }

  public getAuthenticatedSession(tokenHash: string): AuthenticatedSession | null {
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
      return null;
    }

    return {
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
    };
  }
}

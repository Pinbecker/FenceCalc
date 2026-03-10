import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import type {
  CompanyRecord,
  CompanyUserRecord,
  CompanyUserRole,
  DrawingRecord,
  DrawingSummary,
  EstimateResult,
  LayoutModel
} from "@fence-estimator/contracts";

interface StoredUser extends CompanyUserRecord {
  passwordHash: string;
  passwordSalt: string;
}

export interface SessionRecord {
  id: string;
  companyId: string;
  userId: string;
  tokenHash: string;
  createdAtIso: string;
  expiresAtIso: string;
}

export interface CreateOwnerAccountInput {
  companyId: string;
  companyName: string;
  userId: string;
  displayName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAtIso: string;
}

export interface CreateSessionInput {
  id: string;
  companyId: string;
  userId: string;
  tokenHash: string;
  createdAtIso: string;
  expiresAtIso: string;
}

export interface CreateDrawingInput {
  id: string;
  companyId: string;
  name: string;
  layout: LayoutModel;
  estimate: EstimateResult;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateDrawingInput {
  drawingId: string;
  companyId: string;
  name: string;
  layout: LayoutModel;
  estimate: EstimateResult;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface DrawingWithMembership {
  drawing: DrawingRecord;
  company: CompanyRecord;
  user: CompanyUserRecord;
}

export interface AuthenticatedSession {
  session: SessionRecord;
  company: CompanyRecord;
  user: CompanyUserRecord;
}

export interface AppRepository {
  createOwnerAccount(input: CreateOwnerAccountInput): Promise<{ company: CompanyRecord; user: CompanyUserRecord }>;
  getCompanyById(companyId: string): Promise<CompanyRecord | null>;
  getUserByEmail(email: string): Promise<StoredUser | null>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null>;
  createDrawing(input: CreateDrawingInput): Promise<DrawingRecord>;
  listDrawings(companyId: string): Promise<DrawingSummary[]>;
  getDrawingById(drawingId: string, companyId: string): Promise<DrawingRecord | null>;
  updateDrawing(input: UpdateDrawingInput): Promise<DrawingRecord | null>;
}

export class InMemoryAppRepository implements AppRepository {
  private readonly companies = new Map<string, CompanyRecord>();
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly drawings = new Map<string, DrawingRecord>();

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

  public getCompanyById(companyId: string): Promise<CompanyRecord | null> {
    return Promise.resolve(this.companies.get(companyId) ?? null);
  }

  public getUserByEmail(email: string): Promise<StoredUser | null> {
    const found = [...this.users.values()].find((user) => user.email === email) ?? null;
    return Promise.resolve(found);
  }

  public createSession(input: CreateSessionInput): Promise<SessionRecord> {
    this.sessions.set(input.id, input);
    return Promise.resolve(input);
  }

  public getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null> {
    const session = [...this.sessions.values()].find((entry) => entry.tokenHash === tokenHash) ?? null;
    if (!session) {
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
    const drawing: DrawingRecord = { ...input };
    this.drawings.set(drawing.id, drawing);
    return Promise.resolve(drawing);
  }

  public listDrawings(companyId: string): Promise<DrawingSummary[]> {
    return Promise.resolve(
      [...this.drawings.values()]
        .filter((drawing) => drawing.companyId === companyId)
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
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    };
    this.drawings.set(updated.id, updated);
    return Promise.resolve(updated);
  }
}

interface CompanyRow {
  id: string;
  name: string;
  created_at_iso: string;
}

interface UserRow {
  id: string;
  company_id: string;
  email: string;
  display_name: string;
  role: CompanyUserRole;
  password_hash: string;
  password_salt: string;
  created_at_iso: string;
}

interface DrawingRow {
  id: string;
  company_id: string;
  name: string;
  layout_json: string;
  estimate_json: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at_iso: string;
  updated_at_iso: string;
}

function toPublicUser(user: StoredUser | UserRow): CompanyUserRecord {
  if ("companyId" in user) {
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAtIso: user.createdAtIso
    };
  }
  return {
    id: user.id,
    companyId: user.company_id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    createdAtIso: user.created_at_iso
  };
}

function toCompany(row: CompanyRow): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    createdAtIso: row.created_at_iso
  };
}

function toDrawing(row: DrawingRow): DrawingRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    layout: JSON.parse(row.layout_json) as LayoutModel,
    estimate: JSON.parse(row.estimate_json) as EstimateResult,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAtIso: row.created_at_iso,
    updatedAtIso: row.updated_at_iso
  };
}

function toDrawingSummary(drawing: DrawingRecord): DrawingSummary {
  return {
    id: drawing.id,
    companyId: drawing.companyId,
    name: drawing.name,
    createdByUserId: drawing.createdByUserId,
    updatedByUserId: drawing.updatedByUserId,
    createdAtIso: drawing.createdAtIso,
    updatedAtIso: drawing.updatedAtIso
  };
}

export class SqliteAppRepository implements AppRepository {
  private readonly database: Database.Database;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at_iso TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at_iso TEXT NOT NULL,
        expires_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS drawings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        layout_json TEXT NOT NULL,
        estimate_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id),
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_drawings_company_updated_at
      ON drawings(company_id, updated_at_iso DESC);
    `);
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

  public getCompanyById(companyId: string): Promise<CompanyRecord | null> {
    const row = this.database.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as CompanyRow | undefined;
    return Promise.resolve(row ? toCompany(row) : null);
  }

  public createSession(input: CreateSessionInput): Promise<SessionRecord> {
    this.database
      .prepare(
        `
          INSERT INTO sessions (id, company_id, user_id, token_hash, created_at_iso, expires_at_iso)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(input.id, input.companyId, input.userId, input.tokenHash, input.createdAtIso, input.expiresAtIso);
    return Promise.resolve(input);
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

    if (!row) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      session: {
        id: row.session_id,
        companyId: row.session_company_id,
        userId: row.session_user_id,
        tokenHash: row.session_token_hash,
        createdAtIso: row.session_created_at_iso,
        expiresAtIso: row.session_expires_at_iso
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
    this.database
      .prepare(
        `
          INSERT INTO drawings (
            id, company_id, name, layout_json, estimate_json, created_by_user_id, updated_by_user_id, created_at_iso, updated_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.id,
        input.companyId,
        input.name,
        JSON.stringify(input.layout),
        JSON.stringify(input.estimate),
        input.createdByUserId,
        input.updatedByUserId,
        input.createdAtIso,
        input.updatedAtIso,
      );
    return Promise.resolve({ ...input });
  }

  public listDrawings(companyId: string): Promise<DrawingSummary[]> {
    const rows = this.database
      .prepare("SELECT * FROM drawings WHERE company_id = ? ORDER BY updated_at_iso DESC")
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

    this.database
      .prepare(
        `
          UPDATE drawings
          SET name = ?, layout_json = ?, estimate_json = ?, updated_by_user_id = ?, updated_at_iso = ?
          WHERE id = ? AND company_id = ?
        `,
      )
      .run(
        input.name,
        JSON.stringify(input.layout),
        JSON.stringify(input.estimate),
        input.updatedByUserId,
        input.updatedAtIso,
        input.drawingId,
        input.companyId,
      );

    return Promise.resolve({
      ...toDrawing(existing),
      name: input.name,
      layout: input.layout,
      estimate: input.estimate,
      updatedByUserId: input.updatedByUserId,
      updatedAtIso: input.updatedAtIso
    });
  }
}

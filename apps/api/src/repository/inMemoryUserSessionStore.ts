import type { CompanyRecord, CompanyUserRecord } from "@fence-estimator/contracts";

import { toPublicUser } from "./shared.js";
import type {
  AuthenticatedSession,
  BootstrapOwnerAccountInput,
  CreateSessionInput,
  CreateUserInput,
  SessionRecord,
  StoredUser
} from "./types.js";

export interface InMemoryUserSessionState {
  companies: Map<string, CompanyRecord>;
  users: Map<string, StoredUser>;
  sessions: Map<string, SessionRecord>;
}

export class InMemoryUserSessionStore {
  public constructor(private readonly state: InMemoryUserSessionState) {}

  public getUserCount(): number {
    return this.state.users.size;
  }

  public bootstrapOwnerAccount(input: BootstrapOwnerAccountInput): { company: CompanyRecord; user: CompanyUserRecord } | null {
    if (this.state.users.size > 0) {
      return null;
    }

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

    this.state.companies.set(company.id, company);
    this.state.users.set(user.id, user);

    return {
      company,
      user: toPublicUser(user)
    };
  }

  public createUser(input: CreateUserInput): CompanyUserRecord {
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

    this.state.users.set(user.id, user);
    return toPublicUser(user);
  }

  public getCompanyById(companyId: string): CompanyRecord | null {
    return this.state.companies.get(companyId) ?? null;
  }

  public getUserById(userId: string, companyId: string): CompanyUserRecord | null {
    const user = this.state.users.get(userId);
    if (!user || user.companyId !== companyId) {
      return null;
    }
    return toPublicUser(user);
  }

  public getUserByEmail(email: string): StoredUser | null {
    return [...this.state.users.values()].find((user) => user.email === email) ?? null;
  }

  public listUsers(companyId: string): CompanyUserRecord[] {
    return [...this.state.users.values()]
      .filter((user) => user.companyId === companyId)
      .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso))
      .map((user) => toPublicUser(user));
  }

  public updateUserPassword(userId: string, companyId: string, passwordHash: string, passwordSalt: string): void {
    const user = this.state.users.get(userId);
    if (!user || user.companyId !== companyId) {
      return;
    }
    user.passwordHash = passwordHash;
    user.passwordSalt = passwordSalt;
    this.state.users.set(user.id, user);
  }

  public createSession(input: CreateSessionInput): SessionRecord {
    const session = { ...input, revokedAtIso: input.revokedAtIso ?? null };
    this.state.sessions.set(input.id, session);
    return session;
  }

  public revokeSession(tokenHash: string, revokedAtIso: string): void {
    const session = [...this.state.sessions.values()].find((entry) => entry.tokenHash === tokenHash) ?? null;
    if (session) {
      session.revokedAtIso = revokedAtIso;
      this.state.sessions.set(session.id, session);
    }
  }

  public revokeSessionsForUser(userId: string, companyId: string, revokedAtIso: string): void {
    for (const session of this.state.sessions.values()) {
      if (session.userId !== userId || session.companyId !== companyId || session.revokedAtIso) {
        continue;
      }
      session.revokedAtIso = revokedAtIso;
      this.state.sessions.set(session.id, session);
    }
  }

  public getAuthenticatedSession(tokenHash: string): AuthenticatedSession | null {
    const session = [...this.state.sessions.values()].find((entry) => entry.tokenHash === tokenHash) ?? null;
    if (!session || session.revokedAtIso) {
      return null;
    }
    const company = this.state.companies.get(session.companyId);
    const user = this.state.users.get(session.userId);
    if (!company || !user) {
      return null;
    }
    return {
      session,
      company,
      user: toPublicUser(user)
    };
  }
}

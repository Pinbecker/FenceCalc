import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CompanyUserRole,
  DrawingRecord,
  DrawingSummary,
  DrawingVersionRecord,
  EstimateResult,
  LayoutModel
} from "@fence-estimator/contracts";

export interface StoredUser extends CompanyUserRecord {
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
  revokedAtIso?: string | null;
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
  revokedAtIso?: string | null;
}

export interface CreateUserInput {
  id: string;
  companyId: string;
  displayName: string;
  email: string;
  role: Exclude<CompanyUserRole, "OWNER">;
  passwordHash: string;
  passwordSalt: string;
  createdAtIso: string;
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

export interface SetDrawingArchivedStateInput {
  drawingId: string;
  companyId: string;
  archived: boolean;
  archivedAtIso: string | null;
  archivedByUserId: string | null;
  updatedAtIso: string;
  updatedByUserId: string;
}

export interface RestoreDrawingVersionInput {
  drawingId: string;
  companyId: string;
  versionNumber: number;
  restoredByUserId: string;
  restoredAtIso: string;
}

export interface CreateAuditLogInput {
  id: string;
  companyId: string;
  actorUserId: string | null;
  entityType: AuditEntityType;
  entityId: string | null;
  action: AuditAction;
  summary: string;
  createdAtIso: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CreatePasswordResetTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  createdAtIso: string;
  expiresAtIso: string;
}

export interface PasswordResetConsumption {
  user: CompanyUserRecord;
  company: CompanyRecord;
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
  getUserCount(): Promise<number>;
  createOwnerAccount(input: CreateOwnerAccountInput): Promise<{ company: CompanyRecord; user: CompanyUserRecord }>;
  createUser(input: CreateUserInput): Promise<CompanyUserRecord>;
  getCompanyById(companyId: string): Promise<CompanyRecord | null>;
  getUserByEmail(email: string): Promise<StoredUser | null>;
  listUsers(companyId: string): Promise<CompanyUserRecord[]>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  revokeSession(tokenHash: string, revokedAtIso: string): Promise<void>;
  getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null>;
  createDrawing(input: CreateDrawingInput): Promise<DrawingRecord>;
  listDrawings(companyId: string, scope?: "ALL" | "ACTIVE" | "ARCHIVED"): Promise<DrawingSummary[]>;
  getDrawingById(drawingId: string, companyId: string): Promise<DrawingRecord | null>;
  updateDrawing(input: UpdateDrawingInput): Promise<DrawingRecord | null>;
  setDrawingArchivedState(input: SetDrawingArchivedStateInput): Promise<DrawingRecord | null>;
  listDrawingVersions(drawingId: string, companyId: string): Promise<DrawingVersionRecord[]>;
  restoreDrawingVersion(input: RestoreDrawingVersionInput): Promise<DrawingRecord | null>;
  createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void>;
  consumePasswordResetToken(tokenHash: string, passwordHash: string, passwordSalt: string, consumedAtIso: string): Promise<PasswordResetConsumption | null>;
  addAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  listAuditLog(companyId: string, limit?: number): Promise<AuditLogRecord[]>;
}

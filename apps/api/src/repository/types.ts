import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CustomerRecord,
  CustomerSummary,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingRevisionSummary,
  DrawingSummary,
  EstimateResult,
  LayoutModel,
  PricingConfigRecord,
  ProjectRecord,
  ProjectStatus,
  ProjectSummary,
  UserRole,
} from "@fence-estimator/contracts";

// -----------------------------------------------------------------------------
// Identity
// -----------------------------------------------------------------------------

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

export interface AuthenticatedSession {
  session: SessionRecord;
  company: CompanyRecord;
  user: CompanyUserRecord;
}

export interface BootstrapOwnerAccountInput {
  companyId: string;
  companyName: string;
  userId: string;
  displayName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAtIso: string;
}

export interface CreateUserInput {
  id: string;
  companyId: string;
  displayName: string;
  email: string;
  role: UserRole;
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

// -----------------------------------------------------------------------------
// Customers
// -----------------------------------------------------------------------------

export type ScopeFilter = "ALL" | "ACTIVE" | "ARCHIVED";

export interface CreateCustomerInput {
  id: string;
  companyId: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  siteAddress: string | null;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateCustomerInput {
  customerId: string;
  companyId: string;
  name?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  siteAddress?: string | null;
  notes?: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetCustomerArchivedStateInput {
  customerId: string;
  companyId: string;
  archived: boolean;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface DeleteCustomerInput {
  customerId: string;
  companyId: string;
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export interface CreateProjectInput {
  id: string;
  companyId: string;
  customerId: string;
  name: string;
  status: ProjectStatus;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateProjectInput {
  projectId: string;
  companyId: string;
  name?: string;
  notes?: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetProjectStatusInput {
  projectId: string;
  companyId: string;
  status: ProjectStatus;
  statusChangedAtIso: string;
  statusChangedByUserId: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetProjectArchivedStateInput {
  projectId: string;
  companyId: string;
  archived: boolean;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface DeleteProjectInput {
  projectId: string;
  companyId: string;
}

// -----------------------------------------------------------------------------
// Drawings & revisions
// -----------------------------------------------------------------------------

export interface CreateDrawingInput {
  drawingId: string;
  companyId: string;
  projectId: string;
  name: string;
  // The initial (revision 1) state
  initialRevisionId: string;
  initialLayout: LayoutModel;
  initialViewport: DrawingCanvasViewport | null;
  initialEstimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface RenameDrawingInput {
  drawingId: string;
  companyId: string;
  name: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetDrawingArchivedStateInput {
  drawingId: string;
  companyId: string;
  archived: boolean;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface DeleteDrawingInput {
  drawingId: string;
  companyId: string;
}

export interface CreateRevisionInput {
  revisionId: string;
  drawingId: string;
  companyId: string;
  revisionNumber: number;
  parentRevisionId: string;
  notes: string | null;
  layout: LayoutModel;
  savedViewport: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateRevisionLayoutInput {
  revisionId: string;
  companyId: string;
  expectedVersionNumber: number;
  layout: LayoutModel;
  savedViewport: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface UpdateRevisionNotesInput {
  revisionId: string;
  companyId: string;
  notes: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface DeleteRevisionInput {
  revisionId: string;
  companyId: string;
}

// -----------------------------------------------------------------------------
// Other support
// -----------------------------------------------------------------------------

export interface UpsertPricingConfigInput {
  companyId: string;
  items: PricingConfigRecord["items"];
  workbook?: PricingConfigRecord["workbook"];
  updatedAtIso: string;
  updatedByUserId: string;
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

export interface AuditLogQueryOptions {
  limit?: number;
  beforeCreatedAtIso?: string | null;
  fromCreatedAtIso?: string | null;
  toCreatedAtIso?: string | null;
  entityType?: AuditEntityType | null;
  search?: string | null;
}

// -----------------------------------------------------------------------------
// Repository interface
// -----------------------------------------------------------------------------

export interface AppRepository {
  close(): Promise<void>;
  checkHealth(): Promise<void>;
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;

  // Identity
  getUserCount(): Promise<number>;
  bootstrapOwnerAccount(
    input: BootstrapOwnerAccountInput,
  ): Promise<{ company: CompanyRecord; user: CompanyUserRecord } | null>;
  createUser(input: CreateUserInput): Promise<CompanyUserRecord>;
  getCompanyById(companyId: string): Promise<CompanyRecord | null>;
  getUserById(userId: string, companyId: string): Promise<CompanyUserRecord | null>;
  getUserByEmail(email: string): Promise<StoredUser | null>;
  listUsers(companyId: string): Promise<CompanyUserRecord[]>;
  updateUserPassword(
    userId: string,
    companyId: string,
    passwordHash: string,
    passwordSalt: string,
  ): Promise<void>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  revokeSession(tokenHash: string, revokedAtIso: string): Promise<void>;
  revokeSessionsForUser(userId: string, companyId: string, revokedAtIso: string): Promise<void>;
  getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null>;
  createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void>;
  consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
    passwordSalt: string,
    consumedAtIso: string,
  ): Promise<PasswordResetConsumption | null>;

  // Customers
  createCustomer(input: CreateCustomerInput): Promise<CustomerRecord>;
  listCustomers(
    companyId: string,
    scope?: ScopeFilter,
    search?: string,
  ): Promise<CustomerSummary[]>;
  getCustomerById(customerId: string, companyId: string): Promise<CustomerRecord | null>;
  updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord | null>;
  setCustomerArchivedState(input: SetCustomerArchivedStateInput): Promise<CustomerRecord | null>;
  deleteCustomer(input: DeleteCustomerInput): Promise<boolean>;

  // Projects
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  listProjects(
    companyId: string,
    options?: { scope?: ScopeFilter; customerId?: string; search?: string },
  ): Promise<ProjectSummary[]>;
  getProjectById(projectId: string, companyId: string): Promise<ProjectRecord | null>;
  updateProject(input: UpdateProjectInput): Promise<ProjectRecord | null>;
  setProjectStatus(input: SetProjectStatusInput): Promise<ProjectRecord | null>;
  setProjectArchivedState(input: SetProjectArchivedStateInput): Promise<ProjectRecord | null>;
  deleteProject(input: DeleteProjectInput): Promise<boolean>;

  // Drawings & revisions
  createDrawing(input: CreateDrawingInput): Promise<DrawingRecord>;
  listDrawingsForProject(projectId: string, companyId: string): Promise<DrawingSummary[]>;
  getDrawingById(drawingId: string, companyId: string): Promise<DrawingRecord | null>;
  renameDrawing(input: RenameDrawingInput): Promise<DrawingRecord | null>;
  setDrawingArchivedState(input: SetDrawingArchivedStateInput): Promise<DrawingRecord | null>;
  deleteDrawing(input: DeleteDrawingInput): Promise<boolean>;
  createRevision(input: CreateRevisionInput): Promise<DrawingRevisionRecord>;
  listRevisionsForDrawing(
    drawingId: string,
    companyId: string,
  ): Promise<DrawingRevisionSummary[]>;
  getRevisionById(
    revisionId: string,
    companyId: string,
  ): Promise<DrawingRevisionRecord | null>;
  updateRevisionLayout(
    input: UpdateRevisionLayoutInput,
  ): Promise<DrawingRevisionRecord | null>;
  updateRevisionNotes(
    input: UpdateRevisionNotesInput,
  ): Promise<DrawingRevisionRecord | null>;
  deleteRevision(input: DeleteRevisionInput): Promise<boolean>;

  // Pricing
  getPricingConfig(companyId: string): Promise<PricingConfigRecord | null>;
  upsertPricingConfig(input: UpsertPricingConfigInput): Promise<PricingConfigRecord>;

  // Audit
  addAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  listAuditLog(
    companyId: string,
    options?: number | AuditLogQueryOptions,
  ): Promise<AuditLogRecord[]>;
}

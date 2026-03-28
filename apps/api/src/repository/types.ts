import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyUserRecord,
  CompanyUserRole,
  CustomerContact,
  CustomerRecord,
  CustomerSummary,
  DrawingCanvasViewport,
  DrawingJobRole,
  DrawingRecord,
  DrawingStatus,
  DrawingSummary,
  DrawingVersionRecord,
  EstimateResult,
  JobCommercialInputs,
  JobRecord,
  JobStage,
  JobSummary,
  JobTaskRecord,
  LayoutModel,
  PricingConfigRecord,
  QuoteRecord
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
  jobId?: string | null;
  jobRole?: DrawingJobRole | null;
  parentDrawingId?: string | null;
  revisionNumber?: number;
  name: string;
  customerId: string | null;
  customerName: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateDrawingInput {
  drawingId: string;
  companyId: string;
  expectedVersionNumber: number;
  jobId?: string | null;
  jobRole?: DrawingJobRole | null;
  name: string;
  customerId: string | null;
  customerName: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
  estimate: EstimateResult;
  schemaVersion: number;
  rulesVersion: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetDrawingArchivedStateInput {
  drawingId: string;
  companyId: string;
  expectedVersionNumber: number;
  archived: boolean;
  archivedAtIso: string | null;
  archivedByUserId: string | null;
  updatedAtIso: string;
  updatedByUserId: string;
}

export interface SetDrawingStatusInput {
  drawingId: string;
  companyId: string;
  expectedVersionNumber: number;
  status: DrawingStatus;
  statusChangedAtIso: string;
  statusChangedByUserId: string;
  updatedAtIso: string;
  updatedByUserId: string;
}

export interface RestoreDrawingVersionInput {
  drawingId: string;
  companyId: string;
  expectedVersionNumber: number;
  versionNumber: number;
  customerId: string | null;
  customerName: string;
  restoredByUserId: string;
  restoredAtIso: string;
}

export type CustomerScope = "ALL" | "ACTIVE" | "ARCHIVED";

export interface CreateCustomerInput {
  id: string;
  companyId: string;
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  additionalContacts: CustomerContact[];
  siteAddress: string;
  notes: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateCustomerInput {
  customerId: string;
  companyId: string;
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  additionalContacts: CustomerContact[];
  siteAddress: string;
  notes: string;
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

export interface UpsertPricingConfigInput {
  companyId: string;
  items: PricingConfigRecord["items"];
  workbook?: PricingConfigRecord["workbook"];
  updatedAtIso: string;
  updatedByUserId: string;
}

export interface CreatePasswordResetTokenInput {
  id: string;
  userId: string;
  tokenHash: string;
  createdAtIso: string;
  expiresAtIso: string;
}

export interface DeleteDrawingInput {
  drawingId: string;
  companyId: string;
}

export interface DeleteCustomerInput {
  customerId: string;
  companyId: string;
}

export interface DeleteJobInput {
  jobId: string;
  companyId: string;
}

export interface CreateJobInput {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  name: string;
  stage: JobStage;
  primaryDrawingId: string | null;
  commercialInputs: JobCommercialInputs;
  notes: string;
  ownerUserId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateJobInput {
  jobId: string;
  companyId: string;
  name: string;
  stage: JobStage;
  commercialInputs: JobCommercialInputs;
  notes: string;
  ownerUserId: string | null;
  archived: boolean;
  archivedAtIso: string | null;
  archivedByUserId: string | null;
  stageChangedAtIso: string | null;
  stageChangedByUserId: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetJobPrimaryDrawingInput {
  jobId: string;
  companyId: string;
  drawingId: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface CreateJobTaskInput {
  id: string;
  companyId: string;
  jobId: string;
  title: string;
  description: string;
  priority: string;
  assignedUserId: string | null;
  dueAtIso: string | null;
  createdByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateJobTaskInput {
  taskId: string;
  companyId: string;
  jobId: string;
  title: string;
  description: string;
  priority: string;
  assignedUserId: string | null;
  dueAtIso: string | null;
  isCompleted: boolean;
  completedAtIso: string | null;
  completedByUserId: string | null;
  updatedAtIso: string;
}

export type CreateQuoteInput = QuoteRecord;

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
  close(): Promise<void>;
  checkHealth(): Promise<void>;
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;
  getUserCount(): Promise<number>;
  bootstrapOwnerAccount(input: BootstrapOwnerAccountInput): Promise<{ company: CompanyRecord; user: CompanyUserRecord } | null>;
  createUser(input: CreateUserInput): Promise<CompanyUserRecord>;
  getCompanyById(companyId: string): Promise<CompanyRecord | null>;
  getUserById(userId: string, companyId: string): Promise<CompanyUserRecord | null>;
  getUserByEmail(email: string): Promise<StoredUser | null>;
  listUsers(companyId: string): Promise<CompanyUserRecord[]>;
  updateUserPassword(userId: string, companyId: string, passwordHash: string, passwordSalt: string): Promise<void>;
  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  revokeSession(tokenHash: string, revokedAtIso: string): Promise<void>;
  revokeSessionsForUser(userId: string, companyId: string, revokedAtIso: string): Promise<void>;
  getAuthenticatedSession(tokenHash: string): Promise<AuthenticatedSession | null>;
  createCustomer(input: CreateCustomerInput): Promise<CustomerRecord>;
  listCustomers(companyId: string, scope?: CustomerScope, search?: string): Promise<CustomerSummary[]>;
  getCustomerById(customerId: string, companyId: string): Promise<CustomerRecord | null>;
  updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord | null>;
  setCustomerArchivedState(input: SetCustomerArchivedStateInput): Promise<CustomerRecord | null>;
  deleteCustomer(input: DeleteCustomerInput): Promise<boolean>;
  deleteJob(input: DeleteJobInput): Promise<boolean>;
  createJob(input: CreateJobInput): Promise<JobRecord>;
  listJobs(companyId: string, scope?: CustomerScope, search?: string, customerId?: string): Promise<JobSummary[]>;
  listJobsForCustomer(customerId: string, companyId: string): Promise<JobSummary[]>;
  getJobById(jobId: string, companyId: string): Promise<JobRecord | null>;
  updateJob(input: UpdateJobInput): Promise<JobRecord | null>;
  setJobPrimaryDrawing(input: SetJobPrimaryDrawingInput): Promise<JobRecord | null>;
  listJobTasks(jobId: string, companyId: string): Promise<JobTaskRecord[]>;
  listCompanyTasks(companyId: string): Promise<JobTaskRecord[]>;
  createJobTask(input: CreateJobTaskInput): Promise<JobTaskRecord>;
  updateJobTask(input: UpdateJobTaskInput): Promise<JobTaskRecord | null>;
  deleteJobTask(taskId: string, jobId: string, companyId: string): Promise<boolean>;
  listDrawingsForCustomer(customerId: string, companyId: string): Promise<DrawingSummary[]>;
  listDrawingsForJob(jobId: string, companyId: string): Promise<DrawingSummary[]>;
  createDrawing(input: CreateDrawingInput): Promise<DrawingRecord>;
  listDrawings(companyId: string, scope?: "ALL" | "ACTIVE" | "ARCHIVED", search?: string): Promise<DrawingSummary[]>;
  getDrawingById(drawingId: string, companyId: string): Promise<DrawingRecord | null>;
  updateDrawing(input: UpdateDrawingInput): Promise<DrawingRecord | null>;
  setDrawingArchivedState(input: SetDrawingArchivedStateInput): Promise<DrawingRecord | null>;
  setDrawingStatus(input: SetDrawingStatusInput): Promise<DrawingRecord | null>;
  deleteDrawing(input: DeleteDrawingInput): Promise<boolean>;
  listDrawingVersions(drawingId: string, companyId: string): Promise<DrawingVersionRecord[]>;
  restoreDrawingVersion(input: RestoreDrawingVersionInput): Promise<DrawingRecord | null>;
  createQuote(input: CreateQuoteInput): Promise<QuoteRecord>;
  listQuotesForJob(jobId: string, companyId: string): Promise<QuoteRecord[]>;
  listQuotesForDrawing(drawingId: string, companyId: string): Promise<QuoteRecord[]>;
  getPricingConfig(companyId: string): Promise<PricingConfigRecord | null>;
  upsertPricingConfig(input: UpsertPricingConfigInput): Promise<PricingConfigRecord>;
  createPasswordResetToken(input: CreatePasswordResetTokenInput): Promise<void>;
  consumePasswordResetToken(tokenHash: string, passwordHash: string, passwordSalt: string, consumedAtIso: string): Promise<PasswordResetConsumption | null>;
  addAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  listAuditLog(
    companyId: string,
    options?:
      | number
      | {
          limit?: number;
          beforeCreatedAtIso?: string | null;
          fromCreatedAtIso?: string | null;
          toCreatedAtIso?: string | null;
          entityType?: AuditEntityType | null;
          search?: string | null;
        }
  ): Promise<AuditLogRecord[]>;
}

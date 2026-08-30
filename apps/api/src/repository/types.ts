import type {
  AuditAction,
  AuditEntityType,
  AuditLogRecord,
  CompanyRecord,
  CompanyConfigurationDefinition,
  CompanyConfigurationStatus,
  CompanyConfigurationVersionRecord,
  CompanyUserRecord,
  CustomerRecord,
  CustomerSummary,
  CommercialEstimateCalculation,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingRevisionSummary,
  DrawingSummary,
  DesignStatus,
  EstimateRecord,
  EstimateCommercialDraft,
  EstimateSummary,
  EstimateVersionRecord,
  EstimateVersionStatus,
  EstimateResult,
  LayoutModel,
  PricingConfigRecord,
  ProjectRecord,
  ProjectStatus,
  ProjectSummary,
  QuoteRecord,
  QuotePresentationSnapshot,
  QuoteSummary,
  QuoteVersionRecord,
  QuoteVersionStatus,
  SiteRecord,
  SiteSummary,
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
// Sites
// -----------------------------------------------------------------------------

export interface CreateSiteInput {
  id: string;
  companyId: string;
  customerId: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  countryCode: string;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateSiteInput {
  siteId: string;
  companyId: string;
  name?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  countryCode?: string;
  notes?: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetSiteArchivedStateInput {
  siteId: string;
  companyId: string;
  archived: boolean;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface DeleteSiteInput {
  siteId: string;
  companyId: string;
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export interface CreateProjectInput {
  id: string;
  companyId: string;
  customerId: string;
  siteId: string;
  reference: string;
  name: string;
  status: ProjectStatus;
  scope: string | null;
  targetDateIso: string | null;
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
  siteId?: string;
  scope?: string | null;
  targetDateIso?: string | null;
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

export interface SetDrawingStatusInput {
  drawingId: string;
  companyId: string;
  status: DesignStatus;
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
// Estimate lifecycle
// -----------------------------------------------------------------------------

export interface CreateEstimateInput {
  estimateId: string;
  versionId: string;
  companyId: string;
  projectId: string;
  reference: string;
  name: string;
  notes: string | null;
  designRevisionIds: string[];
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateEstimateVersionInput {
  estimateVersionId: string;
  companyId: string;
  notes?: string | null;
  designRevisionIds?: string[];
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetEstimateVersionCalculationInput {
  estimateVersionId: string;
  companyId: string;
  commercialDraft: EstimateCommercialDraft;
  calculation: CommercialEstimateCalculation;
  calculatedAtIso: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetEstimateVersionStatusInput {
  estimateVersionId: string;
  companyId: string;
  status: EstimateVersionStatus;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface CreateEstimateVersionInput {
  estimateId: string;
  versionId: string;
  companyId: string;
  versionNumber: number;
  parentVersionId: string;
  notes: string | null;
  designRevisionIds: string[];
  commercialDraft: EstimateCommercialDraft;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SetEstimateArchivedStateInput {
  estimateId: string;
  companyId: string;
  archived: boolean;
  updatedByUserId: string;
  updatedAtIso: string;
}

// -----------------------------------------------------------------------------
// Quote lifecycle
// -----------------------------------------------------------------------------

export interface CreateQuoteInput {
  quoteId: string;
  versionId: string;
  companyId: string;
  projectId: string;
  estimateId: string;
  estimateVersionId: string;
  reference: string;
  name: string;
  title: string;
  customerMessage: string | null;
  validUntilIso: string | null;
  presentation: QuotePresentationSnapshot;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UpdateQuoteVersionInput {
  quoteVersionId: string;
  companyId: string;
  estimateVersionId?: string;
  title?: string;
  customerMessage?: string | null;
  validUntilIso?: string | null;
  presentation?: QuotePresentationSnapshot;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetQuoteVersionStatusInput {
  quoteVersionId: string;
  companyId: string;
  status: QuoteVersionStatus;
  issuedAtIso: string | null;
  decidedAtIso: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface CreateQuoteVersionInput {
  quoteId: string;
  versionId: string;
  companyId: string;
  versionNumber: number;
  parentVersionId: string;
  estimateVersionId: string;
  title: string;
  customerMessage: string | null;
  validUntilIso: string | null;
  presentation: QuotePresentationSnapshot;
  createdByUserId: string;
  updatedByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SetQuoteArchivedStateInput {
  quoteId: string;
  companyId: string;
  archived: boolean;
  updatedByUserId: string;
  updatedAtIso: string;
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

export interface CreateCompanyConfigurationVersionInput {
  id: string;
  companyId: string;
  versionNumber: number;
  status: CompanyConfigurationStatus;
  definition: CompanyConfigurationDefinition;
  compiledWorkbook: NonNullable<PricingConfigRecord["workbook"]>;
  changeNote: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  publishedByUserId: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  publishedAtIso: string | null;
}

export interface UpdateCompanyConfigurationDraftInput {
  id: string;
  companyId: string;
  definition: CompanyConfigurationDefinition;
  compiledWorkbook: NonNullable<PricingConfigRecord["workbook"]>;
  changeNote: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
}

export interface SetCompanyConfigurationVersionStatusInput {
  id: string;
  companyId: string;
  status: CompanyConfigurationStatus;
  changeNote: string | null;
  updatedByUserId: string;
  updatedAtIso: string;
  publishedByUserId: string | null;
  publishedAtIso: string | null;
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
  getHealthDetails(): Promise<{ provider: "sqlite" | "postgresql"; schemaVersion: number }>;
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

  // Sites
  createSite(input: CreateSiteInput): Promise<SiteRecord>;
  listSites(
    companyId: string,
    options?: { scope?: ScopeFilter; customerId?: string; search?: string },
  ): Promise<SiteSummary[]>;
  getSiteById(siteId: string, companyId: string): Promise<SiteRecord | null>;
  updateSite(input: UpdateSiteInput): Promise<SiteRecord | null>;
  setSiteArchivedState(input: SetSiteArchivedStateInput): Promise<SiteRecord | null>;
  deleteSite(input: DeleteSiteInput): Promise<boolean>;

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
  listRevisionsForDrawing(drawingId: string, companyId: string): Promise<DrawingRevisionSummary[]>;
  getRevisionById(revisionId: string, companyId: string): Promise<DrawingRevisionRecord | null>;
  updateRevisionLayout(input: UpdateRevisionLayoutInput): Promise<DrawingRevisionRecord | null>;
  updateRevisionNotes(input: UpdateRevisionNotesInput): Promise<DrawingRevisionRecord | null>;
  deleteRevision(input: DeleteRevisionInput): Promise<boolean>;
  setDrawingStatus(input: SetDrawingStatusInput): Promise<DrawingRecord | null>;

  // Estimate lifecycle
  createEstimate(input: CreateEstimateInput): Promise<EstimateRecord>;
  listEstimatesForProject(projectId: string, companyId: string): Promise<EstimateSummary[]>;
  getEstimateById(estimateId: string, companyId: string): Promise<EstimateRecord | null>;
  listEstimateVersions(estimateId: string, companyId: string): Promise<EstimateVersionRecord[]>;
  getEstimateVersionById(
    versionId: string,
    companyId: string,
  ): Promise<EstimateVersionRecord | null>;
  updateEstimateVersion(input: UpdateEstimateVersionInput): Promise<EstimateVersionRecord | null>;
  setEstimateVersionCalculation(
    input: SetEstimateVersionCalculationInput,
  ): Promise<EstimateVersionRecord | null>;
  setEstimateVersionStatus(
    input: SetEstimateVersionStatusInput,
  ): Promise<EstimateVersionRecord | null>;
  createEstimateVersion(input: CreateEstimateVersionInput): Promise<EstimateVersionRecord>;
  setEstimateArchivedState(input: SetEstimateArchivedStateInput): Promise<EstimateRecord | null>;

  // Quote lifecycle
  createQuote(input: CreateQuoteInput): Promise<QuoteRecord>;
  listQuotesForProject(projectId: string, companyId: string): Promise<QuoteSummary[]>;
  getQuoteById(quoteId: string, companyId: string): Promise<QuoteRecord | null>;
  listQuoteVersions(quoteId: string, companyId: string): Promise<QuoteVersionRecord[]>;
  getQuoteVersionById(versionId: string, companyId: string): Promise<QuoteVersionRecord | null>;
  updateQuoteVersion(input: UpdateQuoteVersionInput): Promise<QuoteVersionRecord | null>;
  setQuoteVersionStatus(input: SetQuoteVersionStatusInput): Promise<QuoteVersionRecord | null>;
  createQuoteVersion(input: CreateQuoteVersionInput): Promise<QuoteVersionRecord>;
  setQuoteArchivedState(input: SetQuoteArchivedStateInput): Promise<QuoteRecord | null>;

  nextCompanySequence(companyId: string, sequenceKey: string): Promise<number>;

  // Pricing
  getPricingConfig(companyId: string): Promise<PricingConfigRecord | null>;
  upsertPricingConfig(input: UpsertPricingConfigInput): Promise<PricingConfigRecord>;
  listCompanyConfigurationVersions(companyId: string): Promise<CompanyConfigurationVersionRecord[]>;
  getCompanyConfigurationVersionByStatus(
    companyId: string,
    status: "DRAFT" | "PUBLISHED",
  ): Promise<CompanyConfigurationVersionRecord | null>;
  createCompanyConfigurationVersion(
    input: CreateCompanyConfigurationVersionInput,
  ): Promise<CompanyConfigurationVersionRecord>;
  updateCompanyConfigurationDraft(
    input: UpdateCompanyConfigurationDraftInput,
  ): Promise<CompanyConfigurationVersionRecord | null>;
  setCompanyConfigurationVersionStatus(
    input: SetCompanyConfigurationVersionStatusInput,
  ): Promise<CompanyConfigurationVersionRecord | null>;

  // Audit
  addAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  listAuditLog(
    companyId: string,
    options?: number | AuditLogQueryOptions,
  ): Promise<AuditLogRecord[]>;
}

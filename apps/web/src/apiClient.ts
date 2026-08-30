import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  CompanyConfigurationDefinition,
  CompanyConfigurationPreviewFact,
  CompanyConfigurationPreviewResult,
  CompanyConfigurationWorkspace,
  CustomerRecord,
  CustomerSummary,
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
  LayoutModel,
  PricingConfigRecord,
  PricingWorkbookConfig,
  ProjectRecord,
  ProjectStatus,
  ProjectSummary,
  QuoteRecord,
  QuoteDisplayMode,
  QuoteSummary,
  QuoteVersionRecord,
  QuoteVersionStatus,
  SiteRecord,
  SiteSummary,
  UserRole,
} from "@fence-estimator/contracts";

// -----------------------------------------------------------------------------
// Fetch helper
// -----------------------------------------------------------------------------

const configuredApiBase: unknown = import.meta.env.VITE_API_BASE_URL;
const API_BASE = (typeof configuredApiBase === "string" ? configuredApiBase : "").replace(
  /\/$/,
  "",
);

export interface ApiErrorPayload {
  error: string;
  details?: unknown;
  retryAfterSeconds?: number;
  currentVersionNumber?: number;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly payload: ApiErrorPayload;
  public constructor(status: number, payload: ApiErrorPayload) {
    super(payload?.error ?? `HTTP ${status}`);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const payload = (data ?? { error: `HTTP ${response.status}` }) as ApiErrorPayload;
    throw new ApiError(response.status, payload);
  }
  return data as T;
}

// -----------------------------------------------------------------------------
// Setup / Auth
// -----------------------------------------------------------------------------

export interface SetupStatus {
  bootstrapRequired: boolean;
  bootstrapSecretRequired: boolean;
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>("/api/v1/setup/status");
}

export interface BootstrapOwnerInput {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
  bootstrapSecret?: string;
}

export function bootstrapOwner(input: BootstrapOwnerInput): Promise<AuthSessionEnvelope> {
  const headers: Record<string, string> = {};
  if (input.bootstrapSecret) {
    headers["x-bootstrap-secret"] = input.bootstrapSecret;
  }
  const body = {
    companyName: input.companyName,
    displayName: input.displayName,
    email: input.email,
    password: input.password,
  };
  return request<AuthSessionEnvelope>("/api/v1/setup/bootstrap-owner", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export interface LoginInput {
  email: string;
  password: string;
}

export function login(input: LoginInput): Promise<AuthSessionEnvelope> {
  return request<AuthSessionEnvelope>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCurrentSession(): Promise<AuthSessionEnvelope> {
  return request<AuthSessionEnvelope>("/api/v1/auth/me");
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/v1/auth/logout", { method: "POST" });
}

// -----------------------------------------------------------------------------
// Users (admin)
// -----------------------------------------------------------------------------

export function listUsers(): Promise<{ users: CompanyUserRecord[] }> {
  return request("/api/v1/users");
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export function createUser(input: CreateUserInput): Promise<{ user: CompanyUserRecord }> {
  return request("/api/v1/users", { method: "POST", body: JSON.stringify(input) });
}

export function resetUserPassword(userId: string, password: string): Promise<void> {
  return request(`/api/v1/users/${encodeURIComponent(userId)}/password`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

// -----------------------------------------------------------------------------
// Customers
// -----------------------------------------------------------------------------

export type ScopeFilter = "ALL" | "ACTIVE" | "ARCHIVED";

export function listCustomers(options: { scope?: ScopeFilter; search?: string } = {}): Promise<{
  customers: CustomerSummary[];
}> {
  const params = new URLSearchParams();
  if (options.scope) params.set("scope", options.scope);
  if (options.search) params.set("search", options.search);
  const qs = params.toString();
  return request(`/api/v1/customers${qs ? `?${qs}` : ""}`);
}

export function getCustomer(customerId: string): Promise<{ customer: CustomerRecord }> {
  return request(`/api/v1/customers/${encodeURIComponent(customerId)}`);
}

export interface CustomerWritableInput {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  siteAddress?: string | null;
  notes?: string | null;
}

export function createCustomer(
  input: CustomerWritableInput,
): Promise<{ customer: CustomerRecord }> {
  return request("/api/v1/customers", { method: "POST", body: JSON.stringify(input) });
}

export function updateCustomer(
  customerId: string,
  input: Partial<CustomerWritableInput>,
): Promise<{ customer: CustomerRecord }> {
  return request(`/api/v1/customers/${encodeURIComponent(customerId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setCustomerArchived(
  customerId: string,
  isArchived: boolean,
): Promise<{ customer: CustomerRecord }> {
  return request(`/api/v1/customers/${encodeURIComponent(customerId)}/archive`, {
    method: "PUT",
    body: JSON.stringify({ isArchived }),
  });
}

export function deleteCustomer(customerId: string): Promise<void> {
  return request(`/api/v1/customers/${encodeURIComponent(customerId)}`, { method: "DELETE" });
}

// -----------------------------------------------------------------------------
// Sites
// -----------------------------------------------------------------------------

export interface SiteWritableInput {
  customerId: string;
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  countryCode?: string;
  notes?: string | null;
}

export function listSites(
  options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
): Promise<{ sites: SiteSummary[] }> {
  const params = new URLSearchParams();
  if (options.scope) params.set("scope", options.scope);
  if (options.customerId) params.set("customerId", options.customerId);
  if (options.search) params.set("search", options.search);
  const query = params.toString();
  return request(`/api/v1/sites${query ? `?${query}` : ""}`);
}

export function getSite(siteId: string): Promise<{ site: SiteRecord }> {
  return request(`/api/v1/sites/${encodeURIComponent(siteId)}`);
}

export function createSite(input: SiteWritableInput): Promise<{ site: SiteRecord }> {
  return request("/api/v1/sites", { method: "POST", body: JSON.stringify(input) });
}

export function updateSite(
  siteId: string,
  input: Partial<Omit<SiteWritableInput, "customerId">>,
): Promise<{ site: SiteRecord }> {
  return request(`/api/v1/sites/${encodeURIComponent(siteId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setSiteArchived(
  siteId: string,
  isArchived: boolean,
): Promise<{ site: SiteRecord }> {
  return request(`/api/v1/sites/${encodeURIComponent(siteId)}/archive`, {
    method: "PUT",
    body: JSON.stringify({ isArchived }),
  });
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export function listProjects(
  options: { scope?: ScopeFilter; customerId?: string; search?: string } = {},
): Promise<{ projects: ProjectSummary[] }> {
  const params = new URLSearchParams();
  if (options.scope) params.set("scope", options.scope);
  if (options.customerId) params.set("customerId", options.customerId);
  if (options.search) params.set("search", options.search);
  const qs = params.toString();
  return request(`/api/v1/projects${qs ? `?${qs}` : ""}`);
}

export function getProject(projectId: string): Promise<{ project: ProjectRecord }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}`);
}

export interface CreateProjectInput {
  customerId: string;
  siteId: string;
  name: string;
  scope?: string | null;
  targetDateIso?: string | null;
  notes?: string | null;
}

export function createProject(input: CreateProjectInput): Promise<{ project: ProjectRecord }> {
  return request("/api/v1/projects", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateProjectInput {
  name?: string;
  siteId?: string;
  scope?: string | null;
  targetDateIso?: string | null;
  notes?: string | null;
}

export function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<{ project: ProjectRecord }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setProjectStatus(
  projectId: string,
  status: ProjectStatus,
): Promise<{ project: ProjectRecord }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function setProjectArchived(
  projectId: string,
  isArchived: boolean,
): Promise<{ project: ProjectRecord }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}/archive`, {
    method: "PUT",
    body: JSON.stringify({ isArchived }),
  });
}

export function deleteProject(projectId: string): Promise<void> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
}

// -----------------------------------------------------------------------------
// Drawings & revisions
// -----------------------------------------------------------------------------

export function listDrawingsForProject(projectId: string): Promise<{ drawings: DrawingSummary[] }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}/drawings`);
}

export function getDrawing(drawingId: string): Promise<{ drawing: DrawingRecord }> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}`);
}

export interface CreateDrawingInput {
  projectId: string;
  name: string;
  initialLayout?: LayoutModel;
  initialViewport?: DrawingCanvasViewport;
}

export function createDrawing(
  input: CreateDrawingInput,
): Promise<{ drawing: DrawingRecord; revision: DrawingRevisionRecord }> {
  return request("/api/v1/drawings", { method: "POST", body: JSON.stringify(input) });
}

export function renameDrawing(
  drawingId: string,
  name: string,
): Promise<{ drawing: DrawingRecord }> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function setDrawingArchived(
  drawingId: string,
  isArchived: boolean,
): Promise<{ drawing: DrawingRecord }> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}/archive`, {
    method: "PUT",
    body: JSON.stringify({ isArchived }),
  });
}

export function setDrawingStatus(
  drawingId: string,
  status: DesignStatus,
): Promise<{ drawing: DrawingRecord }> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function deleteDrawing(drawingId: string): Promise<void> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}`, { method: "DELETE" });
}

export function listRevisions(drawingId: string): Promise<{ revisions: DrawingRevisionSummary[] }> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}/revisions`);
}

export function startRevision(
  drawingId: string,
  notes?: string | null,
): Promise<{ revision: DrawingRevisionRecord }> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}/revisions`, {
    method: "POST",
    body: JSON.stringify({ notes: notes ?? null }),
  });
}

export function getRevision(revisionId: string): Promise<{ revision: DrawingRevisionRecord }> {
  return request(`/api/v1/revisions/${encodeURIComponent(revisionId)}`);
}

export interface SaveRevisionInput {
  expectedVersionNumber: number;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
}

export function saveRevision(
  revisionId: string,
  input: SaveRevisionInput,
): Promise<{ revision: DrawingRevisionRecord }> {
  return request(`/api/v1/revisions/${encodeURIComponent(revisionId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteRevision(revisionId: string): Promise<void> {
  return request(`/api/v1/revisions/${encodeURIComponent(revisionId)}`, { method: "DELETE" });
}

// -----------------------------------------------------------------------------
// Estimate lifecycle
// -----------------------------------------------------------------------------

export function listEstimatesForProject(
  projectId: string,
): Promise<{ estimates: EstimateSummary[] }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}/estimates`);
}

export function getEstimate(
  estimateId: string,
): Promise<{ estimate: EstimateRecord; currentVersion: EstimateVersionRecord }> {
  return request(`/api/v1/estimates/${encodeURIComponent(estimateId)}`);
}

export function listEstimateVersions(
  estimateId: string,
): Promise<{ versions: EstimateVersionRecord[] }> {
  return request(`/api/v1/estimates/${encodeURIComponent(estimateId)}/versions`);
}

export function getEstimateVersion(versionId: string): Promise<{ version: EstimateVersionRecord }> {
  return request(`/api/v1/estimate-versions/${encodeURIComponent(versionId)}`);
}

export function createEstimate(input: {
  projectId: string;
  name: string;
  designRevisionIds: string[];
  notes?: string | null;
}): Promise<{ estimate: EstimateRecord; version: EstimateVersionRecord }> {
  return request("/api/v1/estimates", { method: "POST", body: JSON.stringify(input) });
}

export function updateEstimateVersion(
  versionId: string,
  input: { designRevisionIds?: string[]; notes?: string | null },
): Promise<{ version: EstimateVersionRecord }> {
  return request(`/api/v1/estimate-versions/${encodeURIComponent(versionId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setEstimateVersionStatus(
  versionId: string,
  status: EstimateVersionStatus,
): Promise<{ version: EstimateVersionRecord }> {
  return request(`/api/v1/estimate-versions/${encodeURIComponent(versionId)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function calculateEstimateVersion(
  versionId: string,
  input: EstimateCommercialDraft,
): Promise<{ version: EstimateVersionRecord }> {
  return request(`/api/v1/estimate-versions/${encodeURIComponent(versionId)}/calculate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function startEstimateVersion(
  estimateId: string,
  input: { designRevisionIds?: string[]; notes?: string | null } = {},
): Promise<{ version: EstimateVersionRecord }> {
  return request(`/api/v1/estimates/${encodeURIComponent(estimateId)}/versions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// -----------------------------------------------------------------------------
// Quote lifecycle
// -----------------------------------------------------------------------------

export function listQuotesForProject(projectId: string): Promise<{ quotes: QuoteSummary[] }> {
  return request(`/api/v1/projects/${encodeURIComponent(projectId)}/quotes`);
}

export function getQuote(
  quoteId: string,
): Promise<{ quote: QuoteRecord; currentVersion: QuoteVersionRecord }> {
  return request(`/api/v1/quotes/${encodeURIComponent(quoteId)}`);
}

export function listQuoteVersions(quoteId: string): Promise<{ versions: QuoteVersionRecord[] }> {
  return request(`/api/v1/quotes/${encodeURIComponent(quoteId)}/versions`);
}

export function createQuote(input: {
  estimateVersionId: string;
  name: string;
  title: string;
  customerMessage?: string | null;
  validUntilIso?: string | null;
  displayMode?: QuoteDisplayMode;
  vatRate?: number;
}): Promise<{ quote: QuoteRecord; version: QuoteVersionRecord }> {
  return request("/api/v1/quotes", { method: "POST", body: JSON.stringify(input) });
}

export function updateQuoteVersion(
  versionId: string,
  input: {
    estimateVersionId?: string;
    title?: string;
    customerMessage?: string | null;
    validUntilIso?: string | null;
    displayMode?: QuoteDisplayMode;
    vatRate?: number;
  },
): Promise<{ version: QuoteVersionRecord }> {
  return request(`/api/v1/quote-versions/${encodeURIComponent(versionId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setQuoteVersionStatus(
  versionId: string,
  status: QuoteVersionStatus,
): Promise<{ version: QuoteVersionRecord }> {
  return request(`/api/v1/quote-versions/${encodeURIComponent(versionId)}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function downloadQuoteVersionPdf(
  versionId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(
    `${API_BASE}/api/v1/quote-versions/${encodeURIComponent(versionId)}/pdf`,
    { credentials: "include", headers: { Accept: "application/pdf" } },
  );
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` }))) as ApiErrorPayload;
    throw new ApiError(response.status, payload);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName = disposition.match(/filename="([^"]+)"/i)?.[1] ?? `quote-${versionId}.pdf`;
  return { blob: await response.blob(), fileName };
}

export function startQuoteVersion(
  quoteId: string,
  input: {
    estimateVersionId: string;
    title: string;
    customerMessage?: string | null;
    validUntilIso?: string | null;
    displayMode?: QuoteDisplayMode;
    vatRate?: number;
  },
): Promise<{ version: QuoteVersionRecord }> {
  return request(`/api/v1/quotes/${encodeURIComponent(quoteId)}/versions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// -----------------------------------------------------------------------------
// Pricing
// -----------------------------------------------------------------------------

export function getPricingConfig(): Promise<{ pricingConfig: PricingConfigRecord }> {
  return request("/api/v1/pricing-config");
}

export function updatePricingConfig(input: {
  workbook: PricingWorkbookConfig;
}): Promise<{ pricingConfig: PricingConfigRecord }> {
  return request("/api/v1/pricing-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getCompanyConfiguration(): Promise<{ workspace: CompanyConfigurationWorkspace }> {
  return request("/api/v1/company-configuration");
}

export function updateCompanyConfigurationDraft(input: {
  definition: CompanyConfigurationDefinition;
  changeNote?: string | null;
}): Promise<{ workspace: CompanyConfigurationWorkspace }> {
  return request("/api/v1/company-configuration/draft", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function previewCompanyConfiguration(input: {
  definition: CompanyConfigurationDefinition;
  facts: CompanyConfigurationPreviewFact[];
}): Promise<{ preview: CompanyConfigurationPreviewResult }> {
  return request("/api/v1/company-configuration/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cloneCompanyConfigurationTemplate(
  templateId: string,
): Promise<{ workspace: CompanyConfigurationWorkspace }> {
  return request("/api/v1/company-configuration/templates/clone", {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });
}

export function publishCompanyConfiguration(
  changeNote: string,
  facts: CompanyConfigurationPreviewFact[],
): Promise<{ workspace: CompanyConfigurationWorkspace }> {
  return request("/api/v1/company-configuration/publish", {
    method: "POST",
    body: JSON.stringify({ changeNote, facts }),
  });
}

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------

export function listAuditLog(
  options: {
    limit?: number;
    before?: string | null;
    from?: string | null;
    to?: string | null;
    entityType?: string | null;
    search?: string | null;
  } = {},
): Promise<{ entries: AuditLogRecord[]; nextBeforeCreatedAtIso: string | null }> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.before) params.set("before", options.before);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.entityType) params.set("entityType", options.entityType);
  if (options.search) params.set("search", options.search);
  const qs = params.toString();
  return request(`/api/v1/audit-log${qs ? `?${qs}` : ""}`);
}

import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  CustomerRecord,
  CustomerSummary,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingRevisionRecord,
  DrawingRevisionSummary,
  DrawingSummary,
  LayoutModel,
  PricingConfigRecord,
  ProjectRecord,
  ProjectStatus,
  ProjectSummary,
  UserRole,
} from "@fence-estimator/contracts";

// -----------------------------------------------------------------------------
// Fetch helper
// -----------------------------------------------------------------------------

const API_BASE = (
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : ""
).replace(/\/$/, "");

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
  const { headers: _, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
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
  const { bootstrapSecret: _bootstrapSecret, ...body } = input;
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

export function createCustomer(input: CustomerWritableInput): Promise<{ customer: CustomerRecord }> {
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
  name: string;
  notes?: string | null;
  status?: ProjectStatus;
}

export function createProject(input: CreateProjectInput): Promise<{ project: ProjectRecord }> {
  return request("/api/v1/projects", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateProjectInput {
  name?: string;
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

export function deleteDrawing(drawingId: string): Promise<void> {
  return request(`/api/v1/drawings/${encodeURIComponent(drawingId)}`, { method: "DELETE" });
}

export function listRevisions(
  drawingId: string,
): Promise<{ revisions: DrawingRevisionSummary[] }> {
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
// Pricing
// -----------------------------------------------------------------------------

export function getPricingConfig(): Promise<{ pricingConfig: PricingConfigRecord }> {
  return request("/api/v1/pricing-config");
}

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------

export function listAuditLog(options: {
  limit?: number;
  before?: string | null;
  from?: string | null;
  to?: string | null;
  entityType?: string | null;
  search?: string | null;
} = {}): Promise<{ entries: AuditLogRecord[]; nextBeforeCreatedAtIso: string | null }> {
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

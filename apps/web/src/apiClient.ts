import type {
  AncillaryEstimateItem,
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyUserRecord,
  CustomerContact,
  CustomerRecord,
  CustomerSummary,
  DrawingCanvasViewport,
  DrawingRecord,
  DrawingStatus,
  DrawingSummary,
  DrawingVersionRecord,
  EstimateWorkbookManualEntry,
  JobCommercialInputs,
  JobRecord,
  JobStage,
  JobSummary,
  JobTaskRecord,
  LayoutModel,
  TaskPriority,
  PricingConfigRecord,
  PricedEstimateResult,
  QuoteRecord,
} from "@fence-estimator/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const RETRIABLE_STATUS_CODES = new Set([502, 503, 504]);

export interface RegisterAccountInput {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
  bootstrapSecret?: string;
}

export interface SetupStatus {
  bootstrapRequired: boolean;
  bootstrapSecretRequired: boolean;
}

export interface AuditLogQueryOptions {
  limit?: number;
  before?: string;
  from?: string;
  to?: string;
  entityType?: "AUTH" | "USER" | "DRAWING" | "QUOTE" | "CUSTOMER" | "JOB";
  search?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateCompanyUserInput {
  displayName: string;
  email: string;
  password: string;
  role: "ADMIN" | "MEMBER";
}

export interface SetCompanyUserPasswordInput {
  password: string;
}

export interface PasswordResetRequestInput {
  email: string;
}

export interface PasswordResetConfirmInput {
  token: string;
  password: string;
}

export interface CreateCustomerInput {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  additionalContacts?: CustomerContact[];
  siteAddress: string;
  notes: string;
}

export interface UpdateCustomerInput {
  name?: string;
  primaryContactName?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  additionalContacts?: CustomerContact[];
  siteAddress?: string;
  notes?: string;
}

export interface CreateJobInput {
  customerId: string;
  name: string;
  notes: string;
}

export interface UpdateJobInput {
  name?: string;
  stage?: JobStage;
  commercialInputs?: JobCommercialInputs;
  notes?: string;
  ownerUserId?: string | null;
  archived?: boolean;
}

export interface CreateJobTaskInput {
  title: string;
  assignedUserId?: string | null;
  dueAtIso?: string | null;
  description?: string;
  priority?: TaskPriority;
}

export interface UpdateJobTaskInput {
  title?: string;
  assignedUserId?: string | null;
  dueAtIso?: string | null;
  isCompleted?: boolean;
  description?: string;
  priority?: TaskPriority;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly details: unknown;

  public constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

export interface AuditLogResponse {
  entries: AuditLogRecord[];
  nextBeforeCreatedAtIso: string | null;
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function buildAuditLogQuery(options: AuditLogQueryOptions = {}): string {
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options.before) {
    params.set("before", options.before);
  }
  if (options.from) {
    params.set("from", options.from);
  }
  if (options.to) {
    params.set("to", options.to);
  }
  if (options.entityType) {
    params.set("entityType", options.entityType);
  }
  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

function validateApiBaseUrl(): void {
  if (!API_BASE_URL || typeof window === "undefined") {
    return;
  }

  new URL(API_BASE_URL, window.location.origin);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function mergeSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (activeSignals.length === 0) {
    return undefined;
  }

  const controller = new AbortController();
  const abort = () => {
    controller.abort();
    for (const signal of activeSignals) {
      signal.removeEventListener("abort", abort);
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

async function executeRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), DEFAULT_REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    const requestInit: RequestInit = {
      method: options.method ?? "GET",
      credentials: "include",
      headers
    };
    const signal = mergeSignals([options.signal, timeoutController.signal]);
    if (signal) {
      requestInit.signal = signal;
    }
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      requestInit.body = JSON.stringify(options.body);
    }

    const response = await fetch(buildUrl(path), requestInit);

    const payload = (await response.json().catch(() => null)) as T | { error?: string; details?: unknown } | null;
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`;
      const details = payload && typeof payload === "object" && "details" in payload ? payload.details : null;
      throw new ApiClientError(message, response.status, details);
    }

    return payload as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function shouldRetry(method: RequestOptions["method"], error: unknown): boolean {
  if ((method ?? "GET") !== "GET") {
    return false;
  }

  if (error instanceof ApiClientError) {
    return RETRIABLE_STATUS_CODES.has(error.status);
  }

  return !isAbortError(error);
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  validateApiBaseUrl();

  let lastError: unknown;
  const maxAttempts = (options.method ?? "GET") === "GET" ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executeRequest<T>(path, options);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(options.method, error)) {
        throw error;
      }

      await new Promise((resolve) => globalThis.setTimeout(resolve, 250 * attempt));
    }
  }

  throw lastError;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return requestJson<SetupStatus>("/api/v1/setup/status");
}

export async function bootstrapOwner(input: RegisterAccountInput): Promise<AuthSessionEnvelope> {
  const bootstrapSecret = input.bootstrapSecret?.trim();
  return requestJson<AuthSessionEnvelope>("/api/v1/setup/bootstrap-owner", {
    method: "POST",
    ...(bootstrapSecret ? { headers: { "x-bootstrap-secret": bootstrapSecret } } : {}),
    body: {
      companyName: input.companyName,
      displayName: input.displayName,
      email: input.email,
      password: input.password
    }
  });
}

export async function registerAccount(input: RegisterAccountInput): Promise<AuthSessionEnvelope> {
  return bootstrapOwner(input);
}

export async function login(input: LoginInput): Promise<AuthSessionEnvelope> {
  return requestJson<AuthSessionEnvelope>("/api/v1/auth/login", {
    method: "POST",
    body: input
  });
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/v1/auth/logout", {
    method: "POST"
  });
}

export async function getAuthenticatedUser(): Promise<AuthSessionEnvelope> {
  return requestJson<AuthSessionEnvelope>("/api/v1/auth/me");
}

export async function listUsers(): Promise<CompanyUserRecord[]> {
  const response = await requestJson<{ users: CompanyUserRecord[] }>("/api/v1/users");
  return response.users;
}

export async function createUser(input: CreateCompanyUserInput): Promise<CompanyUserRecord> {
  const response = await requestJson<{ user: CompanyUserRecord }>("/api/v1/users", {
    method: "POST",
    body: input
  });
  return response.user;
}

export async function setUserPassword(userId: string, input: SetCompanyUserPasswordInput): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/v1/users/${userId}/password`, {
    method: "PUT",
    body: input
  });
}

export async function listCustomers(scope: "ALL" | "ACTIVE" | "ARCHIVED" = "ALL", search = ""): Promise<CustomerSummary[]> {
  const params = new URLSearchParams({ scope });
  if (search.trim()) {
    params.set("search", search.trim());
  }
  const response = await requestJson<{ customers: CustomerSummary[] }>(`/api/v1/customers?${params.toString()}`);
  return response.customers;
}

export async function getCustomer(customerId: string): Promise<CustomerRecord> {
  const response = await requestJson<{ customer: CustomerRecord }>(`/api/v1/customers/${customerId}`);
  return response.customer;
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
  const response = await requestJson<{ customer: CustomerRecord }>("/api/v1/customers", {
    method: "POST",
    body: input
  });
  return response.customer;
}

export async function updateCustomer(customerId: string, input: UpdateCustomerInput): Promise<CustomerRecord> {
  const response = await requestJson<{ customer: CustomerRecord }>(`/api/v1/customers/${customerId}`, {
    method: "PUT",
    body: input
  });
  return response.customer;
}

export async function setCustomerArchivedState(customerId: string, archived: boolean, cascadeDrawings = false): Promise<CustomerRecord> {
  const response = await requestJson<{ customer: CustomerRecord }>(`/api/v1/customers/${customerId}/archive`, {
    method: "PUT",
    body: { archived, cascadeDrawings }
  });
  return response.customer;
}

export async function deleteCustomer(customerId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/v1/customers/${customerId}`, {
    method: "DELETE"
  });
}

export async function listDrawings(search = ""): Promise<DrawingSummary[]> {
  const params = new URLSearchParams({ scope: "ALL" });
  if (search.trim()) params.set("search", search.trim());
  const response = await requestJson<{ drawings: DrawingSummary[] }>(`/api/v1/drawings?${params.toString()}`);
  return response.drawings;
}

export async function listJobs(options: {
  scope?: "ALL" | "ACTIVE" | "ARCHIVED";
  search?: string;
  customerId?: string;
} = {}): Promise<JobSummary[]> {
  const params = new URLSearchParams({ scope: options.scope ?? "ACTIVE" });
  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }
  if (options.customerId?.trim()) {
    params.set("customerId", options.customerId.trim());
  }
  const response = await requestJson<{ jobs: JobSummary[] }>(`/api/v1/jobs?${params.toString()}`);
  return response.jobs;
}

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  const response = await requestJson<{ job: JobRecord }>("/api/v1/jobs", {
    method: "POST",
    body: input
  });
  return response.job;
}

export async function getJob(jobId: string): Promise<JobRecord> {
  const response = await requestJson<{ job: JobRecord }>(`/api/v1/jobs/${encodePathSegment(jobId)}`);
  return response.job;
}

export async function updateJob(jobId: string, input: UpdateJobInput): Promise<JobRecord> {
  const response = await requestJson<{ job: JobRecord }>(`/api/v1/jobs/${encodePathSegment(jobId)}`, {
    method: "PUT",
    body: input
  });
  return response.job;
}

export async function deleteJob(jobId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/v1/jobs/${encodePathSegment(jobId)}`, {
    method: "DELETE"
  });
}

export async function listJobDrawings(jobId: string): Promise<DrawingSummary[]> {
  const response = await requestJson<{ drawings: DrawingSummary[] }>(`/api/v1/jobs/${encodePathSegment(jobId)}/drawings`);
  return response.drawings;
}

export async function createJobDrawing(
  jobId: string,
  input: { name?: string; sourceDrawingId?: string }
): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/jobs/${encodePathSegment(jobId)}/drawings`, {
    method: "POST",
    body: input
  });
  return response.drawing;
}

export async function setJobPrimaryDrawing(jobId: string, drawingId: string): Promise<JobRecord> {
  const response = await requestJson<{ job: JobRecord }>(`/api/v1/jobs/${encodePathSegment(jobId)}/primary-drawing`, {
    method: "PUT",
    body: { drawingId }
  });
  return response.job;
}

export async function getJobEstimate(jobId: string, drawingId?: string | null): Promise<PricedEstimateResult> {
  const params = new URLSearchParams();
  if (drawingId?.trim()) {
    params.set("drawingId", drawingId.trim());
  }
  const response = await requestJson<{ pricedEstimate: PricedEstimateResult }>(
    `/api/v1/jobs/${encodePathSegment(jobId)}/estimate${params.toString() ? `?${params.toString()}` : ""}`
  );
  return response.pricedEstimate;
}

export async function listJobQuotes(jobId: string): Promise<QuoteRecord[]> {
  const response = await requestJson<{ quotes: QuoteRecord[] }>(`/api/v1/jobs/${encodePathSegment(jobId)}/quotes`);
  return response.quotes;
}

export async function createJobQuoteSnapshot(
  jobId: string,
  ancillaryItems: AncillaryEstimateItem[] = [],
  manualEntries: EstimateWorkbookManualEntry[] = [],
  drawingId?: string | null
): Promise<QuoteRecord> {
  const response = await requestJson<{ quote: QuoteRecord }>(`/api/v1/jobs/${encodePathSegment(jobId)}/quotes`, {
    method: "POST",
    body: {
      ...(drawingId ? { drawingId } : {}),
      ancillaryItems,
      manualEntries
    }
  });
  return response.quote;
}

export async function listJobTasks(jobId: string): Promise<JobTaskRecord[]> {
  const response = await requestJson<{ tasks: JobTaskRecord[] }>(`/api/v1/jobs/${encodePathSegment(jobId)}/tasks`);
  return response.tasks;
}

export async function createJobTask(jobId: string, input: CreateJobTaskInput): Promise<JobTaskRecord> {
  const response = await requestJson<{ task: JobTaskRecord }>(`/api/v1/jobs/${encodePathSegment(jobId)}/tasks`, {
    method: "POST",
    body: input
  });
  return response.task;
}

export async function updateJobTask(jobId: string, taskId: string, input: UpdateJobTaskInput): Promise<JobTaskRecord> {
  const response = await requestJson<{ task: JobTaskRecord }>(
    `/api/v1/jobs/${encodePathSegment(jobId)}/tasks/${encodePathSegment(taskId)}`,
    {
      method: "PUT",
      body: input
    }
  );
  return response.task;
}

export async function deleteJobTask(jobId: string, taskId: string): Promise<void> {
  await requestJson<{ success: boolean }>(
    `/api/v1/jobs/${encodePathSegment(jobId)}/tasks/${encodePathSegment(taskId)}`,
    { method: "DELETE" }
  );
}

export async function listCompanyTasks(): Promise<JobTaskRecord[]> {
  const response = await requestJson<{ tasks: JobTaskRecord[] }>("/api/v1/tasks");
  return response.tasks;
}

export async function listJobActivity(jobId: string): Promise<AuditLogRecord[]> {
  const response = await requestJson<{ entries: AuditLogRecord[] }>(`/api/v1/jobs/${encodePathSegment(jobId)}/activity`);
  return response.entries;
}

export async function deleteDrawing(drawingId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/v1/drawings/${drawingId}`, {
    method: "DELETE"
  });
}

export async function getDrawing(drawingId: string): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}`);
  return response.drawing;
}

export async function getPricedEstimate(drawingId: string): Promise<PricedEstimateResult> {
  const response = await requestJson<{ pricedEstimate: PricedEstimateResult }>(`/api/v1/drawings/${drawingId}/priced-estimate`);
  return response.pricedEstimate;
}

export async function listQuotes(drawingId: string): Promise<QuoteRecord[]> {
  const response = await requestJson<{ quotes: QuoteRecord[] }>(`/api/v1/drawings/${drawingId}/quotes`);
  return response.quotes;
}

export async function createQuoteSnapshot(
  drawingId: string,
  ancillaryItems: AncillaryEstimateItem[],
  manualEntries: EstimateWorkbookManualEntry[] = []
): Promise<QuoteRecord> {
  const response = await requestJson<{ quote: QuoteRecord }>(`/api/v1/drawings/${drawingId}/quotes`, {
    method: "POST",
    body: { ancillaryItems, manualEntries }
  });
  return response.quote;
}

export async function createDrawing(input: {
  name: string;
  customerId: string;
  layout: LayoutModel;
  savedViewport?: DrawingCanvasViewport | null;
}): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>("/api/v1/drawings", {
    method: "POST",
    body: input
  });
  return response.drawing;
}

export async function updateDrawing(
  drawingId: string,
  input: {
    expectedVersionNumber: number;
    name?: string;
    customerId?: string;
    layout?: LayoutModel;
    savedViewport?: DrawingCanvasViewport | null;
  },
): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}`, {
    method: "PUT",
    body: input
  });
  return response.drawing;
}

export async function setDrawingArchivedState(
  drawingId: string,
  archived: boolean,
  expectedVersionNumber: number,
): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}/archive`, {
    method: "PUT",
    body: { archived, expectedVersionNumber }
  });
  return response.drawing;
}

export async function setDrawingStatus(
  drawingId: string,
  status: DrawingStatus,
  expectedVersionNumber: number,
): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}/status`, {
    method: "PUT",
    body: { status, expectedVersionNumber }
  });
  return response.drawing;
}

export async function listDrawingVersions(drawingId: string): Promise<DrawingVersionRecord[]> {
  const response = await requestJson<{ versions: DrawingVersionRecord[] }>(`/api/v1/drawings/${drawingId}/versions`);
  return response.versions;
}

export async function restoreDrawingVersion(
  drawingId: string,
  versionNumber: number,
  expectedVersionNumber: number,
): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}/restore`, {
    method: "POST",
    body: { versionNumber, expectedVersionNumber }
  });
  return response.drawing;
}

export async function listAuditLog(options: number | AuditLogQueryOptions = 50): Promise<AuditLogRecord[]> {
  const queryOptions = typeof options === "number" ? { limit: options } : options;
  const response = await requestJson<AuditLogResponse>(`/api/v1/audit-log${buildAuditLogQuery(queryOptions)}`);
  return response.entries;
}

export async function exportAuditLogCsv(options: AuditLogQueryOptions = {}): Promise<string> {
  const response = await fetch(buildUrl(`/api/v1/audit-log/export${buildAuditLogQuery(options)}`), {
    method: "GET",
    credentials: "include"
  });
  if (!response.ok) {
    throw new ApiClientError(`Request failed with status ${response.status}`, response.status, null);
  }

  return response.text();
}

export async function getPricingConfig(): Promise<PricingConfigRecord> {
  const response = await requestJson<{ pricingConfig: PricingConfigRecord }>("/api/v1/pricing-config");
  return response.pricingConfig;
}

export async function updatePricingConfig(input: {
  items?: PricingConfigRecord["items"];
  workbook?: PricingConfigRecord["workbook"];
}): Promise<PricingConfigRecord> {
  const response = await requestJson<{ pricingConfig: PricingConfigRecord }>("/api/v1/pricing-config", {
    method: "PUT",
    body: input
  });
  return response.pricingConfig;
}

export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/v1/auth/request-password-reset", {
    method: "POST",
    body: input
  });
}

export async function resetPassword(input: PasswordResetConfirmInput): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/v1/auth/reset-password", {
    method: "POST",
    body: input
  });
}

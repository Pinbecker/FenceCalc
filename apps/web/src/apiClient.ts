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
  DrawingSummary,
  DrawingVersionRecord,
  LayoutModel,
  PricingConfigRecord,
  PricingItem,
  PricedEstimateResult,
  QuoteRecord,
} from "@fence-estimator/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

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

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
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

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  };
  if (options.body !== undefined) {
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

export async function setCustomerArchivedState(customerId: string, archived: boolean): Promise<CustomerRecord> {
  const response = await requestJson<{ customer: CustomerRecord }>(`/api/v1/customers/${customerId}/archive`, {
    method: "PUT",
    body: { archived }
  });
  return response.customer;
}

export async function listDrawings(): Promise<DrawingSummary[]> {
  const response = await requestJson<{ drawings: DrawingSummary[] }>("/api/v1/drawings?scope=ALL");
  return response.drawings;
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

export async function createQuoteSnapshot(drawingId: string, ancillaryItems: AncillaryEstimateItem[]): Promise<QuoteRecord> {
  const response = await requestJson<{ quote: QuoteRecord }>(`/api/v1/drawings/${drawingId}/quotes`, {
    method: "POST",
    body: { ancillaryItems }
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

export async function listAuditLog(limit = 50): Promise<AuditLogRecord[]> {
  const response = await requestJson<{ entries: AuditLogRecord[] }>(`/api/v1/audit-log?limit=${limit}`);
  return response.entries;
}

export async function getPricingConfig(): Promise<PricingConfigRecord> {
  const response = await requestJson<{ pricingConfig: PricingConfigRecord }>("/api/v1/pricing-config");
  return response.pricingConfig;
}

export async function updatePricingConfig(items: PricingItem[]): Promise<PricingConfigRecord> {
  const response = await requestJson<{ pricingConfig: PricingConfigRecord }>("/api/v1/pricing-config", {
    method: "PUT",
    body: { items }
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

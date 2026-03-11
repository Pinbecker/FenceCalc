import type {
  AuditLogRecord,
  AuthSessionEnvelope,
  CompanyRecord,
  CompanyUserRecord,
  DrawingRecord,
  DrawingSummary,
  DrawingVersionRecord,
  LayoutModel
} from "@fence-estimator/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

export interface RegisterAccountInput {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
}

export interface SetupStatus {
  bootstrapRequired: boolean;
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

export interface PasswordResetRequestInput {
  email: string;
}

export interface PasswordResetConfirmInput {
  token: string;
  password: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  token?: string;
  body?: unknown;
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
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
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
  return requestJson<AuthSessionEnvelope>("/api/v1/setup/bootstrap-owner", {
    method: "POST",
    body: input
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

export async function logout(token: string): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/v1/auth/logout", {
    method: "POST",
    token
  });
}

export async function getAuthenticatedUser(token: string): Promise<{ company: CompanyRecord; user: CompanyUserRecord }> {
  return requestJson<{ company: CompanyRecord; user: CompanyUserRecord }>("/api/v1/auth/me", {
    token
  });
}

export async function listUsers(token: string): Promise<CompanyUserRecord[]> {
  const response = await requestJson<{ users: CompanyUserRecord[] }>("/api/v1/users", { token });
  return response.users;
}

export async function createUser(token: string, input: CreateCompanyUserInput): Promise<CompanyUserRecord> {
  const response = await requestJson<{ user: CompanyUserRecord }>("/api/v1/users", {
    method: "POST",
    token,
    body: input
  });
  return response.user;
}

export async function listDrawings(token: string): Promise<DrawingSummary[]> {
  const response = await requestJson<{ drawings: DrawingSummary[] }>("/api/v1/drawings?scope=ALL", { token });
  return response.drawings;
}

export async function getDrawing(token: string, drawingId: string): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}`, { token });
  return response.drawing;
}

export async function createDrawing(token: string, input: { name: string; layout: LayoutModel }): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>("/api/v1/drawings", {
    method: "POST",
    token,
    body: input
  });
  return response.drawing;
}

export async function updateDrawing(
  token: string,
  drawingId: string,
  input: { name?: string; layout?: LayoutModel },
): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}`, {
    method: "PUT",
    token,
    body: input
  });
  return response.drawing;
}

export async function setDrawingArchivedState(token: string, drawingId: string, archived: boolean): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}/archive`, {
    method: "PUT",
    token,
    body: { archived }
  });
  return response.drawing;
}

export async function listDrawingVersions(token: string, drawingId: string): Promise<DrawingVersionRecord[]> {
  const response = await requestJson<{ versions: DrawingVersionRecord[] }>(`/api/v1/drawings/${drawingId}/versions`, {
    token
  });
  return response.versions;
}

export async function restoreDrawingVersion(token: string, drawingId: string, versionNumber: number): Promise<DrawingRecord> {
  const response = await requestJson<{ drawing: DrawingRecord }>(`/api/v1/drawings/${drawingId}/restore`, {
    method: "POST",
    token,
    body: { versionNumber }
  });
  return response.drawing;
}

export async function listAuditLog(token: string, limit = 50): Promise<AuditLogRecord[]> {
  const response = await requestJson<{ entries: AuditLogRecord[] }>(`/api/v1/audit-log?limit=${limit}`, {
    token
  });
  return response.entries;
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

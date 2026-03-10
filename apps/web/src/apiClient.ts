import type { AuthSessionEnvelope, CompanyRecord, CompanyUserRecord, DrawingRecord, DrawingSummary, LayoutModel } from "@fence-estimator/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

export interface RegisterAccountInput {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
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

export async function registerAccount(input: RegisterAccountInput): Promise<AuthSessionEnvelope> {
  return requestJson<AuthSessionEnvelope>("/api/v1/auth/register", {
    method: "POST",
    body: input
  });
}

export async function login(input: LoginInput): Promise<AuthSessionEnvelope> {
  return requestJson<AuthSessionEnvelope>("/api/v1/auth/login", {
    method: "POST",
    body: input
  });
}

export async function getAuthenticatedUser(token: string): Promise<{ company: CompanyRecord; user: CompanyUserRecord }> {
  return requestJson<{ company: CompanyRecord; user: CompanyUserRecord }>("/api/v1/auth/me", {
    token
  });
}

export async function listDrawings(token: string): Promise<DrawingSummary[]> {
  const response = await requestJson<{ drawings: DrawingSummary[] }>("/api/v1/drawings", { token });
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

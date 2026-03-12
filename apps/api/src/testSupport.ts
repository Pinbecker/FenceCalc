import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { InMemoryAppRepository } from "./repository.js";

export class UnhealthyRepository extends InMemoryAppRepository {
  public override checkHealth(): Promise<void> {
    return Promise.reject(new Error("database unavailable"));
  }
}

export function getCookieHeader(response: { headers: Record<string, string | string[] | number | undefined> }): { cookie: string } {
  const raw = response.headers["set-cookie"];
  const setCookie = Array.isArray(raw) ? raw[0] : raw;
  const cookie = typeof setCookie === "string" ? setCookie.split(";")[0] ?? "" : "";
  return { cookie };
}

export async function registerAndGetSession(configOverrides: Partial<ReturnType<typeof loadConfig>> = {}) {
  const app = buildApp({
    repository: new InMemoryAppRepository(),
    config: {
      ...loadConfig(),
      databasePath: "./data/test.db",
      writeRateLimitMaxRequests: 50,
      ...configOverrides
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/setup/bootstrap-owner",
    ...(configOverrides.bootstrapOwnerSecret
      ? { headers: { "x-bootstrap-secret": configOverrides.bootstrapOwnerSecret } }
      : {}),
    payload: {
      companyName: "Acme Fencing",
      displayName: "Jane Doe",
      email: "jane@example.com",
      password: "supersecure123"
    }
  });
  const registration = response.json<{ session: { id: string }; user: { id: string } }>();

  return {
    app,
    registration,
    cookieHeader: getCookieHeader(response)
  };
}

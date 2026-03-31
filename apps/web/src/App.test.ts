import { describe, expect, it } from "vitest";

import {
  canManageAdmin,
  canManagePricing,
  getPortalRedirectTarget,
  shouldRefreshPortalAdminData,
  shouldRefreshPortalDrawings
} from "./App.js";

describe("App route helpers", () => {
  it("gates admin and pricing capabilities by role", () => {
    expect(canManageAdmin("OWNER")).toBe(true);
    expect(canManageAdmin("ADMIN")).toBe(true);
    expect(canManageAdmin("MEMBER")).toBe(false);
    expect(canManagePricing("OWNER")).toBe(true);
    expect(canManagePricing("ADMIN")).toBe(true);
    expect(canManagePricing("MEMBER")).toBe(false);
  });

  it("redirects login, pricing, and admin routes appropriately", () => {
    expect(
      getPortalRedirectTarget({
        hasSession: false,
        route: "customer",
        showAdmin: false,
        showPricing: false
      })
    ).toBe("login");

    expect(
      getPortalRedirectTarget({
        hasSession: true,
        route: "login",
        showAdmin: true,
        showPricing: true
      })
    ).toBe("dashboard");

    expect(
      getPortalRedirectTarget({
        hasSession: true,
        route: "pricing",
        showAdmin: false,
        showPricing: false
      })
    ).toBe("dashboard");

    expect(
      getPortalRedirectTarget({
        hasSession: true,
        route: "admin",
        showAdmin: false,
        showPricing: true
      })
    ).toBe("dashboard");
  });

  it("refreshes the right datasets for each portal route", () => {
    expect(shouldRefreshPortalDrawings("dashboard")).toBe(true);
    expect(shouldRefreshPortalDrawings("tasks")).toBe(true);
    expect(shouldRefreshPortalDrawings("drawings")).toBe(false);
    expect(shouldRefreshPortalDrawings("customer")).toBe(true);
    expect(shouldRefreshPortalDrawings("drawing")).toBe(true);
    expect(shouldRefreshPortalDrawings("editor")).toBe(true);
    expect(shouldRefreshPortalDrawings("estimate")).toBe(false);
    expect(shouldRefreshPortalDrawings("pricing")).toBe(false);

    expect(shouldRefreshPortalAdminData("dashboard", true)).toBe(true);
    expect(shouldRefreshPortalAdminData("admin", true)).toBe(true);
    expect(shouldRefreshPortalAdminData("tasks", true)).toBe(true);
    expect(shouldRefreshPortalAdminData("drawings", true)).toBe(false);
    expect(shouldRefreshPortalAdminData("admin", false)).toBe(false);
  });
});

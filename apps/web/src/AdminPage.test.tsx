import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuditLogRecord, CompanyUserRecord, CustomerSummary } from "@fence-estimator/contracts";

import { AdminPage } from "./AdminPage.js";

const users: CompanyUserRecord[] = [
  {
    id: "user-1",
    companyId: "company-1",
    email: "jane@example.com",
    displayName: "Jane Doe",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  }
];

const auditLog: AuditLogRecord[] = [
  {
    id: "audit-1",
    companyId: "company-1",
    actorUserId: "user-1",
    entityType: "USER",
    entityId: "user-2",
    action: "USER_CREATED",
    summary: "Jane Doe added John Smith",
    createdAtIso: "2026-03-10T11:00:00.000Z"
  },
  {
    id: "audit-2",
    companyId: "company-1",
    actorUserId: "user-1",
    entityType: "DRAWING",
    entityId: "drawing-1",
    action: "DRAWING_CREATED",
    summary: "Jane Doe created Main yard",
    createdAtIso: "2026-03-10T12:00:00.000Z"
  }
];

const archivedCustomer: CustomerSummary = {
  id: "customer-1",
  companyId: "company-1",
  name: "Archived Corp",
  primaryContactName: "Bob",
  primaryEmail: "bob@example.com",
  primaryPhone: "",
  additionalContacts: [],
  siteAddress: "",
  notes: "",
  isArchived: true,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAtIso: "2026-03-10T10:00:00.000Z",
  updatedAtIso: "2026-03-10T10:00:00.000Z",
  activeDrawingCount: 0,
  archivedDrawingCount: 2,
  lastActivityAtIso: "2026-03-10T10:00:00.000Z"
};

function renderPage(overrides: { customers?: CustomerSummary[] } = {}) {
  return renderToStaticMarkup(
    <AdminPage
      users={users}
      auditLog={auditLog}
      customers={overrides.customers ?? []}
      currentUserId="user-1"
      currentUserRole="OWNER"
      isLoadingUsers={false}
      isLoadingAuditLog={false}
      isSavingUser={false}
      isResettingUserId={null}
      isArchivingCustomerId={null}
      errorMessage={null}
      noticeMessage={null}
      onRefresh={() => Promise.resolve()}
      onRefreshAudit={() => Promise.resolve()}
      onApplyAuditFilters={() => Promise.resolve()}
      onExportAudit={() => Promise.resolve("createdAtIso,entityType")}
      onCreateUser={() => Promise.resolve(true)}
      onResetUserPassword={() => Promise.resolve(true)}
      onRestoreCustomer={() => Promise.resolve()}
    />
  );
}

describe("AdminPage", () => {
  it("renders user provisioning and audit history", () => {
    const html = renderPage();

    expect(html).toContain("User management");
    expect(html).toContain("Audit trail");
    expect(html).toContain("Jane Doe added John Smith");
  });

  it("renders category filter buttons with counts", () => {
    const html = renderPage();

    expect(html).toContain("Users");
    expect(html).toContain("Drawings");
    expect(html).toContain("Search audit events");
    expect(html).toContain("Export CSV");
    expect(html).toContain("Apply filters");
  });

  it("shows archived customers section when archived customers exist", () => {
    const html = renderPage({ customers: [archivedCustomer] });

    expect(html).toContain("Archived customers");
    expect(html).toContain("Archived Corp");
    expect(html).toContain("Restore");
  });

  it("hides archived customers section when none are archived", () => {
    const html = renderPage({ customers: [] });

    expect(html).not.toContain("Archived customers");
  });
});

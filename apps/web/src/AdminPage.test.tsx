import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  AuditLogRecord,
  CompanyUserRecord,
  CustomerSummary,
  DrawingWorkspaceSummary,
} from "@fence-estimator/contracts";

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

const archivedWorkspace: DrawingWorkspaceSummary = {
  id: "job-1",
  companyId: "company-1",
  customerId: "customer-1",
  customerName: "Archived Corp",
  name: "North boundary",
  stage: "DRAFT",
  primaryDrawingId: "drawing-1",
  commercialInputs: {
    labourOverheadPercent: 75,
    travelLodgePerDay: 90,
    travelDays: 1,
    markupRate: 225,
    markupUnits: 1,
    distributionCharge: 215,
    concretePricePerCube: 150,
    hardDig: false,
    clearSpoils: false,
  },
  notes: "",
  ownerUserId: "user-1",
  ownerDisplayName: "Jane Doe",
  isArchived: true,
  archivedAtIso: "2026-03-10T12:00:00.000Z",
  archivedByUserId: "user-1",
  stageChangedAtIso: null,
  stageChangedByUserId: null,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  updatedByDisplayName: "Jane Doe",
  createdAtIso: "2026-03-10T10:00:00.000Z",
  updatedAtIso: "2026-03-10T12:00:00.000Z",
  drawingCount: 2,
  openTaskCount: 1,
  completedTaskCount: 0,
  lastActivityAtIso: "2026-03-10T12:00:00.000Z",
  latestQuoteTotal: null,
  latestQuoteCreatedAtIso: null,
  latestEstimateTotal: null,
  primaryDrawingName: "North boundary",
  primaryDrawingUpdatedAtIso: "2026-03-10T12:00:00.000Z",
  primaryPreviewLayout: { segments: [], gates: [] },
};

function renderPage(
  overrides: { customers?: CustomerSummary[]; workspaces?: DrawingWorkspaceSummary[] } = {},
) {
  return renderToStaticMarkup(
    <AdminPage
      users={users}
      auditLog={auditLog}
      customers={overrides.customers ?? []}
      workspaces={overrides.workspaces ?? []}
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
      onRestoreWorkspace={() => Promise.resolve(true)}
      onDeleteWorkspace={() => Promise.resolve(true)}
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

  it("shows archived workspaces section when archived workspaces exist", () => {
    const html = renderPage({ workspaces: [archivedWorkspace] });

    expect(html).toContain("Archived workspaces");
    expect(html).toContain("North boundary");
    expect(html).toContain("1 revision");
    expect(html).toContain("Restore workspace");
    expect(html).toContain("Delete permanently");
  });
});

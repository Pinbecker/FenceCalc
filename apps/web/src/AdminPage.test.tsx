import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuditLogRecord, CompanyUserRecord } from "@fence-estimator/contracts";

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
  }
];

describe("AdminPage", () => {
  it("renders user provisioning and audit history", () => {
    const html = renderToStaticMarkup(
      <AdminPage
        users={users}
        auditLog={auditLog}
        currentUserRole="OWNER"
        isLoadingUsers={false}
        isLoadingAuditLog={false}
        isSavingUser={false}
        errorMessage={null}
        noticeMessage={null}
        onRefresh={() => Promise.resolve()}
        onRefreshAudit={() => Promise.resolve()}
        onCreateUser={() => Promise.resolve(true)}
      />,
    );

    expect(html).toContain("User management");
    expect(html).toContain("Audit trail");
    expect(html).toContain("Jane Doe added John Smith");
  });
});

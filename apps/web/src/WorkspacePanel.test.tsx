import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, DrawingSummary } from "@fence-estimator/contracts";

import { WorkspacePanel } from "./WorkspacePanel.js";

const resolvedPromise = () => Promise.resolve();
const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

const baseSession: AuthSessionEnvelope = {
  company: {
    id: "company-1",
    name: "Acme Fencing",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  user: {
    id: "user-1",
    companyId: "company-1",
    email: "jane@example.com",
    displayName: "Jane Doe",
    role: "OWNER",
    createdAtIso: "2026-03-10T10:00:00.000Z"
  },
  session: {
    id: "session-1",
    companyId: "company-1",
    userId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    expiresAtIso: "2026-04-10T10:00:00.000Z"
  }
};

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front perimeter",
    customerName: "Cleveland Land Services",
    previewLayout: { segments: [], gates: [] },
    segmentCount: 0,
    gateCount: 0,
    schemaVersion: TEST_SCHEMA_VERSION,
    rulesVersion: TEST_RULES_VERSION,
    versionNumber: 1,
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    createdByUserId: "user-1",
    createdByDisplayName: "Jane Doe",
    updatedByUserId: "user-1",
    updatedByDisplayName: "Jane Doe",
    contributorUserIds: ["user-1"],
    contributorDisplayNames: ["Jane Doe"],
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z"
  }
];

describe("WorkspacePanel", () => {
  it("renders auth controls when no session exists", () => {
    const html = renderToStaticMarkup(
      <WorkspacePanel
        session={null}
        drawings={[]}
        currentDrawingId={null}
        currentDrawingName=""
        currentCustomerName=""
        isDirty={false}
        isRestoringSession={false}
        isAuthenticating={false}
        isLoadingDrawings={false}
        isSavingDrawing={false}
        errorMessage={null}
        noticeMessage={null}
        onSetCurrentDrawingName={() => undefined}
        onSetCurrentCustomerName={() => undefined}
        onRegister={resolvedPromise}
        onLogin={resolvedPromise}
        onLogout={() => undefined}
        onRefreshDrawings={resolvedPromise}
        onLoadDrawing={resolvedPromise}
        onSaveDrawing={resolvedPromise}
        onSaveDrawingAsNew={resolvedPromise}
        onStartNewDraft={() => undefined}
      />,
    );

    expect(html).toContain("Login");
    expect(html).toContain("Register");
    expect(html).toContain("Sign In");
  });

  it("renders company drawings and dirty state for authenticated sessions", () => {
    const html = renderToStaticMarkup(
      <WorkspacePanel
        session={baseSession}
        drawings={drawings}
        currentDrawingId="drawing-1"
        currentDrawingName="Front perimeter"
        currentCustomerName="Cleveland Land Services"
        isDirty
        isRestoringSession={false}
        isAuthenticating={false}
        isLoadingDrawings={false}
        isSavingDrawing={false}
        errorMessage={null}
        noticeMessage="Loaded"
        onSetCurrentDrawingName={() => undefined}
        onSetCurrentCustomerName={() => undefined}
        onRegister={resolvedPromise}
        onLogin={resolvedPromise}
        onLogout={() => undefined}
        onRefreshDrawings={resolvedPromise}
        onLoadDrawing={resolvedPromise}
        onSaveDrawing={resolvedPromise}
        onSaveDrawingAsNew={resolvedPromise}
        onStartNewDraft={() => undefined}
      />,
    );

    expect(html).toContain("Acme Fencing");
    expect(html).toContain("Front perimeter");
    expect(html).toContain("Unsaved changes");
    expect(html).toContain("Saved Drawings");
  });
});

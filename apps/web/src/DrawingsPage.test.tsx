import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import { DrawingsPage } from "./DrawingsPage.js";

const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front perimeter",
    customerId: "customer-1",
    customerName: "Cleveland Land Services",
    previewLayout: { segments: [], gates: [] },
    segmentCount: 8,
    gateCount: 1,
    schemaVersion: TEST_SCHEMA_VERSION,
    rulesVersion: TEST_RULES_VERSION,
    versionNumber: 3,
    revisionNumber: 0,
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
    updatedAtIso: "2026-03-10T12:00:00.000Z",
    status: "DRAFT",
    statusChangedAtIso: null,
    statusChangedByUserId: null
  }
];

const customers: CustomerSummary[] = [
  {
    id: "customer-1",
    companyId: "company-1",
    name: "Cleveland Land Services",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    additionalContacts: [],
    siteAddress: "",
    notes: "",
    isArchived: false,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z",
    activeDrawingCount: 1,
    archivedDrawingCount: 0,
    lastActivityAtIso: "2026-03-10T12:00:00.000Z"
  }
];

const session: AuthSessionEnvelope = {
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

describe("DrawingsPage", () => {
  it("renders the denser grouped drawing worklist", () => {
    const html = renderToStaticMarkup(
      <DrawingsPage
        customers={customers}
        session={session}
        drawings={drawings}
        isLoading={false}
        onRefresh={() => Promise.resolve()}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleArchive={() => Promise.resolve(true)}
        onChangeStatus={() => Promise.resolve(true)}
      />,
    );

    expect(html).toContain("Saved drawings");
    expect(html).toContain("Drawing library summary");
    expect(html).toContain("Company includes every drawing in this workspace.");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Mine");
    expect(html).toContain("Archive");
    expect(html).toContain("Open editor");
    expect(html).toContain("Estimate");
  });
});

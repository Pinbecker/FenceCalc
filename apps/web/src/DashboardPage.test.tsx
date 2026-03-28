import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AuthSessionEnvelope, CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import { DashboardPage } from "./DashboardPage.js";

const TEST_SCHEMA_VERSION = 1;
const TEST_RULES_VERSION = "2026-03-11";

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

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Front perimeter",
    customerId: "customer-1",
    customerName: "Cleveland Land Services",
    previewLayout: {
      segments: [
        {
          id: "segment-1",
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          spec: { system: "TWIN_BAR", height: "2m", twinBarVariant: "STANDARD" }
        }
      ],
      gates: []
    },
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

describe("DashboardPage", () => {
  it("renders the refreshed work queue and customer activity layout", () => {
    const html = renderToStaticMarkup(
      <DashboardPage session={session} customers={customers} drawings={drawings} onNavigate={() => undefined} />
    );

    expect(html).toContain("Workspace overview");
    expect(html).toContain("Welcome, Jane Doe");
    expect(html).toContain("My recent jobs");
    expect(html).toContain("Recent job movement");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Front perimeter");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Drawing preview for Front perimeter");
    expect(html).toContain("1 drawings");
    expect(html).not.toContain("Signed in");
    expect(html).not.toContain("Access");
  });

  it("excludes drawings whose customer is archived", () => {
    const archivedCustomer: CustomerSummary = {
      ...customers[0]!,
      isArchived: true,
      activeDrawingCount: 0,
      archivedDrawingCount: 1
    };

    const html = renderToStaticMarkup(
      <DashboardPage session={session} customers={[archivedCustomer]} drawings={drawings} onNavigate={() => undefined} />
    );

    expect(html).not.toContain("Front perimeter");
    expect(html).not.toContain("Cleveland Land Services");
    expect(html).toContain("No jobs saved yet");
  });

  it("excludes archived drawings from both sections", () => {
    const archivedDrawing: DrawingSummary = {
      ...drawings[0]!,
      isArchived: true,
      archivedAtIso: "2026-03-10T14:00:00.000Z",
      archivedByUserId: "user-1"
    };

    const html = renderToStaticMarkup(
      <DashboardPage session={session} customers={customers} drawings={[archivedDrawing]} onNavigate={() => undefined} />
    );

    expect(html).not.toContain("Front perimeter");
    expect(html).toContain("No jobs saved yet");
    expect(html).toContain("No activity yet");
  });
});

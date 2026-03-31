import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  AuthSessionEnvelope,
  CustomerSummary,
  DrawingSummary,
  DrawingWorkspaceSummary,
} from "@fence-estimator/contracts";

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
    workspaceId: "workspace-1",
    jobRole: "PRIMARY",
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

const workspaces: DrawingWorkspaceSummary[] = [
  {
    id: "workspace-1",
    companyId: "company-1",
    customerId: "customer-1",
    customerName: "Cleveland Land Services",
    name: "Front perimeter",
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
    isArchived: false,
    archivedAtIso: null,
    archivedByUserId: null,
    stageChangedAtIso: null,
    stageChangedByUserId: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    updatedByDisplayName: "Jane Doe",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z",
    drawingCount: 1,
    openTaskCount: 0,
    completedTaskCount: 0,
    lastActivityAtIso: "2026-03-10T12:00:00.000Z",
    latestQuoteTotal: null,
    latestQuoteCreatedAtIso: null,
    latestEstimateTotal: null,
    primaryDrawingName: "Front perimeter",
    primaryDrawingUpdatedAtIso: "2026-03-10T12:00:00.000Z",
    primaryPreviewLayout: {
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
  }
];

describe("DashboardPage", () => {
  it("renders the refreshed work queue and customer activity layout", () => {
    const html = renderToStaticMarkup(
      <DashboardPage
        session={session}
        customers={customers}
        workspaces={workspaces}
        drawings={drawings}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Workspace overview");
    expect(html).toContain("Welcome, Jane Doe");
    expect(html).toContain("My recent workspace activity");
    expect(html).toContain("Recent workspace movement");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Front perimeter");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Drawing preview for Front perimeter");
    expect(html).toContain("1 revision");
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
      <DashboardPage
        session={session}
        customers={[archivedCustomer]}
        workspaces={workspaces}
        drawings={drawings}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Front perimeter");
    expect(html).toContain("Cleveland Land Services");
  });

  it("excludes archived drawings from both sections", () => {
    const archivedDrawing: DrawingSummary = {
      ...drawings[0]!,
      isArchived: true,
      archivedAtIso: "2026-03-10T14:00:00.000Z",
      archivedByUserId: "user-1"
    };

    const html = renderToStaticMarkup(
      <DashboardPage
        session={session}
        customers={customers}
        workspaces={workspaces}
        drawings={[archivedDrawing]}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Front perimeter");
    expect(html).toContain("No quote yet");
  });
});

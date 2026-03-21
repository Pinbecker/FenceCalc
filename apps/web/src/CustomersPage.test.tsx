import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import { CustomersPage } from "./CustomersPage.js";

const customers: CustomerSummary[] = [
  {
    id: "customer-1",
    companyId: "company-1",
    name: "Cleveland Land Services",
    primaryContactName: "Jane Doe",
    primaryEmail: "jane@example.com",
    primaryPhone: "01234 567890",
    siteAddress: "1 Yard Road",
    notes: "Key holder on site",
    isArchived: false,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAtIso: "2026-03-10T10:00:00.000Z",
    updatedAtIso: "2026-03-10T12:00:00.000Z",
    activeDrawingCount: 2,
    archivedDrawingCount: 1,
    lastActivityAtIso: "2026-03-10T12:00:00.000Z"
  }
];

const drawings: DrawingSummary[] = [
  {
    id: "drawing-1",
    companyId: "company-1",
    name: "Legacy yard layout",
    customerId: null,
    customerName: "",
    previewLayout: { segments: [], gates: [] },
    segmentCount: 2,
    gateCount: 0,
    schemaVersion: 1,
    rulesVersion: "2026-03-11",
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

describe("CustomersPage", () => {
  it("renders the customer directory and links into customer workspaces", () => {
    const html = renderToStaticMarkup(
      <CustomersPage
        customers={customers}
        drawings={drawings}
        isLoading={false}
        isSavingCustomer={false}
        onRefresh={() => Promise.resolve()}
        onSaveCustomer={() => Promise.resolve(null)}
        onOpenDrawing={() => undefined}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer directory");
    expect(html).toContain("Company customers");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("View Customer");
    expect(html).toContain("Unassigned drawings");
    expect(html).toContain("Legacy yard layout");
  });

  it("renders the empty directory state when there are no customers", () => {
    const html = renderToStaticMarkup(
      <CustomersPage
        customers={[]}
        drawings={[]}
        isLoading={false}
        isSavingCustomer={false}
        onRefresh={() => Promise.resolve()}
        onSaveCustomer={() => Promise.resolve(null)}
        onOpenDrawing={() => undefined}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("No customers match this search");
  });
});

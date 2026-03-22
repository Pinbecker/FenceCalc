import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CustomerSummary, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

import { CustomerPage } from "./CustomerPage.js";

const customer: CustomerSummary = {
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
  activeDrawingCount: 1,
  archivedDrawingCount: 0,
  lastActivityAtIso: "2026-03-10T12:00:00.000Z"
};

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
    schemaVersion: 1,
    rulesVersion: "2026-03-11",
    versionNumber: 3,
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

const versions: DrawingVersionRecord[] = [];

describe("CustomerPage", () => {
  it("renders customer details and that customer's drawings", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "customer-1" }}
        customers={[customer]}
        drawings={drawings}
        isLoading={false}
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        onRefresh={() => Promise.resolve()}
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleDrawingArchived={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer workspace");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Customer profile");
    expect(html).toContain("Drawing history");
    expect(html).toContain("Front perimeter");
    expect(html).toContain("Open editor");
  });

  it("renders a safe empty state when the customer is missing", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "missing-customer" }}
        customers={[customer]}
        drawings={drawings}
        isLoading={false}
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        onRefresh={() => Promise.resolve()}
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleDrawingArchived={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer not found");
    expect(html).toContain("Back to customers");
  });
});

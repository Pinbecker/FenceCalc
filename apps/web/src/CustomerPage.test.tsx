import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  CustomerSummary,
  DrawingSummary,
  DrawingWorkspaceSummary,
} from "@fence-estimator/contracts";

import { CustomerPage, saveCustomerProfile, validateCustomerProfileInput } from "./CustomerPage.js";

const customer: CustomerSummary = {
  id: "customer-1",
  companyId: "company-1",
  name: "Cleveland Land Services",
  primaryContactName: "Jane Doe",
  primaryEmail: "jane@example.com",
  primaryPhone: "01234 567890",
  additionalContacts: [
    { name: "Bob Smith", phone: "09876 543210", email: "bob@example.com" },
  ],
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
    workspaceId: "workspace-1",
    jobRole: "PRIMARY",
    name: "Front perimeter",
    customerId: "customer-1",
    customerName: "Cleveland Land Services",
    previewLayout: { segments: [], gates: [] },
    segmentCount: 8,
    gateCount: 1,
    schemaVersion: 1,
    rulesVersion: "2026-03-11",
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
    primaryPreviewLayout: { segments: [], gates: [] },
  },
];



describe("CustomerPage", () => {
  it("renders customer details and that customer's drawings", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "customer-1" }}
        customers={[customer]}
        workspaces={workspaces}
        drawings={drawings}
        userRole="OWNER"
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        errorMessage={null}
        noticeMessage={null}
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onCreateDrawing={() => Promise.resolve(null)}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onSetWorkspaceArchived={() => Promise.resolve(true)}
        onDeleteWorkspace={() => Promise.resolve(true)}
        onDeleteCustomer={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer workspace");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("01234 567890");
    expect(html).toContain("1 Yard Road");
    expect(html).toContain("Front perimeter");
    expect(html).toContain("Drawing workspaces");
    expect(html).toContain("Edit profile");
    expect(html).toContain("Open workspace");
    expect(html).toContain("Original");
    expect(html).toContain("Additional contacts");
    expect(html).toContain("Bob Smith");
    expect(html).toContain("bob@example.com");
    expect(html).toContain("portal-customer-drawing-card-copy");
    expect(html).toContain("portal-customer-drawing-card-footer");
    expect(html).not.toContain("Back to customers");
    expect(html).not.toContain("Refresh");
    expect(html).not.toContain("New job");
  });

  it("renders a safe empty state when the customer is missing", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "missing-customer" }}
        customers={[customer]}
        workspaces={workspaces}
        drawings={drawings}
        userRole="OWNER"
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        errorMessage={null}
        noticeMessage={null}
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onCreateDrawing={() => Promise.resolve(null)}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onSetWorkspaceArchived={() => Promise.resolve(true)}
        onDeleteWorkspace={() => Promise.resolve(true)}
        onDeleteCustomer={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer not found");
    expect(html).toContain("Browse customers");
  });

  it("renders inline status messages when provided", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "customer-1" }}
        customers={[customer]}
        workspaces={workspaces}
        drawings={drawings}
        userRole="OWNER"
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        errorMessage="Customer name already exists"
        noticeMessage="Updated customer Cleveland Land Services"
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onCreateDrawing={() => Promise.resolve(null)}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onSetWorkspaceArchived={() => Promise.resolve(true)}
        onDeleteWorkspace={() => Promise.resolve(true)}
        onDeleteCustomer={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer name already exists");
    expect(html).toContain("Updated customer Cleveland Land Services");
  });

  it("keeps customer edits available when the save request fails", async () => {
    const onSaveCustomer = vi.fn(() => Promise.resolve(null));

    const saved = await saveCustomerProfile(
      customer,
      {
        name: "  Cleveland Land Services  ",
        primaryContactName: "  Jane Doe  ",
        primaryEmail: "  jane@example.com  ",
        primaryPhone: "  01234 567890  ",
        siteAddress: "  1 Yard Road  ",
      },
      [{ name: "  Bob Smith  ", phone: "  09876 543210  ", email: "  bob@example.com  " }],
      onSaveCustomer,
    );

    expect(saved).toEqual({ ok: false, message: null });
    expect(onSaveCustomer).toHaveBeenCalledWith({
      mode: "update",
      customerId: "customer-1",
      customer: {
        name: "Cleveland Land Services",
        primaryContactName: "Jane Doe",
        primaryEmail: "jane@example.com",
        primaryPhone: "01234 567890",
        siteAddress: "1 Yard Road",
        additionalContacts: [{ name: "Bob Smith", phone: "09876 543210", email: "bob@example.com" }],
      },
    });
  });

  it("rejects invalid additional contact emails before sending the save request", async () => {
    const onSaveCustomer = vi.fn(() => Promise.resolve({ id: "customer-1" }));

    const saved = await saveCustomerProfile(
      customer,
      {
        name: "Cleveland Land Services",
        primaryContactName: "Jane Doe",
        primaryEmail: "jane@example.com",
        primaryPhone: "01234 567890",
        siteAddress: "1 Yard Road",
      },
      [{ name: "Bob Smith", phone: "09876 543210", email: "not-an-email" }],
      onSaveCustomer,
    );

    expect(saved).toEqual({ ok: false, message: "Enter a valid email address for additional contact 1, or leave it blank." });
    expect(onSaveCustomer).not.toHaveBeenCalled();
  });

  it("formats friendly validation messages for customer profile input", () => {
    expect(
      validateCustomerProfileInput({
        name: "Cleveland Land Services",
        primaryContactName: "Jane Doe",
        primaryEmail: "bad-email",
        primaryPhone: "01234 567890",
        siteAddress: "1 Yard Road",
        additionalContacts: [],
      }),
    ).toBe("Enter a valid primary email address or leave it blank.");
  });
});

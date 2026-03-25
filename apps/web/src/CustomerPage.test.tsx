import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CustomerSummary, DrawingSummary, DrawingVersionRecord } from "@fence-estimator/contracts";

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
    updatedAtIso: "2026-03-10T12:00:00.000Z",
    status: "DRAFT",
    statusChangedAtIso: null,
    statusChangedByUserId: null
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
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        errorMessage={null}
        noticeMessage={null}
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleDrawingArchived={() => Promise.resolve(true)}
        onChangeDrawingStatus={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
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
    expect(html).toContain("Archive");
    expect(html).toContain("Edit profile");
    expect(html).toContain("v3");
    expect(html).toContain("Additional contacts");
    expect(html).toContain("Bob Smith");
    expect(html).toContain("bob@example.com");
    expect(html).toContain("portal-customer-drawing-card-copy");
    expect(html).toContain("portal-customer-drawing-card-footer");
    expect(html).not.toContain("Back to customers");
    expect(html).not.toContain("Refresh");
    expect(html).not.toContain("Notes");
  });

  it("renders a safe empty state when the customer is missing", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "missing-customer" }}
        customers={[customer]}
        drawings={drawings}
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        errorMessage={null}
        noticeMessage={null}
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleDrawingArchived={() => Promise.resolve(true)}
        onChangeDrawingStatus={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer not found");
    expect(html).toContain("Browse customers");
  });

  it("does not render inline status messages", () => {
    const html = renderToStaticMarkup(
      <CustomerPage
        query={{ customerId: "customer-1" }}
        customers={[customer]}
        drawings={drawings}
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        errorMessage="Customer name already exists"
        noticeMessage="Updated customer Cleveland Land Services"
        onSaveCustomer={() => Promise.resolve({ id: "customer-1" })}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onOpenDrawing={() => undefined}
        onOpenEstimate={() => undefined}
        onCreateDrawing={() => undefined}
        onToggleDrawingArchived={() => Promise.resolve(true)}
        onChangeDrawingStatus={() => Promise.resolve(true)}
        onLoadVersions={() => Promise.resolve(versions)}
        onRestoreVersion={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).not.toContain("Customer name already exists");
    expect(html).not.toContain("Updated customer Cleveland Land Services");
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

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CustomerSummary } from "@fence-estimator/contracts";

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

describe("CustomersPage", () => {
  it("renders the directory and the unselected detail state", () => {
    const html = renderToStaticMarkup(
      <CustomersPage
        customers={customers}
        isLoading={false}
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        onRefresh={() => Promise.resolve()}
        onSaveCustomer={() => Promise.resolve(null)}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("Customer directory");
    expect(html).toContain("Company customers");
    expect(html).toContain("Cleveland Land Services");
    expect(html).toContain("No customer selected");
    expect(html).toContain("Last activity");
  });

  it("renders the empty directory state when there are no customers", () => {
    const html = renderToStaticMarkup(
      <CustomersPage
        customers={[]}
        isLoading={false}
        isSavingCustomer={false}
        isArchivingCustomerId={null}
        onRefresh={() => Promise.resolve()}
        onSaveCustomer={() => Promise.resolve(null)}
        onSetCustomerArchived={() => Promise.resolve(true)}
        onNavigate={() => undefined}
      />
    );

    expect(html).toContain("No customers match this search");
  });
});

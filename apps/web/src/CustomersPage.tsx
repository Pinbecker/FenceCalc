import { useMemo, useState } from "react";

import type { CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import type { PortalRoute } from "./useHashRoute";

type CustomerFilter = "ACTIVE" | "ARCHIVED" | "ALL";

interface CustomerDraft {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  siteAddress: string;
  notes: string;
}

interface CustomersPageProps {
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  isLoading: boolean;
  isSavingCustomer: boolean;
  onRefresh(this: void): Promise<void>;
  onSaveCustomer(
    this: void,
    input:
      | { mode: "create"; customer: CustomerDraft }
      | { mode: "update"; customerId: string; customer: Partial<CustomerDraft> },
  ): Promise<{ id: string } | null>;
  onOpenDrawing(this: void, drawingId: string): void;
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

function buildEmptyDraft(): CustomerDraft {
  return {
    name: "",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    siteAddress: "",
    notes: "",
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No activity";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sortStrings(left: string, right: string): number {
  return left.localeCompare(right, "en-GB", { sensitivity: "base" });
}

export function CustomersPage({
  customers,
  drawings,
  isLoading,
  isSavingCustomer,
  onRefresh,
  onSaveCustomer,
  onOpenDrawing,
  onNavigate,
}: CustomersPageProps) {
  const [filter, setFilter] = useState<CustomerFilter>("ACTIVE");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(buildEmptyDraft);

  const visibleCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return customers
      .filter((customer) => {
        if (filter === "ACTIVE") {
          return !customer.isArchived;
        }
        if (filter === "ARCHIVED") {
          return customer.isArchived;
        }
        return true;
      })
      .filter((customer) => {
        if (!normalizedSearch) {
          return true;
        }
        return [
          customer.name,
          customer.primaryContactName,
          customer.primaryEmail,
          customer.primaryPhone,
          customer.siteAddress,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .slice()
      .sort((left, right) => {
        if (right.lastActivityAtIso && left.lastActivityAtIso && right.lastActivityAtIso !== left.lastActivityAtIso) {
          return right.lastActivityAtIso.localeCompare(left.lastActivityAtIso);
        }
        return sortStrings(left.name, right.name);
      });
  }, [customers, filter, search]);

  const activeCount = customers.filter((customer) => !customer.isArchived).length;
  const archivedCount = customers.length - activeCount;
  const activeWorkCount = customers.filter((customer) => customer.activeDrawingCount > 0).length;
  const unassignedDrawings = useMemo(
    () => drawings.filter((drawing) => !drawing.customerId).sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso)),
    [drawings],
  );

  const handleCreateCustomer = async () => {
    const trimmedDraft: CustomerDraft = {
      name: draft.name.trim(),
      primaryContactName: draft.primaryContactName.trim(),
      primaryEmail: draft.primaryEmail.trim(),
      primaryPhone: draft.primaryPhone.trim(),
      siteAddress: draft.siteAddress.trim(),
      notes: draft.notes.trim(),
    };

    const result = await onSaveCustomer({ mode: "create", customer: trimmedDraft });
    if (!result) {
      return;
    }

    setIsCreating(false);
    setDraft(buildEmptyDraft());
    onNavigate("customer", { customerId: result.id });
  };

  return (
    <section className="portal-page portal-customers-page">
      <header className="portal-page-header">
        <div className="portal-customers-heading">
          <span className="portal-eyebrow">Customers</span>
          <h1>Customer directory</h1>
          <p>Browse customers first, then open a dedicated customer page to review customer information and that customer’s drawings together.</p>
        </div>
        <div className="portal-header-actions">
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="portal-primary-button"
            onClick={() => {
              setIsCreating((current) => !current);
              if (!isCreating) {
                setDraft(buildEmptyDraft());
              }
            }}
          >
            {isCreating ? "Close Create Form" : "New Customer"}
          </button>
        </div>
      </header>

      <section className="portal-surface-card drawing-library-toolbar">
        <div className="drawing-library-toolbar-main">
          <div className="drawing-library-toolbar-filters">
            <div className="portal-filter-row" role="tablist" aria-label="Customer filter">
              {(["ACTIVE", "ARCHIVED", "ALL"] as CustomerFilter[]).map((option) => (
                <button
                  type="button"
                  key={option}
                  className={filter === option ? "is-active" : undefined}
                  onClick={() => setFilter(option)}
                >
                  {option === "ACTIVE" ? "Active" : option === "ARCHIVED" ? "Archived" : "All"}
                </button>
              ))}
            </div>

            <label className="drawing-library-customer-filter">
              <span>Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer records" />
            </label>
          </div>

          <div className="drawing-library-toolbar-summary" aria-label="Customer directory summary">
            <article className="drawing-library-overview-metric">
              <span>Visible</span>
              <strong>{visibleCustomers.length}</strong>
            </article>
            <article className="drawing-library-overview-metric">
              <span>Active</span>
              <strong>{activeCount}</strong>
            </article>
            <article className="drawing-library-overview-metric">
              <span>Archived</span>
              <strong>{archivedCount}</strong>
            </article>
            <article className="drawing-library-overview-metric">
              <span>With Work</span>
              <strong>{activeWorkCount}</strong>
            </article>
          </div>
        </div>
      </section>

      {isCreating ? (
        <section className="portal-surface-card portal-customer-create-panel">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Create</span>
              <h2>New customer</h2>
            </div>
          </div>

          <div className="portal-customer-detail-body">
            <section className="portal-customer-form-section">
              <div className="portal-customer-form-section-head">
                <span className="portal-section-kicker">Customer</span>
                <h3>Core details</h3>
              </div>
              <div className="portal-customer-form-grid">
                <label className="drawing-library-customer-filter">
                  <span>Name</span>
                  <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                </label>
              </div>
            </section>

            <section className="portal-customer-form-section">
              <div className="portal-customer-form-section-head">
                <span className="portal-section-kicker">Primary contact</span>
                <h3>Contact channels</h3>
              </div>
              <div className="portal-customer-form-grid portal-customer-form-grid-two-column">
                <label className="drawing-library-customer-filter">
                  <span>Primary Contact</span>
                  <input
                    value={draft.primaryContactName}
                    onChange={(event) => setDraft((current) => ({ ...current, primaryContactName: event.target.value }))}
                  />
                </label>
                <label className="drawing-library-customer-filter">
                  <span>Phone</span>
                  <input
                    value={draft.primaryPhone}
                    onChange={(event) => setDraft((current) => ({ ...current, primaryPhone: event.target.value }))}
                  />
                </label>
                <label className="drawing-library-customer-filter portal-customer-form-grid-span">
                  <span>Email</span>
                  <input
                    value={draft.primaryEmail}
                    onChange={(event) => setDraft((current) => ({ ...current, primaryEmail: event.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="portal-customer-form-section">
              <div className="portal-customer-form-section-head">
                <span className="portal-section-kicker">Site</span>
                <h3>Address information</h3>
              </div>
              <div className="portal-customer-form-grid">
                <label className="drawing-library-customer-filter">
                  <span>Site Address</span>
                  <textarea
                    value={draft.siteAddress}
                    onChange={(event) => setDraft((current) => ({ ...current, siteAddress: event.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="portal-customer-form-section">
              <div className="portal-customer-form-section-head">
                <span className="portal-section-kicker">Notes</span>
                <h3>Internal context</h3>
              </div>
              <div className="portal-customer-form-grid">
                <label className="drawing-library-customer-filter">
                  <span>Notes</span>
                  <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
              </div>
            </section>

            <div className="portal-customer-detail-footer">
              <button type="button" className="portal-primary-button" onClick={() => void handleCreateCustomer()} disabled={isSavingCustomer}>
                {isSavingCustomer ? "Saving..." : "Create Customer"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="portal-surface-card portal-customers-directory">
        <div className="portal-section-heading">
          <div>
            <span className="portal-section-kicker">Directory</span>
            <h2>Company customers</h2>
          </div>
        </div>
        {visibleCustomers.length === 0 ? (
          <div className="portal-empty-state portal-customers-empty-state">
            <h2>No customers match this search</h2>
            <p>Adjust the filter or search terms to bring records back into view.</p>
          </div>
        ) : null}
        <div className="portal-customers-directory-list">
          {visibleCustomers.map((customer) => (
            <button
              type="button"
              key={customer.id}
              className="portal-customer-row"
              onClick={() => onNavigate("customer", { customerId: customer.id })}
            >
              <div className="portal-customer-row-main">
                <div className="portal-customer-row-head">
                  <div className="portal-customer-row-title">
                    <strong>{customer.name}</strong>
                    <p>{customer.primaryContactName || customer.primaryEmail || customer.primaryPhone || "No contact details yet"}</p>
                  </div>
                  <span className={`portal-customer-status${customer.isArchived ? " is-archived" : ""}`}>
                    {customer.isArchived ? "Archived" : "Active"}
                  </span>
                </div>
                <div className="portal-customer-row-meta">
                  <span>{customer.activeDrawingCount} active drawings</span>
                  <span>{customer.archivedDrawingCount} archived drawings</span>
                  <span>Last activity {formatTimestamp(customer.lastActivityAtIso)}</span>
                </div>
              </div>
              <span className="portal-customer-row-cta">View Customer</span>
            </button>
          ))}
        </div>
      </section>

      {unassignedDrawings.length > 0 ? (
        <section className="portal-surface-card portal-customer-orphans">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Exception</span>
              <h2>Unassigned drawings</h2>
            </div>
          </div>
          <p className="portal-empty-copy">These drawings are not linked to a customer yet, so they stay outside the customer-first browse flow.</p>
          <div className="portal-dashboard-list">
            {unassignedDrawings.map((drawing) => (
              <button type="button" key={drawing.id} className="portal-dashboard-row" onClick={() => onOpenDrawing(drawing.id)}>
                <div className="portal-dashboard-row-copy">
                  <div className="portal-dashboard-row-head">
                    <div className="portal-dashboard-row-title">
                      <strong>{drawing.name}</strong>
                      <p>{drawing.customerName.trim() || "Unassigned customer"}</p>
                    </div>
                    <span className="portal-dashboard-row-version">v{drawing.versionNumber}</span>
                  </div>
                  <div className="portal-dashboard-row-meta">
                    <span>Updated {formatTimestamp(drawing.updatedAtIso)}</span>
                    <span>{drawing.segmentCount} segments</span>
                    <span>{drawing.gateCount} gates</span>
                  </div>
                </div>
                <span className="portal-dashboard-row-cta">Open</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

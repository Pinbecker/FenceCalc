import { useMemo, useState } from "react";

import type { CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

import type { PortalRoute } from "./useHashRoute";

type CustomerFilter = "ACTIVE" | "ARCHIVED" | "ALL";
type CustomerSort = "RECENT" | "NAME" | "ACTIVE_DRAWINGS";

interface CustomerDraft {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  siteAddress: string;
  notes: string;
}

interface CustomerDrawingActivity {
  latestDrawingId: string;
  latestDrawingName: string;
  latestUpdatedAtIso: string;
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

function hasMissingContact(customer: CustomerSummary): boolean {
  return !customer.primaryContactName.trim() && !customer.primaryEmail.trim() && !customer.primaryPhone.trim();
}

function formatPrimaryContact(customer: CustomerSummary): string {
  return customer.primaryContactName || customer.primaryEmail || customer.primaryPhone || "No contact details";
}

export function CustomersPage({
  customers,
  drawings,
  isLoading,
  isSavingCustomer,
  onRefresh,
  onSaveCustomer,
  onNavigate,
}: CustomersPageProps) {
  const [filter, setFilter] = useState<CustomerFilter>("ACTIVE");
  const [sortBy, setSortBy] = useState<CustomerSort>("RECENT");
  const [search, setSearch] = useState("");
  const [onlyWithActiveWork, setOnlyWithActiveWork] = useState(false);
  const [onlyMissingContact, setOnlyMissingContact] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(buildEmptyDraft);

  const drawingActivityByCustomerId = useMemo(() => {
    const byCustomerId = new Map<string, CustomerDrawingActivity>();
    for (const drawing of drawings) {
      if (!drawing.customerId) {
        continue;
      }

      const current = byCustomerId.get(drawing.customerId);
      if (!current || drawing.updatedAtIso.localeCompare(current.latestUpdatedAtIso) > 0) {
        byCustomerId.set(drawing.customerId, {
          latestDrawingId: drawing.id,
          latestDrawingName: drawing.name,
          latestUpdatedAtIso: drawing.updatedAtIso,
        });
      }
    }
    return byCustomerId;
  }, [drawings]);

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
      .filter((customer) => !onlyWithActiveWork || customer.activeDrawingCount > 0)
      .filter((customer) => !onlyMissingContact || hasMissingContact(customer))
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
          customer.notes,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .slice()
      .sort((left, right) => {
        if (sortBy === "NAME") {
          return sortStrings(left.name, right.name);
        }

        if (sortBy === "ACTIVE_DRAWINGS" && right.activeDrawingCount !== left.activeDrawingCount) {
          return right.activeDrawingCount - left.activeDrawingCount;
        }

        const leftRecent = drawingActivityByCustomerId.get(left.id)?.latestUpdatedAtIso ?? left.lastActivityAtIso ?? "";
        const rightRecent = drawingActivityByCustomerId.get(right.id)?.latestUpdatedAtIso ?? right.lastActivityAtIso ?? "";
        if (leftRecent !== rightRecent) {
          return rightRecent.localeCompare(leftRecent);
        }

        if (right.activeDrawingCount !== left.activeDrawingCount) {
          return right.activeDrawingCount - left.activeDrawingCount;
        }

        return sortStrings(left.name, right.name);
      });
  }, [customers, drawingActivityByCustomerId, filter, onlyMissingContact, onlyWithActiveWork, search, sortBy]);

  const activeCount = customers.filter((customer) => !customer.isArchived).length;
  const archivedCount = customers.length - activeCount;
  const activeWorkCount = customers.filter((customer) => customer.activeDrawingCount > 0).length;
  const missingContactCount = customers.filter((customer) => hasMissingContact(customer)).length;
  const visibleActiveWorkCount = visibleCustomers.filter((customer) => customer.activeDrawingCount > 0).length;

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

  const canCreateCustomer = draft.name.trim().length > 0;
  const resultsLabel = `${visibleCustomers.length} customer${visibleCustomers.length === 1 ? "" : "s"} shown`;

  return (
    <section className="portal-page portal-customers-page">
      <header className="portal-page-header">
          <div className="portal-customers-heading">
            <span className="portal-eyebrow">Customers</span>
            <h1>Customer directory</h1>
            <p>Use status, search, and sort controls to locate customers quickly and open the right customer workspace.</p>
          </div>
        <div className="portal-header-actions">
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="portal-primary-button"
            onClick={() => {
              if (isCreating) {
                setIsCreating(false);
                return;
              }
              setDraft(buildEmptyDraft());
              setIsCreating(true);
            }}
          >
            {isCreating ? "Close create panel" : "New customer"}
          </button>
        </div>
      </header>

      <section className="portal-surface-card drawing-library-toolbar portal-customers-toolbar">
        <div className="portal-customers-toolbar-main-simple">
          <div className="portal-customers-control-row">
            <div className="portal-filter-row" role="tablist" aria-label="Customer status filter">
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
            <label className="drawing-library-customer-filter portal-customers-sort-filter">
              <span>Sort by</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CustomerSort)}>
                <option value="RECENT">Recent activity</option>
                <option value="ACTIVE_DRAWINGS">Active drawings</option>
                <option value="NAME">Name (A-Z)</option>
              </select>
            </label>
          </div>

          <div className="portal-customers-search-row">
            <label className="drawing-library-customer-filter portal-customers-search">
              <span>Search directory</span>
              <div className="portal-customers-search-wrap">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by customer, contact, email, phone, site, or notes"
                />
                {search.trim().length > 0 ? (
                  <button type="button" className="portal-text-button portal-customers-clear-search" onClick={() => setSearch("")}>
                    Clear
                  </button>
                ) : null}
              </div>
            </label>
          </div>

          <div className="portal-customers-toggle-row">
            <label className="portal-customers-toggle">
              <input
                type="checkbox"
                checked={onlyWithActiveWork}
                onChange={(event) => setOnlyWithActiveWork(event.target.checked)}
              />
              <span>Only customers with active drawings</span>
            </label>
            <label className="portal-customers-toggle">
              <input
                type="checkbox"
                checked={onlyMissingContact}
                onChange={(event) => setOnlyMissingContact(event.target.checked)}
              />
              <span>Only customers missing contact details</span>
            </label>
          </div>
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
            <span>With work</span>
            <strong>{activeWorkCount}</strong>
          </article>
          <article className="drawing-library-overview-metric">
            <span>Missing contact</span>
            <strong>{missingContactCount}</strong>
          </article>
        </div>

        <p className="drawing-library-toolbar-copy portal-customers-result-copy">
          <strong>{resultsLabel}.</strong> {visibleActiveWorkCount} shown with active drawing work.
        </p>
      </section>

      {isCreating ? (
        <section className="portal-surface-card portal-customer-create-panel">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Create customer</span>
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
                  <span>Primary contact</span>
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
                  <span>Site address</span>
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
              <button
                type="button"
                className="portal-primary-button"
                onClick={() => void handleCreateCustomer()}
                disabled={!canCreateCustomer || isSavingCustomer}
              >
                {isSavingCustomer ? "Saving..." : "Create customer"}
              </button>
              <button type="button" className="portal-secondary-button" onClick={() => setIsCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="portal-surface-card portal-customers-directory">
        <div className="portal-section-heading portal-customers-directory-header">
          <div>
            <span className="portal-section-kicker">Directory</span>
            <h2>Customers</h2>
          </div>
          <span className="drawing-library-badge">{resultsLabel}</span>
        </div>
        {visibleCustomers.length === 0 ? (
          <div className="portal-empty-state portal-customers-empty-state">
            <h2>No customers in this view</h2>
            <p>Adjust filters or search terms to bring records back into view.</p>
          </div>
        ) : null}
        <div className="portal-customers-list">
          {visibleCustomers.map((customer) => {
            const latestDrawing = drawingActivityByCustomerId.get(customer.id) ?? null;
            const missingContact = hasMissingContact(customer);
            return (
              <article key={customer.id} className={`portal-customer-directory-row${missingContact ? " is-missing-contact" : ""}`}>
                <div className="portal-customer-directory-main">
                  <div className="portal-customer-directory-head">
                    <div className="portal-customer-directory-title">
                      <strong>{customer.name}</strong>
                      <p>{customer.siteAddress || "No site address recorded"}</p>
                    </div>
                    <div className="portal-customer-directory-badges">
                      <span className={`portal-customer-status${customer.isArchived ? " is-archived" : ""}`}>
                        {customer.isArchived ? "Archived" : "Active"}
                      </span>
                      {missingContact ? <span className="drawing-library-badge">Contact details missing</span> : null}
                    </div>
                  </div>

                  <div className="portal-customer-directory-contact">
                    <span>Contact: {formatPrimaryContact(customer)}</span>
                    <span>Email: {customer.primaryEmail || "Not set"}</span>
                    <span>Phone: {customer.primaryPhone || "Not set"}</span>
                  </div>

                  <div className="portal-customer-directory-meta">
                    <span>{customer.activeDrawingCount} active drawings</span>
                    <span>{customer.archivedDrawingCount} archived drawings</span>
                    <span>{latestDrawing ? `Latest: ${latestDrawing.latestDrawingName}` : "No linked drawings"}</span>
                    <span>
                      {latestDrawing
                        ? `Updated ${formatTimestamp(latestDrawing.latestUpdatedAtIso)}`
                        : `Last activity ${formatTimestamp(customer.lastActivityAtIso)}`}
                    </span>
                  </div>
                </div>

                <div className="portal-customer-directory-actions">
                  <button
                    type="button"
                    className="portal-primary-button"
                    onClick={() => onNavigate("customer", { customerId: customer.id })}
                  >
                    Open customer
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

    </section>
  );
}

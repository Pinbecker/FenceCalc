import { useEffect, useMemo, useState } from "react";

import type { CustomerSummary } from "@fence-estimator/contracts";

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
  query?: Record<string, string>;
  customers: CustomerSummary[];
  isLoading: boolean;
  isSavingCustomer: boolean;
  isArchivingCustomerId: string | null;
  onRefresh(this: void): Promise<void>;
  onSaveCustomer(
    this: void,
    input:
      | { mode: "create"; customer: CustomerDraft }
      | { mode: "update"; customerId: string; customer: Partial<CustomerDraft> },
  ): Promise<{ id: string } | null>;
  onSetCustomerArchived(this: void, customerId: string, archived: boolean): Promise<boolean>;
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
  query,
  customers,
  isLoading,
  isSavingCustomer,
  isArchivingCustomerId,
  onRefresh,
  onSaveCustomer,
  onSetCustomerArchived,
  onNavigate,
}: CustomersPageProps) {
  const [filter, setFilter] = useState<CustomerFilter>("ACTIVE");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(buildEmptyDraft);

  useEffect(() => {
    if (query?.customerId) {
      setSelectedCustomerId(query.customerId);
    }
  }, [query]);

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

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!selectedCustomer) {
      setDraft(buildEmptyDraft());
      return;
    }
    setDraft({
      name: selectedCustomer.name,
      primaryContactName: selectedCustomer.primaryContactName,
      primaryEmail: selectedCustomer.primaryEmail,
      primaryPhone: selectedCustomer.primaryPhone,
      siteAddress: selectedCustomer.siteAddress,
      notes: selectedCustomer.notes,
    });
  }, [isCreating, selectedCustomer]);

  const activeCount = customers.filter((customer) => !customer.isArchived).length;
  const archivedCount = customers.length - activeCount;
  const activeWorkCount = customers.filter((customer) => customer.activeDrawingCount > 0).length;

  const handleSave = async () => {
    const trimmedDraft: CustomerDraft = {
      name: draft.name.trim(),
      primaryContactName: draft.primaryContactName.trim(),
      primaryEmail: draft.primaryEmail.trim(),
      primaryPhone: draft.primaryPhone.trim(),
      siteAddress: draft.siteAddress.trim(),
      notes: draft.notes.trim(),
    };

    const result = isCreating
      ? await onSaveCustomer({ mode: "create", customer: trimmedDraft })
      : selectedCustomerId
        ? await onSaveCustomer({ mode: "update", customerId: selectedCustomerId, customer: trimmedDraft })
        : null;

    if (!result) {
      return;
    }

    setIsCreating(false);
    setSelectedCustomerId(result.id);
  };

  return (
    <section className="portal-page portal-customers-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Customers</span>
          <h1>Customer directory</h1>
          <p>Keep customer records reusable, searchable, and linked to the current drawing library.</p>
        </div>
        <div className="portal-header-actions">
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="portal-primary-button"
            onClick={() => {
              setIsCreating(true);
              setSelectedCustomerId(null);
              setDraft(buildEmptyDraft());
            }}
          >
            New Customer
          </button>
        </div>
      </header>

      <section className="portal-surface-card drawing-library-toolbar">
        <div className="drawing-library-toolbar-main">
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

        <div className="drawing-library-toolbar-summary">
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
      </section>

      <div className="portal-dashboard-layout">
        <section className="portal-surface-card portal-dashboard-primary">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Directory</span>
              <h2>Company customers</h2>
            </div>
          </div>
          {visibleCustomers.length === 0 ? <p className="portal-empty-copy">No customers match this view.</p> : null}
          <div className="portal-dashboard-list">
            {visibleCustomers.map((customer) => (
              <button
                type="button"
                key={customer.id}
                className="portal-dashboard-row"
                onClick={() => onNavigate("drawings", { customerId: customer.id, scope: customer.isArchived ? "all" : "active" })}
              >
                <div className="portal-dashboard-row-copy">
                  <div className="portal-dashboard-row-head">
                    <strong>{customer.name}</strong>
                    <span className="portal-dashboard-row-version">{customer.isArchived ? "Archived" : "Active"}</span>
                  </div>
                  <p>{customer.primaryContactName || customer.primaryEmail || customer.primaryPhone || "No contact details yet"}</p>
                  <div className="portal-dashboard-row-meta">
                    <span>{customer.activeDrawingCount} active drawings</span>
                    <span>{customer.archivedDrawingCount} archived drawings</span>
                    <span>{formatTimestamp(customer.lastActivityAtIso)}</span>
                  </div>
                </div>
                <span
                  className="portal-dashboard-row-cta"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsCreating(false);
                    setSelectedCustomerId(customer.id);
                  }}
                >
                  Edit
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="portal-dashboard-side">
          <section className="portal-surface-card portal-dashboard-customers">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">{isCreating ? "Create" : "Details"}</span>
                <h2>{isCreating ? "New customer" : selectedCustomer ? selectedCustomer.name : "Select a customer"}</h2>
              </div>
            </div>

            {!isCreating && !selectedCustomer ? <p className="portal-empty-copy">Choose a customer to edit details.</p> : null}

            {isCreating || selectedCustomer ? (
              <div className="portal-dashboard-action-grid">
                <label className="drawing-library-customer-filter">
                  <span>Name</span>
                  <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="drawing-library-customer-filter">
                  <span>Primary Contact</span>
                  <input
                    value={draft.primaryContactName}
                    onChange={(event) => setDraft((current) => ({ ...current, primaryContactName: event.target.value }))}
                  />
                </label>
                <label className="drawing-library-customer-filter">
                  <span>Email</span>
                  <input
                    value={draft.primaryEmail}
                    onChange={(event) => setDraft((current) => ({ ...current, primaryEmail: event.target.value }))}
                  />
                </label>
                <label className="drawing-library-customer-filter">
                  <span>Phone</span>
                  <input
                    value={draft.primaryPhone}
                    onChange={(event) => setDraft((current) => ({ ...current, primaryPhone: event.target.value }))}
                  />
                </label>
                <label className="drawing-library-customer-filter">
                  <span>Site Address</span>
                  <textarea
                    value={draft.siteAddress}
                    onChange={(event) => setDraft((current) => ({ ...current, siteAddress: event.target.value }))}
                  />
                </label>
                <label className="drawing-library-customer-filter">
                  <span>Notes</span>
                  <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <button type="button" className="portal-primary-button" onClick={() => void handleSave()} disabled={isSavingCustomer}>
                  {isSavingCustomer ? "Saving..." : isCreating ? "Create Customer" : "Save Changes"}
                </button>
                {!isCreating && selectedCustomer ? (
                  <button
                    type="button"
                    className="portal-secondary-button"
                    onClick={() => void onSetCustomerArchived(selectedCustomer.id, !selectedCustomer.isArchived)}
                    disabled={isArchivingCustomerId === selectedCustomer.id}
                  >
                    {isArchivingCustomerId === selectedCustomer.id
                      ? "Updating..."
                      : selectedCustomer.isArchived
                        ? "Restore Customer"
                        : "Archive Customer"}
                  </button>
                ) : null}
                {!isCreating && selectedCustomer ? (
                  <button
                    type="button"
                    className="portal-secondary-button"
                    onClick={() => onNavigate("drawings", { customerId: selectedCustomer.id, scope: selectedCustomer.isArchived ? "all" : "active" })}
                  >
                    Open Drawings
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}

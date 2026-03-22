import { useEffect, useMemo, useState } from "react";

import type { CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

type CustomerFilter = "ACTIVE" | "ARCHIVED" | "ALL";
type CustomerSort = "RECENT" | "NAME";

interface CustomerDraft {
  name: string;
  primaryContactName: string;
  primaryEmail: string;
  primaryPhone: string;
  siteAddress: string;
  notes: string;
}

interface CustomerDrawingActivity {
  latestUpdatedAtIso: string;
}

interface CustomerPickerModalProps {
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  isLoading: boolean;
  isSavingCustomer: boolean;
  onClose(this: void): void;
  onRefresh(this: void): Promise<void>;
  onOpenCustomer(this: void, customerId: string): void;
  onCreateCustomer(this: void, customer: CustomerDraft): Promise<{ id: string } | null>;
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

function formatPrimaryContact(customer: CustomerSummary): string {
  return customer.primaryContactName || customer.primaryEmail || customer.primaryPhone || "No contact details";
}

export function CustomerPickerModal({
  customers,
  drawings,
  isLoading,
  isSavingCustomer,
  onClose,
  onRefresh,
  onOpenCustomer,
  onCreateCustomer,
}: CustomerPickerModalProps) {
  const [filter, setFilter] = useState<CustomerFilter>("ACTIVE");
  const [sortBy, setSortBy] = useState<CustomerSort>("RECENT");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(buildEmptyDraft);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalDocumentOverflow;
    };
  }, []);

  const drawingActivityByCustomerId = useMemo(() => {
    const byCustomerId = new Map<string, CustomerDrawingActivity>();
    for (const drawing of drawings) {
      if (!drawing.customerId) {
        continue;
      }
      const current = byCustomerId.get(drawing.customerId);
      if (!current || drawing.updatedAtIso.localeCompare(current.latestUpdatedAtIso) > 0) {
        byCustomerId.set(drawing.customerId, {
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

        const leftRecent = drawingActivityByCustomerId.get(left.id)?.latestUpdatedAtIso ?? left.lastActivityAtIso ?? "";
        const rightRecent = drawingActivityByCustomerId.get(right.id)?.latestUpdatedAtIso ?? right.lastActivityAtIso ?? "";
        if (leftRecent !== rightRecent) {
          return rightRecent.localeCompare(leftRecent);
        }
        return sortStrings(left.name, right.name);
      });
  }, [customers, drawingActivityByCustomerId, filter, search, sortBy]);

  const handleCreateCustomer = async () => {
    const result = await onCreateCustomer({
      name: draft.name.trim(),
      primaryContactName: draft.primaryContactName.trim(),
      primaryEmail: draft.primaryEmail.trim(),
      primaryPhone: draft.primaryPhone.trim(),
      siteAddress: draft.siteAddress.trim(),
      notes: draft.notes.trim(),
    });

    if (!result) {
      return;
    }

    setIsCreating(false);
    setDraft(buildEmptyDraft());
    onOpenCustomer(result.id);
  };

  return (
    <div className="customer-picker-backdrop" role="presentation" onClick={onClose}>
      <section
        className="customer-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Customer picker"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="customer-picker-header">
          <div>
            <span className="portal-eyebrow">Customers</span>
            <h2>Customer directory</h2>
            <p>Select any customer to open their workspace, or create a new customer without leaving your current page.</p>
          </div>
          <div className="customer-picker-header-actions">
            <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              className="portal-secondary-button"
              onClick={() => {
                if (isCreating) {
                  setIsCreating(false);
                  return;
                }
                setDraft(buildEmptyDraft());
                setIsCreating(true);
              }}
            >
              {isCreating ? "Cancel create" : "New customer"}
            </button>
            <button type="button" className="portal-primary-button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <section className="customer-picker-controls">
          <div className="customer-picker-control-row">
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

            <label className="drawing-library-customer-filter customer-picker-sort">
              <span>Sort by</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CustomerSort)}>
                <option value="RECENT">Recent activity</option>
                <option value="NAME">Name (A-Z)</option>
              </select>
            </label>
          </div>

          <label className="drawing-library-customer-filter customer-picker-search">
            <span>Search customers</span>
            <div className="customer-picker-search-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by customer, contact, email, phone, or site"
              />
              {search.trim().length > 0 ? (
                <button type="button" className="portal-text-button" onClick={() => setSearch("")}>
                  Clear
                </button>
              ) : null}
            </div>
          </label>
        </section>

        {isCreating ? (
          <section className="customer-picker-create">
            <h3>New customer</h3>
            <div className="customer-picker-create-grid">
              <label className="drawing-library-customer-filter">
                <span>Name</span>
                <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="drawing-library-customer-filter">
                <span>Primary contact</span>
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
              <label className="drawing-library-customer-filter is-wide">
                <span>Site address</span>
                <input value={draft.siteAddress} onChange={(event) => setDraft((current) => ({ ...current, siteAddress: event.target.value }))} />
              </label>
            </div>
            <div className="customer-picker-create-actions">
              <button
                type="button"
                className="portal-primary-button"
                onClick={() => void handleCreateCustomer()}
                disabled={draft.name.trim().length === 0 || isSavingCustomer}
              >
                {isSavingCustomer ? "Saving..." : "Create customer"}
              </button>
              <button type="button" className="portal-secondary-button" onClick={() => setIsCreating(false)}>
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <div className="customer-picker-results-scroll">
          <div className="customer-picker-list">
            {visibleCustomers.length === 0 ? (
              <div className="portal-empty-state customer-picker-empty">
                <h2>No customers in this view</h2>
                <p>Adjust filters or search terms to bring customer records back into view.</p>
              </div>
            ) : null}

            {visibleCustomers.map((customer) => {
              const latestDrawing = drawingActivityByCustomerId.get(customer.id) ?? null;
              return (
                <button type="button" key={customer.id} className="customer-picker-row" onClick={() => onOpenCustomer(customer.id)}>
                  <div className="customer-picker-row-main">
                    <div className="customer-picker-row-title">
                      <strong>{customer.name}</strong>
                      <p>{customer.siteAddress || "No site address recorded"}</p>
                    </div>
                    <div className="customer-picker-row-meta">
                      <span>Contact: {formatPrimaryContact(customer)}</span>
                      <span>{customer.activeDrawingCount} active drawings</span>
                      <span>{customer.archivedDrawingCount} archived drawings</span>
                      <span>
                        {latestDrawing
                          ? `Updated ${formatTimestamp(latestDrawing.latestUpdatedAtIso)}`
                          : `Last activity ${formatTimestamp(customer.lastActivityAtIso)}`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

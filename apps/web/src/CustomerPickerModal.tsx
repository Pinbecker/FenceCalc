import { useEffect, useMemo, useState } from "react";

import type { CustomerSummary, DrawingSummary } from "@fence-estimator/contracts";

type CustomerSort = "RECENT" | "NAME";

interface CustomerDraft {
  name: string;
  siteAddress: string;
}

interface CustomerDrawingActivity {
  latestUpdatedAtIso: string;
}

interface CustomerPickerModalProps {
  customers: CustomerSummary[];
  drawings: DrawingSummary[];
  isSavingCustomer: boolean;
  onClose(this: void): void;
  onOpenCustomer(this: void, customerId: string): void;
  onCreateCustomer(this: void, customer: { name: string; primaryContactName: string; primaryEmail: string; primaryPhone: string; siteAddress: string; notes: string }): Promise<{ id: string } | null>;
}

function buildEmptyDraft(): CustomerDraft {
  return {
    name: "",
    siteAddress: "",
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

export function CustomerPickerModal({
  customers,
  drawings,
  isSavingCustomer,
  onClose,
  onOpenCustomer,
  onCreateCustomer,
}: CustomerPickerModalProps) {
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
      if (!drawing.customerId || drawing.isArchived) {
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
      .filter((customer) => !customer.isArchived)
      .filter((customer) => {
        if (!normalizedSearch) {
          return true;
        }
        return [customer.name, customer.siteAddress].some((value) => value.toLowerCase().includes(normalizedSearch));
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
  }, [customers, drawingActivityByCustomerId, search, sortBy]);

  const handleCreateCustomer = async () => {
    const result = await onCreateCustomer({
      name: draft.name.trim(),
      primaryContactName: "",
      primaryEmail: "",
      primaryPhone: "",
      siteAddress: draft.siteAddress.trim(),
      notes: "",
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
          </div>
          <button type="button" className="customer-picker-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="customer-picker-controls">
          <div className="customer-picker-control-row">
            <label className="drawing-library-customer-filter customer-picker-search">
              <span>Search</span>
              <div className="customer-picker-search-row">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or site address"
                />
                {search.trim().length > 0 ? (
                  <button type="button" className="customer-picker-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                ) : null}
              </div>
            </label>
            <label className="drawing-library-customer-filter customer-picker-sort">
              <span>Sort</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CustomerSort)}>
                <option value="RECENT">Recent activity</option>
                <option value="NAME">Name (A-Z)</option>
              </select>
            </label>
          </div>
        </section>

        {isCreating ? (
          <section className="customer-picker-create">
            <h3>New customer</h3>
            <div className="customer-picker-create-grid">
              <label className="drawing-library-customer-filter">
                <span>Customer name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Smith Residential"
                />
              </label>
              <label className="drawing-library-customer-filter">
                <span>Site address</span>
                <input
                  value={draft.siteAddress}
                  onChange={(event) => setDraft((current) => ({ ...current, siteAddress: event.target.value }))}
                  placeholder="Optional"
                />
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

        <div className="customer-picker-toolbar">
          <span className="customer-picker-count">{visibleCustomers.length} customers</span>
          <button
            type="button"
            className="portal-primary-button"
            onClick={() => {
              setDraft(buildEmptyDraft());
              setIsCreating(true);
            }}
          >
            New customer
          </button>
        </div>

        <div className="customer-picker-results-scroll">
          <div className="customer-picker-list">
            {visibleCustomers.length === 0 ? (
              <div className="portal-empty-state customer-picker-empty">
                <h2>No customers found</h2>
                <p>{search.trim() ? "Try a different search term." : "Create your first customer to get started."}</p>
              </div>
            ) : null}

            {visibleCustomers.map((customer) => {
              const latestDrawing = drawingActivityByCustomerId.get(customer.id) ?? null;
              return (
                <button type="button" key={customer.id} className="customer-picker-row" onClick={() => onOpenCustomer(customer.id)}>
                  <div className="customer-picker-row-main">
                    <div className="customer-picker-row-title">
                      <strong>{customer.name}</strong>
                      {customer.siteAddress ? <p>{customer.siteAddress}</p> : null}
                    </div>
                    <div className="customer-picker-row-meta">
                      <span>{customer.activeDrawingCount} active drawing{customer.activeDrawingCount !== 1 ? "s" : ""}</span>
                      <span>
                        {latestDrawing
                          ? `Updated ${formatTimestamp(latestDrawing.latestUpdatedAtIso)}`
                          : `Last activity ${formatTimestamp(customer.lastActivityAtIso)}`}
                      </span>
                    </div>
                  </div>
                  <span className="customer-picker-row-arrow" aria-hidden="true">&rsaquo;</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

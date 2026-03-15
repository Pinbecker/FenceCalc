import { useEffect, useMemo, useState } from "react";

import type { AuthSessionEnvelope, PricingConfigRecord, PricingItem, PricingItemCategory } from "@fence-estimator/contracts";

import { getPricingConfig, updatePricingConfig } from "./apiClient";

interface PricingPageProps {
  session: AuthSessionEnvelope;
}

const CATEGORY_LABELS: Record<PricingItemCategory, string> = {
  PANELS: "Panels",
  POSTS: "Posts",
  GATES: "Gates",
  CONCRETE: "Concrete",
  FLOODLIGHT_COLUMNS: "Floodlight columns",
  BASKETBALL_POSTS: "Basketball posts",
  FIXINGS: "Fixings",
  PLANT: "Plant",
  ANCILLARY: "Ancillary"
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not saved yet";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPricingSavedLabel(pricingConfig: PricingConfigRecord | null): string {
  if (!pricingConfig || pricingConfig.updatedByUserId === null) {
    return "Default configuration";
  }
  return formatTimestamp(pricingConfig.updatedAtIso);
}

function groupItems(items: PricingItem[]) {
  const systems = new Map<string, Map<PricingItemCategory, PricingItem[]>>();

  items
    .slice()
    .sort((left, right) => {
      const orderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return left.displayName.localeCompare(right.displayName, "en-GB");
    })
    .forEach((item) => {
      const byCategory = systems.get(item.fenceSystem) ?? new Map<PricingItemCategory, PricingItem[]>();
      const bucket = byCategory.get(item.category) ?? [];
      bucket.push(item);
      byCategory.set(item.category, bucket);
      systems.set(item.fenceSystem, byCategory);
    });

  return [...systems.entries()];
}

export function PricingPage({ session }: PricingPageProps) {
  const [pricingConfig, setPricingConfig] = useState<PricingConfigRecord | null>(null);
  const [draftItems, setDraftItems] = useState<PricingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const nextPricingConfig = await getPricingConfig();
        if (cancelled) {
          return;
        }
        setPricingConfig(nextPricingConfig);
        setDraftItems(nextPricingConfig.items);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedItems = useMemo(() => groupItems(draftItems), [draftItems]);
  const isDirty = useMemo(() => JSON.stringify(draftItems) !== JSON.stringify(pricingConfig?.items ?? []), [draftItems, pricingConfig]);

  const updateItem = (itemCode: string, updater: (current: PricingItem) => PricingItem) => {
    setDraftItems((current) => current.map((item) => (item.itemCode === itemCode ? updater(item) : item)));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
      try {
        const nextPricingConfig = await updatePricingConfig(draftItems);
        setPricingConfig(nextPricingConfig);
        setDraftItems(nextPricingConfig.items);
        setNoticeMessage(`Saved pricing for ${session.company.name} at ${formatTimestamp(nextPricingConfig.updatedAtIso)}.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="portal-page pricing-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Estimating Configuration</span>
          <h1>Pricing and labour rates</h1>
          <p>The estimate pages read from this company pricing configuration. Twin Bar is live now, and Roll Form is scaffolded for later expansion.</p>
        </div>
        <div className="portal-header-actions">
          <button
            type="button"
            className="portal-secondary-button"
            onClick={() => {
              if (pricingConfig) {
                setDraftItems(pricingConfig.items);
                setNoticeMessage(null);
                setErrorMessage(null);
              }
            }}
            disabled={!pricingConfig || !isDirty || isSaving}
          >
            Reset Changes
          </button>
          <button type="button" className="portal-primary-button" onClick={() => void handleSave()} disabled={!isDirty || isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save Pricing"}
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
      {noticeMessage ? <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div> : null}

      <section className="portal-surface-card pricing-page-summary">
        <article>
          <span>Company</span>
          <strong>{session.company.name}</strong>
        </article>
        <article>
          <span>Rows</span>
          <strong>{draftItems.length}</strong>
        </article>
        <article>
          <span>Active</span>
          <strong>{draftItems.filter((item) => item.isActive).length}</strong>
        </article>
          <article>
            <span>Last saved</span>
            <strong>{formatPricingSavedLabel(pricingConfig)}</strong>
          </article>
      </section>

      {isLoading ? (
        <div className="portal-empty-state">
          <h2>Loading pricing configuration...</h2>
        </div>
      ) : null}

      <div className="pricing-system-stack">
        {groupedItems.map(([fenceSystem, categories]) => (
          <section key={fenceSystem} className="portal-surface-card pricing-system-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Fence system</span>
                <h2>{fenceSystem === "TWIN_BAR" ? "Twin Bar" : "Roll Form Welded Mesh"}</h2>
              </div>
            </div>

            <div className="pricing-category-stack">
              {[...categories.entries()].map(([category, items]) => (
                <section key={`${fenceSystem}-${category}`} className="pricing-category-card">
                  <header className="pricing-category-head">
                    <h3>{CATEGORY_LABELS[category]}</h3>
                    <span>{items.length} items</span>
                  </header>

                  <div className="pricing-table" role="table" aria-label={`${fenceSystem} ${CATEGORY_LABELS[category]}`}>
                    <div className="pricing-table-row pricing-table-head" role="row">
                      <span>Item</span>
                      <span>Unit</span>
                      <span>Material</span>
                      <span>Labour</span>
                      <span>Active</span>
                      <span>Notes</span>
                    </div>

                    {items.map((item) => (
                      <div key={item.itemCode} className="pricing-table-row" role="row">
                        <label className="pricing-item-main">
                          <span className="pricing-item-code">{item.itemCode}</span>
                          <input
                            value={item.displayName}
                            onChange={(event) =>
                              updateItem(item.itemCode, (current) => ({ ...current, displayName: event.target.value }))
                            }
                          />
                        </label>
                        <input
                          value={item.unit}
                          onChange={(event) => updateItem(item.itemCode, (current) => ({ ...current, unit: event.target.value }))}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.materialCost}
                          onChange={(event) =>
                            updateItem(item.itemCode, (current) => ({
                              ...current,
                              materialCost: Number(event.target.value || 0)
                            }))
                          }
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.labourCost}
                          onChange={(event) =>
                            updateItem(item.itemCode, (current) => ({
                              ...current,
                              labourCost: Number(event.target.value || 0)
                            }))
                          }
                        />
                        <label className="pricing-checkbox-cell">
                          <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={(event) =>
                              updateItem(item.itemCode, (current) => ({ ...current, isActive: event.target.checked }))
                            }
                          />
                          <span>{item.isActive ? "Live" : "Off"}</span>
                        </label>
                        <textarea
                          value={item.notes ?? ""}
                          rows={2}
                          onChange={(event) => updateItem(item.itemCode, (current) => ({ ...current, notes: event.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

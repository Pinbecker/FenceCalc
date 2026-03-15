import { useEffect, useMemo, useState } from "react";

import type { AncillaryEstimateItem, AuthSessionEnvelope, DrawingRecord, PricingConfigRecord } from "@fence-estimator/contracts";

import { getDrawing, getPricingConfig } from "./apiClient";
import { buildEstimateFromDrawing } from "./estimating/buildEstimateFromDrawing.js";
import type { PortalRoute } from "./useHashRoute";

interface EstimatePageProps {
  session: AuthSessionEnvelope;
  drawingId: string | null;
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP"
  }).format(value);
}

function formatQuantity(value: number, unit: string): string {
  if (unit === "m3") {
    return `${value.toFixed(3)} ${unit}`;
  }
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${formatted} ${unit}`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPricingSavedLabel(pricingConfig: PricingConfigRecord): string {
  if (pricingConfig.updatedByUserId === null) {
    return "Default configuration";
  }
  return formatTimestamp(pricingConfig.updatedAtIso);
}

function buildAncillaryItem(): AncillaryEstimateItem {
  return {
    id: `ancillary-${crypto.randomUUID()}`,
    description: "",
    quantity: 1,
    materialCost: 0,
    labourCost: 0
  };
}

export function EstimatePage({ session, drawingId, onNavigate }: EstimatePageProps) {
  const [drawing, setDrawing] = useState<DrawingRecord | null>(null);
  const [pricingConfig, setPricingConfig] = useState<PricingConfigRecord | null>(null);
  const [ancillaryItems, setAncillaryItems] = useState<AncillaryEstimateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!drawingId) {
      setIsLoading(false);
      setDrawing(null);
      return;
    }

    setIsLoading(true);
    void (async () => {
      try {
        const [nextDrawing, nextPricingConfig] = await Promise.all([getDrawing(drawingId), getPricingConfig()]);
        if (cancelled) {
          return;
        }
        setDrawing(nextDrawing);
        setPricingConfig(nextPricingConfig);
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
  }, [drawingId]);

  const pricedEstimate = useMemo(() => {
    if (!drawing || !pricingConfig) {
      return null;
    }
    return buildEstimateFromDrawing(drawing, pricingConfig, ancillaryItems);
  }, [ancillaryItems, drawing, pricingConfig]);

  return (
    <section className="portal-page estimate-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Estimate</span>
          <h1>{drawing?.name ?? "Drawing estimate"}</h1>
          <p>Review priced quantities derived from the saved drawing and the current company pricing configuration.</p>
        </div>
        <div className="portal-header-actions">
          {drawing ? (
            <button
              type="button"
              className="portal-secondary-button"
              onClick={() => onNavigate("editor", { drawingId: drawing.id })}
            >
              Open In Editor
            </button>
          ) : null}
          <button type="button" className="portal-secondary-button" onClick={() => onNavigate("pricing")}>
            Pricing
          </button>
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("drawings")}>
            Drawing Library
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}

      {!drawingId ? (
        <div className="portal-empty-state">
          <h2>No drawing selected</h2>
          <p>Open the estimate page from a drawing card or from the editor for a saved drawing.</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="portal-empty-state">
          <h2>Loading estimate...</h2>
        </div>
      ) : null}

      {drawing && pricingConfig && pricedEstimate ? (
        <>
          <section className="portal-surface-card estimate-meta-strip">
            <article>
              <span>Customer</span>
              <strong>{drawing.customerName}</strong>
            </article>
            <article>
              <span>Updated</span>
              <strong>{formatTimestamp(drawing.updatedAtIso)}</strong>
            </article>
            <article>
              <span>Panels</span>
              <strong>{drawing.estimate.materials.twinBarPanels + drawing.estimate.materials.twinBarPanelsSuperRebound}</strong>
            </article>
            <article>
              <span>Posts</span>
              <strong>{drawing.estimate.posts.total}</strong>
            </article>
            <article>
              <span>Gates</span>
              <strong>{drawing.layout.gates?.length ?? 0}</strong>
            </article>
            <article>
              <span>Pricing last saved</span>
              <strong>{formatPricingSavedLabel(pricingConfig)}</strong>
            </article>
          </section>

          <section className="portal-surface-card estimate-ancillary-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Ancillary items</span>
                <h2>Manual additions</h2>
              </div>
              <button
                type="button"
                className="portal-secondary-button"
                onClick={() => setAncillaryItems((current) => [...current, buildAncillaryItem()])}
              >
                Add Ancillary Item
              </button>
            </div>

            {ancillaryItems.length === 0 ? <p className="portal-empty-copy">No ancillary items added yet.</p> : null}

            <div className="estimate-ancillary-list">
              {ancillaryItems.map((item) => (
                <div key={item.id} className="estimate-ancillary-row">
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(event) =>
                      setAncillaryItems((current) =>
                        current.map((entry) => (entry.id === item.id ? { ...entry, description: event.target.value } : entry))
                      )
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(event) =>
                      setAncillaryItems((current) =>
                        current.map((entry) => (entry.id === item.id ? { ...entry, quantity: Number(event.target.value || 0) } : entry))
                      )
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.materialCost}
                    onChange={(event) =>
                      setAncillaryItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, materialCost: Number(event.target.value || 0) } : entry
                        )
                      )
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.labourCost}
                    onChange={(event) =>
                      setAncillaryItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, labourCost: Number(event.target.value || 0) } : entry
                        )
                      )
                    }
                  />
                  <button
                    type="button"
                    className="portal-text-button"
                    onClick={() => setAncillaryItems((current) => current.filter((entry) => entry.id !== item.id))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="estimate-group-stack">
            {pricedEstimate.groups.map((group) => (
              <section key={group.key} className="portal-surface-card estimate-group-card">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">Estimate group</span>
                    <h2>{group.title}</h2>
                  </div>
                  <div className="estimate-group-subtotal">
                    <span>Subtotal</span>
                    <strong>{formatMoney(group.subtotalCost)}</strong>
                  </div>
                </div>

                <div className="estimate-table" role="table" aria-label={`${group.title} estimate rows`}>
                  <div className="estimate-table-row estimate-table-head" role="row">
                    <span>Item</span>
                    <span>Quantity</span>
                    <span>Unit material</span>
                    <span>Unit labour</span>
                    <span>Material total</span>
                    <span>Labour total</span>
                    <span>Total</span>
                  </div>

                  {group.rows.map((row) => (
                    <div key={row.key} className="estimate-table-row" role="row">
                      <div className="estimate-item-copy">
                        <strong>{row.itemName}</strong>
                        {row.notes ? <span>{row.notes}</span> : null}
                      </div>
                      <span>{formatQuantity(row.quantity, row.unit)}</span>
                      <span>{formatMoney(row.unitMaterialCost)}</span>
                      <span>{formatMoney(row.unitLabourCost)}</span>
                      <span>{formatMoney(row.totalMaterialCost)}</span>
                      <span>{formatMoney(row.totalLabourCost)}</span>
                      <strong>{formatMoney(row.totalCost)}</strong>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className="portal-surface-card estimate-totals-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Totals</span>
                <h2>Labour summary and grand total</h2>
              </div>
            </div>
            <div className="estimate-totals-grid">
              <article>
                <span>Material total</span>
                <strong>{formatMoney(pricedEstimate.totals.materialCost)}</strong>
              </article>
              <article>
                <span>Labour total</span>
                <strong>{formatMoney(pricedEstimate.totals.labourCost)}</strong>
              </article>
              <article className="is-grand-total">
                <span>Grand total</span>
                <strong>{formatMoney(pricedEstimate.totals.totalCost)}</strong>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

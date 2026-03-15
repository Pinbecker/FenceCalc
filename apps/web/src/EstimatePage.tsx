import { useEffect, useMemo, useState } from "react";

import type {
  AncillaryEstimateItem,
  AuthSessionEnvelope,
  DrawingRecord,
  EstimateGroup,
  EstimateRow,
  EstimateTotals,
  PricedEstimateResult,
  QuoteRecord
} from "@fence-estimator/contracts";

import { createQuoteSnapshot, getDrawing, getPricedEstimate, listQuotes } from "./apiClient";
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

function formatPricingSavedLabel(pricedEstimate: PricedEstimateResult): string {
  if (pricedEstimate.pricingSnapshot.source === "DEFAULT") {
    return "Default configuration";
  }
  return formatTimestamp(pricedEstimate.pricingSnapshot.updatedAtIso);
}

export function formatQuoteSummaryLabel(quote: QuoteRecord): string {
  return `${formatTimestamp(quote.createdAtIso)} | v${quote.drawingVersionNumber} | ${formatMoney(
    quote.pricedEstimate.totals.totalCost
  )}`;
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildAncillaryRows(items: AncillaryEstimateItem[]): EstimateRow[] {
  return items
    .filter((item) => item.quantity > 0 || item.materialCost > 0 || item.labourCost > 0 || item.description.trim().length > 0)
    .map((item) => {
      const quantity = Math.round(item.quantity * 1000) / 1000;
      const totalMaterialCost = roundMoney(quantity * item.materialCost);
      const totalLabourCost = roundMoney(quantity * item.labourCost);
      return {
        key: item.id,
        itemCode: null,
        itemName: item.description.trim() || "Ancillary item",
        category: "ANCILLARY",
        quantity,
        unit: "item",
        unitMaterialCost: item.materialCost,
        unitLabourCost: item.labourCost,
        totalMaterialCost,
        totalLabourCost,
        totalCost: roundMoney(totalMaterialCost + totalLabourCost)
      };
    });
}

function buildAncillaryGroup(items: AncillaryEstimateItem[]): EstimateGroup | null {
  const rows = buildAncillaryRows(items);
  if (rows.length === 0) {
    return null;
  }

  const subtotalMaterialCost = roundMoney(rows.reduce((sum, row) => sum + row.totalMaterialCost, 0));
  const subtotalLabourCost = roundMoney(rows.reduce((sum, row) => sum + row.totalLabourCost, 0));
  return {
    key: "ancillary-items",
    title: "Ancillary items",
    rows,
    subtotalMaterialCost,
    subtotalLabourCost,
    subtotalCost: roundMoney(subtotalMaterialCost + subtotalLabourCost)
  };
}

export function mergeEstimateWithAncillaryItems(
  baseEstimate: PricedEstimateResult,
  ancillaryItems: AncillaryEstimateItem[]
): PricedEstimateResult {
  const ancillaryGroup = buildAncillaryGroup(ancillaryItems);
  const nonAncillaryGroups = baseEstimate.groups.filter((group) => group.key !== "ancillary-items");
  const groups = ancillaryGroup ? [...nonAncillaryGroups, ancillaryGroup] : nonAncillaryGroups;
  const totals: EstimateTotals = groups.reduce(
    (sum, group) => ({
      materialCost: roundMoney(sum.materialCost + group.subtotalMaterialCost),
      labourCost: roundMoney(sum.labourCost + group.subtotalLabourCost),
      totalCost: roundMoney(sum.totalCost + group.subtotalCost)
    }),
    { materialCost: 0, labourCost: 0, totalCost: 0 }
  );

  return {
    ...baseEstimate,
    ancillaryItems,
    groups,
    totals
  };
}

export function EstimatePage({ session, drawingId, onNavigate }: EstimatePageProps) {
  const canManagePricing = session.user.role === "OWNER" || session.user.role === "ADMIN";
  const [drawing, setDrawing] = useState<DrawingRecord | null>(null);
  const [basePricedEstimate, setBasePricedEstimate] = useState<PricedEstimateResult | null>(null);
  const [ancillaryItems, setAncillaryItems] = useState<AncillaryEstimateItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quoteNoticeMessage, setQuoteNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!drawingId) {
      setIsLoading(false);
      setDrawing(null);
      setBasePricedEstimate(null);
      setQuotes([]);
      return;
    }

    setIsLoading(true);
    void (async () => {
      try {
        const [nextDrawing, nextPricedEstimate, nextQuotes] = await Promise.all([
          getDrawing(drawingId),
          getPricedEstimate(drawingId),
          listQuotes(drawingId)
        ]);
        if (cancelled) {
          return;
        }
        setDrawing(nextDrawing);
        setBasePricedEstimate(nextPricedEstimate);
        setQuotes(nextQuotes);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setBasePricedEstimate(null);
          setQuotes([]);
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
    if (!basePricedEstimate) {
      return null;
    }
    return mergeEstimateWithAncillaryItems(basePricedEstimate, ancillaryItems);
  }, [ancillaryItems, basePricedEstimate]);

  const handleCreateQuote = async () => {
    if (!drawingId) {
      return;
    }
    setIsCreatingQuote(true);
    setQuoteNoticeMessage(null);
    setErrorMessage(null);
    try {
      const quote = await createQuoteSnapshot(drawingId, ancillaryItems);
      setQuotes((current) => [quote, ...current]);
      setQuoteNoticeMessage(`Saved quote snapshot at ${formatTimestamp(quote.createdAtIso)}.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsCreatingQuote(false);
    }
  };

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
          {canManagePricing ? (
            <button type="button" className="portal-secondary-button" onClick={() => onNavigate("pricing")}>
              Pricing
            </button>
          ) : null}
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("drawings")}>
            Drawing Library
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
      {quoteNoticeMessage ? <div className="portal-inline-message portal-inline-notice">{quoteNoticeMessage}</div> : null}

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

      {drawing && pricedEstimate ? (
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
              <strong>{formatPricingSavedLabel(pricedEstimate)}</strong>
            </article>
          </section>

          <section className="portal-surface-card estimate-ancillary-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Quote snapshots</span>
                <h2>Saved immutable quotes</h2>
              </div>
              <button
                type="button"
                className="portal-primary-button"
                onClick={() => void handleCreateQuote()}
                disabled={isCreatingQuote}
              >
                {isCreatingQuote ? "Saving Quote..." : "Save Quote Snapshot"}
              </button>
            </div>

            {quotes.length === 0 ? <p className="portal-empty-copy">No quote snapshots saved for this drawing yet.</p> : null}

            {quotes.length > 0 ? (
              <div className="estimate-ancillary-list">
                {quotes.map((quote) => (
                  <article key={quote.id} className="estimate-ancillary-row">
                    <div className="estimate-item-copy">
                      <strong>{quote.pricedEstimate.drawing.drawingName}</strong>
                      <span>{formatQuoteSummaryLabel(quote)}</span>
                    </div>
                    <span>{quote.pricedEstimate.pricingSnapshot.source === "DEFAULT" ? "Default pricing" : "Company pricing"}</span>
                  </article>
                ))}
              </div>
            ) : null}
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

          {pricedEstimate.warnings.length > 0 ? (
            <section className="portal-surface-card">
              <div className="portal-section-heading">
                <div>
                  <span className="portal-section-kicker">Manual review</span>
                  <h2>Estimate exclusions and warnings</h2>
                </div>
              </div>
              <div className="portal-inline-message portal-inline-error">
                <ul>
                  {pricedEstimate.warnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

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

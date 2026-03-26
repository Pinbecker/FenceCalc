import { useEffect, useMemo, useState } from "react";

import type {
  AncillaryEstimateItem,
  AuthSessionEnvelope,
  DrawingRecord,
  EstimateWorkbookManualEntry,
  PricedEstimateResult,
  QuoteRecord
} from "@fence-estimator/contracts";

import { createQuoteSnapshot, getDrawing, getPricedEstimate, listQuotes } from "./apiClient";
import {
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_MARKUP_UNITS_CODE,
  COMMERCIAL_TRAVEL_DAYS_CODE,
  COMMERCIAL_TRAVEL_RATE_CODE,
  mergeEstimateWorkbook
} from "./estimatingWorkbook";
import type { PortalRoute } from "./useHashRoute";
import { buildEstimateDisplaySections, formatQuantityForDisplay } from "./workbookPresentation";

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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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

function upsertManualEntry(
  current: EstimateWorkbookManualEntry[],
  code: string,
  quantity: number
): EstimateWorkbookManualEntry[] {
  const nextQuantity = Number.isFinite(quantity) ? quantity : 0;
  const existing = current.find((entry) => entry.code === code);
  if (existing) {
    return current.map((entry) => (entry.code === code ? { ...entry, quantity: nextQuantity } : entry));
  }
  return [...current, { code, quantity: nextQuantity }];
}

function buildInitialManualEntries(pricedEstimate: PricedEstimateResult): EstimateWorkbookManualEntry[] {
  const current = [...(pricedEstimate.manualEntries ?? [])];
  const workbook = pricedEstimate.workbook;
  if (!workbook) {
    return current;
  }
  if (workbook.settings.hardDigDefault && !current.some((entry) => entry.code === "LAB_HARD_DIG")) {
    current.push({ code: "LAB_HARD_DIG", quantity: 1 });
  }
  if (workbook.settings.clearSpoilsDefault && !current.some((entry) => entry.code === "LAB_CLEAR_SPOILS")) {
    current.push({ code: "LAB_CLEAR_SPOILS", quantity: 1 });
  }
  return current;
}

function getManualEntryValue(
  manualEntries: EstimateWorkbookManualEntry[],
  code: string,
  fallback: number
): number {
  return manualEntries.find((entry) => entry.code === code)?.quantity ?? fallback;
}

export function EstimatePage({ session, drawingId, onNavigate }: EstimatePageProps) {
  const canManagePricing = session.user.role === "OWNER" || session.user.role === "ADMIN";
  const [drawing, setDrawing] = useState<DrawingRecord | null>(null);
  const [basePricedEstimate, setBasePricedEstimate] = useState<PricedEstimateResult | null>(null);
  const [ancillaryItems, setAncillaryItems] = useState<AncillaryEstimateItem[]>([]);
  const [manualEntries, setManualEntries] = useState<EstimateWorkbookManualEntry[]>([]);
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
      setAncillaryItems([]);
      setManualEntries([]);
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
        setAncillaryItems([]);
        setManualEntries(buildInitialManualEntries(nextPricedEstimate));
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
    return mergeEstimateWorkbook(basePricedEstimate, ancillaryItems, manualEntries);
  }, [ancillaryItems, basePricedEstimate, manualEntries]);

  const workbook = pricedEstimate?.workbook ?? null;

  const materialSections = useMemo(
    () => (drawing && workbook ? buildEstimateDisplaySections(workbook, drawing, "MATERIALS") : []),
    [drawing, workbook]
  );
  const labourSections = useMemo(
    () => (drawing && workbook ? buildEstimateDisplaySections(workbook, drawing, "LABOUR") : []),
    [drawing, workbook]
  );

  const handleCreateQuote = async () => {
    if (!drawingId) {
      return;
    }
    setIsCreatingQuote(true);
    setQuoteNoticeMessage(null);
    setErrorMessage(null);
    try {
      const quote = await createQuoteSnapshot(drawingId, ancillaryItems, manualEntries);
      setQuotes((current) => [quote, ...current]);
      setQuoteNoticeMessage(`Saved quote snapshot at ${formatTimestamp(quote.createdAtIso)}.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsCreatingQuote(false);
    }
  };

  return (
    <section className="portal-page estimate-page workbook-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Estimate workbook</span>
          <h1>{drawing?.name ?? "Drawing estimate"}</h1>
          <p>Review only the lines that are actually on the job, adjust estimate-level commercial controls, and save quote snapshots when the build-up is ready.</p>
        </div>
        <div className="portal-header-actions">
          {drawing ? (
            <button
              type="button"
              className="portal-secondary-button"
              onClick={() => onNavigate("editor", { drawingId: drawing.id })}
            >
              Open editor
            </button>
          ) : null}
          {canManagePricing ? (
            <button type="button" className="portal-secondary-button" onClick={() => onNavigate("pricing")}>
              Pricing workbook
            </button>
          ) : null}
          <button
            type="button"
            className="portal-primary-button"
            onClick={() =>
              onNavigate(
                drawing?.customerId ? "customer" : "customers",
                drawing?.customerId ? { customerId: drawing.customerId } : undefined
              )
            }
          >
            {drawing?.customerId ? "Customer workspace" : "Customer directory"}
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
      {quoteNoticeMessage ? <div className="portal-inline-message portal-inline-notice">{quoteNoticeMessage}</div> : null}

      {!drawingId ? (
        <div className="portal-empty-state">
          <h2>No drawing selected</h2>
          <p>Open estimates from a saved drawing in the editor or from a customer workspace drawing list.</p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="portal-empty-state">
          <h2>Loading estimate workbook...</h2>
        </div>
      ) : null}

      {drawing && basePricedEstimate && !workbook ? (
        <div className="portal-empty-state">
          <h2>Estimate workbook unavailable</h2>
          <p>This drawing returned pricing totals without workbook rows. Open the pricing workbook and save it once, then reopen this estimate.</p>
        </div>
      ) : null}

      {drawing && pricedEstimate && workbook ? (
        <>
          <section className="portal-surface-card workbook-commercial-card estimate-control-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Estimate controls</span>
                <h2>Commercial and site variables</h2>
              </div>
              <button
                type="button"
                className="portal-primary-button"
                onClick={() => void handleCreateQuote()}
                disabled={isCreatingQuote}
              >
                {isCreatingQuote ? "Saving quote..." : "Save quote snapshot"}
              </button>
            </div>

            <div className="workbook-settings-grid estimate-control-grid">
              <label>
                <span>Labour overhead %</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.settings.labourOverheadPercent}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_LABOUR_OVERHEAD_PERCENT_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label>
                <span>Travel / lodge per day</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.settings.travelLodgePerDay}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_TRAVEL_RATE_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label>
                <span>Travel days</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.commercialInputs.travelDays}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_TRAVEL_DAYS_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label>
                <span>Markup rate</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.settings.markupRate}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_MARKUP_RATE_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label>
                <span>Markup units</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.commercialInputs.markupUnits}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_MARKUP_UNITS_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label>
                <span>Distribution charge</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.settings.distributionCharge}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_DISTRIBUTION_CHARGE_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label>
                <span>Concrete price per cube</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={workbook.settings.concretePricePerCube}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE, Number(event.target.value || 0))
                    )
                  }
                />
              </label>
              <label className="workbook-toggle-field">
                <span>Hard dig</span>
                <input
                  type="checkbox"
                  checked={getManualEntryValue(manualEntries, "LAB_HARD_DIG", workbook.settings.hardDigDefault ? 1 : 0) > 0}
                  onChange={(event) =>
                    setManualEntries((current) => upsertManualEntry(current, "LAB_HARD_DIG", event.target.checked ? 1 : 0))
                  }
                />
              </label>
              <label className="workbook-toggle-field">
                <span>Clear spoils</span>
                <input
                  type="checkbox"
                  checked={getManualEntryValue(manualEntries, "LAB_CLEAR_SPOILS", workbook.settings.clearSpoilsDefault ? 1 : 0) > 0}
                  onChange={(event) =>
                    setManualEntries((current) =>
                      upsertManualEntry(current, "LAB_CLEAR_SPOILS", event.target.checked ? 1 : 0)
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section className="portal-surface-card workbook-summary-strip">
            <article>
              <span>Customer</span>
              <strong>{drawing.customerName}</strong>
            </article>
            <article>
              <span>Updated</span>
              <strong>{formatTimestamp(drawing.updatedAtIso)}</strong>
            </article>
            <article>
              <span>Pricing last saved</span>
              <strong>{pricedEstimate.pricingSnapshot.source === "DEFAULT" ? "Default configuration" : formatTimestamp(pricedEstimate.pricingSnapshot.updatedAtIso)}</strong>
            </article>
            <article>
              <span>Materials</span>
              <strong>{formatMoney(workbook.totals.materialsSubtotal)}</strong>
            </article>
            <article>
              <span>Labour</span>
              <strong>{formatMoney(workbook.totals.labourSubtotal)}</strong>
            </article>
            <article>
              <span>Total</span>
              <strong>{formatMoney(pricedEstimate.totals.totalCost)}</strong>
            </article>
          </section>

          <section className="portal-surface-card workbook-commercial-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Quote snapshots</span>
                <h2>Saved estimate versions</h2>
              </div>
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
                <h2>Manual line items</h2>
              </div>
              <button
                type="button"
                className="portal-secondary-button"
                onClick={() => setAncillaryItems((current) => [...current, buildAncillaryItem()])}
              >
                Add ancillary line
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

          <div className="workbook-sheet-stack">
            {[
              { key: "materials", title: "Materials", sections: materialSections, rateLabel: "Material rate" },
              { key: "labour", title: "Labour", sections: labourSections, rateLabel: "Labour rate" }
            ].map((sheet) => (
              <section key={sheet.key} className="portal-surface-card workbook-sheet-card">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">Estimate sheet</span>
                    <h2>{sheet.title}</h2>
                  </div>
                </div>

                {sheet.sections.length === 0 ? <p className="portal-empty-copy">No {sheet.title.toLowerCase()} lines are currently on this job.</p> : null}

                <div className="workbook-section-grid">
                  {sheet.sections.map((section) => (
                    <section key={section.key} className="workbook-section-card estimate-display-card">
                      <header className="workbook-section-head">
                        <div>
                          <h3>{section.title}</h3>
                        </div>
                        <strong>{formatMoney(section.subtotal)}</strong>
                      </header>

                      <div className="workbook-table estimate-display-table" role="table" aria-label={`${section.title} ${sheet.title.toLowerCase()} rows`}>
                        <div className="workbook-table-row workbook-table-head estimate-display-head" role="row">
                          <span>Item</span>
                          <span>Qty</span>
                          <span>{sheet.rateLabel}</span>
                          <span>Total</span>
                        </div>

                        {section.rows.map((row) => (
                          <div key={row.key} className="workbook-table-row estimate-display-row" role="row">
                            <div className="workbook-item-copy">
                              <strong>{row.label}</strong>
                              {row.notes ? <span>{row.notes}</span> : null}
                            </div>
                            {row.isEditable ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.quantity}
                                onChange={(event) =>
                                  setManualEntries((current) => upsertManualEntry(current, row.key.split(":").at(-1) ?? row.key, Number(event.target.value || 0)))
                                }
                              />
                            ) : (
                              <span>{formatQuantityForDisplay(row.quantity)}</span>
                            )}
                            <span>{formatMoney(row.rate)}</span>
                            <strong>{formatMoney(row.total)}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className="portal-surface-card estimate-totals-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Totals</span>
                <h2>Estimate totals</h2>
              </div>
            </div>
            <div className="estimate-totals-grid">
              <article>
                <span>Materials subtotal</span>
                <strong>{formatMoney(workbook.totals.materialsSubtotal)}</strong>
              </article>
              <article>
                <span>Distribution</span>
                <strong>{formatMoney(workbook.totals.distributionCharge)}</strong>
              </article>
              <article>
                <span>Labour subtotal</span>
                <strong>{formatMoney(workbook.totals.labourSubtotal)}</strong>
              </article>
              <article>
                <span>Labour overhead</span>
                <strong>{formatMoney(workbook.totals.labourOverheadAmount)}</strong>
              </article>
              <article>
                <span>Travel / lodge</span>
                <strong>{formatMoney(workbook.totals.travelTotal)}</strong>
              </article>
              <article>
                <span>Markup</span>
                <strong>{formatMoney(workbook.totals.markupTotal)}</strong>
              </article>
              <article>
                <span>Ancillary material</span>
                <strong>{formatMoney(ancillaryItems.reduce((sum, item) => sum + item.quantity * item.materialCost, 0))}</strong>
              </article>
              <article>
                <span>Ancillary labour</span>
                <strong>{formatMoney(ancillaryItems.reduce((sum, item) => sum + item.quantity * item.labourCost, 0))}</strong>
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

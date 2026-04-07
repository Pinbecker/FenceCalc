import type {
  AncillaryEstimateItem,
  DrawingSummary,
  PricedEstimateResult,
} from "@fence-estimator/contracts";

import {
  COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
  COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
  COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
  COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE,
  COMMERCIAL_LABOUR_DAY_VALUE_CODE,
  COMMERCIAL_MARKUP_RATE_CODE,
  COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE,
} from "../estimatingWorkbook";
import { getRevisionLabel } from "../drawingWorkspace";
import { buildEstimateDisplaySections, formatQuantityForDisplay } from "../workbookPresentation";
import { formatMoney } from "./shared";

type EstimateDisplaySections = ReturnType<typeof buildEstimateDisplaySections>;

interface WorkspaceEstimatePanelProps {
  customerName: string;
  activeDrawing: DrawingSummary;
  isLoadingEstimate: boolean;
  isSavingControls: boolean;
  isSavingQuote: boolean;
  pricedEstimate: PricedEstimateResult | null;
  workbook: PricedEstimateResult["workbook"] | null;
  ancillaryItems: AncillaryEstimateItem[];
  materialSections: EstimateDisplaySections;
  labourSections: EstimateDisplaySections;
  onCloseEstimate: () => void;
  onGenerateQuotePdf: () => void;
  onAddAncillaryItem: () => void;
  onUpdateAncillaryItem: (
    itemId: string,
    field: "description" | "quantity" | "materialCost" | "labourCost",
    value: string | number,
  ) => void;
  onRemoveAncillaryItem: (itemId: string) => void;
  onManualEntryChange: (code: string, quantity: number) => void;
}

export function WorkspaceEstimatePanel({
  customerName,
  activeDrawing,
  isLoadingEstimate,
  isSavingControls,
  isSavingQuote,
  pricedEstimate,
  workbook,
  ancillaryItems,
  materialSections,
  labourSections,
  onCloseEstimate,
  onGenerateQuotePdf,
  onAddAncillaryItem,
  onUpdateAncillaryItem,
  onRemoveAncillaryItem,
  onManualEntryChange,
}: WorkspaceEstimatePanelProps) {
  return (
    <>
      <section className="portal-surface-card workbook-commercial-card estimate-control-card">
        <div className="portal-section-heading">
          <div>
            <span className="portal-section-kicker">Estimate</span>
            <h2>{`${activeDrawing.name} (${getRevisionLabel(activeDrawing)})`}</h2>
            <p className="portal-empty-copy" style={{ margin: "6px 0 0" }}>
              {isSavingControls
                ? "Saving workspace defaults..."
                : "Changes here save automatically. Labour days are calculated from the labour total divided by the labour day value, then rounded up."}
            </p>
          </div>
          <div className="portal-header-actions">
            <button
              type="button"
              className="portal-secondary-button portal-compact-button"
              onClick={onCloseEstimate}
            >
              Hide estimate
            </button>
            <button
              type="button"
              className="portal-primary-button portal-compact-button"
              onClick={onGenerateQuotePdf}
              disabled={isSavingQuote || !pricedEstimate}
            >
              {isSavingQuote ? "Generating..." : "Generate quote PDF"}
            </button>
          </div>
        </div>

        {isLoadingEstimate ? <p className="portal-empty-copy">Loading estimate...</p> : null}
        {workbook ? (
          <div className="workbook-settings-grid estimate-control-grid">
            <label>
              <span>Labour day value</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={workbook.settings.labourDayValue ?? 205}
                onChange={(event) =>
                  onManualEntryChange(
                    COMMERCIAL_LABOUR_DAY_VALUE_CODE,
                    Number(event.target.value || 0),
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
                  onManualEntryChange(
                    COMMERCIAL_TRAVEL_LODGE_PER_DAY_CODE,
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
            <label>
              <span>Markup per day</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={workbook.settings.markupRate}
                onChange={(event) =>
                  onManualEntryChange(COMMERCIAL_MARKUP_RATE_CODE, Number(event.target.value || 0))
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
                  onManualEntryChange(
                    COMMERCIAL_DISTRIBUTION_CHARGE_CODE,
                    Number(event.target.value || 0),
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
                  onManualEntryChange(
                    COMMERCIAL_CONCRETE_PRICE_PER_CUBE_CODE,
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
            <label>
              <span>Hard dig per hole</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={workbook.settings.hardDigRatePerHole ?? 0}
                onChange={(event) =>
                  onManualEntryChange(
                    COMMERCIAL_HARD_DIG_RATE_PER_HOLE_CODE,
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
            <label>
              <span>Clear spoils per hole</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={workbook.settings.clearSpoilsRatePerHole ?? 0}
                onChange={(event) =>
                  onManualEntryChange(
                    COMMERCIAL_CLEAR_SPOILS_RATE_PER_HOLE_CODE,
                    Number(event.target.value || 0),
                  )
                }
              />
            </label>
            <label>
              <span>Hole count</span>
              <input type="number" value={workbook.totals.holeCount ?? 0} readOnly />
            </label>
            <label>
              <span>Labour days</span>
              <input type="number" value={workbook.totals.labourDays ?? 0} readOnly />
            </label>
            <label>
              <span>Travel / lodge total</span>
              <input type="text" value={formatMoney(workbook.totals.travelTotal)} readOnly />
            </label>
            <label>
              <span>Markup total</span>
              <input type="text" value={formatMoney(workbook.totals.markupTotal)} readOnly />
            </label>
          </div>
        ) : null}
      </section>

      {pricedEstimate ? (
        <>
          <section className="portal-surface-card workbook-summary-strip">
            <article>
              <span>Customer</span>
              <strong>{customerName}</strong>
            </article>
            <article>
              <span>Revision</span>
              <strong>{`${activeDrawing.name} (${getRevisionLabel(activeDrawing)})`}</strong>
            </article>
            <article>
              <span>Materials</span>
              <strong>{formatMoney(workbook?.totals.materialsSubtotal)}</strong>
            </article>
            <article>
              <span>Labour</span>
              <strong>{formatMoney(workbook?.totals.labourSubtotal)}</strong>
            </article>
            <article>
              <span>Labour days</span>
              <strong>{workbook?.totals.labourDays ?? 0}</strong>
            </article>
            <article>
              <span>Total</span>
              <strong>{formatMoney(pricedEstimate.totals.totalCost)}</strong>
            </article>
            <article>
              <span>Pricing</span>
              <strong>
                {pricedEstimate.pricingSnapshot.source === "DEFAULT"
                  ? "Default pricing"
                  : "Company pricing"}
              </strong>
            </article>
          </section>

          <section className="portal-surface-card estimate-ancillary-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Ancillary items</span>
              </div>
              <button
                type="button"
                className="portal-secondary-button"
                onClick={onAddAncillaryItem}
              >
                Add ancillary line
              </button>
            </div>
            <div className="estimate-ancillary-list">
              {ancillaryItems.length === 0 ? (
                <p className="portal-empty-copy">No ancillary items added yet.</p>
              ) : null}
              {ancillaryItems.map((item) => (
                <div key={item.id} className="estimate-ancillary-row">
                  <input
                    placeholder="Description"
                    value={item.description}
                    onChange={(event) =>
                      onUpdateAncillaryItem(item.id, "description", event.target.value)
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(event) =>
                      onUpdateAncillaryItem(item.id, "quantity", Number(event.target.value || 0))
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.materialCost}
                    onChange={(event) =>
                      onUpdateAncillaryItem(item.id, "materialCost", Number(event.target.value || 0))
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.labourCost}
                    onChange={(event) =>
                      onUpdateAncillaryItem(item.id, "labourCost", Number(event.target.value || 0))
                    }
                  />
                  <button
                    type="button"
                    className="portal-text-button"
                    onClick={() => onRemoveAncillaryItem(item.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="workbook-sheet-stack">
            {[
              {
                key: "materials",
                title: "Material",
                sections: materialSections,
                rateLabel: "Material rate",
              },
              {
                key: "labour",
                title: "Labour",
                sections: labourSections,
                rateLabel: "Labour rate",
              },
            ].map((sheet) => (
              <section key={sheet.key} className="portal-surface-card workbook-sheet-card">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">{`${sheet.title} sheet`}</span>
                  </div>
                </div>
                {sheet.sections.length === 0 ? (
                  <p className="portal-empty-copy">
                    No {sheet.title.toLowerCase()} lines are currently on this drawing workspace.
                  </p>
                ) : null}
                <div className="workbook-section-stack">
                  {sheet.sections.map((section) => (
                    <section key={section.key} className="workbook-section-card estimate-display-card">
                      <header className="workbook-section-head">
                        <div>
                          <h3>{section.title}</h3>
                        </div>
                        <strong>{formatMoney(section.subtotal)}</strong>
                      </header>

                      <div
                        className="workbook-table estimate-display-table"
                        role="table"
                        aria-label={`${section.title} ${sheet.title.toLowerCase()} rows`}
                      >
                        <div
                          className="workbook-table-row workbook-table-head estimate-display-head"
                          role="row"
                        >
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
                                  onManualEntryChange(
                                    row.key.split(":").at(-1) ?? row.key,
                                    Number(event.target.value || 0),
                                  )
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
        </>
      ) : null}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";

import type { AuthSessionEnvelope, PricingConfigRecord, PricingWorkbookConfig, PricingWorkbookRow } from "@fence-estimator/contracts";
import { buildDefaultPricingWorkbookConfig, groupWorkbookSectionsBySheet } from "@fence-estimator/contracts";

import { getPricingConfig, updatePricingConfig } from "./apiClient";

interface PricingPageProps {
  session: AuthSessionEnvelope;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not saved yet";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatPricingSavedLabel(pricingConfig: PricingConfigRecord | null): string {
  if (!pricingConfig || pricingConfig.updatedByUserId === null) {
    return "Default configuration";
  }
  return formatTimestamp(pricingConfig.updatedAtIso);
}

function cloneWorkbook(workbook: PricingWorkbookConfig | undefined): PricingWorkbookConfig | null {
  return workbook ? (JSON.parse(JSON.stringify(workbook)) as PricingWorkbookConfig) : null;
}

export function getPricingWorkbookOrDefault(pricingConfig: PricingConfigRecord | null | undefined): PricingWorkbookConfig {
  return pricingConfig?.workbook ?? buildDefaultPricingWorkbookConfig();
}

function countEditableRows(workbook: PricingWorkbookConfig | null): number {
  return workbook?.sections.reduce(
    (sum, section) => sum + section.rows.filter((row) => row.quantityRule.kind === "MANUAL_ENTRY").length,
    0
  ) ?? 0;
}

function updateWorkbookRow(
  workbook: PricingWorkbookConfig,
  code: string,
  updater: (row: PricingWorkbookRow) => PricingWorkbookRow
): PricingWorkbookConfig {
  return {
    ...workbook,
    sections: workbook.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => (row.code === code ? updater(row) : row))
    }))
  };
}

export function PricingPage({ session }: PricingPageProps) {
  const [pricingConfig, setPricingConfig] = useState<PricingConfigRecord | null>(null);
  const [draftWorkbook, setDraftWorkbook] = useState<PricingWorkbookConfig | null>(null);
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
        setDraftWorkbook(cloneWorkbook(getPricingWorkbookOrDefault(nextPricingConfig)));
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

  const groupedSections = useMemo(
    () => (draftWorkbook ? groupWorkbookSectionsBySheet(draftWorkbook) : { MATERIALS: [], LABOUR: [] }),
    [draftWorkbook]
  );

  const isDirty = useMemo(
    () => JSON.stringify(draftWorkbook) !== JSON.stringify(getPricingWorkbookOrDefault(pricingConfig)),
    [draftWorkbook, pricingConfig]
  );

  const handleSave = async () => {
    if (!draftWorkbook) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const nextPricingConfig = await updatePricingConfig({
        ...(pricingConfig?.items ? { items: pricingConfig.items } : {}),
        workbook: draftWorkbook
      });
      setPricingConfig(nextPricingConfig);
      setDraftWorkbook(cloneWorkbook(nextPricingConfig.workbook));
      setNoticeMessage(`Saved pricing for ${session.company.name} at ${formatTimestamp(nextPricingConfig.updatedAtIso)}.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="portal-page pricing-page workbook-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Pricing workbook</span>
          <h1>Materials and labour schedule</h1>
          <p>Rates on this workbook feed the estimate page directly. Keep it aligned with the live spreadsheet structure rather than a flat catalogue list.</p>
        </div>
        <div className="portal-header-actions">
          <button
            type="button"
            className="portal-secondary-button"
            onClick={() => {
              setDraftWorkbook(cloneWorkbook(getPricingWorkbookOrDefault(pricingConfig)));
              setNoticeMessage(null);
              setErrorMessage(null);
            }}
            disabled={!pricingConfig || !isDirty || isSaving}
          >
            Reset changes
          </button>
          <button type="button" className="portal-primary-button" onClick={() => void handleSave()} disabled={!isDirty || isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save workbook"}
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
      {noticeMessage ? <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div> : null}

      <section className="portal-surface-card pricing-page-summary workbook-summary-strip">
        <article>
          <span>Company</span>
          <strong>{session.company.name}</strong>
        </article>
        <article>
          <span>Workbook sections</span>
          <strong>{draftWorkbook?.sections.length ?? 0}</strong>
        </article>
        <article>
          <span>Manual rows</span>
          <strong>{countEditableRows(draftWorkbook)}</strong>
        </article>
        <article>
          <span>Last saved</span>
          <strong>{formatPricingSavedLabel(pricingConfig)}</strong>
        </article>
      </section>

      {isLoading ? (
        <div className="portal-empty-state">
          <h2>Loading pricing workbook...</h2>
        </div>
      ) : null}

      {draftWorkbook ? (
        <>
          <section className="portal-surface-card workbook-settings-card">
            <div className="portal-section-heading">
              <div>
                <span className="portal-section-kicker">Workbook controls</span>
                <h2>Commercial defaults</h2>
              </div>
            </div>

            <div className="workbook-settings-grid">
              <label>
                <span>Labour overhead %</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftWorkbook.settings.labourOverheadPercent}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              labourOverheadPercent: Number(event.target.value || 0)
                            }
                          }
                        : current
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
                  value={draftWorkbook.settings.travelLodgePerDay}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              travelLodgePerDay: Number(event.target.value || 0)
                            }
                          }
                        : current
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
                  value={draftWorkbook.settings.markupRate}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              markupRate: Number(event.target.value || 0)
                            }
                          }
                        : current
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
                  value={draftWorkbook.settings.distributionCharge}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              distributionCharge: Number(event.target.value || 0)
                            }
                          }
                        : current
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
                  value={draftWorkbook.settings.concretePricePerCube}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              concretePricePerCube: Number(event.target.value || 0)
                            }
                          }
                        : current
                    )
                  }
                />
              </label>
              <label>
                <span>Colour option</span>
                <input
                  value={draftWorkbook.settings.colourOption}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              colourOption: event.target.value
                            }
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="workbook-toggle-field">
                <span>Hard dig default</span>
                <input
                  type="checkbox"
                  checked={draftWorkbook.settings.hardDigDefault}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              hardDigDefault: event.target.checked
                            }
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="workbook-toggle-field">
                <span>Clear spoils default</span>
                <input
                  type="checkbox"
                  checked={draftWorkbook.settings.clearSpoilsDefault}
                  onChange={(event) =>
                    setDraftWorkbook((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              clearSpoilsDefault: event.target.checked
                            }
                          }
                        : current
                    )
                  }
                />
              </label>
            </div>
          </section>

          <div className="workbook-sheet-stack">
            {(["MATERIALS", "LABOUR"] as const).map((sheet) => (
              <section key={sheet} className="portal-surface-card workbook-sheet-card">
                <div className="portal-section-heading">
                  <div>
                    <span className="portal-section-kicker">Workbook sheet</span>
                    <h2>{sheet === "MATERIALS" ? "Materials" : "Labour"}</h2>
                  </div>
                </div>

                <div className="workbook-section-stack">
                  {groupedSections[sheet].map((section) => (
                    <section key={section.key} className="workbook-section-card">
                      <header className="workbook-section-head">
                        <div>
                          <h3>{section.title}</h3>
                          {section.caption ? <p>{section.caption}</p> : null}
                        </div>
                        <span>{section.rows.length} rows</span>
                      </header>

                      <div className="workbook-table" role="table" aria-label={`${section.title} pricing`}>
                        <div className="workbook-table-row workbook-table-head" role="row">
                          <span>Item</span>
                          <span>Unit</span>
                          <span>Rate</span>
                          <span>Mode</span>
                        </div>

                        {section.rows.map((row) => (
                          <div key={row.code} className="workbook-table-row" role="row">
                            <div className="workbook-item-copy">
                              <strong>{row.label}</strong>
                              {row.notes ? <span>{row.notes}</span> : null}
                            </div>
                            <span>{row.unit}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.rate}
                              disabled={row.rateMode === "REFERENCE"}
                              onChange={(event) =>
                                setDraftWorkbook((current) =>
                                  current
                                    ? updateWorkbookRow(current, row.code, (entry) => ({
                                        ...entry,
                                        rate: Number(event.target.value || 0)
                                      }))
                                    : current
                                )
                              }
                            />
                            <span>{row.rateMode ?? "MONEY"}</span>
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
    </section>
  );
}

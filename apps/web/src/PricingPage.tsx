import { useEffect, useMemo, useState } from "react";

import type { AuthSessionEnvelope, PricingConfigRecord, PricingWorkbookConfig, PricingWorkbookRow } from "@fence-estimator/contracts";
import { buildDefaultPricingWorkbookConfig } from "@fence-estimator/contracts";

import { getPricingConfig, updatePricingConfig } from "./apiClient";
import { buildPricingRateGroups, type NumericPricingSettingKey } from "./workbookPresentation";

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

function updateWorkbookSetting(
  workbook: PricingWorkbookConfig,
  key: NumericPricingSettingKey,
  value: number
): PricingWorkbookConfig {
  return {
    ...workbook,
    settings: {
      ...workbook.settings,
      [key]: value
    }
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

  const rateGroups = useMemo(() => (draftWorkbook ? buildPricingRateGroups(draftWorkbook) : []), [draftWorkbook]);

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
          <h1>Materials and labour rates</h1>
          <p>Keep the base rates tight and periodic here. Estimate-specific commercial controls now live on the estimate itself.</p>
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
          <span>Rate groups</span>
          <strong>{rateGroups.length}</strong>
        </article>
        <article>
          <span>Priced lines</span>
          <strong>{rateGroups.reduce((sum, group) => sum + group.rows.length, 0)}</strong>
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
        <div className="pricing-rate-group-grid">
          {rateGroups.map((group) => (
            <section key={group.key} className="portal-surface-card pricing-rate-group-card">
              <header className="pricing-rate-group-head">
                <div>
                  <span className="portal-section-kicker">Pricing group</span>
                  <h2>{group.title}</h2>
                </div>
                <span>{group.rows.length} items</span>
              </header>

              <div className="pricing-rate-table" role="table" aria-label={`${group.title} pricing`}>
                <div className="pricing-rate-row pricing-rate-head" role="row">
                  <span>Item</span>
                  <span>Unit</span>
                  <span>Material</span>
                  <span>Labour</span>
                </div>

                {group.rows.map((row) => (
                  <div key={row.key} className="pricing-rate-row" role="row">
                    <div className="pricing-rate-copy">
                      <strong>{row.label}</strong>
                      {row.notes ? <span>{row.notes}</span> : null}
                    </div>
                    <span>{row.unit}</span>
                    {row.materialCode || row.materialSettingKey ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.materialSettingKey ? draftWorkbook.settings[row.materialSettingKey] : row.materialRate ?? 0}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value || 0);
                          setDraftWorkbook((current) => {
                            if (!current) {
                              return current;
                            }
                            if (row.materialSettingKey) {
                              return updateWorkbookSetting(current, row.materialSettingKey, nextValue);
                            }
                            if (!row.materialCode) {
                              return current;
                            }
                            return updateWorkbookRow(current, row.materialCode, (entry) => ({
                              ...entry,
                              rate: nextValue
                            }));
                          });
                        }}
                      />
                    ) : (
                      <strong className="pricing-rate-placeholder">-</strong>
                    )}
                    {row.labourCode ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.labourRate ?? 0}
                        onChange={(event) =>
                          setDraftWorkbook((current) =>
                            current
                              ? updateWorkbookRow(current, row.labourCode!, (entry) => ({
                                  ...entry,
                                  rate: Number(event.target.value || 0)
                                }))
                              : current
                          )
                        }
                      />
                    ) : (
                      <strong className="pricing-rate-placeholder">-</strong>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

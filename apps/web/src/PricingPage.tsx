import { useEffect, useMemo, useState } from "react";

import type { AuthSessionEnvelope, PricingConfigRecord, PricingWorkbookConfig, PricingWorkbookRow } from "@fence-estimator/contracts";
import { buildDefaultPricingWorkbookConfig, mergePricingWorkbookWithTemplate } from "@fence-estimator/contracts";

import { getPricingConfig, updatePricingConfig } from "./apiClient";
import { buildPricingRateGroups, type NumericPricingSettingKey } from "./workbookPresentation";

interface PricingPageProps {
  session: AuthSessionEnvelope;
}

type PricingVariantType =
  | "FLOODLIGHT_COLUMN"
  | "KICKBOARD"
  | "GOAL_UNIT"
  | "BASKETBALL_POST"
  | "SIDE_NETTING";

interface PricingVariantDraft {
  type: PricingVariantType;
  label: string;
  widthMm: string;
  heightMm: string;
  thicknessMm: string;
  boardLengthMm: string;
  profile: string;
  hasBasketballPost: boolean;
  materialRate: string;
  labourRate: string;
}

const DEFAULT_VARIANT_DRAFT: PricingVariantDraft = {
  type: "FLOODLIGHT_COLUMN",
  label: "",
  widthMm: "3000",
  heightMm: "6000",
  thicknessMm: "50",
  boardLengthMm: "2500",
  profile: "SQUARE",
  hasBasketballPost: false,
  materialRate: "0",
  labourRate: "0",
};

const VARIANT_TYPE_BY_GROUP_KEY: Partial<Record<string, PricingVariantType>> = {
  "goal-units": "GOAL_UNIT",
  basketball: "BASKETBALL_POST",
  "floodlight-columns": "FLOODLIGHT_COLUMN",
  kickboards: "KICKBOARD",
  "side-netting": "SIDE_NETTING",
};

const VARIANT_ADD_LABEL: Record<PricingVariantType, string> = {
  FLOODLIGHT_COLUMN: "floodlight column",
  KICKBOARD: "kickboard",
  GOAL_UNIT: "goal unit",
  BASKETBALL_POST: "basketball post",
  SIDE_NETTING: "side netting",
};

const VARIANT_HELP_TEXT: Record<PricingVariantType, string> = {
  FLOODLIGHT_COLUMN: "Add another column height. It will appear as a floodlight option in the editor.",
  KICKBOARD: "Add a board height, thickness, cut/profile, and board length for the editor kickboard tool.",
  GOAL_UNIT: "Add a goal unit size and choose whether that unit includes a basketball post.",
  BASKETBALL_POST: "Add another dedicated basketball arm length for the editor basketball tool.",
  SIDE_NETTING: "Add another side-netting height for the editor side-netting tool.",
};

function buildDefaultVariantDraft(type: PricingVariantType): PricingVariantDraft {
  return {
    ...DEFAULT_VARIANT_DRAFT,
    type,
    heightMm:
      type === "KICKBOARD"
        ? "200"
        : type === "GOAL_UNIT"
          ? "3000"
          : type === "BASKETBALL_POST"
            ? "1800"
            : type === "SIDE_NETTING"
              ? "2000"
              : "6000",
  };
}

function getVariantTypeForGroup(groupKey: string): PricingVariantType | null {
  return VARIANT_TYPE_BY_GROUP_KEY[groupKey] ?? null;
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
  return mergePricingWorkbookWithTemplate(pricingConfig?.workbook ?? buildDefaultPricingWorkbookConfig());
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

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function sanitizeCodePart(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "CUSTOM";
}

function buildVariantRows(draft: PricingVariantDraft): PricingWorkbookRow[] {
  const parsedHeightMm = parsePositiveInteger(draft.heightMm, 6000);
  const heightMm = draft.type === "GOAL_UNIT" ? Math.min(parsedHeightMm, 6000) : parsedHeightMm;
  const widthMm = parsePositiveInteger(draft.widthMm, 3000);
  const thicknessMm = parsePositiveInteger(draft.thicknessMm, 50);
  const boardLengthMm = parsePositiveInteger(draft.boardLengthMm, 2500);
  const profile = sanitizeCodePart(draft.profile || "CUSTOM");
  const parsedMaterialRate = Number(draft.materialRate || 0);
  const parsedLabourRate = Number(draft.labourRate || 0);
  const materialRate = Number.isFinite(parsedMaterialRate) ? Math.max(0, parsedMaterialRate) : 0;
  const labourRate = Number.isFinite(parsedLabourRate) ? Math.max(0, parsedLabourRate) : 0;

  const definition =
    draft.type === "FLOODLIGHT_COLUMN"
      ? {
          pairKey: `custom:floodlight:column:${heightMm}`,
          label: draft.label.trim() || `Floodlight column ${heightMm / 1000}m`,
          unit: "column",
          category: "FLOODLIGHT_COLUMNS" as const,
          groupKey: "floodlight-columns",
          groupTitle: "Floodlight columns",
          sortOrder: 8200,
          quantityKey: `floodlight:column:${heightMm}:count`,
          materialCode: `MAT_CUSTOM_FLOODLIGHT_COLUMN_${heightMm}`,
          labourCode: `LAB_CUSTOM_FLOODLIGHT_COLUMN_${heightMm}`,
          concreteQuantityKey: `floodlight:column:${heightMm}:concrete-m3`,
          holeQuantityKey: `floodlight:column:${heightMm}:holes`,
        }
      : draft.type === "KICKBOARD"
        ? {
            pairKey: `custom:kickboard:${heightMm}:${thicknessMm}:${profile}:${boardLengthMm}`,
            label:
              draft.label.trim() ||
              `${heightMm} x ${thicknessMm} ${profile.toLowerCase()} kickboards`,
            unit: "board",
            category: "KICKBOARDS" as const,
            groupKey: "kickboards",
            groupTitle: "Kickboards",
            sortOrder: 8300,
            quantityKey: `kickboard:${heightMm}:${thicknessMm}:${profile}:${boardLengthMm}:boards`,
            materialCode: `MAT_CUSTOM_KICKBOARD_${heightMm}_${thicknessMm}_${profile}_${boardLengthMm}`,
            labourCode: `LAB_CUSTOM_KICKBOARD_${heightMm}_${thicknessMm}_${profile}_${boardLengthMm}`,
          }
        : draft.type === "GOAL_UNIT"
          ? {
              pairKey: `custom:goal-unit:${widthMm}:${heightMm}:${draft.hasBasketballPost ? "basketball" : "plain"}`,
              label:
                draft.label.trim() ||
                `Goal unit ${widthMm / 1000}m x ${heightMm / 1000}m${draft.hasBasketballPost ? " with basketball post" : ""}`,
              unit: "item",
              category: "GOAL_UNITS" as const,
              groupKey: "goal-units",
              groupTitle: "Goal units",
              sortOrder: 8000,
              quantityKey: draft.hasBasketballPost
                ? `goal-unit:${widthMm}:${heightMm}:basketball:count`
                : `goal-unit:${widthMm}:${heightMm}:count`,
              materialCode: `MAT_CUSTOM_GOAL_UNIT_${widthMm}_${heightMm}${draft.hasBasketballPost ? "_BASKETBALL" : ""}`,
              labourCode: `LAB_CUSTOM_GOAL_UNIT_${widthMm}_${heightMm}${draft.hasBasketballPost ? "_BASKETBALL" : ""}`,
            }
          : draft.type === "BASKETBALL_POST"
            ? {
                pairKey: `custom:basketball:dedicated:${heightMm}`,
                label: draft.label.trim() || `Dedicated basketball post ${heightMm}mm arm`,
                unit: "post",
                category: "BASKETBALL_POSTS" as const,
                groupKey: "basketball",
                groupTitle: "Basketball",
                sortOrder: 8100,
                quantityKey: `basketball:dedicated:${heightMm}:count`,
                materialCode: `MAT_CUSTOM_BASKETBALL_DEDICATED_${heightMm}`,
                labourCode: `LAB_CUSTOM_BASKETBALL_DEDICATED_${heightMm}`,
                concreteQuantityKey: `basketball:dedicated:${heightMm}:concrete-m3`,
                holeQuantityKey: `basketball:dedicated:${heightMm}:holes`,
              }
            : {
                pairKey: `custom:side-netting:${heightMm}`,
                label: draft.label.trim() || `Side netting +${heightMm}mm`,
                unit: "m2",
                category: "SIDE_NETTING" as const,
                groupKey: "side-netting",
                groupTitle: "Side netting",
                sortOrder: 8500,
                quantityKey: `side-netting:${heightMm}:area-m2`,
                materialCode: `MAT_CUSTOM_SIDE_NETTING_${heightMm}`,
                labourCode: `LAB_CUSTOM_SIDE_NETTING_${heightMm}`,
              };

  const presentation = {
    pairKey: definition.pairKey,
    groupKey: definition.groupKey,
    groupTitle: definition.groupTitle,
    sortOrder: definition.sortOrder,
  };

  return [
    {
      code: definition.materialCode,
      label: definition.label,
      unit: definition.unit,
      rate: materialRate,
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: definition.quantityKey },
      category: definition.category,
      presentation,
      ...(definition.concreteQuantityKey ? { concreteQuantityKey: definition.concreteQuantityKey } : {}),
    },
    {
      code: definition.labourCode,
      label: definition.label,
      unit: definition.unit,
      rate: labourRate,
      quantityRule: { kind: "CATALOG_QUANTITY", quantityKey: definition.quantityKey },
      category: definition.category,
      presentation,
      ...(definition.holeQuantityKey ? { holeQuantityKey: definition.holeQuantityKey } : {}),
    },
  ];
}

function upsertWorkbookVariantRows(
  workbook: PricingWorkbookConfig,
  rows: PricingWorkbookRow[]
): PricingWorkbookConfig {
  const rowCodes = new Set(rows.map((row) => row.code));
  return {
    ...workbook,
    sections: workbook.sections.map((section) => {
      if (section.key !== "materials-installables" && section.key !== "labour-installables") {
        return {
          ...section,
          rows: section.rows.filter((row) => !rowCodes.has(row.code))
        };
      }
      const targetRows = rows.filter((row) =>
        section.key === "labour-installables" ? row.code.startsWith("LAB_") : row.code.startsWith("MAT_")
      );
      if (targetRows.length === 0) {
        return {
          ...section,
          rows: section.rows.filter((row) => !rowCodes.has(row.code))
        };
      }
      return {
        ...section,
        rows: [
          ...section.rows.filter((row) => !rowCodes.has(row.code)),
          ...targetRows
        ]
      };
    })
  };
}

function removeWorkbookRowsByCode(workbook: PricingWorkbookConfig, codes: string[]): PricingWorkbookConfig {
  const codeSet = new Set(codes);
  return {
    ...workbook,
    sections: workbook.sections.map((section) => ({
      ...section,
      rows: section.rows.filter((row) => !codeSet.has(row.code))
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
  const [variantDraft, setVariantDraft] = useState<PricingVariantDraft>(DEFAULT_VARIANT_DRAFT);
  const [activeVariantGroupKey, setActiveVariantGroupKey] = useState<string | null>(null);

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
      setDraftWorkbook(cloneWorkbook(getPricingWorkbookOrDefault(nextPricingConfig)));
      setNoticeMessage(`Saved pricing for ${session.company.name} at ${formatTimestamp(nextPricingConfig.updatedAtIso)}.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenVariantForm = (groupKey: string, type: PricingVariantType) => {
    if (activeVariantGroupKey === groupKey) {
      setActiveVariantGroupKey(null);
      return;
    }
    setVariantDraft(buildDefaultVariantDraft(type));
    setActiveVariantGroupKey(groupKey);
    setNoticeMessage(null);
  };

  const handleAddVariant = () => {
    setDraftWorkbook((current) => {
      if (!current) {
        return current;
      }
      return upsertWorkbookVariantRows(current, buildVariantRows(variantDraft));
    });
    setActiveVariantGroupKey(null);
    setNoticeMessage(`Added ${VARIANT_ADD_LABEL[variantDraft.type]} variant to the draft. Save the workbook to make it available in the editor.`);
  };

  const renderVariantFields = () => {
    const heightLabel =
      variantDraft.type === "BASKETBALL_POST"
        ? "Arm length mm"
        : variantDraft.type === "KICKBOARD"
          ? "Board height mm"
          : variantDraft.type === "SIDE_NETTING"
            ? "Additional height mm"
            : "Height mm";

    return (
      <div className="pricing-add-grid">
        <label className="pricing-add-field pricing-add-field-wide">
          <span>Display label</span>
          <input
            type="text"
            value={variantDraft.label}
            placeholder="Auto-label if blank"
            onChange={(event) => setVariantDraft((current) => ({ ...current, label: event.target.value }))}
          />
        </label>
        {variantDraft.type === "GOAL_UNIT" ? (
          <label className="pricing-add-field">
            <span>Width mm</span>
            <input
              type="number"
              min="1"
              step="1"
              value={variantDraft.widthMm}
              onChange={(event) => setVariantDraft((current) => ({ ...current, widthMm: event.target.value }))}
            />
          </label>
        ) : null}
        <label className="pricing-add-field">
          <span>{heightLabel}</span>
          <input
            type="number"
            min="1"
            max={variantDraft.type === "GOAL_UNIT" ? "6000" : undefined}
            step="1"
            value={variantDraft.heightMm}
            onChange={(event) => setVariantDraft((current) => ({ ...current, heightMm: event.target.value }))}
          />
        </label>
        {variantDraft.type === "GOAL_UNIT" ? (
          <label className="pricing-add-field">
            <span>Basketball post</span>
            <select
              value={variantDraft.hasBasketballPost ? "YES" : "NO"}
              onChange={(event) =>
                setVariantDraft((current) => ({
                  ...current,
                  hasBasketballPost: event.target.value === "YES"
                }))
              }
            >
              <option value="NO">No basketball post</option>
              <option value="YES">Includes basketball post</option>
            </select>
          </label>
        ) : null}
        {variantDraft.type === "KICKBOARD" ? (
          <>
            <label className="pricing-add-field">
              <span>Thickness mm</span>
              <input
                type="number"
                min="1"
                step="1"
                value={variantDraft.thicknessMm}
                onChange={(event) => setVariantDraft((current) => ({ ...current, thicknessMm: event.target.value }))}
              />
            </label>
            <label className="pricing-add-field">
              <span>Profile / cut</span>
              <input
                type="text"
                value={variantDraft.profile}
                onChange={(event) => setVariantDraft((current) => ({ ...current, profile: event.target.value }))}
              />
            </label>
            <label className="pricing-add-field">
              <span>Board length mm</span>
              <input
                type="number"
                min="1"
                step="1"
                value={variantDraft.boardLengthMm}
                onChange={(event) => setVariantDraft((current) => ({ ...current, boardLengthMm: event.target.value }))}
              />
            </label>
          </>
        ) : null}
        <label className="pricing-add-field">
          <span>Material rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={variantDraft.materialRate}
            onChange={(event) => setVariantDraft((current) => ({ ...current, materialRate: event.target.value }))}
          />
        </label>
        <label className="pricing-add-field">
          <span>Labour rate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={variantDraft.labourRate}
            onChange={(event) => setVariantDraft((current) => ({ ...current, labourRate: event.target.value }))}
          />
        </label>
      </div>
    );
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
          {rateGroups.map((group) => {
            const variantType = getVariantTypeForGroup(group.key);
            const isAddingVariant = activeVariantGroupKey === group.key && variantType !== null;

            return (
            <section key={group.key} className="portal-surface-card pricing-rate-group-card">
              <header className="pricing-rate-group-head">
                <div className="pricing-rate-group-title">
                  <span className="portal-section-kicker">Pricing group</span>
                  <h2>{group.title}</h2>
                  <p>{group.rows.length} priced {group.rows.length === 1 ? "line" : "lines"}</p>
                </div>
                <div className="pricing-rate-group-actions">
                  {variantType ? (
                    <button
                      type="button"
                      className="pricing-add-button"
                      onClick={() => handleOpenVariantForm(group.key, variantType)}
                      aria-expanded={isAddingVariant}
                    >
                      {isAddingVariant ? "Close" : `+ Add ${VARIANT_ADD_LABEL[variantType]}`}
                    </button>
                  ) : (
                    <span className="pricing-fixed-badge">Fixed catalogue</span>
                  )}
                </div>
              </header>

              {isAddingVariant && variantType ? (
                <div className="pricing-add-panel">
                  <div className="pricing-add-copy">
                    <strong>Add {VARIANT_ADD_LABEL[variantType]}</strong>
                    <span>{VARIANT_HELP_TEXT[variantType]}</span>
                  </div>
                  {renderVariantFields()}
                  <div className="pricing-add-actions">
                    <button type="button" className="portal-secondary-button" onClick={() => setActiveVariantGroupKey(null)}>
                      Cancel
                    </button>
                    <button type="button" className="portal-primary-button" onClick={handleAddVariant}>
                      Add to draft
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="pricing-rate-table" role="table" aria-label={`${group.title} pricing`}>
                <div className="pricing-rate-row pricing-rate-head" role="row">
                  <span>Item</span>
                  <span>Unit</span>
                  <span>Material</span>
                  <span>Labour</span>
                  <span>Actions</span>
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
                    {row.isCustom ? (
                      <button
                        type="button"
                        className="portal-secondary-button"
                        onClick={() =>
                          setDraftWorkbook((current) =>
                            current
                              ? removeWorkbookRowsByCode(current, [row.materialCode, row.labourCode].filter(Boolean) as string[])
                              : current
                          )
                        }
                      >
                        Remove
                      </button>
                    ) : (
                      <strong className="pricing-rate-placeholder">-</strong>
                    )}
                  </div>
                ))}
              </div>
            </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

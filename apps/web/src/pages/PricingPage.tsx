import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Beaker,
  BookOpen,
  History,
  Loader2,
  PackagePlus,
  Rocket,
  Save,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";

import {
  ApiError,
  cloneCompanyConfigurationTemplate,
  getCompanyConfiguration,
  previewCompanyConfiguration,
  publishCompanyConfiguration,
  updateCompanyConfigurationDraft,
} from "@/apiClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import type {
  AssemblyConditionOperator,
  AssemblyRoundingMode,
  CompanyAssemblyRule,
  CompanyCatalogueItem,
  CompanyConfigurationDefinition,
  CompanyConfigurationPreviewResult,
  CompanyConfigurationWorkspace,
  PricingWorkbookSheet,
} from "@fence-estimator/contracts";

const clone = (value: CompanyConfigurationDefinition) => structuredClone(value);
const errorText = (error: unknown) =>
  error instanceof ApiError ? error.payload.error : "Company configuration could not be updated";
const money = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
const ruleSource = (rule: CompanyAssemblyRule) =>
  rule.quantitySource.kind === "MANUAL_ENTRY"
    ? "Entered on estimate"
    : rule.quantitySource.quantityKey;

export function PricingPage() {
  const [workspace, setWorkspace] = useState<CompanyConfigurationWorkspace | null>(null);
  const [draft, setDraft] = useState<CompanyConfigurationDefinition | null>(null);
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<"ADD" | "PREVIEW" | "PUBLISH" | "TEMPLATE" | null>(null);
  const [preview, setPreview] = useState<CompanyConfigurationPreviewResult | null>(null);
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});

  const useWorkspace = (next: CompanyConfigurationWorkspace) => {
    setWorkspace(next);
    setDraft(clone(next.draft.definition));
    setPreview(null);
    setPreviewSignature(null);
  };
  useEffect(() => {
    let cancelled = false;
    void getCompanyConfiguration()
      .then(({ workspace: next }) => !cancelled && useWorkspace(next))
      .catch((error: unknown) => !cancelled && toast.error(errorText(error)));
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => new Map((draft?.catalogueItems ?? []).map((item) => [item.id, item] as const)),
    [draft],
  );
  const sources = useMemo(
    () =>
      [
        ...new Set(
          (draft?.assemblies ?? []).flatMap((rule) =>
            rule.quantitySource.kind === "DRAWING_QUANTITY"
              ? [rule.quantitySource.quantityKey]
              : [],
          ),
        ),
      ].sort(),
    [draft],
  );
  const groups = useMemo(() => {
    const result = new Map<string, CompanyAssemblyRule[]>();
    const needle = search.trim().toLowerCase();
    for (const rule of draft?.assemblies ?? []) {
      const item = items.get(rule.catalogueItemId);
      if (
        needle &&
        !`${rule.name} ${item?.code ?? ""} ${ruleSource(rule)}`.toLowerCase().includes(needle)
      )
        continue;
      const title = rule.presentation.groupTitle;
      result.set(title, [...(result.get(title) ?? []), rule]);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b, "en-GB", { numeric: true }));
  }, [draft, items, search]);

  if (!workspace || !draft)
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading company configuration...
      </div>
    );
  const signature = JSON.stringify(draft);
  const previewFacts = Object.entries(facts).map(([quantityKey, value]) => ({
    quantityKey,
    quantity: Math.max(0, Number(value) || 0),
  }));
  const dirty = signature !== JSON.stringify(workspace.draft.definition);
  const tested = previewSignature === signature && preview?.canPublish === true;
  const updateItem = (id: string, patch: Partial<CompanyCatalogueItem>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            catalogueItems: current.catalogueItems.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  const updateRule = (id: string, patch: Partial<CompanyAssemblyRule>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            assemblies: current.assemblies.map((rule) =>
              rule.id === id ? { ...rule, ...patch } : rule,
            ),
          }
        : current,
    );
  const updateSetting = (key: keyof CompanyConfigurationDefinition["settings"], value: number) =>
    setDraft((current) =>
      current ? { ...current, settings: { ...current.settings, [key]: value } } : current,
    );

  const save = async () => {
    setWorking(true);
    try {
      const response = await updateCompanyConfigurationDraft({ definition: draft });
      useWorkspace(response.workspace);
      toast.success(`Draft version ${response.workspace.draft.versionNumber} saved`);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setWorking(false);
    }
  };
  const runPreview = async () => {
    setWorking(true);
    try {
      const response = await previewCompanyConfiguration({
        definition: draft,
        facts: previewFacts,
      });
      setPreview(response.preview);
      setPreviewSignature(signature);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Company configuration</h1>
            <Badge variant="warning">Draft v{workspace.draft.versionNumber}</Badge>
            <Badge variant="success">Live v{workspace.published?.versionNumber ?? "-"}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Build the catalogue and controlled assembly rules that turn drawing facts into estimate
            lines. Changes affect future calculations only after testing and publication.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog("TEMPLATE")}>
            <BookOpen className="h-4 w-4" />
            Templates
          </Button>
          <Button variant="outline" onClick={() => setDialog("PREVIEW")}>
            <Beaker className="h-4 w-4" />
            Test rules
          </Button>
          <Button variant="outline" disabled={!dirty || working} onClick={() => void save()}>
            <Save className="h-4 w-4" />
            Save draft
          </Button>
          <Button disabled={dirty || !tested || working} onClick={() => setDialog("PUBLISH")}>
            <Rocket className="h-4 w-4" />
            Publish
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Catalogue" value={draft.catalogueItems.length} copy="versioned items" />
        <Metric
          title="Assemblies"
          value={draft.assemblies.filter((rule) => rule.enabled).length}
          copy="enabled typed rules"
        />
        <Metric
          title="Publication"
          value={tested ? "Ready" : dirty ? "Save first" : "Test required"}
          copy="preview must match draft"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Commercial policy</CardTitle>
          <CardDescription>
            Company defaults applied after assembly quantities resolve.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label="Labour value per day"
            value={draft.settings.labourDayValue ?? 205}
            setValue={(v) => updateSetting("labourDayValue", v)}
          />
          <NumberField
            label="Material markup %"
            value={draft.settings.materialMarkupPercent ?? 0}
            setValue={(v) => updateSetting("materialMarkupPercent", v)}
          />
          <NumberField
            label="Labour markup %"
            value={draft.settings.labourMarkupPercent ?? 0}
            setValue={(v) => updateSetting("labourMarkupPercent", v)}
          />
          <NumberField
            label="Labour overhead %"
            value={draft.settings.labourOverheadPercent ?? 0}
            setValue={(v) => updateSetting("labourOverheadPercent", v)}
          />
          <NumberField
            label="Travel and lodge per day"
            value={draft.settings.travelLodgePerDay}
            setValue={(v) => updateSetting("travelLodgePerDay", v)}
          />
          <NumberField
            label="Selling addition per day"
            value={draft.settings.markupRate}
            setValue={(v) => updateSetting("markupRate", v)}
          />
          <NumberField
            label="Shared distribution charge"
            value={draft.settings.distributionCharge}
            setValue={(v) => updateSetting("distributionCharge", v)}
          />
          <NumberField
            label="Default VAT rate %"
            value={draft.settings.vatRate ?? 20}
            setValue={(v) => updateSetting("vatRate", v)}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Catalogue and assemblies</h2>
            <p className="text-sm text-muted-foreground">
              Every assembly consumes a controlled source, multiplier and rounding policy.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-64 pl-9"
                placeholder="Search item or source"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => setDialog("ADD")}>
              <PackagePlus className="h-4 w-4" />
              Add item and rule
            </Button>
          </div>
        </div>
        {groups.map(([title, rules]) => (
          <Card key={title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{title}</CardTitle>
                <Badge variant="muted">{rules.length} rules</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="hidden grid-cols-[minmax(240px,1fr)_minmax(220px,1fr)_100px_100px_130px_40px] gap-3 px-3 text-xs font-medium uppercase text-muted-foreground xl:grid">
                <span>Item</span>
                <span>Source</span>
                <span>Rate</span>
                <span>Multiplier</span>
                <span>Rounding</span>
                <span />
              </div>
              {rules.map((rule) => {
                const item = items.get(rule.catalogueItemId);
                if (!item) return null;
                return (
                  <div
                    key={rule.id}
                    className={`grid gap-3 rounded-lg border p-3 xl:grid-cols-[minmax(240px,1fr)_minmax(220px,1fr)_100px_100px_130px_40px] xl:items-center ${rule.enabled ? "" : "opacity-50"}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Enable ${item.label}`}
                          checked={rule.enabled}
                          onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                        />
                        <span className="font-medium">{item.label}</span>
                        <Badge variant="outline">
                          {item.sheet === "MATERIALS" ? "Material" : "Labour"}
                        </Badge>
                      </div>
                      <p className="ml-6 text-xs text-muted-foreground">
                        {item.code} · {item.unit}
                      </p>
                    </div>
                    <span className="truncate text-sm" title={ruleSource(rule)}>
                      {ruleSource(rule)}
                    </span>
                    <Input
                      aria-label={`${item.label} rate`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) =>
                        updateItem(item.id, { rate: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                    <Input
                      aria-label={`${item.label} multiplier`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={rule.formula.multiplier}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          formula: {
                            ...rule.formula,
                            multiplier: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                    />
                    <Select
                      value={rule.formula.rounding}
                      onValueChange={(value) =>
                        updateRule(rule.id, {
                          formula: { ...rule.formula, rounding: value as AssemblyRoundingMode },
                        })
                      }
                    >
                      <SelectTrigger aria-label={`${item.label} rounding`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Exact</SelectItem>
                        <SelectItem value="UP">Round up</SelectItem>
                        <SelectItem value="DOWN">Round down</SelectItem>
                        <SelectItem value="NEAREST">Nearest</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${item.label}`}
                      onClick={() =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                catalogueItems: current.catalogueItems.filter(
                                  (entry) => entry.id !== item.id,
                                ),
                                assemblies: current.assemblies.filter(
                                  (entry) => entry.id !== rule.id,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <details className="ml-6 rounded-md bg-muted/40 px-3 py-2 xl:col-span-6">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Advanced rule controls: increment {rule.formula.increment}, minimum{" "}
                        {rule.formula.minimum}
                        {rule.formula.condition
                          ? `, condition ${rule.formula.condition.operator} ${rule.formula.condition.value}`
                          : ", always applied"}
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <NumberField
                          label="Rounding increment"
                          value={rule.formula.increment}
                          setValue={(value) =>
                            updateRule(rule.id, {
                              formula: { ...rule.formula, increment: Math.max(0.01, value) },
                            })
                          }
                        />
                        <NumberField
                          label="Minimum output quantity"
                          value={rule.formula.minimum}
                          setValue={(value) =>
                            updateRule(rule.id, {
                              formula: { ...rule.formula, minimum: value },
                            })
                          }
                        />
                        <Field label="Apply only when">
                          <Select
                            value={rule.formula.condition?.operator ?? "NONE"}
                            onValueChange={(value) =>
                              updateRule(rule.id, {
                                formula: {
                                  ...rule.formula,
                                  condition:
                                    value === "NONE"
                                      ? undefined
                                      : {
                                          operator: value as AssemblyConditionOperator,
                                          value: rule.formula.condition?.value ?? 0,
                                        },
                                },
                              })
                            }
                          >
                            <SelectTrigger aria-label={`${item.label} condition operator`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">Always</SelectItem>
                              <SelectItem value="GT">Greater than</SelectItem>
                              <SelectItem value="GTE">At least</SelectItem>
                              <SelectItem value="LT">Less than</SelectItem>
                              <SelectItem value="LTE">At most</SelectItem>
                              <SelectItem value="EQ">Equals</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Condition value">
                          <Input
                            aria-label={`${item.label} condition value`}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!rule.formula.condition}
                            value={rule.formula.condition?.value ?? 0}
                            onChange={(event) =>
                              rule.formula.condition &&
                              updateRule(rule.id, {
                                formula: {
                                  ...rule.formula,
                                  condition: {
                                    ...rule.formula.condition,
                                    value: Math.max(0, Number(event.target.value) || 0),
                                  },
                                },
                              })
                            }
                          />
                        </Field>
                      </div>
                    </details>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <CardTitle className="text-lg">Version history</CardTitle>
          </div>
          <CardDescription>
            Published versions are immutable. Estimates retain their own resolved snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {workspace.history.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    version.status === "PUBLISHED"
                      ? "success"
                      : version.status === "DRAFT"
                        ? "warning"
                        : "muted"
                  }
                >
                  {version.status.toLowerCase()}
                </Badge>
                <div>
                  <p className="font-medium">Version {version.versionNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {version.changeNote ?? "No change note"}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(version.updatedAtIso).toLocaleString("en-GB")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <AddDialog
        open={dialog === "ADD"}
        close={() => setDialog(null)}
        sources={sources}
        add={(item, rule) => {
          setDraft((current) =>
            current
              ? {
                  ...current,
                  catalogueItems: [...current.catalogueItems, item],
                  assemblies: [...current.assemblies, rule],
                }
              : current,
          );
          setDialog(null);
        }}
      />
      <PreviewDialog
        open={dialog === "PREVIEW"}
        close={() => setDialog(null)}
        sources={sources}
        facts={facts}
        setFacts={setFacts}
        preview={preview}
        working={working}
        run={() => void runPreview()}
      />
      <PublishDialog
        open={dialog === "PUBLISH"}
        close={() => setDialog(null)}
        version={workspace.draft.versionNumber}
        working={working}
        publish={(note) => {
          setWorking(true);
          void publishCompanyConfiguration(note, previewFacts)
            .then(({ workspace: next }) => {
              useWorkspace(next);
              setDialog(null);
              toast.success(`Configuration version ${next.published?.versionNumber ?? ""} is live`);
            })
            .catch((error: unknown) => toast.error(errorText(error)))
            .finally(() => setWorking(false));
        }}
      />
      <TemplateDialog
        open={dialog === "TEMPLATE"}
        close={() => setDialog(null)}
        workspace={workspace}
        working={working}
        cloneTemplate={(id) => {
          setWorking(true);
          void cloneCompanyConfigurationTemplate(id)
            .then(({ workspace: next }) => {
              useWorkspace(next);
              setDialog(null);
              toast.success("Template cloned into the draft");
            })
            .catch((error: unknown) => toast.error(errorText(error)))
            .finally(() => setWorking(false));
        }}
      />
    </div>
  );
}

function Metric({ title, value, copy }: { title: string; value: string | number; copy: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{copy}</p>
      </CardContent>
    </Card>
  );
}
function NumberField({
  label,
  value,
  setValue,
}: {
  label: string;
  value: number;
  setValue: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        aria-label={label}
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
      />
    </Field>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AddDialog({
  open,
  close,
  sources,
  add,
}: {
  open: boolean;
  close: () => void;
  sources: string[];
  add: (item: CompanyCatalogueItem, rule: CompanyAssemblyRule) => void;
}) {
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("item");
  const [rate, setRate] = useState("0");
  const [sheet, setSheet] = useState<PricingWorkbookSheet>("MATERIALS");
  const [source, setSource] = useState("MANUAL");
  const [multiplier, setMultiplier] = useState("1");
  const [rounding, setRounding] = useState<AssemblyRoundingMode>("NONE");
  const [increment, setIncrement] = useState("1");
  const [minimum, setMinimum] = useState("0");
  const [conditionOperator, setConditionOperator] = useState<AssemblyConditionOperator | "NONE">(
    "NONE",
  );
  const [conditionValue, setConditionValue] = useState("0");
  const submit = () => {
    const id = crypto.randomUUID();
    const itemId = `catalogue-${id}`;
    const generatedCode = (code.trim() || label.trim())
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const safeCode = generatedCode || `CUSTOM_${id.slice(0, 8).toUpperCase()}`;
    add(
      {
        id: itemId,
        code: safeCode,
        label: label.trim(),
        sheet,
        category: "ANCILLARY",
        unit: unit.trim(),
        rate: Math.max(0, Number(rate) || 0),
        active: true,
      },
      {
        id: `assembly-${id}`,
        name: label.trim(),
        catalogueItemId: itemId,
        quantitySource:
          source === "MANUAL"
            ? { kind: "MANUAL_ENTRY", defaultQuantity: 0 }
            : { kind: "DRAWING_QUANTITY", quantityKey: source },
        formula: {
          multiplier: Math.max(0, Number(multiplier) || 0),
          rounding,
          increment: Math.max(0.01, Number(increment) || 1),
          minimum: Math.max(0, Number(minimum) || 0),
          condition:
            conditionOperator === "NONE"
              ? undefined
              : {
                  operator: conditionOperator,
                  value: Math.max(0, Number(conditionValue) || 0),
                },
        },
        presentation: {
          pairKey: `custom:${id}`,
          groupKey: "custom-rules",
          groupTitle: "Custom estimate rules",
          sortOrder: 9_000,
        },
        enabled: true,
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add catalogue item and assembly</DialogTitle>
          <DialogDescription>
            Link a priced item to a safe quantity source. Formula code cannot be entered.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Item name">
            <Input
              aria-label="Item name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Item code">
            <Input
              aria-label="Item code"
              placeholder="Generated from name"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="Cost type">
            <Select value={sheet} onValueChange={(v) => setSheet(v as PricingWorkbookSheet)}>
              <SelectTrigger aria-label="Cost type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MATERIALS">Material</SelectItem>
                <SelectItem value="LABOUR">Labour</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unit">
            <Input aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="Rate">
            <Input
              aria-label="Rate"
              type="number"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field label="Quantity source">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger aria-label="Quantity source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Entered on estimate</SelectItem>
                {sources.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Multiplier">
            <Input
              aria-label="Multiplier"
              type="number"
              min="0"
              step="0.01"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
            />
          </Field>
          <Field label="Rounding">
            <Select value={rounding} onValueChange={(v) => setRounding(v as AssemblyRoundingMode)}>
              <SelectTrigger aria-label="Rounding">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Exact</SelectItem>
                <SelectItem value="UP">Round up</SelectItem>
                <SelectItem value="DOWN">Round down</SelectItem>
                <SelectItem value="NEAREST">Nearest</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rounding increment">
            <Input
              aria-label="Rounding increment"
              type="number"
              min="0.01"
              step="0.01"
              value={increment}
              onChange={(e) => setIncrement(e.target.value)}
            />
          </Field>
          <Field label="Minimum output quantity">
            <Input
              aria-label="Minimum output quantity"
              type="number"
              min="0"
              step="0.01"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
          </Field>
          <Field label="Apply only when">
            <Select
              value={conditionOperator}
              onValueChange={(value) =>
                setConditionOperator(value as AssemblyConditionOperator | "NONE")
              }
            >
              <SelectTrigger aria-label="Condition operator">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Always</SelectItem>
                <SelectItem value="GT">Source is greater than</SelectItem>
                <SelectItem value="GTE">Source is at least</SelectItem>
                <SelectItem value="LT">Source is less than</SelectItem>
                <SelectItem value="LTE">Source is at most</SelectItem>
                <SelectItem value="EQ">Source equals</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Condition value">
            <Input
              aria-label="Condition value"
              type="number"
              min="0"
              step="0.01"
              disabled={conditionOperator === "NONE"}
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!label.trim() || !unit.trim()} onClick={submit}>
            Add to draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({
  open,
  close,
  sources,
  facts,
  setFacts,
  preview,
  working,
  run,
}: {
  open: boolean;
  close: () => void;
  sources: string[];
  facts: Record<string, string>;
  setFacts: (value: Record<string, string>) => void;
  preview: CompanyConfigurationPreviewResult | null;
  working: boolean;
  run: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test assembly rules</DialogTitle>
          <DialogDescription>
            Enter example drawing quantities. The result explains every applied multiplier and
            rounding decision.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Example facts</p>
            {sources.slice(0, 12).map((source) => (
              <div key={source} className="grid grid-cols-[1fr_90px] items-center gap-2">
                <Label className="truncate text-xs" title={source}>
                  {source}
                </Label>
                <Input
                  aria-label={`Example ${source}`}
                  type="number"
                  min="0"
                  value={facts[source] ?? "0"}
                  onChange={(e) => setFacts({ ...facts, [source]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {preview ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Total label="Materials" value={preview.materialsTotal} />
                  <Total label="Labour" value={preview.labourTotal} />
                  <Total label="Total" value={preview.grandTotal} />
                </div>
                {preview.errors.map((text) => (
                  <p key={text} className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                    {text}
                  </p>
                ))}
                {preview.warnings.map((text) => (
                  <p key={text} className="rounded bg-amber-50 p-2 text-xs text-amber-800">
                    {text}
                  </p>
                ))}
                {preview.lines
                  .filter((line) => line.applied)
                  .slice(0, 16)
                  .map((line) => (
                    <div
                      key={line.assemblyId}
                      className="flex justify-between gap-3 rounded border p-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{line.label}</p>
                        <p className="text-xs text-muted-foreground">{line.explanation}</p>
                      </div>
                      <span className="text-sm font-medium">{money(line.total)}</span>
                    </div>
                  ))}
              </>
            ) : (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Run this example to inspect resolved quantities and warnings.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          <Button disabled={working} onClick={run}>
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Beaker className="h-4 w-4" />
            )}
            Run preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-muted p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{money(value)}</p>
    </div>
  );
}
function PublishDialog({
  open,
  close,
  version,
  working,
  publish,
}: {
  open: boolean;
  close: () => void;
  version: number;
  working: boolean;
  publish: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish version {version}</DialogTitle>
          <DialogDescription>
            This tested version becomes live for future calculations. Existing estimates are
            unchanged.
          </DialogDescription>
        </DialogHeader>
        <Field label="Required change note">
          <Textarea
            aria-label="Publish change note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!note.trim() || working} onClick={() => publish(note.trim())}>
            <Rocket className="h-4 w-4" />
            Publish version {version}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function TemplateDialog({
  open,
  close,
  workspace,
  working,
  cloneTemplate,
}: {
  open: boolean;
  close: () => void;
  workspace: CompanyConfigurationWorkspace;
  working: boolean;
  cloneTemplate: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Starting templates</DialogTitle>
          <DialogDescription>
            Cloning replaces the draft only. The current live version remains untouched.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {workspace.templates.map((template) => (
            <button
              type="button"
              key={template.id}
              disabled={working}
              className="w-full rounded-lg border p-4 text-left hover:bg-muted"
              onClick={() => cloneTemplate(template.id)}
            >
              <p className="font-medium">{template.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

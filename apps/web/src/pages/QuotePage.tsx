import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  GitBranch,
  Loader2,
  Pencil,
  XCircle,
} from "lucide-react";

import {
  ApiError,
  downloadQuoteVersionPdf,
  getCustomer,
  getEstimate,
  getEstimateVersion,
  getProject,
  getQuote,
  listQuoteVersions,
  setQuoteVersionStatus,
  startQuoteVersion,
  updateQuoteVersion,
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
import { ESTIMATE_STATUS_TONES, formatDateOnly, QUOTE_STATUS_TONES } from "@/lifecyclePresentation";
import type { AppRoute } from "@/useHashRoute";
import {
  ESTIMATE_VERSION_STATUS_LABELS,
  QUOTE_VERSION_STATUS_LABELS,
  type CustomerRecord,
  type EstimateRecord,
  type EstimateVersionRecord,
  type ProjectRecord,
  type QuoteRecord,
  type QuoteDisplayMode,
  type QuoteVersionRecord,
  type QuoteVersionStatus,
} from "@fence-estimator/contracts";

interface QuotePageProps {
  quoteId: string | null;
  versionId?: string | null;
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.payload.error : "Something went wrong";
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

export function QuotePage({ quoteId, versionId = null, onNavigate }: QuotePageProps) {
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [versions, setVersions] = useState<QuoteVersionRecord[]>([]);
  const [estimate, setEstimate] = useState<EstimateRecord | null>(null);
  const [estimateCurrentVersion, setEstimateCurrentVersion] =
    useState<EstimateVersionRecord | null>(null);
  const [linkedEstimateVersion, setLinkedEstimateVersion] = useState<EstimateVersionRecord | null>(
    null,
  );
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const refresh = async () => {
    if (!quoteId) return;
    const [{ quote: nextQuote }, { versions: nextVersions }] = await Promise.all([
      getQuote(quoteId),
      listQuoteVersions(quoteId),
    ]);
    const nextSelectedVersion = nextVersions.find(
      (candidate) => candidate.id === (versionId ?? nextQuote.currentVersionId),
    );
    if (!nextSelectedVersion) throw new Error("Quote version not found");
    const [
      { estimate: nextEstimate, currentVersion },
      { project: nextProject },
      { version: nextLinkedEstimateVersion },
    ] = await Promise.all([
      getEstimate(nextQuote.estimateId),
      getProject(nextQuote.projectId),
      getEstimateVersion(nextSelectedVersion.estimateVersionId),
    ]);
    const { customer: nextCustomer } = await getCustomer(nextProject.customerId);
    setQuote(nextQuote);
    setVersions(nextVersions);
    setEstimate(nextEstimate);
    setEstimateCurrentVersion(currentVersion);
    setLinkedEstimateVersion(nextLinkedEstimateVersion);
    setProject(nextProject);
    setCustomer(nextCustomer);
  };

  useEffect(() => {
    if (!quoteId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [{ quote: nextQuote }, { versions: nextVersions }] = await Promise.all([
          getQuote(quoteId),
          listQuoteVersions(quoteId),
        ]);
        const nextSelectedVersion = nextVersions.find(
          (candidate) => candidate.id === (versionId ?? nextQuote.currentVersionId),
        );
        if (!nextSelectedVersion) throw new Error("Quote version not found");
        const [
          { estimate: nextEstimate, currentVersion },
          { project: nextProject },
          { version: nextLinkedEstimateVersion },
        ] = await Promise.all([
          getEstimate(nextQuote.estimateId),
          getProject(nextQuote.projectId),
          getEstimateVersion(nextSelectedVersion.estimateVersionId),
        ]);
        const { customer: nextCustomer } = await getCustomer(nextProject.customerId);
        if (!cancelled) {
          setQuote(nextQuote);
          setVersions(nextVersions);
          setEstimate(nextEstimate);
          setEstimateCurrentVersion(currentVersion);
          setLinkedEstimateVersion(nextLinkedEstimateVersion);
          setProject(nextProject);
          setCustomer(nextCustomer);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(errorMessage(error));
          onNavigate("customers");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onNavigate, quoteId, versionId]);

  const selectedVersion = useMemo(
    () =>
      quote
        ? (versions.find((candidate) => candidate.id === (versionId ?? quote.currentVersionId)) ??
          null)
        : null,
    [quote, versionId, versions],
  );
  if (
    loading ||
    !quote ||
    !selectedVersion ||
    !estimate ||
    !estimateCurrentVersion ||
    !linkedEstimateVersion ||
    !project ||
    !customer
  )
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading quote...
      </div>
    );

  const isCurrent = selectedVersion.id === quote.currentVersionId;
  const transition = async (status: QuoteVersionStatus) => {
    const prompt =
      status === "ISSUED"
        ? `Issue ${quote.reference}? Its content will become immutable.`
        : status === "ACCEPTED"
          ? `Mark ${quote.reference} as accepted and the project as won?`
          : `Mark this quote as ${QUOTE_VERSION_STATUS_LABELS[status].toLowerCase()}?`;
    if (!window.confirm(prompt)) return;
    try {
      await setQuoteVersionStatus(selectedVersion.id, status);
      await refresh();
      toast.success(`Quote marked ${QUOTE_VERSION_STATUS_LABELS[status].toLowerCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const canStartVersion =
    isCurrent &&
    ["ISSUED", "REJECTED", "EXPIRED"].includes(selectedVersion.status) &&
    estimateCurrentVersion.status === "APPROVED";
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadQuoteVersionPdf(selectedVersion.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${quote.reference} version ${selectedVersion.versionNumber}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-7 px-2"
          onClick={() => onNavigate("project", { projectId: project.id })}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {project.name}
        </Button>
        <span>/</span>
        <span className="font-mono text-xs">{quote.reference}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{quote.name}</h1>
            <Badge variant={QUOTE_STATUS_TONES[selectedVersion.status]}>
              {QUOTE_VERSION_STATUS_LABELS[selectedVersion.status]}
            </Badge>
            {!isCurrent ? <Badge variant="outline">Historical</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{quote.reference}</span> · Version{" "}
            {selectedVersion.versionNumber} · {customer.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={downloading} onClick={() => void downloadPdf()}>
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </Button>
          {isCurrent ? (
            <>
              {selectedVersion.status === "DRAFT" ? (
                <>
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit quote details
                  </Button>
                  <Button onClick={() => void transition("ISSUED")}>
                    <FileCheck2 className="h-4 w-4" />
                    Issue quote
                  </Button>
                </>
              ) : null}
              {selectedVersion.status === "ISSUED" ? (
                <>
                  <Button variant="outline" onClick={() => void transition("EXPIRED")}>
                    <Clock3 className="h-4 w-4" />
                    Mark expired
                  </Button>
                  <Button variant="outline" onClick={() => void transition("REJECTED")}>
                    <XCircle className="h-4 w-4" />
                    Mark rejected
                  </Button>
                  <Button onClick={() => void transition("ACCEPTED")}>
                    <CheckCircle2 className="h-4 w-4" />
                    Mark accepted
                  </Button>
                </>
              ) : null}
              {canStartVersion ? (
                <Button variant="outline" onClick={() => setNewVersionOpen(true)}>
                  <GitBranch className="h-4 w-4" />
                  Start new version
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{selectedVersion.title}</CardTitle>
              <CardDescription>
                Customer-facing quote details for this immutable lifecycle version.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Info label="Customer" value={customer.name} />
              <Info label="Valid until" value={formatDateOnly(selectedVersion.validUntilIso)} />
              <Info
                label="Issued"
                value={
                  selectedVersion.issuedAtIso
                    ? new Date(selectedVersion.issuedAtIso).toLocaleDateString()
                    : null
                }
              />
              <Info
                label="Decision"
                value={
                  selectedVersion.decidedAtIso
                    ? new Date(selectedVersion.decidedAtIso).toLocaleDateString()
                    : null
                }
              />
              <div className="sm:col-span-2">
                <Info label="Customer message" value={selectedVersion.customerMessage} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Price</CardTitle>
                  <CardDescription>
                    {selectedVersion.presentation.displayMode === "DETAILED"
                      ? "Detailed customer breakdown"
                      : selectedVersion.presentation.displayMode === "SUMMARY"
                        ? "Customer section summary"
                        : "Customer total"}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total incl. VAT
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatMoney(selectedVersion.presentation.grossTotal)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedVersion.presentation.sections.map((section) => (
                <div key={section.key} className="rounded-lg border">
                  <div className="flex items-center justify-between px-4 py-3 font-medium">
                    <span>{section.title}</span>
                    <span>{formatMoney(section.amount)}</span>
                  </div>
                  {section.rows.length > 0 ? (
                    <div className="divide-y border-t">
                      {section.rows.map((row, index) => (
                        <div
                          key={`${row.description}:${index}`}
                          className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-sm"
                        >
                          <div>
                            {row.description}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {row.quantity} {row.unit}
                            </span>
                          </div>
                          <span>{formatMoney(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <div className="ml-auto max-w-sm space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net total</span>
                  <span>{formatMoney(selectedVersion.presentation.netTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    VAT {selectedVersion.presentation.vatRate}%
                  </span>
                  <span>{formatMoney(selectedVersion.presentation.vatAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(selectedVersion.presentation.grossTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Commercial source</CardTitle>
              <CardDescription>
                The quote is pinned to one approved estimate version.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={() =>
                  onNavigate("estimate", {
                    estimateId: estimate.id,
                    versionId: selectedVersion.estimateVersionId,
                  })
                }
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:border-primary/40 hover:bg-accent/30"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{estimate.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {estimate.reference}
                    </span>
                    <Badge variant={ESTIMATE_STATUS_TONES[linkedEstimateVersion.status]}>
                      {ESTIMATE_VERSION_STATUS_LABELS[linkedEstimateVersion.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimate version linked by immutable ID
                  </p>
                </div>
                <FileCheck2 className="h-4 w-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Quote history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => onNavigate("quote", { quoteId: quote.id, versionId: version.id })}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${version.id === selectedVersion.id ? "bg-primary/10 text-primary" : "hover:bg-accent"}`}
              >
                <span>Version {version.versionNumber}</span>
                <Badge variant={QUOTE_STATUS_TONES[version.status]}>
                  {QUOTE_VERSION_STATUS_LABELS[version.status]}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <QuoteDetailsDialog
        version={selectedVersion}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refresh}
        mode="edit"
      />
      <QuoteDetailsDialog
        version={{ ...selectedVersion, estimateVersionId: estimateCurrentVersion.id }}
        open={newVersionOpen}
        onOpenChange={setNewVersionOpen}
        onSaved={refresh}
        mode="new"
        quoteId={quote.id}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm">{value || "Not entered"}</div>
    </div>
  );
}

function QuoteDetailsDialog({
  version,
  quoteId,
  open,
  onOpenChange,
  onSaved,
  mode,
}: {
  version: QuoteVersionRecord;
  quoteId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  mode: "edit" | "new";
}) {
  const [title, setTitle] = useState(version.title);
  const [message, setMessage] = useState(version.customerMessage ?? "");
  const [validUntil, setValidUntil] = useState(version.validUntilIso ?? "");
  const [displayMode, setDisplayMode] = useState<QuoteDisplayMode>(
    version.presentation.displayMode,
  );
  const [vatRate, setVatRate] = useState(String(version.presentation.vatRate));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle(version.title);
      setMessage(version.customerMessage ?? "");
      setValidUntil(version.validUntilIso ?? "");
      setDisplayMode(version.presentation.displayMode);
      setVatRate(String(version.presentation.vatRate));
    }
  }, [open, version]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit draft quote" : "Start quote version"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "These details lock when the quote is issued."
              : "The previous quote remains in history and this becomes the new draft."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const input = {
                estimateVersionId: version.estimateVersionId,
                title: title.trim(),
                customerMessage: message.trim() || null,
                validUntilIso: validUntil || null,
                displayMode,
                vatRate: Math.max(0, Number(vatRate) || 0),
              };
              if (mode === "edit") await updateQuoteVersion(version.id, input);
              else await startQuoteVersion(quoteId!, input);
              await onSaved();
              onOpenChange(false);
              toast.success(mode === "edit" ? "Quote updated" : "New quote version started");
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>Customer-facing title</Label>
            <Input
              aria-label="Customer-facing title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Valid until</Label>
            <Input
              aria-label="Valid until"
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Customer message</Label>
            <Textarea
              aria-label="Customer message"
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quote detail</Label>
              <Select
                value={displayMode}
                onValueChange={(value) => setDisplayMode(value as QuoteDisplayMode)}
              >
                <SelectTrigger aria-label="Quote detail">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUMMARY">Section totals</SelectItem>
                  <SelectItem value="DETAILED">Detailed line items</SelectItem>
                  <SelectItem value="TOTAL_ONLY">Single total only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>VAT rate %</Label>
              <Input
                aria-label="VAT rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "edit" ? "Save quote" : "Start version"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

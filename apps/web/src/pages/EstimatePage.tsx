import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileEdit,
  GitBranch,
  Loader2,
  Pencil,
  RotateCcw,
} from "lucide-react";

import {
  ApiError,
  createQuote,
  getCustomer,
  getEstimate,
  getProject,
  listDrawingsForProject,
  listEstimateVersions,
  setEstimateVersionStatus,
  startEstimateVersion,
  updateEstimateVersion,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { DESIGN_STATUS_TONES, ESTIMATE_STATUS_TONES } from "@/lifecyclePresentation";
import { EstimateCommercialPanel } from "@/pages/EstimateCommercialPanel";
import type { AppRoute } from "@/useHashRoute";
import {
  DESIGN_STATUS_LABELS,
  ESTIMATE_VERSION_STATUS_LABELS,
  type CustomerRecord,
  type DrawingSummary,
  type EstimateRecord,
  type EstimateVersionRecord,
  type ProjectRecord,
  type QuoteDisplayMode,
} from "@fence-estimator/contracts";

interface EstimatePageProps {
  estimateId: string | null;
  versionId?: string | null;
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.payload.error : "Something went wrong";
}

export function EstimatePage({ estimateId, versionId = null, onNavigate }: EstimatePageProps) {
  const [estimate, setEstimate] = useState<EstimateRecord | null>(null);
  const [versions, setVersions] = useState<EstimateVersionRecord[]>([]);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [designs, setDesigns] = useState<DrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  const refresh = async () => {
    if (!estimateId) return;
    const [{ estimate: nextEstimate }, { versions: nextVersions }] = await Promise.all([
      getEstimate(estimateId),
      listEstimateVersions(estimateId),
    ]);
    const { project: nextProject } = await getProject(nextEstimate.projectId);
    const [{ customer: nextCustomer }, { drawings }] = await Promise.all([
      getCustomer(nextProject.customerId),
      listDrawingsForProject(nextProject.id),
    ]);
    setEstimate(nextEstimate);
    setVersions(nextVersions);
    setProject(nextProject);
    setCustomer(nextCustomer);
    setDesigns(drawings.filter((drawing) => !drawing.isArchived));
  };

  useEffect(() => {
    if (!estimateId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [{ estimate: nextEstimate }, { versions: nextVersions }] = await Promise.all([
          getEstimate(estimateId),
          listEstimateVersions(estimateId),
        ]);
        const { project: nextProject } = await getProject(nextEstimate.projectId);
        const [{ customer: nextCustomer }, { drawings }] = await Promise.all([
          getCustomer(nextProject.customerId),
          listDrawingsForProject(nextProject.id),
        ]);
        if (!cancelled) {
          setEstimate(nextEstimate);
          setVersions(nextVersions);
          setProject(nextProject);
          setCustomer(nextCustomer);
          setDesigns(drawings.filter((drawing) => !drawing.isArchived));
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
  }, [estimateId, onNavigate]);

  const selectedVersion = useMemo(() => {
    if (!estimate) return null;
    return (
      versions.find((version) => version.id === (versionId ?? estimate.currentVersionId)) ?? null
    );
  }, [estimate, versionId, versions]);

  if (loading || !estimate || !selectedVersion || !project || !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading estimate...
      </div>
    );
  }

  const isCurrent = selectedVersion.id === estimate.currentVersionId;
  const changeStatus = async (status: "DRAFT" | "IN_REVIEW" | "APPROVED") => {
    try {
      await setEstimateVersionStatus(selectedVersion.id, status);
      await refresh();
      toast.success(`Estimate moved to ${ESTIMATE_VERSION_STATUS_LABELS[status].toLowerCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
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
        <span className="font-mono text-xs">{estimate.reference}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{estimate.name}</h1>
            <Badge variant={ESTIMATE_STATUS_TONES[selectedVersion.status]}>
              {ESTIMATE_VERSION_STATUS_LABELS[selectedVersion.status]}
            </Badge>
            {!isCurrent ? <Badge variant="outline">Historical</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{estimate.reference}</span> · Version{" "}
            {selectedVersion.versionNumber} · {customer.name}
          </p>
        </div>
        {isCurrent ? (
          <div className="flex flex-wrap gap-2">
            {selectedVersion.status === "DRAFT" ? (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  Edit scope
                </Button>
                <Button onClick={() => void changeStatus("IN_REVIEW")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Submit for review
                </Button>
              </>
            ) : null}
            {selectedVersion.status === "IN_REVIEW" ? (
              <>
                <Button variant="outline" onClick={() => void changeStatus("DRAFT")}>
                  <RotateCcw className="h-4 w-4" />
                  Return to draft
                </Button>
                <Button onClick={() => void changeStatus("APPROVED")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Approve estimate
                </Button>
              </>
            ) : null}
            {selectedVersion.status === "APPROVED" ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await startEstimateVersion(estimate.id, {
                        notes: `Revision after version ${selectedVersion.versionNumber}`,
                      });
                      await refresh();
                      toast.success("New estimate version started");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  <GitBranch className="h-4 w-4" />
                  Start new version
                </Button>
                <Button onClick={() => setQuoteOpen(true)}>
                  <FileCheck2 className="h-4 w-4" />
                  Create quote
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <EstimateCommercialPanel
        version={selectedVersion}
        editable={isCurrent && selectedVersion.status === "DRAFT"}
        onRefresh={refresh}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Included design revisions</CardTitle>
            <CardDescription>
              This version is pinned to these exact layouts. Later drawing changes cannot silently
              alter it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedVersion.designRevisionSelections.map((selection) => {
              const design = designs.find((candidate) => candidate.id === selection.drawingId);
              return (
                <button
                  key={selection.drawingRevisionId}
                  type="button"
                  onClick={() => onNavigate("drawing", { drawingId: selection.drawingId })}
                  className="flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left hover:border-primary/40 hover:bg-accent/30"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{selection.drawingName}</span>
                      {design ? (
                        <Badge variant={DESIGN_STATUS_TONES[design.status]}>
                          {DESIGN_STATUS_LABELS[design.status]}
                        </Badge>
                      ) : (
                        <Badge variant="muted">Historical design</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Design revision {selection.revisionNumber}
                      {design?.currentRevisionId === selection.drawingRevisionId
                        ? " · current"
                        : " · historical"}
                    </p>
                  </div>
                  <FileEdit className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version notes</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
              {selectedVersion.notes || "No notes for this version."}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() =>
                    onNavigate("estimate", { estimateId: estimate.id, versionId: version.id })
                  }
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${version.id === selectedVersion.id ? "bg-primary/10 text-primary" : "hover:bg-accent"}`}
                >
                  <span>Version {version.versionNumber}</span>
                  <Badge variant={ESTIMATE_STATUS_TONES[version.status]}>
                    {ESTIMATE_VERSION_STATUS_LABELS[version.status]}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <EditEstimateDialog
        version={selectedVersion}
        designs={designs}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refresh}
      />
      <CreateQuoteDialog
        estimate={estimate}
        version={selectedVersion}
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        onCreated={(quoteId) => onNavigate("quote", { quoteId })}
      />
    </div>
  );
}

function EditEstimateDialog({
  version,
  designs,
  open,
  onOpenChange,
  onSaved,
}: {
  version: EstimateVersionRecord;
  designs: DrawingSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setSelected(version.designRevisionSelections.map((selection) => selection.drawingRevisionId));
      setNotes(version.notes ?? "");
    }
  }, [open, version]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit estimate scope</DialogTitle>
          <DialogDescription>
            Choose the latest revision of each design to include in this draft.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await updateEstimateVersion(version.id, {
                designRevisionIds: selected,
                notes: notes.trim() || null,
              });
              await onSaved();
              onOpenChange(false);
              toast.success("Estimate scope updated");
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-2">
            {designs.map((design) => (
              <label
                key={design.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={selected.includes(design.currentRevisionId)}
                  onChange={(event) =>
                    setSelected((current) => {
                      const withoutDesign = current.filter(
                        (revisionId) =>
                          !version.designRevisionSelections.some(
                            (selection) =>
                              selection.drawingId === design.id &&
                              selection.drawingRevisionId === revisionId,
                          ),
                      );
                      return event.target.checked
                        ? [...withoutDesign, design.currentRevisionId]
                        : withoutDesign.filter((id) => id !== design.currentRevisionId);
                    })
                  }
                />
                <span>
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {design.name}
                    <Badge variant={DESIGN_STATUS_TONES[design.status]}>
                      {DESIGN_STATUS_LABELS[design.status]}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Latest revision {design.latestRevisionNumber}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Version notes</Label>
            <Textarea
              aria-label="Version notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || selected.length === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save scope
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateQuoteDialog({
  estimate,
  version,
  open,
  onOpenChange,
  onCreated,
}: {
  estimate: EstimateRecord;
  version: EstimateVersionRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (quoteId: string) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [displayMode, setDisplayMode] = useState<QuoteDisplayMode>("SUMMARY");
  const [vatRate, setVatRate] = useState("20");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(estimate.name.replace(/estimate/i, "quote"));
      setTitle(estimate.name);
      setMessage("");
      setDisplayMode(version.calculation?.workbook.settings.quoteDisplayMode ?? "SUMMARY");
      setVatRate(String(version.calculation?.workbook.settings.vatRate ?? 20));
      const date = new Date();
      date.setDate(date.getDate() + 30);
      setValidUntil(date.toISOString().slice(0, 10));
    }
  }, [estimate.name, open, version.calculation]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create quote</DialogTitle>
          <DialogDescription>
            The draft quote will be tied to approved estimate {estimate.reference} version{" "}
            {version.versionNumber}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const { quote } = await createQuote({
                estimateVersionId: version.id,
                name: name.trim(),
                title: title.trim(),
                customerMessage: message.trim() || null,
                validUntilIso: validUntil || null,
                displayMode,
                vatRate: Math.max(0, Number(vatRate) || 0),
              });
              toast.success(`${quote.reference} created`);
              onCreated(quote.id);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>Internal quote name</Label>
            <Input
              aria-label="Internal quote name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
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
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quote detail</Label>
              <Select value={displayMode} onValueChange={(value) => setDisplayMode(value as QuoteDisplayMode)}>
                <SelectTrigger aria-label="Quote detail"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="SUMMARY">Section totals</SelectItem><SelectItem value="DETAILED">Detailed line items</SelectItem><SelectItem value="TOTAL_ONLY">Single total only</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>VAT rate %</Label>
              <Input aria-label="VAT rate" type="number" min="0" max="100" step="0.01" value={vatRate} onChange={(event) => setVatRate(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create draft quote
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

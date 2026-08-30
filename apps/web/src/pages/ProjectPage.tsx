import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Calculator,
  CalendarDays,
  FileCheck2,
  FileEdit,
  Layers3,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  ApiError,
  createDrawing,
  createEstimate,
  deleteProject,
  getCustomer,
  getProject,
  getSite,
  listDrawingsForProject,
  listEstimatesForProject,
  listQuotesForProject,
  listSites,
  setDrawingArchived,
  setDrawingStatus,
  setProjectArchived,
  setProjectStatus,
  updateProject,
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
import { EmptyState } from "@/components/ui/empty-state";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DESIGN_STATUS_TONES,
  ESTIMATE_STATUS_TONES,
  formatDateOnly,
  formatSiteAddress,
  PROJECT_STATUS_TONES,
  QUOTE_STATUS_TONES,
} from "@/lifecyclePresentation";
import type { AppRoute } from "@/useHashRoute";
import { useSession } from "@/useSession";
import {
  DESIGN_STATUS_LABELS,
  ESTIMATE_VERSION_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  QUOTE_VERSION_STATUS_LABELS,
  type CustomerRecord,
  type DrawingSummary,
  type EstimateSummary,
  type ProjectRecord,
  type ProjectStatus,
  type QuoteSummary,
  type SiteRecord,
  type SiteSummary,
} from "@fence-estimator/contracts";

interface ProjectPageProps {
  projectId: string | null;
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

const MANUAL_PROJECT_STATUSES: ProjectStatus[] = [
  "ENQUIRY",
  "SURVEY",
  "ESTIMATING",
  "QUOTED",
  "ON_HOLD",
  "WON",
  "LOST",
];

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.payload.error : "Something went wrong";
}

export function ProjectPage({ projectId, onNavigate }: ProjectPageProps) {
  const { session } = useSession();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [site, setSite] = useState<SiteRecord | null>(null);
  const [customerSites, setCustomerSites] = useState<SiteSummary[]>([]);
  const [designs, setDesigns] = useState<DrawingSummary[]>([]);
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);

  const refresh = async () => {
    if (!projectId) return;
    const { project: nextProject } = await getProject(projectId);
    const [customerResult, siteResult, sitesResult, designResult, estimateResult, quoteResult] =
      await Promise.all([
        getCustomer(nextProject.customerId),
        nextProject.siteId ? getSite(nextProject.siteId) : Promise.resolve({ site: null }),
        listSites({ customerId: nextProject.customerId, scope: "ACTIVE" }),
        listDrawingsForProject(nextProject.id),
        listEstimatesForProject(nextProject.id),
        listQuotesForProject(nextProject.id),
      ]);
    setProject(nextProject);
    setCustomer(customerResult.customer);
    setSite(siteResult.site);
    setCustomerSites(sitesResult.sites);
    setDesigns(designResult.drawings);
    setEstimates(estimateResult.estimates);
    setQuotes(quoteResult.quotes);
  };

  useEffect(() => {
    if (!projectId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { project: nextProject } = await getProject(projectId);
        const [customerResult, siteResult, sitesResult, designResult, estimateResult, quoteResult] =
          await Promise.all([
            getCustomer(nextProject.customerId),
            nextProject.siteId ? getSite(nextProject.siteId) : Promise.resolve({ site: null }),
            listSites({ customerId: nextProject.customerId, scope: "ACTIVE" }),
            listDrawingsForProject(nextProject.id),
            listEstimatesForProject(nextProject.id),
            listQuotesForProject(nextProject.id),
          ]);
        if (!cancelled) {
          setProject(nextProject);
          setCustomer(customerResult.customer);
          setSite(siteResult.site);
          setCustomerSites(sitesResult.sites);
          setDesigns(designResult.drawings);
          setEstimates(estimateResult.estimates);
          setQuotes(quoteResult.quotes);
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
  }, [onNavigate, projectId]);

  if (loading || !project || !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading project...
      </div>
    );
  }

  const activeDesigns = designs.filter((design) => !design.isArchived);
  const readyDesigns = activeDesigns.filter((design) => design.status === "READY");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate("customer", { customerId: customer.id })}
          className="-ml-2 h-7 px-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {customer.name}
        </Button>
        <span>/</span>
        <span className="font-mono text-xs">{project.reference}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
            <Badge variant={PROJECT_STATUS_TONES[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            {project.isArchived ? <Badge variant="muted">Archived</Badge> : null}
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{project.reference}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={project.status}
            disabled={project.status === "QUOTED" || project.status === "WON"}
            onValueChange={async (value) => {
              try {
                await setProjectStatus(project.id, value as ProjectStatus);
                await refresh();
                toast.success("Project stage updated");
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            <SelectTrigger aria-label="Project stage" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_PROJECT_STATUSES.map((status) => (
                <SelectItem
                  key={status}
                  value={status}
                  disabled={status === "QUOTED" || status === "WON"}
                >
                  {PROJECT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await setProjectArchived(project.id, !project.isArchived);
                await refresh();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {project.isArchived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {project.isArchived ? "Restore" : "Archive"}
          </Button>
          {session?.user.role === "ADMIN" && project.isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (
                  !window.confirm(`Permanently delete ${project.name} and every design revision?`)
                )
                  return;
                try {
                  await deleteProject(project.id);
                  onNavigate("customer", { customerId: customer.id });
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          icon={<MapPin className="h-4 w-4" />}
          label="Site"
          value={site?.name ?? "Not assigned"}
          detail={
            site
              ? formatSiteAddress(site) || "Address not entered"
              : "Assign a site before estimating"
          }
        />
        <SummaryCard
          icon={<Layers3 className="h-4 w-4" />}
          label="Designs"
          value={`${activeDesigns.length} active`}
          detail={`${readyDesigns.length} ready for estimating`}
        />
        <SummaryCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Target date"
          value={formatDateOnly(project.targetDateIso) ?? "Not set"}
          detail={
            project.statusChangedAtIso
              ? `Stage changed ${new Date(project.statusChangedAtIso).toLocaleDateString()}`
              : ""
          }
        />
      </div>

      {project.scope || project.notes ? (
        <Card>
          <CardContent className="grid gap-5 p-5 md:grid-cols-2">
            <InfoBlock label="Scope" value={project.scope} />
            <InfoBlock label="Internal notes" value={project.notes} />
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="designs">
        <TabsList className="grid h-auto w-full grid-cols-3 md:w-[520px]">
          <TabsTrigger value="designs">Designs ({activeDesigns.length})</TabsTrigger>
          <TabsTrigger value="estimates">Estimates ({estimates.length})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="designs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-lg">Designs</CardTitle>
                <CardDescription>
                  Independent layout areas with their own immutable revision histories.
                </CardDescription>
              </div>
              <Button onClick={() => setDesignOpen(true)}>
                <Plus className="h-4 w-4" />
                New design
              </Button>
            </CardHeader>
            <CardContent>
              {designs.length === 0 ? (
                <EmptyState
                  icon={<Layers3 className="h-5 w-5" />}
                  title="No designs yet"
                  description="Create the first layout area for this project."
                  action={
                    <Button onClick={() => setDesignOpen(true)}>
                      <FileEdit className="h-4 w-4" />
                      Start a design
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {designs.map((design) => (
                    <DesignCard
                      key={design.id}
                      design={design}
                      onOpen={() => onNavigate("drawing", { drawingId: design.id })}
                      onChanged={refresh}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="estimates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-lg">Estimates</CardTitle>
                <CardDescription>
                  Each version pins the exact design revisions included in the commercial scope.
                </CardDescription>
              </div>
              <Button disabled={activeDesigns.length === 0} onClick={() => setEstimateOpen(true)}>
                <Plus className="h-4 w-4" />
                New estimate
              </Button>
            </CardHeader>
            <CardContent>
              {estimates.length === 0 ? (
                <EmptyState
                  icon={<Calculator className="h-5 w-5" />}
                  title="No estimates yet"
                  description={
                    activeDesigns.length === 0
                      ? "Create a design first."
                      : "Build the first estimate scope from one or more design revisions."
                  }
                />
              ) : (
                <div className="space-y-2">
                  {estimates.map((estimate) => (
                    <button
                      type="button"
                      key={estimate.id}
                      onClick={() => onNavigate("estimate", { estimateId: estimate.id })}
                      className="flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-accent/30"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{estimate.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {estimate.reference}
                          </span>
                          <Badge variant={ESTIMATE_STATUS_TONES[estimate.currentStatus]}>
                            {ESTIMATE_VERSION_STATUS_LABELS[estimate.currentStatus]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Version {estimate.latestVersionNumber} · {estimate.selectedDesignCount}{" "}
                          selected design{estimate.selectedDesignCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="quotes">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quotes</CardTitle>
              <CardDescription>
                Quotes are created from an approved estimate and become immutable when issued.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <EmptyState
                  icon={<FileCheck2 className="h-5 w-5" />}
                  title="No quotes yet"
                  description="Approve an estimate, then create its customer quote."
                />
              ) : (
                <div className="space-y-2">
                  {quotes.map((quote) => (
                    <button
                      type="button"
                      key={quote.id}
                      onClick={() => onNavigate("quote", { quoteId: quote.id })}
                      className="flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-accent/30"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{quote.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {quote.reference}
                          </span>
                          <Badge variant={QUOTE_STATUS_TONES[quote.currentStatus]}>
                            {QUOTE_VERSION_STATUS_LABELS[quote.currentStatus]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Version {quote.latestVersionNumber} · from {quote.estimateReference} v
                          {quote.estimateVersionNumber}
                          {quote.validUntilIso
                            ? ` · valid to ${formatDateOnly(quote.validUntilIso)}`
                            : ""}
                        </p>
                      </div>
                      <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EditProjectDialog
        project={project}
        sites={customerSites}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refresh}
      />
      <CreateDesignDialog
        projectId={project.id}
        open={designOpen}
        onOpenChange={setDesignOpen}
        onCreated={(drawingId) => onNavigate("editor", { drawingId })}
      />
      <CreateEstimateDialog
        projectId={project.id}
        designs={activeDesigns}
        open={estimateOpen}
        onOpenChange={setEstimateOpen}
        onCreated={(estimateId) => onNavigate("estimate", { estimateId })}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 font-medium">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}
function InfoBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value || "Not entered"}</p>
    </div>
  );
}

function DesignCard({
  design,
  onOpen,
  onChanged,
}: {
  design: DrawingSummary;
  onOpen: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <Card className="transition hover:border-primary/40">
      <CardContent className="space-y-3 p-4">
        <button type="button" onClick={onOpen} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{design.name}</span>
            <Badge variant={DESIGN_STATUS_TONES[design.status]}>
              {DESIGN_STATUS_LABELS[design.status]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Revision {design.latestRevisionNumber} · {design.segmentCount} fence line
            {design.segmentCount === 1 ? "" : "s"} · {design.gateCount} gate
            {design.gateCount === 1 ? "" : "s"}
          </p>
        </button>
        <div className="flex items-center justify-between border-t pt-2">
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Open design
          </Button>
          <div className="flex gap-1">
            {!design.isArchived && design.status !== "SUPERSEDED" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await setDrawingStatus(
                      design.id,
                      design.status === "READY" ? "WORKING" : "READY",
                    );
                    await onChanged();
                  } catch (error) {
                    toast.error(errorMessage(error));
                  }
                }}
              >
                {design.status === "READY" ? "Return to working" : "Mark ready"}
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={async () => {
                try {
                  await setDrawingArchived(design.id, !design.isArchived);
                  await onChanged();
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              {design.isArchived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditProjectDialog({
  project,
  sites,
  open,
  onOpenChange,
  onSaved,
}: {
  project: ProjectRecord;
  sites: SiteSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [siteId, setSiteId] = useState(project.siteId ?? "");
  const [scope, setScope] = useState(project.scope ?? "");
  const [targetDate, setTargetDate] = useState(project.targetDateIso ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(project.name);
      setSiteId(project.siteId ?? "");
      setScope(project.scope ?? "");
      setTargetDate(project.targetDateIso ?? "");
      setNotes(project.notes ?? "");
    }
  }, [open, project]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the project-level scope and location. Designs and commercial versions remain
            intact.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await updateProject(project.id, {
                name: name.trim(),
                siteId,
                scope: scope.trim() || null,
                targetDateIso: targetDate || null,
                notes: notes.trim() || null,
              });
              await onSaved();
              onOpenChange(false);
              toast.success("Project updated");
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Project name">
            <Input
              aria-label="Project name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Site">
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger aria-label="Site">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Scope">
            <Textarea
              aria-label="Scope"
              rows={3}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            />
          </Field>
          <Field label="Target date">
            <Input
              aria-label="Target date"
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </Field>
          <Field label="Internal notes">
            <Textarea
              aria-label="Internal notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !siteId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateDesignDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (drawingId: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New design</DialogTitle>
          <DialogDescription>
            Create an independent layout area with its own revision history.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const { drawing } = await createDrawing({ projectId, name: name.trim() });
              toast.success("Design created");
              onCreated(drawing.id);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Design name">
            <Input
              aria-label="Design name"
              required
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Tennis courts perimeter"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create and open editor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateEstimateDialog({
  projectId,
  designs,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  designs: DrawingSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (estimateId: string) => void;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("Main estimate");
      setNotes("");
      setSelected(
        designs
          .filter((design) => design.status === "READY")
          .map((design) => design.currentRevisionId),
      );
    }
  }, [designs, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New estimate</DialogTitle>
          <DialogDescription>
            Select the exact current design revisions this commercial scope will include. Working
            designs can be drafted into an estimate but must be marked ready before review.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const { estimate } = await createEstimate({
                projectId,
                name: name.trim(),
                designRevisionIds: selected,
                notes: notes.trim() || null,
              });
              toast.success(`${estimate.reference} created`);
              onCreated(estimate.id);
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Estimate name">
            <Input
              aria-label="Estimate name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="space-y-2">
            <Label>Included designs</Label>
            {designs.map((design) => (
              <label
                key={design.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                  checked={selected.includes(design.currentRevisionId)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, design.currentRevisionId]
                        : current.filter((id) => id !== design.currentRevisionId),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {design.name}
                    <Badge variant={DESIGN_STATUS_TONES[design.status]}>
                      {DESIGN_STATUS_LABELS[design.status]}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Revision {design.latestRevisionNumber} · {design.segmentCount} fence lines
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Field label="Version notes">
            <Textarea
              aria-label="Version notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Scope choices or assumptions for this version"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || selected.length === 0}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create estimate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

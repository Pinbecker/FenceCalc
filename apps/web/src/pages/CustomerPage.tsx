import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  BriefcaseBusiness,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  ApiError,
  createProject,
  createSite,
  deleteCustomer,
  getCustomer,
  listProjects,
  listSites,
  setCustomerArchived,
  setProjectArchived,
  setSiteArchived,
  updateCustomer,
  updateSite,
  type ScopeFilter,
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
import { Textarea } from "@/components/ui/textarea";
import { formatSiteAddress, PROJECT_STATUS_TONES } from "@/lifecyclePresentation";
import type { AppRoute } from "@/useHashRoute";
import { useSession } from "@/useSession";
import {
  PROJECT_STATUS_LABELS,
  type CustomerRecord,
  type ProjectSummary,
  type SiteRecord,
  type SiteSummary,
} from "@fence-estimator/contracts";

interface CustomerPageProps {
  customerId: string | null;
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.payload.error : "Something went wrong";
}

export function CustomerPage({ customerId, onNavigate }: CustomerPageProps) {
  const { session } = useSession();
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectScope, setProjectScope] = useState<ScopeFilter>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  const refresh = async () => {
    if (!customerId) return;
    const [{ customer: nextCustomer }, { sites: nextSites }, { projects: nextProjects }] =
      await Promise.all([
        getCustomer(customerId),
        listSites({ customerId, scope: "ALL" }),
        listProjects({ customerId, scope: projectScope }),
      ]);
    setCustomer(nextCustomer);
    setSites(nextSites);
    setProjects(nextProjects);
  };

  useEffect(() => {
    if (!customerId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [{ customer: nextCustomer }, { sites: nextSites }, { projects: nextProjects }] =
          await Promise.all([
            getCustomer(customerId),
            listSites({ customerId, scope: "ALL" }),
            listProjects({ customerId, scope: projectScope }),
          ]);
        if (!cancelled) {
          setCustomer(nextCustomer);
          setSites(nextSites);
          setProjects(nextProjects);
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
  }, [customerId, onNavigate, projectScope]);

  if (loading || !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading customer...
      </div>
    );
  }

  const activeSites = sites.filter((site) => !site.isArchived);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => onNavigate("customers")} className="-ml-2">
        <ArrowLeft className="h-4 w-4" />
        Back to customers
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{customer.name}</h1>
            {customer.isArchived ? <Badge variant="muted">Archived</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer account · {activeSites.length} active site{activeSites.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setCustomerDialogOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit customer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await setCustomerArchived(customer.id, !customer.isArchived);
                toast.success(customer.isArchived ? "Customer restored" : "Customer archived");
                await refresh();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {customer.isArchived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {customer.isArchived ? "Restore" : "Archive"}
          </Button>
          {session?.user.role === "ADMIN" && customer.isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!window.confirm(`Permanently delete ${customer.name} and all of its records?`))
                  return;
                try {
                  await deleteCustomer(customer.id);
                  onNavigate("customers");
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account contact</CardTitle>
          <CardDescription>Who enquiries, estimates and quotes are addressed to.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Contact" value={customer.contactName} />
          <Info label="Email" value={customer.contactEmail} />
          <Info label="Phone" value={customer.contactPhone} />
          <Info label="Notes" value={customer.notes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">Sites</CardTitle>
            <CardDescription>
              Locations are separate from the customer so repeat work stays organised.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              setEditingSite(null);
              setSiteDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add site
          </Button>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-5 w-5" />}
              title="No sites yet"
              description="Add the first location before creating a project."
              action={
                <Button onClick={() => setSiteDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add site
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sites.map((site) => (
                <div key={site.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{site.name}</span>
                        {site.isArchived ? <Badge variant="muted">Archived</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatSiteAddress(site) || "Address not yet entered"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {site.activeProjectCount} active project
                        {site.activeProjectCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingSite(site);
                          setSiteDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit site</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={async () => {
                          try {
                            await setSiteArchived(site.id, !site.isArchived);
                            await refresh();
                          } catch (error) {
                            toast.error(errorMessage(error));
                          }
                        }}
                      >
                        {site.isArchived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {site.isArchived ? "Restore" : "Archive"} site
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">Projects</CardTitle>
            <CardDescription>
              The commercial umbrella for designs, estimates and quotes at a site.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select
              value={projectScope}
              onValueChange={(value) => setProjectScope(value as ScopeFilter)}
            >
              <SelectTrigger aria-label="Project view" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={activeSites.length === 0 || customer.isArchived}
              onClick={() => setProjectDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState
              icon={<BriefcaseBusiness className="h-5 w-5" />}
              title="No projects in this view"
              description={
                activeSites.length === 0
                  ? "Add a site first, then create the project that will hold the work."
                  : "Create a project for the enquiry, survey and quotation lifecycle."
              }
            />
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-4 py-3 transition hover:border-primary/40 hover:bg-accent/30"
                  onClick={() => onNavigate("project", { projectId: project.id })}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{project.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {project.reference}
                      </span>
                      <Badge variant={PROJECT_STATUS_TONES[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                      {project.isArchived ? <Badge variant="muted">Archived</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project.siteName ?? "Site not assigned"} · {project.designCount} design
                      {project.designCount === 1 ? "" : "s"} · {project.estimateCount} estimate
                      {project.estimateCount === 1 ? "" : "s"} · {project.quoteCount} quote
                      {project.quoteCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={async (event) => {
                      event.stopPropagation();
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
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomerDialog
        customer={customer}
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onSaved={refresh}
      />
      <SiteDialog
        customerId={customer.id}
        site={editingSite}
        open={siteDialogOpen}
        onOpenChange={setSiteDialogOpen}
        onSaved={refresh}
      />
      <ProjectDialog
        customerId={customer.id}
        sites={activeSites}
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onCreated={(projectId) => onNavigate("project", { projectId })}
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

function CustomerDialog({
  customer,
  open,
  onOpenChange,
  onSaved,
}: {
  customer: CustomerRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(customer.name);
  const [contactName, setContactName] = useState(customer.contactName ?? "");
  const [email, setEmail] = useState(customer.contactEmail ?? "");
  const [phone, setPhone] = useState(customer.contactPhone ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(customer.name);
      setContactName(customer.contactName ?? "");
      setEmail(customer.contactEmail ?? "");
      setPhone(customer.contactPhone ?? "");
      setNotes(customer.notes ?? "");
    }
  }, [customer, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>
            Account and primary contact details. Site addresses are managed separately.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await updateCustomer(customer.id, {
                name: name.trim(),
                contactName: contactName.trim() || null,
                contactEmail: email.trim() || null,
                contactPhone: phone.trim() || null,
                notes: notes.trim() || null,
              });
              await onSaved();
              onOpenChange(false);
              toast.success("Customer updated");
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Customer or organisation name">
            <Input
              aria-label="Customer or organisation name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact name">
              <Input
                aria-label="Contact name"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input aria-label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
          </div>
          <Field label="Email">
            <Input
              aria-label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Account notes">
            <Textarea
              aria-label="Account notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SiteDialog({
  customerId,
  site,
  open,
  onOpenChange,
  onSaved,
}: {
  customerId: string;
  site: SiteRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(site?.name ?? "");
      setLine1(site?.addressLine1 ?? "");
      setLine2(site?.addressLine2 ?? "");
      setCity(site?.city ?? "");
      setCounty(site?.county ?? "");
      setPostcode(site?.postcode ?? "");
      setNotes(site?.notes ?? "");
    }
  }, [open, site]);
  const body = {
    name: name.trim(),
    addressLine1: line1.trim() || null,
    addressLine2: line2.trim() || null,
    city: city.trim() || null,
    county: county.trim() || null,
    postcode: postcode.trim() || null,
    countryCode: "GB",
    notes: notes.trim() || null,
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{site ? "Edit site" : "Add site"}</DialogTitle>
          <DialogDescription>
            A customer can have any number of distinct work locations.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              if (site) await updateSite(site.id, body);
              else await createSite({ customerId, ...body });
              await onSaved();
              onOpenChange(false);
              toast.success(site ? "Site updated" : "Site added");
            } catch (error) {
              toast.error(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Site name">
            <Input
              aria-label="Site name"
              required
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Westfield Sports Ground"
            />
          </Field>
          <Field label="Address line 1">
            <Input
              aria-label="Address line 1"
              value={line1}
              onChange={(event) => setLine1(event.target.value)}
            />
          </Field>
          <Field label="Address line 2">
            <Input
              aria-label="Address line 2"
              value={line2}
              onChange={(event) => setLine2(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Town or city">
              <Input
                aria-label="Town or city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </Field>
            <Field label="County">
              <Input
                aria-label="County"
                value={county}
                onChange={(event) => setCounty(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Postcode">
            <Input
              aria-label="Postcode"
              value={postcode}
              onChange={(event) => setPostcode(event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Site notes">
            <Textarea
              aria-label="Site notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {site ? "Save site" : "Add site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialog({
  customerId,
  sites,
  open,
  onOpenChange,
  onCreated,
}: {
  customerId: string;
  sites: SiteSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [scope, setScope] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setSiteId(sites[0]?.id ?? "");
      setScope("");
      setTargetDate("");
      setNotes("");
    }
  }, [open, sites]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Start the commercial lifecycle for one piece of work at a customer site.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const { project } = await createProject({
                customerId,
                siteId,
                name: name.trim(),
                scope: scope.trim() || null,
                targetDateIso: targetDate || null,
                notes: notes.trim() || null,
              });
              toast.success(`${project.reference} created`);
              onCreated(project.id);
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
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. New perimeter fencing"
            />
          </Field>
          <Field label="Site">
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger aria-label="Site">
                <SelectValue placeholder="Choose a site" />
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
              placeholder="What the customer has asked us to design and estimate"
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create project
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

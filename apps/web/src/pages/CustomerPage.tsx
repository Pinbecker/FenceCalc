import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Briefcase,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import {
  ApiError,
  createProject,
  deleteCustomer,
  getCustomer,
  listProjects,
  setCustomerArchived,
  setProjectArchived,
  type ScopeFilter,
} from "@/apiClient";
import { useSession } from "@/useSession";
import type { AppRoute } from "@/useHashRoute";
import type {
  CustomerRecord,
  ProjectStatus,
  ProjectSummary,
} from "@fence-estimator/contracts";

interface CustomerPageProps {
  customerId: string | null;
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

const STATUS_VARIANTS: Record<
  ProjectStatus,
  "default" | "secondary" | "muted" | "success" | "warning" | "destructive" | "outline"
> = {
  DRAFT: "muted",
  QUOTED: "secondary",
  WON: "success",
  LOST: "destructive",
  ON_HOLD: "warning",
};

export function CustomerPage({ customerId, onNavigate }: CustomerPageProps) {
  const { session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectScope, setProjectScope] = useState<ScopeFilter>("ACTIVE");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  useEffect(() => {
    if (!customerId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const [{ customer: c }, { projects: p }] = await Promise.all([
          getCustomer(customerId),
          listProjects({ customerId, scope: projectScope }),
        ]);
        if (cancelled) return;
        setCustomer(c);
        setProjects(p);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof ApiError ? error.payload.error : "Failed to load");
          onNavigate("customers");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, projectScope, onNavigate]);

  const refresh = async () => {
    if (!customerId) return;
    const { projects: p } = await listProjects({ customerId, scope: projectScope });
    setProjects(p);
    const { customer: c } = await getCustomer(customerId);
    setCustomer(c);
  };

  if (isLoading || !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading customer...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate("customers")}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to customers
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {customer.name}
            </h1>
            {customer.isArchived ? <Badge variant="muted">Archived</Badge> : null}
          </div>
          {customer.siteAddress ? (
            <p className="text-sm text-muted-foreground">{customer.siteAddress}</p>
          ) : null}
        </div>
        <CustomerActions
          customer={customer}
          isAdmin={isAdmin}
          onUpdated={refresh}
          onDeleted={() => onNavigate("customers")}
        />
      </div>

      <CustomerInfoCard customer={customer} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Projects</CardTitle>
            <CardDescription>Quote stages and drawings live inside projects.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={projectScope}
              onValueChange={(value) => setProjectScope(value as ScopeFilter)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setCreateProjectOpen(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-5 w-5" />}
              title="No projects yet"
              description="Each project bundles together the drawings and revisions for a quote."
              action={
                <Button onClick={() => setCreateProjectOpen(true)}>
                  <FolderPlus className="h-4 w-4" />
                  Start a project
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onOpen={() => onNavigate("project", { projectId: project.id })}
                  onAfterArchive={refresh}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateProjectDialog
        customerId={customer.id}
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(projectId) => {
          setCreateProjectOpen(false);
          onNavigate("project", { projectId });
        }}
      />
    </div>
  );
}

function CustomerInfoCard({ customer }: { customer: CustomerRecord }) {
  const rows: Array<[string, string | null]> = [
    ["Contact", customer.contactName],
    ["Email", customer.contactEmail],
    ["Phone", customer.contactPhone],
    ["Notes", customer.notes],
  ];
  const hasContent = rows.some(([, value]) => Boolean(value));
  if (!hasContent) return null;
  return (
    <Card>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
              <div className="mt-0.5 break-words">{value}</div>
            </div>
          ) : null,
        )}
      </CardContent>
    </Card>
  );
}

function CustomerActions({
  customer,
  isAdmin,
  onUpdated,
  onDeleted,
}: {
  customer: CustomerRecord;
  isAdmin: boolean;
  onUpdated: () => void | Promise<void>;
  onDeleted: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleArchived = async () => {
    setBusy(true);
    try {
      await setCustomerArchived(customer.id, !customer.isArchived);
      toast.success(customer.isArchived ? "Customer restored" : "Customer archived");
      await onUpdated();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Permanently delete ${customer.name}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteCustomer(customer.id);
      toast.success("Customer deleted");
      onDeleted();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={busy}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <Button variant="outline" size="sm" onClick={toggleArchived} disabled={busy}>
        {customer.isArchived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        {customer.isArchived ? "Restore" : "Archive"}
      </Button>
      {isAdmin && customer.isArchived ? (
        <Button variant="outline" size="sm" onClick={remove} disabled={busy}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      ) : null}
      <EditCustomerDialog
        customer={customer}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={onUpdated}
      />
    </div>
  );
}

function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
  onUpdated,
}: {
  customer: CustomerRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void | Promise<void>;
}) {
  const [name, setName] = useState(customer.name);
  const [contactName, setContactName] = useState(customer.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(customer.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(customer.contactPhone ?? "");
  const [siteAddress, setSiteAddress] = useState(customer.siteAddress ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(customer.name);
      setContactName(customer.contactName ?? "");
      setContactEmail(customer.contactEmail ?? "");
      setContactPhone(customer.contactPhone ?? "");
      setSiteAddress(customer.siteAddress ?? "");
      setNotes(customer.notes ?? "");
    }
  }, [customer, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { updateCustomer } = await import("@/apiClient");
      await updateCustomer(customer.id, {
        name: name.trim(),
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        siteAddress: siteAddress.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Customer updated");
      await onUpdated();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input required value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Site address</Label>
            <Input
              value={siteAddress}
              onChange={(event) => setSiteAddress(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectRow({
  project,
  onOpen,
  onAfterArchive,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onAfterArchive: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const lastActivity = useMemo(() => {
    if (!project.lastActivityAtIso) return null;
    try {
      return new Date(project.lastActivityAtIso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }, [project.lastActivityAtIso]);

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 transition hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{project.name}</span>
          <Badge variant={STATUS_VARIANTS[project.status]}>
            {STATUS_LABELS[project.status]}
          </Badge>
          {project.isArchived ? <Badge variant="muted">Archived</Badge> : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {project.drawingCount} drawing{project.drawingCount === 1 ? "" : "s"}
          {lastActivity ? ` · updated ${lastActivity}` : ""}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async (event) => {
          event.stopPropagation();
          setBusy(true);
          try {
            await setProjectArchived(project.id, !project.isArchived);
            await onAfterArchive();
          } catch (error) {
            toast.error(error instanceof ApiError ? error.payload.error : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {project.isArchived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        <span className="sr-only">
          {project.isArchived ? "Restore" : "Archive"}
        </span>
      </Button>
    </div>
  );
}

function CreateProjectDialog({
  customerId,
  open,
  onOpenChange,
  onCreated,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setNotes("");
      setStatus("DRAFT");
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const { project } = await createProject({
        customerId,
        name: name.trim(),
        status,
        notes: notes.trim() || null,
      });
      toast.success("Project created");
      onCreated(project.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Projects group together the drawings you produce for a customer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-notes">Notes</Label>
            <Textarea
              id="project-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

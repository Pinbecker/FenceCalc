import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  FileEdit,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  createDrawing,
  deleteProject,
  getCustomer,
  getProject,
  listDrawingsForProject,
  setDrawingArchived,
  setProjectArchived,
  setProjectStatus,
  updateProject,
} from "@/apiClient";
import { useSession } from "@/useSession";
import type { AppRoute } from "@/useHashRoute";
import type {
  CustomerRecord,
  DrawingSummary,
  ProjectRecord,
  ProjectStatus,
} from "@fence-estimator/contracts";

interface ProjectPageProps {
  projectId: string | null;
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

export function ProjectPage({ projectId, onNavigate }: ProjectPageProps) {
  const { session } = useSession();
  const isAdmin = session?.user.role === "ADMIN";
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [createDrawingOpen, setCreateDrawingOpen] = useState(false);

  useEffect(() => {
    if (!projectId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const { project: p } = await getProject(projectId);
        const [{ customer: c }, { drawings: d }] = await Promise.all([
          getCustomer(p.customerId),
          listDrawingsForProject(p.id),
        ]);
        if (cancelled) return;
        setProject(p);
        setCustomer(c);
        setDrawings(d);
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
  }, [projectId, onNavigate]);

  const refresh = async () => {
    if (!projectId) return;
    const [{ project: p }, { drawings: d }] = await Promise.all([
      getProject(projectId),
      listDrawingsForProject(projectId),
    ]);
    setProject(p);
    setDrawings(d);
  };

  const updatedAt = useMemo(() => {
    if (!project) return null;
    try {
      return new Date(project.updatedAtIso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }, [project?.updatedAtIso]);

  if (isLoading || !project || !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading project...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate("customers")}
          className="-ml-2 h-7 px-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Customers
        </Button>
        <span>/</span>
        <button
          type="button"
          onClick={() => onNavigate("customer", { customerId: customer.id })}
          className="hover:text-foreground hover:underline"
        >
          {customer.name}
        </button>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
            <Badge variant={STATUS_VARIANTS[project.status]}>
              {STATUS_LABELS[project.status]}
            </Badge>
            {project.isArchived ? <Badge variant="muted">Archived</Badge> : null}
          </div>
          {updatedAt ? (
            <p className="text-sm text-muted-foreground">Updated {updatedAt}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusSelect project={project} onChanged={refresh} />
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <ArchiveButton project={project} onChanged={refresh} />
          {isAdmin && project.isArchived ? (
            <DeleteProjectButton
              project={project}
              onDeleted={() => onNavigate("customer", { customerId: customer.id })}
            />
          ) : null}
        </div>
      </div>

      {project.notes ? (
        <Card>
          <CardContent className="p-5 text-sm whitespace-pre-wrap">{project.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Drawings</CardTitle>
            <p className="text-sm text-muted-foreground">
              Each drawing carries its own revision history.
            </p>
          </div>
          <Button onClick={() => setCreateDrawingOpen(true)}>
            <Plus className="h-4 w-4" />
            New drawing
          </Button>
        </CardHeader>
        <CardContent>
          {drawings.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="No drawings yet"
              description="Start by adding your first fence layout for this project."
              action={
                <Button onClick={() => setCreateDrawingOpen(true)}>
                  <FileEdit className="h-4 w-4" />
                  Start drawing
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {drawings.map((drawing) => (
                <DrawingCard
                  key={drawing.id}
                  drawing={drawing}
                  onOpen={() => onNavigate("drawing", { drawingId: drawing.id })}
                  onAfterArchive={refresh}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EditProjectDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={refresh}
      />
      <CreateDrawingDialog
        projectId={project.id}
        open={createDrawingOpen}
        onOpenChange={setCreateDrawingOpen}
        onCreated={(drawingId) => {
          setCreateDrawingOpen(false);
          onNavigate("editor", { drawingId });
        }}
      />
    </div>
  );
}

function ProjectStatusSelect({
  project,
  onChanged,
}: {
  project: ProjectRecord;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Select
      disabled={busy}
      value={project.status}
      onValueChange={async (value) => {
        setBusy(true);
        try {
          await setProjectStatus(project.id, value as ProjectStatus);
          toast.success(`Status set to ${STATUS_LABELS[value as ProjectStatus]}`);
          await onChanged();
        } catch (error) {
          toast.error(error instanceof ApiError ? error.payload.error : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <SelectTrigger className="w-36">
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
  );
}

function ArchiveButton({
  project,
  onChanged,
}: {
  project: ProjectRecord;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setProjectArchived(project.id, !project.isArchived);
          toast.success(project.isArchived ? "Project restored" : "Project archived");
          await onChanged();
        } catch (error) {
          toast.error(error instanceof ApiError ? error.payload.error : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {project.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      {project.isArchived ? "Restore" : "Archive"}
    </Button>
  );
}

function DeleteProjectButton({
  project,
  onDeleted,
}: {
  project: ProjectRecord;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (
          !window.confirm(
            `Permanently delete ${project.name}? All drawings and revisions will be removed.`,
          )
        ) {
          return;
        }
        setBusy(true);
        try {
          await deleteProject(project.id);
          toast.success("Project deleted");
          onDeleted();
        } catch (error) {
          toast.error(error instanceof ApiError ? error.payload.error : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
      Delete
    </Button>
  );
}

function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onUpdated,
}: {
  project: ProjectRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void | Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setNotes(project.notes ?? "");
    }
  }, [project, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        notes: notes.trim() || null,
      });
      toast.success("Project updated");
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
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input required value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
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

function DrawingCard({
  drawing,
  onOpen,
  onAfterArchive,
}: {
  drawing: DrawingSummary;
  onOpen: () => void;
  onAfterArchive: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const updatedAt = useMemo(() => {
    try {
      return new Date(drawing.updatedAtIso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }, [drawing.updatedAtIso]);

  return (
    <Card
      onClick={onOpen}
      className="cursor-pointer transition hover:border-primary/40 hover:shadow-md"
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-semibold">{drawing.name}</h3>
          <Badge variant="secondary">rev {drawing.latestRevisionNumber}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {drawing.segmentCount} segment{drawing.segmentCount === 1 ? "" : "s"} ·{" "}
          {drawing.gateCount} gate{drawing.gateCount === 1 ? "" : "s"}
          {updatedAt ? ` · updated ${updatedAt}` : ""}
        </div>
        <div className="flex items-center justify-between pt-1">
          {drawing.isArchived ? (
            <Badge variant="muted">Archived</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {drawing.updatedByDisplayName}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async (event) => {
              event.stopPropagation();
              setBusy(true);
              try {
                await setDrawingArchived(drawing.id, !drawing.isArchived);
                await onAfterArchive();
              } catch (error) {
                toast.error(error instanceof ApiError ? error.payload.error : "Failed");
              } finally {
                setBusy(false);
              }
            }}
            className="h-7 px-2"
          >
            {drawing.isArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">
              {drawing.isArchived ? "Restore" : "Archive"}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateDrawingDialog({
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const { drawing } = await createDrawing({
        projectId,
        name: name.trim(),
      });
      toast.success("Drawing created");
      onCreated(drawing.id);
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
          <DialogTitle>New drawing</DialogTitle>
          <DialogDescription>
            We&apos;ll start an empty revision 1 and take you straight into the editor.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="drawing-name">Drawing name</Label>
            <Input
              id="drawing-name"
              required
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create &amp; open editor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

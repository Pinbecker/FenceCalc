import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  GitBranch,
  History,
  Loader2,
  Pencil,
  PenLine,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import {
  ApiError,
  deleteRevision,
  getCustomer,
  getDrawing,
  getProject,
  listRevisions,
  renameDrawing,
  startRevision,
} from "@/apiClient";
import type { AppRoute } from "@/useHashRoute";
import type {
  CustomerRecord,
  DrawingRecord,
  DrawingRevisionSummary,
  ProjectRecord,
} from "@fence-estimator/contracts";

interface DrawingPageProps {
  drawingId: string | null;
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

export function DrawingPage({ drawingId, onNavigate }: DrawingPageProps) {
  const [drawing, setDrawing] = useState<DrawingRecord | null>(null);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [revisions, setRevisions] = useState<DrawingRevisionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  useEffect(() => {
    if (!drawingId) {
      onNavigate("customers");
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const { drawing: d } = await getDrawing(drawingId);
        const [{ project: p }, { revisions: r }] = await Promise.all([
          getProject(d.projectId),
          listRevisions(d.id),
        ]);
        const { customer: c } = await getCustomer(p.customerId);
        if (cancelled) return;
        setDrawing(d);
        setProject(p);
        setCustomer(c);
        setRevisions(r);
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
  }, [drawingId, onNavigate]);

  const refresh = async () => {
    if (!drawingId) return;
    const [{ drawing: d }, { revisions: r }] = await Promise.all([
      getDrawing(drawingId),
      listRevisions(drawingId),
    ]);
    setDrawing(d);
    setRevisions(r);
  };

  const updatedAt = useMemo(() => {
    if (!drawing) return null;
    try {
      return new Date(drawing.updatedAtIso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }, [drawing?.updatedAtIso]);

  if (isLoading || !drawing || !project || !customer) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading drawing...
      </div>
    );
  }

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
        <button
          type="button"
          onClick={() => onNavigate("project", { projectId: project.id })}
          className="hover:text-foreground hover:underline"
        >
          {project.name}
        </button>
        <span>/</span>
        <span className="text-foreground">{drawing.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{drawing.name}</h1>
          <p className="text-sm text-muted-foreground">
            Latest revision rev {drawing.latestRevisionNumber}
            {updatedAt ? ` · updated ${updatedAt}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
            <Pencil className="h-4 w-4" />
            Rename
          </Button>
          <Button variant="outline" onClick={() => setStartOpen(true)}>
            <GitBranch className="h-4 w-4" />
            Start new revision
          </Button>
          <Button
            onClick={() =>
              onNavigate("editor", {
                drawingId: drawing.id,
              })
            }
          >
            <PenLine className="h-4 w-4" />
            Open latest in editor
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revision history</CardTitle>
          <p className="text-sm text-muted-foreground">
            Starting a revision forks the previous revision&apos;s layout, leaving the earlier
            version read-only.
          </p>
        </CardHeader>
        <CardContent>
          {revisions.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="No revisions yet"
              description="Revisions appear here once you save changes from the editor."
            />
          ) : (
            <ul className="space-y-2">
              {revisions.map((revision) => (
                <RevisionRow
                  key={revision.id}
                  revision={revision}
                  isLatest={revision.id === drawing.currentRevisionId}
                  onOpen={() =>
                    onNavigate("editor", {
                      drawingId: drawing.id,
                    })
                  }
                  onDeleted={refresh}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RenameDrawingDialog
        drawing={drawing}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onUpdated={refresh}
      />
      <StartRevisionDialog
        drawing={drawing}
        open={startOpen}
        onOpenChange={setStartOpen}
        onStarted={(_revisionId) => {
          setStartOpen(false);
          onNavigate("editor", { drawingId: drawing.id });
        }}
      />
    </div>
  );
}

function RevisionRow({
  revision,
  isLatest,
  onOpen,
  onDeleted,
}: {
  revision: DrawingRevisionSummary;
  isLatest: boolean;
  onOpen: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const createdAt = useMemo(() => {
    try {
      return new Date(revision.createdAtIso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }, [revision.createdAtIso]);

  const remove = async () => {
    if (!isLatest || revision.revisionNumber === 1) return;
    if (!window.confirm(`Delete revision ${revision.revisionNumber}?`)) return;
    setBusy(true);
    try {
      await deleteRevision(revision.id);
      await onDeleted();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Revision {revision.revisionNumber}</span>
          {isLatest ? <Badge variant="success">Current</Badge> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {revision.segmentCount} segments · {revision.gateCount} gates · by{" "}
          {revision.createdByDisplayName || "unknown"}
          {createdAt ? ` · ${createdAt}` : ""}
        </div>
        {revision.notes ? (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{revision.notes}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {isLatest ? (
          <Button size="sm" variant="outline" onClick={onOpen}>
            <PenLine className="h-4 w-4" />
            Open in editor
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled>
            Read-only
          </Button>
        )}
        {isLatest && revision.revisionNumber > 1 ? (
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={remove}
            className="h-8 w-8 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete revision</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function RenameDrawingDialog({
  drawing,
  open,
  onOpenChange,
  onUpdated,
}: {
  drawing: DrawingRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void | Promise<void>;
}) {
  const [name, setName] = useState(drawing.name);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setName(drawing.name);
  }, [drawing, open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await renameDrawing(drawing.id, name.trim());
      toast.success("Drawing renamed");
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
          <DialogTitle>Rename drawing</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
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
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StartRevisionDialog({
  drawing,
  open,
  onOpenChange,
  onStarted,
}: {
  drawing: DrawingRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (revisionId: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setNotes("");
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { revision } = await startRevision(drawing.id, notes.trim() || null);
      toast.success(`Revision ${revision.revisionNumber} started`);
      onStarted(revision.id);
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
          <DialogTitle>Start a new revision</DialogTitle>
          <DialogDescription>
            We&apos;ll fork the layout from revision {drawing.latestRevisionNumber} so you
            continue from where it left off.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>What changes in this revision?</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes you can refer back to later"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <Plus className="h-4 w-4" />
              Start revision
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

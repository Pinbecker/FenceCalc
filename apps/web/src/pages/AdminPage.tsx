import { useEffect, useState } from "react";
import { Key, Loader2, Plus, ShieldCheck, UserCircle, Users } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import {
  ApiError,
  createUser,
  listAuditLog,
  listUsers,
  resetUserPassword,
} from "@/apiClient";
import { useSession } from "@/useSession";
import type {
  AuditLogRecord,
  CompanyUserRecord,
  UserRole,
} from "@fence-estimator/contracts";

export function AdminPage() {
  const { session } = useSession();
  const [users, setUsers] = useState<CompanyUserRecord[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<CompanyUserRecord | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await listUsers();
        setUsers(data.users);
      } catch (error) {
        toast.error(error instanceof ApiError ? error.payload.error : "Failed to load users");
      } finally {
        setIsLoadingUsers(false);
      }
    })();
    void (async () => {
      try {
        const data = await listAuditLog({ limit: 25 });
        setAuditEntries(data.entries);
      } catch {
        /* ignore */
      } finally {
        setIsLoadingAudit(false);
      }
    })();
  }, []);

  const refreshUsers = async () => {
    const data = await listUsers();
    setUsers(data.users);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage user access and review the audit trail for {session?.company.name}.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Team members</CardTitle>
            <p className="text-sm text-muted-foreground">
              Admins can manage other users and pricing config.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading users...
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No users yet"
              description="Add your first teammate to give them access."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {user.role === "ADMIN" ? (
                        <Badge>
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <UserCircle className="mr-1 h-3 w-3" />
                          User
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={user.id === session?.user.id}
                        onClick={() => setResetTarget(user)}
                      >
                        <Key className="h-4 w-4" />
                        Reset password
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Latest 25 events across customers, projects, drawings and revisions.
          </p>
        </CardHeader>
        <CardContent>
          {isLoadingAudit ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading activity...
            </div>
          ) : auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {auditEntries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{entry.summary}</div>
                    <div className="text-xs text-muted-foreground">
                      <Badge variant="muted" className="mr-2">
                        {entry.entityType}
                      </Badge>
                      {entry.action}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(entry.createdAtIso)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refreshUsers}
      />
      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setDisplayName("");
      setPassword("");
      setRole("USER");
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createUser({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        role,
      });
      toast.success(`Invited ${displayName.trim()}`);
      await onCreated();
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
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Share the email and initial password with them out of band.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              required
              autoFocus
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Temporary password</Label>
            <Input
              type="text"
              required
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Minimum 10 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: CompanyUserRecord | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) setPassword("");
  }, [target]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    setSubmitting(true);
    try {
      await resetUserPassword(target.id, password);
      toast.success(`Password reset for ${target.displayName}`);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {target?.displayName}. Their active sessions will be signed out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="text"
              required
              minLength={10}
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || password.length < 10}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Plus, Search, UserPlus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  createCustomer,
  listCustomers,
  setCustomerArchived,
  type ScopeFilter,
} from "@/apiClient";
import type { AppRoute } from "@/useHashRoute";
import type { CustomerSummary } from "@fence-estimator/contracts";

interface CustomersPageProps {
  onNavigate: (route: AppRoute, query?: Record<string, string>) => void;
}

export function CustomersPage({ onNavigate }: CustomersPageProps) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [scope, setScope] = useState<ScopeFilter>("ACTIVE");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const data = await listCustomers({ scope, search });
      setCustomers(data.customers);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed to load customers");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const needle = search.toLowerCase();
    return customers.filter((customer) => customer.name.toLowerCase().includes(needle));
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Manage everyone you quote fence work for.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New customer
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[16rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={scope} onValueChange={(value) => setScope(value as ScopeFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={search ? "No matching customers" : "No customers yet"}
              description={
                search
                  ? "Try a different search term."
                  : "Add your first customer to start tracking projects and drawings."
              }
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  Add customer
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCustomers.map((customer) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  onOpen={() => onNavigate("customer", { customerId: customer.id })}
                  onAfterArchive={refresh}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(customerId) => {
          setCreateOpen(false);
          onNavigate("customer", { customerId });
        }}
      />
    </div>
  );
}

function CustomerCard({
  customer,
  onOpen,
  onAfterArchive,
}: {
  customer: CustomerSummary;
  onOpen: () => void;
  onAfterArchive: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const toggleArchived = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setBusy(true);
    try {
      await setCustomerArchived(customer.id, !customer.isArchived);
      toast.success(customer.isArchived ? "Customer restored" : "Customer archived");
      await onAfterArchive();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      onClick={onOpen}
      className="cursor-pointer transition hover:border-primary/40 hover:shadow-md"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{customer.name}</h3>
            {customer.siteAddress ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {customer.siteAddress}
              </p>
            ) : null}
          </div>
          {customer.isArchived ? (
            <Badge variant="muted">Archived</Badge>
          ) : (
            <Badge variant="secondary">{customer.activeProjectCount} active</Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {customer.projectCount} project{customer.projectCount === 1 ? "" : "s"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={toggleArchived}
            className="h-7 px-2"
          >
            {customer.isArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">
              {customer.isArchived ? "Restore" : "Archive"}
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customerId: string) => void;
}) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setSiteAddress("");
      setNotes("");
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const { customer } = await createCustomer({
        name: name.trim(),
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        siteAddress: siteAddress.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Customer created");
      onCreated(customer.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.payload.error : "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Add a customer so you can start their first project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer-contact">Contact name</Label>
              <Input
                id="customer-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input
                id="customer-phone"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-site">Site address</Label>
            <Input
              id="customer-site"
              value={siteAddress}
              onChange={(event) => setSiteAddress(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-notes">Notes</Label>
            <Textarea
              id="customer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

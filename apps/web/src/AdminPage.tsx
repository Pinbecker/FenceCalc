import { useMemo, useState, type FormEvent } from "react";

import type { AuditEntityType, AuditLogRecord, CompanyUserRecord, CustomerSummary } from "@fence-estimator/contracts";

type AuditCategoryFilter = "ALL" | AuditEntityType;

interface AdminPageProps {
  users: CompanyUserRecord[];
  auditLog: AuditLogRecord[];
  customers: CustomerSummary[];
  currentUserId: string;
  currentUserRole: CompanyUserRecord["role"];
  isLoadingUsers: boolean;
  isLoadingAuditLog: boolean;
  isSavingUser: boolean;
  isResettingUserId: string | null;
  isArchivingCustomerId: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  onRefresh(this: void): Promise<void>;
  onRefreshAudit(this: void): Promise<void>;
  onCreateUser(
    this: void,
    input: { displayName: string; email: string; password: string; role: "ADMIN" | "MEMBER" },
  ): Promise<boolean>;
  onResetUserPassword(this: void, userId: string, password: string): Promise<boolean>;
  onRestoreCustomer(this: void, customerId: string): Promise<void>;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const AUDIT_CATEGORIES: { key: AuditCategoryFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AUTH", label: "Auth" },
  { key: "USER", label: "Users" },
  { key: "DRAWING", label: "Drawings" },
  { key: "QUOTE", label: "Quotes" },
  { key: "CUSTOMER", label: "Customers" }
];

export function AdminPage({
  users,
  auditLog,
  customers,
  currentUserId,
  currentUserRole,
  isLoadingUsers,
  isLoadingAuditLog,
  isSavingUser,
  isResettingUserId,
  isArchivingCustomerId,
  errorMessage,
  noticeMessage,
  onRefresh,
  onRefreshAudit,
  onCreateUser,
  onResetUserPassword,
  onRestoreCustomer
}: AdminPageProps) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [resetPasswordsByUserId, setResetPasswordsByUserId] = useState<Record<string, string>>({});
  const [auditCategory, setAuditCategory] = useState<AuditCategoryFilter>("ALL");
  const [auditSearch, setAuditSearch] = useState("");

  const canManageUsers = currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  const archivedCustomers = useMemo(
    () => customers.filter((customer) => customer.isArchived).sort((a, b) => a.name.localeCompare(b.name, "en-GB")),
    [customers]
  );

  const filteredAuditLog = useMemo(() => {
    const normalizedSearch = auditSearch.trim().toLowerCase();
    return auditLog.filter((entry) => {
      if (auditCategory !== "ALL" && entry.entityType !== auditCategory) {
        return false;
      }
      if (normalizedSearch) {
        return (
          entry.summary.toLowerCase().includes(normalizedSearch) ||
          entry.action.toLowerCase().includes(normalizedSearch) ||
          entry.entityType.toLowerCase().includes(normalizedSearch)
        );
      }
      return true;
    });
  }, [auditLog, auditCategory, auditSearch]);

  const auditCountByCategory = useMemo(() => {
    const counts: Record<string, number> = { ALL: auditLog.length };
    for (const entry of auditLog) {
      counts[entry.entityType] = (counts[entry.entityType] ?? 0) + 1;
    }
    return counts;
  }, [auditLog]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreateUser({ displayName, email, password, role })) {
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRole("MEMBER");
    }
  };

  const handleResetPassword = async (userId: string) => {
    const nextPassword = resetPasswordsByUserId[userId]?.trim() ?? "";
    if (!nextPassword) {
      return;
    }
    if (await onResetUserPassword(userId, nextPassword)) {
      setResetPasswordsByUserId((current) => ({ ...current, [userId]: "" }));
    }
  };

  if (!canManageUsers) {
    return (
      <section className="portal-page">
        <div className="portal-empty-state">
          <h1>Admin access required</h1>
          <p>User provisioning is limited to company owners and admins.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="portal-page admin-page-layout">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Administration</span>
          <h1>User management</h1>
          <p>Manage user access, apply password resets, and keep an auditable record of account changes.</p>
        </div>
        <div className="portal-header-actions">
          <button type="button" className="portal-secondary-button" onClick={() => void onRefresh()} disabled={isLoadingUsers}>
            {isLoadingUsers ? "Refreshing users..." : "Refresh Users"}
          </button>
          <button type="button" className="portal-secondary-button" onClick={() => void onRefreshAudit()} disabled={isLoadingAuditLog}>
            {isLoadingAuditLog ? "Refreshing audit..." : "Refresh Audit"}
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
      {noticeMessage ? <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div> : null}

      <div className="admin-page-grid">
        <section className="portal-surface-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Team</span>
              <h2>Company users</h2>
            </div>
          </div>
          <div className="admin-user-list">
            {users.map((user) => (
              <article key={user.id} className="admin-user-card">
                <div>
                  <strong>{user.displayName}</strong>
                  <span>{user.email}</span>
                </div>
                <div className="admin-user-meta">
                  <span>{user.role}</span>
                  <span>{formatTimestamp(user.createdAtIso)}</span>
                </div>
                <div className="portal-form-grid">
                  {user.id === currentUserId ? (
                    <p className="portal-empty-copy">
                      Your own password must be reset by another manager or through the operator recovery process.
                    </p>
                  ) : (
                    <>
                      <label className="portal-field">
                        <span>Temporary password</span>
                        <input
                          type="password"
                          value={resetPasswordsByUserId[user.id] ?? ""}
                          onChange={(event) =>
                            setResetPasswordsByUserId((current) => ({ ...current, [user.id]: event.target.value }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="portal-secondary-button"
                        onClick={() => void handleResetPassword(user.id)}
                        disabled={isResettingUserId === user.id || !(resetPasswordsByUserId[user.id]?.trim())}
                      >
                        {isResettingUserId === user.id ? "Setting password..." : "Set password"}
                      </button>
                      <p className="portal-empty-copy">Active sessions are revoked immediately after password reset.</p>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="portal-surface-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Create user</span>
              <h2>Add user login</h2>
            </div>
          </div>
          <form className="portal-form-grid" onSubmit={(event) => void handleSubmit(event)}>
            <label className="portal-field">
              <span>Name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>
            <label className="portal-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="portal-field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <label className="portal-field">
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "MEMBER")}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <button type="submit" className="portal-primary-button" disabled={isSavingUser}>
              {isSavingUser ? "Adding..." : "Add user"}
            </button>
          </form>
        </section>
      </div>

      {archivedCustomers.length > 0 ? (
        <section className="portal-surface-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Recovery</span>
              <h2>Archived customers</h2>
            </div>
          </div>
          <p className="portal-empty-copy" style={{ marginBottom: 12 }}>
            These customers have been archived and are no longer visible in the directory.
            Restore a customer to make them accessible again.
          </p>
          <div className="audit-log-list">
            {archivedCustomers.map((customer) => (
              <article key={customer.id} className="audit-log-card">
                <div>
                  <strong>{customer.name}</strong>
                  <span>
                    {customer.activeDrawingCount} active · {customer.archivedDrawingCount} archived drawings
                  </span>
                </div>
                <button
                  type="button"
                  className="portal-secondary-button portal-compact-button"
                  disabled={isArchivingCustomerId === customer.id}
                  onClick={() => void onRestoreCustomer(customer.id)}
                >
                  {isArchivingCustomerId === customer.id ? "Restoring..." : "Restore"}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="portal-surface-card">
        <div className="portal-section-heading">
          <div>
            <span className="portal-section-kicker">Audit trail</span>
            <h2>Recent operational events</h2>
          </div>
        </div>
        <div className="admin-audit-controls">
          <div className="portal-filter-row" role="tablist" aria-label="Audit category filter">
            {AUDIT_CATEGORIES.map((category) => (
              <button
                type="button"
                key={category.key}
                className={auditCategory === category.key ? "is-active" : undefined}
                onClick={() => setAuditCategory(category.key)}
              >
                {category.label}
                {auditCountByCategory[category.key] ? (
                  <span className="admin-audit-count">{auditCountByCategory[category.key]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <label className="admin-audit-search">
            <input
              value={auditSearch}
              onChange={(event) => setAuditSearch(event.target.value)}
              placeholder="Search audit events..."
            />
            {auditSearch.trim().length > 0 ? (
              <button type="button" className="portal-text-button" onClick={() => setAuditSearch("")}>
                Clear
              </button>
            ) : null}
          </label>
        </div>
        <div className="audit-log-list">
          {filteredAuditLog.length === 0 ? (
            <p className="portal-empty-copy">
              {auditLog.length === 0
                ? "No recent audit events."
                : "No events match the current filter."}
            </p>
          ) : null}
          {filteredAuditLog.map((entry) => (
            <article key={entry.id} className="audit-log-card">
              <div>
                <strong>{entry.summary}</strong>
                <span>
                  {entry.action} · {formatTimestamp(entry.createdAtIso)}
                </span>
              </div>
              <span className="drawing-library-badge">{entry.entityType}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

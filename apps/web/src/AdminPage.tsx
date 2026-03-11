import { useState, type FormEvent } from "react";

import type { AuditLogRecord, CompanyUserRecord } from "@fence-estimator/contracts";

interface AdminPageProps {
  users: CompanyUserRecord[];
  auditLog: AuditLogRecord[];
  currentUserRole: CompanyUserRecord["role"];
  isLoadingUsers: boolean;
  isLoadingAuditLog: boolean;
  isSavingUser: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  onRefresh(this: void): Promise<void>;
  onRefreshAudit(this: void): Promise<void>;
  onCreateUser(
    this: void,
    input: { displayName: string; email: string; password: string; role: "ADMIN" | "MEMBER" },
  ): Promise<boolean>;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function AdminPage({
  users,
  auditLog,
  currentUserRole,
  isLoadingUsers,
  isLoadingAuditLog,
  isSavingUser,
  errorMessage,
  noticeMessage,
  onRefresh,
  onRefreshAudit,
  onCreateUser
}: AdminPageProps) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");

  const canManageUsers = currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreateUser({ displayName, email, password, role })) {
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRole("MEMBER");
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
          <p>Provision company users and review the activity trail from one operational surface.</p>
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

      <div className="admin-page-grid">
        <section className="portal-surface-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Create user</span>
              <h2>Add a company login</h2>
            </div>
          </div>
          {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
          {noticeMessage ? <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div> : null}
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
              {isSavingUser ? "Adding..." : "Add User"}
            </button>
          </form>
        </section>

        <section className="portal-surface-card">
          <div className="portal-section-heading">
            <div>
              <span className="portal-section-kicker">Team</span>
              <h2>Current company users</h2>
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
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="portal-surface-card">
        <div className="portal-section-heading">
          <div>
            <span className="portal-section-kicker">Audit trail</span>
            <h2>Recent operational events</h2>
          </div>
        </div>
        <div className="audit-log-list">
          {auditLog.map((entry) => (
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

import { useState, type FormEvent } from "react";

import { type RegisterAccountInput } from "./apiClient";

interface LoginPageProps {
  bootstrapRequired: boolean;
  bootstrapSecretRequired: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  onLogin(this: void, input: { email: string; password: string }): Promise<boolean>;
  onBootstrap(this: void, input: RegisterAccountInput): Promise<boolean>;
}

export function LoginPage({
  bootstrapRequired,
  bootstrapSecretRequired,
  isSubmitting,
  errorMessage,
  noticeMessage,
  onLogin,
  onBootstrap
}: LoginPageProps) {
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bootstrapRequired) {
      await onBootstrap({ companyName, displayName, email, password, bootstrapSecret });
      return;
    }
    await onLogin({ email, password });
  };

  return (
    <section className="portal-auth-page">
      <div className="portal-auth-hero">
        <span className="portal-eyebrow">Fence Estimator Portal</span>
        <h1>Commercial drawing workspace for company teams.</h1>
        <p>
          Keep drawings, estimates, and team access in one place. The editor is no longer the whole product surface.
        </p>
        <div className="portal-hero-points">
          <span>Company-level access control</span>
          <span>Saved drawing library with previews</span>
          <span>Admin-managed user creation</span>
        </div>
      </div>

      <form className="portal-auth-card" onSubmit={(event) => void handleSubmit(event)}>
        <span className="portal-form-badge">{bootstrapRequired ? "Initial Setup" : "Sign In"}</span>
        <h2>{bootstrapRequired ? "Create the first owner account" : "Log in to your workspace"}</h2>
        <p className="portal-form-copy">
          {bootstrapRequired
            ? "Bootstrap is only available until the first company owner is created. After that, users must be added by an admin."
            : "Use your company credentials. New users are provisioned by an owner or admin."}
        </p>

        {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}
        {noticeMessage ? <div className="portal-inline-message portal-inline-notice">{noticeMessage}</div> : null}

        {bootstrapRequired ? (
          <label className="portal-field">
            <span>Company Name</span>
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
          </label>
        ) : null}

        {bootstrapRequired ? (
          <label className="portal-field">
            <span>Your Name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
        ) : null}

        {bootstrapRequired && bootstrapSecretRequired ? (
          <label className="portal-field">
            <span>Bootstrap Secret</span>
            <input
              type="password"
              value={bootstrapSecret}
              onChange={(event) => setBootstrapSecret(event.target.value)}
              required
            />
          </label>
        ) : null}

        <label className="portal-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>

        <label className="portal-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>

        <button type="submit" className="portal-primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Working..." : bootstrapRequired ? "Create Owner" : "Log In"}
        </button>

        {!bootstrapRequired ? (
          <div className="portal-recovery-card">
            <p className="portal-form-copy">
              Password recovery is manager-driven for this workspace. Contact a company owner or admin if you need access restored.
            </p>
          </div>
        ) : null}
      </form>
    </section>
  );
}

import { useMemo, useState } from "react";

import type { AuthSessionEnvelope, DrawingSummary } from "@fence-estimator/contracts";

import type { LoginInput, RegisterAccountInput } from "./apiClient";

type AuthMode = "LOGIN" | "REGISTER";

interface WorkspacePanelProps {
  session: AuthSessionEnvelope | null;
  drawings: DrawingSummary[];
  currentDrawingId: string | null;
  currentDrawingName: string;
  isDirty: boolean;
  isRestoringSession: boolean;
  isAuthenticating: boolean;
  isLoadingDrawings: boolean;
  isSavingDrawing: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  onSetCurrentDrawingName: (name: string) => void;
  onRegister: (input: RegisterAccountInput) => Promise<void>;
  onLogin: (input: LoginInput) => Promise<void>;
  onLogout: () => void;
  onRefreshDrawings: () => Promise<void>;
  onLoadDrawing: (drawingId: string) => Promise<void>;
  onSaveDrawing: () => Promise<void>;
  onSaveDrawingAsNew: () => Promise<void>;
  onStartNewDraft: () => void;
}

function formatUpdatedAt(updatedAtIso: string): string {
  return new Date(updatedAtIso).toLocaleString();
}

export function WorkspacePanel(props: WorkspacePanelProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("LOGIN");
  const [registerForm, setRegisterForm] = useState<RegisterAccountInput>({
    companyName: "",
    displayName: "",
    email: "",
    password: ""
  });
  const [loginForm, setLoginForm] = useState<LoginInput>({
    email: "",
    password: ""
  });
  const sortedDrawings = useMemo(
    () => [...props.drawings].sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso)),
    [props.drawings],
  );

  async function submitRegister(): Promise<void> {
    await props.onRegister(registerForm);
    setRegisterForm((current) => ({
      ...current,
      password: ""
    }));
  }

  async function submitLogin(): Promise<void> {
    await props.onLogin(loginForm);
    setLoginForm((current) => ({
      ...current,
      password: ""
    }));
  }

  return (
    <section className="panel-block panel-workspace">
      <div className="panel-heading">
        <h2>Workspace</h2>
      </div>

      {props.isRestoringSession ? <p className="muted-line">Restoring saved session...</p> : null}
      {props.errorMessage ? <p className="status-line status-error">{props.errorMessage}</p> : null}
      {props.noticeMessage ? <p className="status-line status-ok">{props.noticeMessage}</p> : null}

      {!props.session ? (
        <div className="workspace-auth">
          <div className="mode-toggle-row mode-toggle-row-2" role="tablist" aria-label="Account mode">
            <button
              type="button"
              className={`mode-toggle-btn${authMode === "LOGIN" ? " active" : ""}`}
              onClick={() => setAuthMode("LOGIN")}
            >
              Login
            </button>
            <button
              type="button"
              className={`mode-toggle-btn${authMode === "REGISTER" ? " active" : ""}`}
              onClick={() => setAuthMode("REGISTER")}
            >
              Register
            </button>
          </div>

          {authMode === "REGISTER" ? (
            <>
              <label>
                Company
                <input
                  type="text"
                  value={registerForm.companyName}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, companyName: event.target.value }))}
                />
              </label>
              <label>
                Your Name
                <input
                  type="text"
                  value={registerForm.displayName}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <button type="button" onClick={() => void submitRegister()} disabled={props.isAuthenticating}>
                {props.isAuthenticating ? "Creating..." : "Create Workspace"}
              </button>
            </>
          ) : (
            <>
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <button type="button" onClick={() => void submitLogin()} disabled={props.isAuthenticating}>
                {props.isAuthenticating ? "Signing In..." : "Sign In"}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="workspace-session">
          <div className="workspace-user-row">
            <div>
              <strong>{props.session.company.name}</strong>
              <p className="muted-line">
                {props.session.user.displayName} · {props.session.user.role}
              </p>
            </div>
            <button type="button" className="ghost" onClick={props.onLogout}>
              Log Out
            </button>
          </div>

          <label>
            Drawing Name
            <input
              type="text"
              value={props.currentDrawingName}
              placeholder="Name this drawing"
              onChange={(event) => props.onSetCurrentDrawingName(event.target.value)}
            />
          </label>

          <div className="workspace-actions">
            <button type="button" onClick={() => void props.onSaveDrawing()} disabled={props.isSavingDrawing}>
              {props.currentDrawingId ? "Save Changes" : "Save New"}
            </button>
            <button type="button" className="ghost" onClick={() => void props.onSaveDrawingAsNew()} disabled={props.isSavingDrawing}>
              Save As New
            </button>
            <button type="button" className="ghost" onClick={props.onStartNewDraft}>
              New Draft
            </button>
          </div>

          <div className="workspace-meta-row">
            <span className={`workspace-dirty${props.isDirty ? " dirty" : ""}`}>
              {props.isDirty ? "Unsaved changes" : "Saved"}
            </span>
            <button type="button" className="ghost" onClick={() => void props.onRefreshDrawings()} disabled={props.isLoadingDrawings}>
              {props.isLoadingDrawings ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="workspace-library">
            <div className="workspace-library-header">
              <h3>Saved Drawings</h3>
              <span>{sortedDrawings.length}</span>
            </div>
            {sortedDrawings.length === 0 ? (
              <p className="muted-line">No drawings saved for this company yet.</p>
            ) : (
              <ul className="drawing-list">
                {sortedDrawings.map((drawing) => {
                  const isActive = drawing.id === props.currentDrawingId;
                  return (
                    <li key={drawing.id} className={isActive ? "active" : ""}>
                      <button type="button" className="drawing-load-btn" onClick={() => void props.onLoadDrawing(drawing.id)}>
                        <span className="drawing-name">{drawing.name}</span>
                        <span className="drawing-updated">{formatUpdatedAt(drawing.updatedAtIso)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

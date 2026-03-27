import { useEffect, useState } from "react";

import type { AuthSessionEnvelope, QuoteRecord } from "@fence-estimator/contracts";

import { getDrawing } from "./apiClient";
import type { PortalRoute } from "./useHashRoute";

interface EstimatePageProps {
  session: AuthSessionEnvelope;
  drawingId: string | null;
  onNavigate(this: void, route: PortalRoute, query?: Record<string, string>): void;
}

export function EstimatePage({ session, drawingId, onNavigate }: EstimatePageProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canManagePricing = session.user.role === "OWNER" || session.user.role === "ADMIN";

  useEffect(() => {
    let cancelled = false;

    if (!drawingId) {
      return;
    }

    void (async () => {
      try {
        const drawing = await getDrawing(drawingId);
        if (cancelled) {
          return;
        }
        if (drawing.jobId) {
          onNavigate("job", { jobId: drawing.jobId, tab: "estimate", drawingId: drawing.id });
          return;
        }
        setErrorMessage("This drawing is not attached to a job yet.");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage((error as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [drawingId, onNavigate]);

  return (
    <section className="portal-page estimate-page workbook-page">
      <header className="portal-page-header">
        <div>
          <span className="portal-eyebrow">Estimate workspace</span>
          <h1>Redirecting to job estimate</h1>
          <p>Estimates now live inside the job workspace so drawings, controls, quotes, and activity stay together.</p>
        </div>
        <div className="portal-header-actions">
          {canManagePricing ? (
            <button type="button" className="portal-secondary-button" onClick={() => onNavigate("pricing")}>
              Pricing workbook
            </button>
          ) : null}
          <button type="button" className="portal-primary-button" onClick={() => onNavigate("customers")}>
            Customer directory
          </button>
        </div>
      </header>

      {errorMessage ? <div className="portal-inline-message portal-inline-error">{errorMessage}</div> : null}

      <div className="portal-empty-state">
        <h2>{drawingId ? "Opening job workspace..." : "No drawing selected"}</h2>
        <p>
          {drawingId
            ? "If this does not redirect automatically, reopen the estimate from a customer job card or from the editor."
            : "Open estimates from a saved drawing or from a job workspace."}
        </p>
        <button type="button" className="portal-secondary-button portal-compact-button" onClick={() => onNavigate("customers")}>
          Browse customers
        </button>
      </div>
    </section>
  );
}

export function formatQuoteSummaryLabel(quote: QuoteRecord): string {
  return `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(quote.createdAtIso))} | v${
    quote.sourceDrawingVersionNumber ?? quote.drawingVersionNumber
  } | ${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(quote.pricedEstimate.totals.totalCost)}`;
}

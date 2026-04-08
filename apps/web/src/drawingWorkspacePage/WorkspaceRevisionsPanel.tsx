import type { DrawingSummary, QuoteRecord } from "@fence-estimator/contracts";

import { DrawingPreview } from "../DrawingPreview";
import { getRevisionLabel } from "../drawingWorkspace";
import { DRAWING_STATUS_LABELS, formatDateOnly, formatMoney } from "./shared";

interface WorkspaceRevisionsPanelProps {
  drawings: DrawingSummary[];
  activeDrawing: DrawingSummary | null;
  activeLatestDrawing: DrawingSummary | null;
  isEstimateVisible: boolean;
  latestQuoteByDrawingId: Map<string, QuoteRecord>;
  isAddingRevision: boolean;
  onCreateRevision: () => void;
  onOpenDrawingInEditor: (drawingId: string) => void;
  onOpenDrawingEstimate: (drawingId: string) => void;
  onCloseDrawingEstimate: () => void;
  onOpenSavedQuotePdf: (quote: QuoteRecord) => void;
}

export function WorkspaceRevisionsPanel({
  drawings,
  activeDrawing,
  activeLatestDrawing,
  isEstimateVisible,
  latestQuoteByDrawingId,
  isAddingRevision,
  onCreateRevision,
  onOpenDrawingInEditor,
  onOpenDrawingEstimate,
  onCloseDrawingEstimate,
  onOpenSavedQuotePdf,
}: WorkspaceRevisionsPanelProps) {
  return (
    <section className="portal-surface-card portal-job-primary-card">
      <div className="portal-section-heading">
        <div>
          <span className="portal-section-kicker">Drawing history</span>
        </div>
        <button
          type="button"
          className="portal-secondary-button portal-compact-button"
          onClick={onCreateRevision}
          disabled={isAddingRevision || !activeLatestDrawing}
        >
          {isAddingRevision ? "Creating..." : "Create revision"}
        </button>
      </div>
      <div className="portal-customer-drawing-grid">
        {drawings.length === 0 ? (
          <p className="portal-empty-copy">No drawings are available in this workspace.</p>
        ) : null}
        {drawings.map((drawing) => {
          const isLatestDrawing = drawing.id === activeLatestDrawing?.id;
          const isEstimateOpen = isEstimateVisible && activeDrawing?.id === drawing.id;
          const drawingQuote = latestQuoteByDrawingId.get(drawing.id) ?? null;
          return (
            <article key={drawing.id} className="portal-customer-drawing-card">
              <div
                className="portal-customer-drawing-card-preview"
                role="button"
                tabIndex={0}
                onClick={() => onOpenDrawingInEditor(drawing.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onOpenDrawingInEditor(drawing.id);
                  }
                }}
              >
                <DrawingPreview layout={drawing.previewLayout} label={drawing.name} variant="card" />
              </div>
              <div className="portal-customer-drawing-card-body">
                <div className="portal-customer-drawing-card-head">
                  <div className="portal-customer-drawing-card-copy">
                    <h3>{getRevisionLabel(drawing)}</h3>
                    <span>{drawing.name}</span>
                  </div>
                  <div className="portal-customer-drawing-card-badges">
                    {isLatestDrawing ? (
                      <span className="portal-customer-drawing-badge">Latest</span>
                    ) : null}
                    <span className={`portal-customer-drawing-badge drawing-status-${drawing.status.toLowerCase()}`}>
                      {DRAWING_STATUS_LABELS[drawing.status]}
                    </span>
                    {drawing.isArchived ? (
                      <span className="portal-customer-drawing-badge is-archived">Archived</span>
                    ) : null}
                  </div>
                </div>
                <div className="portal-customer-drawing-card-meta">
                  <strong>
                    {drawingQuote
                      ? `Quote ${formatMoney(drawingQuote.pricedEstimate.totals.totalCost)}`
                      : "No quote yet"}
                  </strong>
                  <span>{formatDateOnly(drawing.updatedAtIso)}</span>
                </div>
                <div className="portal-customer-drawing-card-footer">
                  <button
                    type="button"
                    className="portal-text-button"
                    onClick={() =>
                      isEstimateOpen
                        ? onCloseDrawingEstimate()
                        : onOpenDrawingEstimate(drawing.id)
                    }
                  >
                    {isEstimateOpen ? "Hide estimate" : "Estimate"}
                  </button>
                  {drawingQuote ? (
                    <button
                      type="button"
                      className="portal-text-button"
                      onClick={() => onOpenSavedQuotePdf(drawingQuote)}
                    >
                      Quote PDF
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

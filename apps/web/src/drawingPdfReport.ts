import type { EstimateResult, LayoutModel, LayoutSegment } from "@fence-estimator/contracts";

import type {
  ResolvedBasketballPostPlacement,
  ResolvedFloodlightColumnPlacement,
  ResolvedGatePlacement
} from "./editor/types.js";
import { buildOptimization3DScene } from "./optimization3D.js";
import { buildOptimization3DRenderData, DEFAULT_ORBIT, type OrbitState } from "./optimization3DRenderData.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatLengthMm(valueMm: number): string {
  if (valueMm >= 1000) {
    return `${(valueMm / 1000).toFixed(2)} m`;
  }
  return `${Math.round(valueMm)} mm`;
}

function buildFileSafeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "drawing";
}

export interface DrawingPdfReportInput {
  companyName: string | null;
  preparedBy: string | null;
  drawingTitle: string;
  drawingId: string | null;
  customerName: string;
  generatedAtIso: string;
  isDirty: boolean;
  layout: LayoutModel;
  canvasImageDataUrl: string | null;
  estimate: EstimateResult;
  estimateSegments: LayoutSegment[];
  segmentOrdinalById: Map<string, number>;
  resolvedGatePlacements: ResolvedGatePlacement[];
  resolvedBasketballPostPlacements: ResolvedBasketballPostPlacement[];
  resolvedFloodlightColumnPlacements: ResolvedFloodlightColumnPlacement[];
}

function parsePoints(value: string): Array<[number, number]> {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.split(",").map(Number) as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function buildBlankThreeDimensionalSvg(label: string): string {
  return `
    <svg viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)}">
      <defs>
        <linearGradient id="blank-3d-bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#f5f8fb" />
          <stop offset="100%" stop-color="#dce3e4" />
        </linearGradient>
      </defs>
      <rect width="960" height="540" rx="28" fill="url(#blank-3d-bg)" />
      <text x="50%" y="50%" text-anchor="middle" fill="#6a756d" font-family="Segoe UI, sans-serif" font-size="28">
        3D view unavailable
      </text>
    </svg>
  `.trim();
}

export function buildOptimizationIsometricSvg(
  input: Pick<
    DrawingPdfReportInput,
    | "estimateSegments"
    | "segmentOrdinalById"
    | "resolvedGatePlacements"
    | "resolvedBasketballPostPlacements"
    | "resolvedFloodlightColumnPlacements"
  >,
  orbit: OrbitState,
  label: string
): string {
  if (input.estimateSegments.length === 0) {
    return buildBlankThreeDimensionalSvg(label);
  }

  const scene = buildOptimization3DScene(
    input.estimateSegments,
    [],
    input.segmentOrdinalById,
    input.resolvedGatePlacements,
    input.resolvedBasketballPostPlacements,
    input.resolvedFloodlightColumnPlacements
  );
  const renderData = buildOptimization3DRenderData(scene, orbit, 960, 540);

  const facesMarkup = renderData.faces
    .map(
      (face) => `
        <polygon
          points="${face.points}"
          fill="${face.fill}"
          stroke="${face.stroke}"
          stroke-width="${face.strokeWidth}"
          opacity="${face.opacity}"
        />
      `
    )
    .join("");
  const strokesMarkup = renderData.strokes
    .map((stroke) => {
      if (stroke.kind === "path") {
        return `
          <path
            d="${stroke.value}"
            fill="none"
            stroke="${stroke.stroke}"
            stroke-width="${stroke.strokeWidth}"
            opacity="${stroke.opacity}"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray="${stroke.dashArray ?? ""}"
          />
        `;
      }

      const points = parsePoints(stroke.value)
        .map(([x, y]) => `${x},${y}`)
        .join(" ");
      return `
        <polyline
          points="${points}"
          fill="none"
          stroke="${stroke.stroke}"
          stroke-width="${stroke.strokeWidth}"
          opacity="${stroke.opacity}"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="${stroke.dashArray ?? ""}"
        />
      `;
    })
    .join("");
  const badgesMarkup = renderData.badges
    .map(
      (badge) => `
        <g>
          <circle cx="${badge.cx}" cy="${badge.cy}" r="15" fill="${badge.fill}" stroke="${badge.stroke}" stroke-width="1.4" />
          <text
            x="${badge.cx}"
            y="${badge.cy + 4}"
            text-anchor="middle"
            fill="#ffffff"
            font-family="Segoe UI, sans-serif"
            font-size="11"
            font-weight="700"
          >${escapeHtml(badge.step)}</text>
          ${
            badge.segmentLabel
              ? `
                <text
                  x="${badge.cx}"
                  y="${badge.cy + 25}"
                  text-anchor="middle"
                  fill="rgba(17, 30, 36, 0.78)"
                  font-family="Segoe UI, sans-serif"
                  font-size="9"
                  font-weight="700"
                >${escapeHtml(badge.segmentLabel)}</text>
              `
              : ""
          }
        </g>
      `
    )
    .join("");

  return `
    <svg viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)}">
      <defs>
        <linearGradient id="iso-bg-${escapeHtml(label).replace(/[^a-zA-Z0-9]/g, "")}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#f5f8fb" />
          <stop offset="100%" stop-color="#dde4e4" />
        </linearGradient>
      </defs>
      <rect width="960" height="540" rx="28" fill="#f7f3ec" />
      <rect width="960" height="540" rx="28" fill="url(#iso-bg-${escapeHtml(label).replace(/[^a-zA-Z0-9]/g, "")})" />
      ${facesMarkup}
      ${strokesMarkup}
      ${badgesMarkup}
    </svg>
  `.trim();
}

function buildSummaryCards(input: DrawingPdfReportInput): Array<{ label: string; value: string }> {
  const gateCount = input.layout.gates?.length ?? 0;
  const basketballPostCount = input.layout.basketballPosts?.length ?? 0;
  const floodlightColumnCount = input.layout.floodlightColumns?.length ?? 0;
  const panelCount = input.estimate.materials.twinBarPanels + input.estimate.materials.twinBarPanelsSuperRebound;

  return [
    { label: "Fence runs", value: String(input.estimate.segments.length) },
    { label: "Panels", value: String(panelCount) },
    { label: "Posts", value: String(input.estimate.posts.total) },
    { label: "Gates", value: String(gateCount) },
    { label: "Basketball posts", value: String(basketballPostCount) },
    { label: "Floodlight columns", value: String(floodlightColumnCount) }
  ];
}

function buildScheduleRows(input: DrawingPdfReportInput): Array<{ label: string; value: string }> {
  return [
    { label: "Corner posts", value: String(input.estimate.corners.total) },
    { label: "Intermediate posts", value: String(input.estimate.posts.intermediate) },
    { label: "Fixed full panels", value: String(input.estimate.optimization.twinBar.fixedFullPanels) },
    { label: "Opened stock panels", value: String(input.estimate.optimization.twinBar.stockPanelsOpened) },
    { label: "Panels saved", value: String(input.estimate.optimization.twinBar.panelsSaved) },
    { label: "Reusable offcuts", value: String(input.estimate.optimization.twinBar.reusedCuts) },
    { label: "Reusable leftover", value: formatLengthMm(input.estimate.optimization.twinBar.reusableLeftoverMm) },
    { label: "Utilisation", value: `${Math.round(input.estimate.optimization.twinBar.utilizationRate * 100)}%` }
  ];
}

function buildSegmentTableRows(input: DrawingPdfReportInput): string {
  return input.estimate.segments
    .map(
      (segment, index) => `
        <tr>
          <td>Segment ${index + 1}</td>
          <td>${formatLengthMm(segment.lengthMm)}</td>
          <td>${segment.panels}</td>
          <td>${segment.intermediatePosts}</td>
          <td>${segment.bays}</td>
        </tr>
      `
    )
    .join("");
}

function buildInfoRow(label: string, value: string): string {
  return `<div class="report-meta-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function buildDrawingPdfReportHtml(input: DrawingPdfReportInput): string {
  const summaryCards = buildSummaryCards(input);
  const scheduleRows = buildScheduleRows(input);
  const drawingLabel = input.drawingTitle.trim() || "Drawing";
  const canvasMarkup = input.canvasImageDataUrl
    ? `<img src="${input.canvasImageDataUrl}" alt="Live canvas plan for ${escapeHtml(drawingLabel)}" />`
    : `<div class="report-empty-figure">Live canvas plan was not available for capture.</div>`;
  const primaryIsometricSvg = buildOptimizationIsometricSvg(
    input,
    DEFAULT_ORBIT,
    `${drawingLabel} primary isometric view`
  );
  const secondaryIsometricSvg = buildOptimizationIsometricSvg(
    input,
    {
      yaw: 0.92,
      pitch: 0.66,
      zoom: 1.16,
      panX: 0,
      panY: 0
    },
    `${drawingLabel} reverse isometric view`
  );
  const fileName = `${buildFileSafeSlug(drawingLabel)}-report.pdf`;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(fileName)}</title>
        <style>
          :root {
            color-scheme: light;
            --ink: #20322f;
            --muted: #66736c;
            --line: #d7d2c6;
            --paper: #fffdfa;
            --panel: #f7f2ea;
            --accent: #355b87;
            --accent-soft: #e5eef9;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            color: var(--ink);
            background: #ddd6c8;
          }
          .report-actions {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            padding: 14px 20px;
            border-bottom: 1px solid var(--line);
            background: rgba(255, 253, 250, 0.96);
            backdrop-filter: blur(12px);
          }
          .report-actions-copy {
            color: var(--muted);
            font-size: 13px;
          }
          .report-actions-buttons {
            display: flex;
            gap: 10px;
          }
          .report-action-button {
            border: 0;
            border-radius: 999px;
            padding: 11px 16px;
            font: inherit;
            font-weight: 600;
            cursor: pointer;
            color: #fff;
            background: var(--accent);
          }
          .report-action-button.is-secondary {
            color: var(--ink);
            background: #ebe4d8;
          }
          .report-shell {
            max-width: 1100px;
            margin: 0 auto;
            padding: 32px;
            background: var(--paper);
          }
          .report-header {
            display: grid;
            grid-template-columns: 1.6fr 1fr;
            gap: 24px;
            padding-bottom: 24px;
            border-bottom: 2px solid var(--line);
          }
          .report-kicker {
            display: inline-block;
            margin-bottom: 10px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: var(--accent);
          }
          h1 {
            margin: 0;
            font-size: 34px;
            line-height: 1.08;
          }
          .report-subtitle {
            margin: 12px 0 0;
            color: var(--muted);
            line-height: 1.5;
          }
          .report-meta {
            display: grid;
            gap: 10px;
            padding: 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: var(--panel);
          }
          .report-meta-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 14px;
          }
          .report-meta-row span {
            color: var(--muted);
          }
          .report-grid {
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 24px;
            margin-top: 28px;
          }
          .report-card {
            border: 1px solid var(--line);
            border-radius: 20px;
            padding: 20px;
            background: #fff;
          }
          .report-card h2 {
            margin: 0 0 14px;
            font-size: 22px;
          }
          .report-card p {
            margin: 0 0 18px;
            color: var(--muted);
            line-height: 1.45;
          }
          .report-figure {
            border: 1px solid var(--line);
            border-radius: 16px;
            overflow: hidden;
            background: #f6f2ea;
          }
          .report-figure img,
          .report-figure svg {
            display: block;
            width: 100%;
            height: auto;
          }
          .report-empty-figure {
            display: grid;
            place-items: center;
            min-height: 320px;
            padding: 24px;
            color: var(--muted);
          }
          .report-card-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }
          .report-stat {
            padding: 14px;
            border-radius: 14px;
            background: var(--panel);
            border: 1px solid #ebe4d9;
          }
          .report-stat span {
            display: block;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
          }
          .report-stat strong {
            display: block;
            margin-top: 8px;
            font-size: 24px;
          }
          .report-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .report-list-item {
            padding: 14px 16px;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: #fcfaf7;
          }
          .report-list-item span {
            display: block;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
          }
          .report-list-item strong {
            display: block;
            margin-top: 8px;
            font-size: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          thead th {
            text-align: left;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--muted);
            padding-bottom: 10px;
            border-bottom: 1px solid var(--line);
          }
          tbody td {
            padding: 12px 0;
            border-bottom: 1px solid #ece7dc;
          }
          .report-footer {
            margin-top: 28px;
            padding-top: 18px;
            border-top: 1px solid var(--line);
            color: var(--muted);
            font-size: 12px;
          }
          @media print {
            .report-actions {
              display: none;
            }
            body {
              background: #fff;
            }
            .report-shell {
              max-width: none;
              padding: 0;
            }
            .report-card,
            .report-meta,
            .report-stat,
            .report-list-item,
            .report-figure {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="report-actions">
          <div class="report-actions-copy">
            Exported report for ${escapeHtml(drawingLabel)}. Use Print / Save PDF to create the final file.
          </div>
          <div class="report-actions-buttons">
            <button type="button" class="report-action-button is-secondary" onclick="window.close()">Close</button>
            <button type="button" class="report-action-button" onclick="window.print()">Print / Save PDF</button>
          </div>
        </div>
        <main class="report-shell">
          <header class="report-header">
            <section>
              <span class="report-kicker">Drawing PDF Report</span>
              <h1>${escapeHtml(drawingLabel)}</h1>
              <p class="report-subtitle">
                Professional export of the current drawing, including the live plan capture, two 3D isometric views,
                material counts, and optimisation status.
              </p>
            </section>
            <aside class="report-meta">
              ${buildInfoRow("Company", input.companyName ?? "Local workspace")}
              ${buildInfoRow("Prepared by", input.preparedBy ?? "Unknown user")}
              ${buildInfoRow("Customer", input.customerName.trim() || "Unassigned")}
              ${buildInfoRow("Drawing ID", input.drawingId ?? "Unsaved draft")}
              ${buildInfoRow("Generated", formatTimestamp(input.generatedAtIso))}
              ${buildInfoRow("Status", input.isDirty ? "Unsaved changes present" : "Saved state")}
            </aside>
          </header>

          <section class="report-grid">
            <article class="report-card">
              <span class="report-kicker">View 1</span>
              <h2>Live Canvas Plan</h2>
              <p>The exact canvas view captured at export time, including the current zoom, pan, and on-canvas layout context.</p>
              <div class="report-figure">${canvasMarkup}</div>
            </article>

            <article class="report-card">
              <span class="report-kicker">View 2</span>
              <h2>Primary Isometric View</h2>
              <p>A full 3D isometric drawing view generated from the current fence model and installed features.</p>
              <div class="report-figure">${primaryIsometricSvg}</div>
            </article>
          </section>

          <section class="report-card" style="margin-top: 24px;">
            <span class="report-kicker">View 3</span>
            <h2>Reverse Isometric View</h2>
            <p>A second 3D isometric angle for clearer review of gates, panel faces, and perimeter depth.</p>
            <div class="report-figure">${secondaryIsometricSvg}</div>
          </section>

          <section class="report-card" style="margin-top: 24px;">
            <span class="report-kicker">Project Summary</span>
            <h2>Drawing Snapshot</h2>
            <div class="report-card-grid">
              ${summaryCards
                .map(
                  (item) => `
                    <article class="report-stat">
                      <span>${escapeHtml(item.label)}</span>
                      <strong>${escapeHtml(item.value)}</strong>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>

          <section class="report-grid">
            <article class="report-card">
              <span class="report-kicker">Optimisation</span>
              <h2>Reuse and Stock Planning</h2>
              <div class="report-list">
                ${scheduleRows
                  .map(
                    (item) => `
                      <article class="report-list-item">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.value)}</strong>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </article>

            <article class="report-card">
              <span class="report-kicker">Notes</span>
              <h2>Export Context</h2>
              <p>
                This report captures the current editor state. If the drawing still has unsaved changes, the PDF may not
                match the last saved drawing record on the server.
              </p>
              <p>
                Optimisation values reflect the live chained cut planner, including the configured reuse allowance of
                ${formatLengthMm(input.estimate.optimization.twinBar.reuseAllowanceMm)}.
              </p>
            </article>
          </section>

          <section class="report-card" style="margin-top: 24px;">
            <span class="report-kicker">Segment Schedule</span>
            <h2>Fence Runs</h2>
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Length</th>
                  <th>Panels</th>
                  <th>Intermediate posts</th>
                  <th>Bays</th>
                </tr>
              </thead>
              <tbody>
                ${buildSegmentTableRows(input)}
              </tbody>
            </table>
          </section>

          <footer class="report-footer">
            Generated by Fence Estimator. Use the print action to save this report as a PDF from the browser dialog.
          </footer>
        </main>
        <script>
          window.addEventListener("load", () => {
            document.title = ${JSON.stringify(fileName)};
            const currentUrl = window.location.href;
            window.setTimeout(() => {
              if (currentUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
                URL.revokeObjectURL(currentUrl);
              }
            }, 60000);
          });
        </script>
      </body>
    </html>
  `.trim();
}

export function exportDrawingPdfReport(input: DrawingPdfReportInput): boolean {
  const reportHtml = buildDrawingPdfReportHtml(input);
  const reportBlob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
  const reportUrl = URL.createObjectURL(reportBlob);
  const reportWindow = window.open(reportUrl, "_blank");
  if (!reportWindow) {
    URL.revokeObjectURL(reportUrl);
    return false;
  }

  return true;
}

export function buildDrawingPdfFileName(drawingTitle: string): string {
  return `${buildFileSafeSlug(drawingTitle)}-report.pdf`;
}

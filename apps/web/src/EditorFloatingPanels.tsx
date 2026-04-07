import { useState } from "react";

import type { HeightCountRow, HeightLabelCountRow } from "./editor/types.js";

interface TwinBarFenceRow {
  height: string;
  standard: number;
  superRebound: number;
}

interface PostTypeCounts {
  END: number;
  INTERMEDIATE: number;
  CORNER: number;
  JUNCTION: number;
  INLINE_JOIN: number;
  GATE: number;
}

interface EditorFloatingPanelsProps {
  isItemCountsVisible: boolean;
  isPostKeyVisible: boolean;
  postRowsByType: {
    end: HeightCountRow[];
    intermediate: HeightCountRow[];
    corner: HeightCountRow[];
    junction: HeightCountRow[];
    inlineJoin: HeightCountRow[];
  };
  gateCounts: {
    total: number;
    single: number;
    double: number;
    custom: number;
  };
  gateCountsByHeight: {
    single: HeightLabelCountRow[];
    double: HeightLabelCountRow[];
    custom: HeightLabelCountRow[];
  };
  basketballPostCountsByHeight: HeightLabelCountRow[];
  floodlightColumnCountsByHeight: HeightLabelCountRow[];
  twinBarFenceRows: TwinBarFenceRow[];
  featureCounts: {
    goalUnits: number;
    kickboards: number;
    pitchDividers: number;
    sideNettings: number;
  };
  featureRowsByKind: {
    goalUnits: Array<{ label: string; value: string }>;
    kickboards: Array<{ label: string; value: string }>;
    pitchDividers: Array<{ label: string; value: string }>;
    sideNettings: Array<{ label: string; value: string }>;
  };
  postTypeCounts: PostTypeCounts;
  panelCount: number;
  fenceRunCount: number;
  formatHeightLabelFromMm: (value: number) => string;
  onToggleItemCounts: () => void;
  onTogglePostKey: () => void;
}

function FloatingMiniMetric(props: { label: string; value: number }) {
  return (
    <div className="float-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function CountList(props: {
  rows: Array<{ label: string; value: string | number }>;
  empty: string;
}) {
  if (props.rows.length === 0) {
    return <p className="float-muted">{props.empty}</p>;
  }
  return (
    <dl className="float-count-list">
      {props.rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EditorFloatingPanels({
  isItemCountsVisible,
  isPostKeyVisible,
  postRowsByType,
  gateCounts,
  gateCountsByHeight,
  basketballPostCountsByHeight,
  floodlightColumnCountsByHeight,
  twinBarFenceRows,
  featureCounts,
  featureRowsByKind,
  postTypeCounts,
  panelCount,
  fenceRunCount,
  formatHeightLabelFromMm,
  onToggleItemCounts,
  onTogglePostKey
}: EditorFloatingPanelsProps) {
  const [isItemsExpanded, setIsItemsExpanded] = useState(false);
  const totalPostCount =
    postTypeCounts.END +
    postTypeCounts.INTERMEDIATE +
    postTypeCounts.CORNER +
    postTypeCounts.JUNCTION +
    postTypeCounts.INLINE_JOIN +
    postTypeCounts.GATE;
  const basketballPostCount = basketballPostCountsByHeight.reduce((sum, row) => sum + row.count, 0);
  const floodlightColumnCount = floodlightColumnCountsByHeight.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      {/* ── Floating Item Counts ── */}
      {isItemCountsVisible ? (
        <div className="floating-panel floating-item-counts">
          <div className="floating-panel-header">
            <span className="floating-panel-title">Item Counts</span>
            <button type="button" className="floating-panel-close" onClick={onToggleItemCounts} title="Hide">×</button>
          </div>
          <div className="float-metrics-grid">
            <FloatingMiniMetric label="Posts" value={totalPostCount} />
            <FloatingMiniMetric label="Gates" value={gateCounts.total} />
            <FloatingMiniMetric label="BB Posts" value={basketballPostCount} />
            <FloatingMiniMetric label="Floodlights" value={floodlightColumnCount} />
            <FloatingMiniMetric label="Goal Units" value={featureCounts.goalUnits} />
            <FloatingMiniMetric label="KB Boards" value={featureCounts.kickboards} />
            <FloatingMiniMetric label="Dividers" value={featureCounts.pitchDividers} />
            <FloatingMiniMetric label="Netting m2" value={featureCounts.sideNettings} />
            <FloatingMiniMetric label="Panels" value={panelCount} />
            <FloatingMiniMetric label="Runs" value={fenceRunCount} />
          </div>
          <button
            type="button"
            className="floating-panel-toggle"
            onClick={() => setIsItemsExpanded((current) => !current)}
          >
            {isItemsExpanded ? "Hide detail" : "Detail"}
          </button>
          {isItemsExpanded ? (
            <div className="float-detail-groups">
              <div className="float-count-group">
                <h4>Posts By Type</h4>
                <CountList
                  empty="No posts placed."
                  rows={[
                    { label: "End", value: postTypeCounts.END },
                    { label: "Intermediate", value: postTypeCounts.INTERMEDIATE },
                    { label: "Corner", value: postTypeCounts.CORNER },
                    { label: "Junction", value: postTypeCounts.JUNCTION },
                    { label: "Inline Join", value: postTypeCounts.INLINE_JOIN },
                    { label: "Gate", value: postTypeCounts.GATE }
                  ].filter((row) => row.value > 0)}
                />
              </div>
              <div className="float-count-group">
                <h4>End Posts</h4>
                <CountList empty="None" rows={postRowsByType.end.map((r) => ({ label: formatHeightLabelFromMm(r.heightMm), value: r.count }))} />
              </div>
              <div className="float-count-group">
                <h4>Intermediate Posts</h4>
                <CountList empty="None" rows={postRowsByType.intermediate.map((r) => ({ label: formatHeightLabelFromMm(r.heightMm), value: r.count }))} />
              </div>
              <div className="float-count-group">
                <h4>Corners / Junctions</h4>
                <CountList
                  empty="None"
                  rows={[
                    ...postRowsByType.corner.map((r) => ({ label: `Corner ${formatHeightLabelFromMm(r.heightMm)}`, value: r.count })),
                    ...postRowsByType.junction.map((r) => ({ label: `Junction ${formatHeightLabelFromMm(r.heightMm)}`, value: r.count })),
                    ...postRowsByType.inlineJoin.map((r) => ({ label: `Inline ${formatHeightLabelFromMm(r.heightMm)}`, value: r.count }))
                  ]}
                />
              </div>
              <div className="float-count-group">
                <h4>Gates</h4>
                <CountList
                  empty="No gates."
                  rows={[
                    { label: "Total", value: gateCounts.total },
                    ...gateCountsByHeight.single.map((r) => ({ label: `Single leaf ${r.height}`, value: r.count })),
                    ...gateCountsByHeight.double.map((r) => ({ label: `Double leaf ${r.height}`, value: r.count })),
                    ...gateCountsByHeight.custom.map((r) => ({ label: `Custom ${r.height}`, value: r.count }))
                  ].filter((r) => r.value > 0)}
                />
              </div>
              <div className="float-count-group">
                <h4>Basketball Posts</h4>
                <CountList empty="None" rows={[
                  { label: "Total", value: basketballPostCount },
                  ...basketballPostCountsByHeight.map((r) => ({ label: r.height, value: r.count }))
                ].filter((r) => r.value > 0)} />
              </div>
              <div className="float-count-group">
                <h4>Floodlight Columns</h4>
                <CountList empty="None" rows={[
                  { label: "Total", value: floodlightColumnCount },
                  ...floodlightColumnCountsByHeight.map((r) => ({ label: r.height, value: r.count }))
                ].filter((r) => r.value > 0)} />
              </div>
              <div className="float-count-group">
                <h4>Goal Units</h4>
                <CountList empty="None" rows={featureRowsByKind.goalUnits} />
              </div>
              <div className="float-count-group">
                <h4>Kickboards</h4>
                <CountList empty="None" rows={featureRowsByKind.kickboards} />
              </div>
              <div className="float-count-group">
                <h4>Pitch Dividers</h4>
                <CountList empty="None" rows={featureRowsByKind.pitchDividers} />
              </div>
              <div className="float-count-group">
                <h4>Side Netting</h4>
                <CountList empty="None" rows={featureRowsByKind.sideNettings} />
              </div>
              <div className="float-count-group">
                <h4>Fence Heights (Std / SR)</h4>
                <CountList
                  empty="No twin bar fence."
                  rows={twinBarFenceRows.map((r) => ({ label: r.height, value: `${r.standard} / ${r.superRebound}` }))}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Floating Post Key ── */}
      {isPostKeyVisible ? (
        <div className="floating-panel floating-post-key">
          <div className="floating-panel-header">
            <span className="floating-panel-title">Post Key</span>
            <button type="button" className="floating-panel-close" onClick={onTogglePostKey} title="Hide">×</button>
          </div>
          <div className="post-key-compact">
            <div className="post-key-row">
              <span className="post-icon post-end" />
              <span>End</span>
              <strong>{postTypeCounts.END}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-intermediate" />
              <span>Intermediate</span>
              <strong>{postTypeCounts.INTERMEDIATE}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-corner" />
              <span>Corner</span>
              <strong>{postTypeCounts.CORNER}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-junction" />
              <span>Junction</span>
              <strong>{postTypeCounts.JUNCTION}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-inline-join" />
              <span>Inline</span>
              <strong>{postTypeCounts.INLINE_JOIN}</strong>
            </div>
            <div className="post-key-row">
              <span className="post-icon post-gate" />
              <span>Gate</span>
              <strong>{postTypeCounts.GATE}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

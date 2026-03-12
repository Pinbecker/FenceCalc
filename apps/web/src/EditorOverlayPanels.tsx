interface HeightCountRow {
  heightMm: number;
  count: number;
}

interface HeightLabelCountRow {
  height: string;
  count: number;
}

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

interface EditorOverlayPanelsProps {
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
  gateCountsByHeight: HeightLabelCountRow[];
  twinBarFenceRows: TwinBarFenceRow[];
  postTypeCounts: PostTypeCounts;
  panelCount: number;
  fenceRunCount: number;
  isTutorialOpen: boolean;
  onOpenTutorial: () => void;
  onCloseTutorial: () => void;
  formatHeightLabelFromMm: (value: number) => string;
}

function CountList(props: {
  rows: Array<{ label: string; value: string | number }>;
  empty: string;
}) {
  if (props.rows.length === 0) {
    return <p className="muted-line">{props.empty}</p>;
  }

  return (
    <dl className="dense-list">
      {props.rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EditorOverlayPanels({
  postRowsByType,
  gateCounts,
  gateCountsByHeight,
  twinBarFenceRows,
  postTypeCounts,
  panelCount,
  fenceRunCount,
  isTutorialOpen,
  onOpenTutorial,
  onCloseTutorial,
  formatHeightLabelFromMm
}: EditorOverlayPanelsProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const totalPostCount =
    postTypeCounts.END +
    postTypeCounts.INTERMEDIATE +
    postTypeCounts.CORNER +
    postTypeCounts.JUNCTION +
    postTypeCounts.INLINE_JOIN +
    postTypeCounts.GATE;

  return (
    <>
      <section className="panel-block editor-summary-panel">
        <div className="panel-heading">
          <div>
            <h2>Item Counts</h2>
            <p className="muted-line">Keep the quick totals visible and open the full breakdown only when you need it.</p>
          </div>
          <button
            type="button"
            className="ghost editor-link-btn"
            onClick={() => setIsBreakdownOpen((current) => !current)}
          >
            {isBreakdownOpen ? "Hide Detail" : "Show Detail"}
          </button>
        </div>

        <div className="editor-summary-metrics">
          <article className="editor-summary-metric">
            <span>Posts</span>
            <strong>{totalPostCount}</strong>
          </article>
          <article className="editor-summary-metric">
            <span>Gates</span>
            <strong>{gateCounts.total}</strong>
          </article>
          <article className="editor-summary-metric">
            <span>Panels</span>
            <strong>{panelCount}</strong>
          </article>
          <article className="editor-summary-metric">
            <span>Fence Runs</span>
            <strong>{fenceRunCount}</strong>
          </article>
        </div>

        <div className={`editor-summary-breakdown${isBreakdownOpen ? " is-open" : ""}`}>
          <div className="editor-summary-breakdown-inner">
            <div className="editor-summary-groups">
              <div className="count-group">
                <h3>Posts By Type</h3>
                <CountList
                  empty="No posts placed."
                  rows={[
                    { label: "End Posts", value: postTypeCounts.END },
                    { label: "Intermediate Posts", value: postTypeCounts.INTERMEDIATE },
                    { label: "Corner Posts", value: postTypeCounts.CORNER },
                    { label: "Junction Posts", value: postTypeCounts.JUNCTION },
                    { label: "Inline Join Posts", value: postTypeCounts.INLINE_JOIN },
                    { label: "Gate Posts", value: postTypeCounts.GATE }
                  ].filter((row) => row.value > 0)}
                />
              </div>

              <div className="count-group">
                <h3>End Posts</h3>
                <CountList
                  empty="No end posts."
                  rows={postRowsByType.end.map((row) => ({
                    label: formatHeightLabelFromMm(row.heightMm),
                    value: row.count
                  }))}
                />
              </div>

              <div className="count-group">
                <h3>Intermediate Posts</h3>
                <CountList
                  empty="No intermediate posts."
                  rows={postRowsByType.intermediate.map((row) => ({
                    label: formatHeightLabelFromMm(row.heightMm),
                    value: row.count
                  }))}
                />
              </div>

              <div className="count-group">
                <h3>Corners And Junctions</h3>
                <CountList
                  empty="No corner or junction posts."
                  rows={[
                    ...postRowsByType.corner.map((row) => ({
                      label: `Corner ${formatHeightLabelFromMm(row.heightMm)}`,
                      value: row.count
                    })),
                    ...postRowsByType.junction.map((row) => ({
                      label: `Junction ${formatHeightLabelFromMm(row.heightMm)}`,
                      value: row.count
                    })),
                    ...postRowsByType.inlineJoin.map((row) => ({
                      label: `Inline ${formatHeightLabelFromMm(row.heightMm)}`,
                      value: row.count
                    }))
                  ]}
                />
              </div>

              <div className="count-group">
                <h3>Gates</h3>
                <CountList
                  empty="No gates placed."
                  rows={[
                    { label: "Total", value: gateCounts.total },
                    { label: "Single Leaf", value: gateCounts.single },
                    { label: "Double Leaf", value: gateCounts.double },
                    { label: "Custom", value: gateCounts.custom },
                    ...gateCountsByHeight.map((row) => ({
                      label: row.height,
                      value: row.count
                    }))
                  ].filter((row) => row.value > 0)}
                />
              </div>

              <div className="count-group">
                <h3>Fence Heights (Std / SR)</h3>
                <CountList
                  empty="No twin bar fence runs yet."
                  rows={twinBarFenceRows.map((row) => ({
                    label: row.height,
                    value: `${row.standard} / ${row.superRebound}`
                  }))}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel-block editor-summary-panel">
        <div className="panel-heading">
          <div>
            <h2>Post Key</h2>
            <p className="muted-line">Match the canvas markers to the material count summary.</p>
          </div>
        </div>
        <div className="post-key">
          <div className="post-key-row">
            <span className="post-icon post-end" />
            <span>End Post</span>
            <strong>{postTypeCounts.END}</strong>
          </div>
          <div className="post-key-row">
            <span className="post-icon post-intermediate" />
            <span>Intermediate Post</span>
            <strong>{postTypeCounts.INTERMEDIATE}</strong>
          </div>
          <div className="post-key-row">
            <span className="post-icon post-corner" />
            <span>Corner Post</span>
            <strong>{postTypeCounts.CORNER}</strong>
          </div>
          <div className="post-key-row">
            <span className="post-icon post-junction" />
            <span>Junction Post</span>
            <strong>{postTypeCounts.JUNCTION}</strong>
          </div>
          <div className="post-key-row">
            <span className="post-icon post-inline-join" />
            <span>Inline Join Post</span>
            <strong>{postTypeCounts.INLINE_JOIN}</strong>
          </div>
          <div className="post-key-row">
            <span className="post-icon post-gate" />
            <span>Gate Post</span>
            <strong>{postTypeCounts.GATE}</strong>
          </div>
        </div>
      </section>

      <section className="panel-block editor-help-panel">
        <div className="panel-heading">
          <div>
            <h2>Workflow Guide</h2>
            <p className="muted-line">Keep the core shortcuts and drawing modes within reach.</p>
          </div>
          <button
            type="button"
            className="ghost editor-link-btn"
            onClick={isTutorialOpen ? onCloseTutorial : onOpenTutorial}
          >
            {isTutorialOpen ? "Hide" : "Show"}
          </button>
        </div>
        {isTutorialOpen ? (
          <ul className="editor-help-list">
            <li>Draw mode chains fence segments with each click.</li>
            <li>Select mode lets you edit lengths, drag runs, and adjust gates.</li>
            <li>Rectangle mode lays out a perimeter from two corners.</li>
            <li>Recess and gate modes preview openings before placement.</li>
            <li>Right click cancels an active draw chain.</li>
            <li>Hold Shift to disable angle snapping and Space to pan.</li>
            <li>Open the cut planner when you want to review panel reuse.</li>
          </ul>
        ) : (
          <p className="muted-line">Open the guide when you need a quick refresher on drawing, snapping, and planner flow.</p>
        )}
      </section>
    </>
  );
}
import { useState } from "react";

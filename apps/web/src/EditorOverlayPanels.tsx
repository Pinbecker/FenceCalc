import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";

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
  isTutorialOpen: boolean;
  onOpenTutorial: () => void;
  onCloseTutorial: () => void;
  onStartItemCountsDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartPostKeyDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStartTutorialDrag: (event: ReactMouseEvent<HTMLDivElement>) => void;
  itemCountsStyle: CSSProperties;
  postKeyStyle: CSSProperties;
  tutorialStyle: CSSProperties;
  formatHeightLabelFromMm: (value: number) => string;
}

export function EditorOverlayPanels({
  postRowsByType,
  gateCounts,
  gateCountsByHeight,
  twinBarFenceRows,
  postTypeCounts,
  isTutorialOpen,
  onOpenTutorial,
  onCloseTutorial,
  onStartItemCountsDrag,
  onStartPostKeyDrag,
  onStartTutorialDrag,
  itemCountsStyle,
  postKeyStyle,
  tutorialStyle,
  formatHeightLabelFromMm
}: EditorOverlayPanelsProps) {
  return (
    <>
      <section className="panel-block panel-item-counts" style={itemCountsStyle}>
        <div className="panel-heading panel-drag-handle" onMouseDown={onStartItemCountsDrag}>
          <h2>Item Counts</h2>
        </div>
        <div className="count-group">
          <h3>End Posts</h3>
          {postRowsByType.end.length === 0 ? (
            <p className="muted-line">No end posts.</p>
          ) : (
            <dl className="dense-list">
              {postRowsByType.end.map((row) => (
                <div key={`end-${row.heightMm}`}>
                  <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                  <dd>{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="count-group">
          <h3>Intermediate Posts</h3>
          {postRowsByType.intermediate.length === 0 ? (
            <p className="muted-line">No intermediate posts.</p>
          ) : (
            <dl className="dense-list">
              {postRowsByType.intermediate.map((row) => (
                <div key={`intermediate-${row.heightMm}`}>
                  <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                  <dd>{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="count-group">
          <h3>Corner Posts</h3>
          {postRowsByType.corner.length === 0 ? (
            <p className="muted-line">No corner posts.</p>
          ) : (
            <dl className="dense-list">
              {postRowsByType.corner.map((row) => (
                <div key={`corner-${row.heightMm}`}>
                  <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                  <dd>{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="count-group">
          <h3>Junction Posts</h3>
          {postRowsByType.junction.length === 0 ? (
            <p className="muted-line">No junction posts.</p>
          ) : (
            <dl className="dense-list">
              {postRowsByType.junction.map((row) => (
                <div key={`junction-${row.heightMm}`}>
                  <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                  <dd>{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="count-group">
          <h3>Inline Join Posts</h3>
          {postRowsByType.inlineJoin.length === 0 ? (
            <p className="muted-line">No inline join posts.</p>
          ) : (
            <dl className="dense-list">
              {postRowsByType.inlineJoin.map((row) => (
                <div key={`inline-${row.heightMm}`}>
                  <dt>{formatHeightLabelFromMm(row.heightMm)}</dt>
                  <dd>{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="count-group">
          <h3>Gates</h3>
          {gateCounts.total === 0 ? (
            <p className="muted-line">No gates placed.</p>
          ) : (
            <>
              <dl className="dense-list">
                <div>
                  <dt>Total</dt>
                  <dd>{gateCounts.total}</dd>
                </div>
                <div>
                  <dt>Single Leaf</dt>
                  <dd>{gateCounts.single}</dd>
                </div>
                <div>
                  <dt>Double Leaf</dt>
                  <dd>{gateCounts.double}</dd>
                </div>
                <div>
                  <dt>Custom</dt>
                  <dd>{gateCounts.custom}</dd>
                </div>
              </dl>
              <dl className="dense-list">
                {gateCountsByHeight.map((row) => (
                  <div key={`gate-height-${row.height}`}>
                    <dt>{row.height}</dt>
                    <dd>{row.count}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        <div className="count-group">
          <h3>Fence Heights (Std / SR)</h3>
          {twinBarFenceRows.length === 0 ? (
            <p className="muted-line">No twin bar fence runs yet.</p>
          ) : (
            <dl className="dense-list">
              {twinBarFenceRows.map((row) => (
                <div key={row.height}>
                  <dt>{row.height}</dt>
                  <dd>
                    {row.standard} / {row.superRebound}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="panel-block panel-post-key" style={postKeyStyle}>
        <div className="panel-heading panel-drag-handle" onMouseDown={onStartPostKeyDrag}>
          <h2>Post Key</h2>
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

      {!isTutorialOpen ? (
        <button type="button" className="tutorial-launch" onClick={onOpenTutorial}>
          Tutorial
        </button>
      ) : null}

      {isTutorialOpen ? (
        <section className="panel-block panel-tutorial" style={tutorialStyle}>
          <div className="panel-heading panel-drag-handle" onMouseDown={onStartTutorialDrag}>
            <h2>Tutorial</h2>
            <button type="button" className="panel-close" onMouseDown={(event) => event.stopPropagation()} onClick={onCloseTutorial}>
              x
            </button>
          </div>
          <ul>
            <li>Mode Draw: left click start/commit fence line.</li>
            <li>Mode Select: click line to select and edit.</li>
            <li>Mode Rect: click two corners to draw a rectangle perimeter.</li>
            <li>Mode Recess: hover line and click to insert recess.</li>
            <li>Mode Gate: hover line and click to insert a gate object.</li>
            <li>Right click cancels active draw chain.</li>
            <li>Hold Shift to disable angle snapping.</li>
            <li>Horizontal/vertical guide lines help match terminations.</li>
            <li>Middle drag or Space + drag to pan.</li>
            <li>Open Cut Planner after drawing to review stock-panel plans and reuse steps.</li>
          </ul>
        </section>
      ) : null}
    </>
  );
}

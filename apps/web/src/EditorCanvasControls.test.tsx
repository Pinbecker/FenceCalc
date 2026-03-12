import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorCanvasControls } from "./EditorCanvasControls.js";

describe("EditorCanvasControls", () => {
  it("renders core canvas actions", () => {
    const html = renderToStaticMarkup(
      <EditorCanvasControls
        canUndo
        canRedo={false}
        canDeleteSelection
        canFinishInteraction
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onResetView={vi.fn()}
        onFinishInteraction={vi.fn()}
        onDeleteSelection={vi.fn()}
        onClearLayout={vi.fn()}
      />,
    );

    expect(html).toContain("Undo");
    expect(html).toContain("Ctrl+Z");
    expect(html).toContain("Zoom In");
    expect(html).toContain("Finish");
    expect(html).toContain('title="Undo"');
    expect(html).toContain('title="Clear Layout"');
  });
});

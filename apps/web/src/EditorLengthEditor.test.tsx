import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorLengthEditor } from "./EditorLengthEditor.js";

describe("EditorLengthEditor", () => {
  it("renders nothing when closed", () => {
    expect(
      renderToStaticMarkup(
        <EditorLengthEditor
          isOpen={false}
          selectedComponentClosed={false}
          selectedLengthInputM="3.00"
          inputStepM={0.05}
          onChangeLength={vi.fn()}
          onApply={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    ).toBe("");
  });

  it("renders the open-state controls and closed-loop guidance", () => {
    const html = renderToStaticMarkup(
      <EditorLengthEditor
        isOpen
        selectedComponentClosed
        selectedLengthInputM="3.50"
        inputStepM={0.05}
        onChangeLength={vi.fn()}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html).toContain("Edit Segment Length");
    expect(html).toContain("Length (m)");
    expect(html).toContain("3.50");
    expect(html).toContain("Closed perimeter: matching parallel spans update as a rigid body.");
    expect(html).toContain("Apply Length");
    expect(html).toContain("Cancel");
  });
});

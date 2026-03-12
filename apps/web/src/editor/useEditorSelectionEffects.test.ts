import { afterEach, describe, expect, it, vi } from "vitest";

describe("useEditorSelectionEffects", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
  });

  it("clears dependent editor state when the segment, gate, or plan selection becomes invalid", async () => {
    vi.doMock("react", () => ({
      useEffect: (effect: () => void) => effect()
    }));

    const { useEditorSelectionEffects } = await import("./useEditorSelectionEffects.js");
    const setSelectedGateId = vi.fn();
    const setActiveGateDrag = vi.fn();
    const setIsLengthEditorOpen = vi.fn();
    const setSelectedLengthInputM = vi.fn();
    const setSelectedPlanId = vi.fn();

    useEditorSelectionEffects({
      selectedSegment: null,
      selectedGateId: "gate-1",
      selectedPlanId: "missing-plan",
      hasSelectedGate: false,
      highlightablePlanIds: ["plan-1", "plan-2"],
      setSelectedGateId,
      setActiveGateDrag,
      setIsLengthEditorOpen,
      setSelectedLengthInputM,
      setSelectedPlanId
    });

    expect(setIsLengthEditorOpen).toHaveBeenCalledWith(false);
    expect(setSelectedLengthInputM).toHaveBeenCalledWith("");
    expect(setSelectedGateId).toHaveBeenCalledWith(null);
    expect(setActiveGateDrag).toHaveBeenCalledWith(null);
    expect(setSelectedPlanId).toHaveBeenCalledWith("plan-1");
  });

  it("derives the selected length input and clears plans when none are available", async () => {
    vi.doMock("react", () => ({
      useEffect: (effect: () => void) => effect()
    }));

    const { useEditorSelectionEffects } = await import("./useEditorSelectionEffects.js");
    const setSelectedGateId = vi.fn();
    const setActiveGateDrag = vi.fn();
    const setIsLengthEditorOpen = vi.fn();
    const setSelectedLengthInputM = vi.fn();
    const setSelectedPlanId = vi.fn();

    useEditorSelectionEffects({
      selectedSegment: {
        id: "segment-1",
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 4000 },
        spec: { system: "TWIN_BAR", height: "2m" }
      },
      selectedGateId: "gate-1",
      selectedPlanId: "plan-1",
      hasSelectedGate: true,
      highlightablePlanIds: [],
      setSelectedGateId,
      setActiveGateDrag,
      setIsLengthEditorOpen,
      setSelectedLengthInputM,
      setSelectedPlanId
    });

    expect(setSelectedLengthInputM).toHaveBeenCalledWith("5.00");
    expect(setSelectedPlanId).toHaveBeenCalledWith(null);
    expect(setSelectedGateId).not.toHaveBeenCalled();
    expect(setActiveGateDrag).not.toHaveBeenCalled();
    expect(setIsLengthEditorOpen).not.toHaveBeenCalled();
  });
});

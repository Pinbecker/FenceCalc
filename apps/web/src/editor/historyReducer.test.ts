import { describe, expect, it } from "vitest";

import type { HistoryState } from "./types.js";
import { historyReducer } from "./editorMath.js";

const baseSegment = {
  id: "segment-1",
  start: { x: 0, y: 0 },
  end: { x: 1000, y: 0 },
  spec: { system: "TWIN_BAR" as const, height: "2m" as const }
};

describe("historyReducer", () => {
  it("tracks gate-only changes in undo and redo history", () => {
    const initialState: HistoryState = {
      past: [],
      present: {
        segments: [baseSegment],
        gates: [],
        basketballPosts: []
      },
      future: []
    };

    const withGate = historyReducer(initialState, {
      type: "APPLY",
      updater: (layout) => ({
        ...layout,
        gates: [
          {
            id: "gate-1",
            segmentId: "segment-1",
            startOffsetMm: 200,
            endOffsetMm: 400,
            gateType: "SINGLE_LEAF"
          }
        ]
      })
    });

    expect(withGate.present.gates).toHaveLength(1);
    expect(withGate.past).toHaveLength(1);

    const undone = historyReducer(withGate, { type: "UNDO" });
    expect(undone.present.gates).toEqual([]);
    expect(undone.future).toHaveLength(1);

    const redone = historyReducer(undone, { type: "REDO" });
    expect(redone.present.gates).toHaveLength(1);
  });

  it("tracks basketball-post-only changes in undo and redo history", () => {
    const initialState: HistoryState = {
      past: [],
      present: {
        segments: [baseSegment],
        gates: [],
        basketballPosts: []
      },
      future: []
    };

    const withBasketballPost = historyReducer(initialState, {
      type: "APPLY",
      updater: (layout) => ({
        ...layout,
        basketballPosts: [
          {
            id: "post-1",
            segmentId: "segment-1",
            offsetMm: 350,
            facing: "LEFT"
          }
        ]
      })
    });

    expect(withBasketballPost.present.basketballPosts).toHaveLength(1);
    expect(withBasketballPost.past).toHaveLength(1);

    const undone = historyReducer(withBasketballPost, { type: "UNDO" });
    expect(undone.present.basketballPosts).toEqual([]);
    expect(undone.future).toHaveLength(1);

    const redone = historyReducer(undone, { type: "REDO" });
    expect(redone.present.basketballPosts).toHaveLength(1);
  });

  it("resets history when loading a new document", () => {
    const dirtyState: HistoryState = {
      past: [
        {
          segments: [],
          gates: [],
          basketballPosts: []
        }
      ],
      present: {
        segments: [baseSegment],
        gates: [],
        basketballPosts: []
      },
      future: [
        {
          segments: [baseSegment],
          gates: [
            {
              id: "gate-1",
              segmentId: "segment-1",
              startOffsetMm: 200,
              endOffsetMm: 400,
              gateType: "SINGLE_LEAF"
            }
          ]
        }
      ]
    };

    const reset = historyReducer(dirtyState, {
      type: "RESET",
      layout: {
        segments: [],
        gates: [],
        basketballPosts: []
      }
    });

    expect(reset.past).toEqual([]);
    expect(reset.future).toEqual([]);
    expect(reset.present).toEqual({ segments: [], gates: [], basketballPosts: [] });
  });
});

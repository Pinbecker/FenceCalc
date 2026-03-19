import { describe, expect, it } from "vitest";

import type { HistoryState } from "./types.js";
import { historyReducer } from "./editorMath.js";

const baseSegment = {
  id: "segment-1",
  start: { x: 0, y: 0 },
  end: { x: 1000, y: 0 },
  spec: { system: "TWIN_BAR" as const, height: "2m" as const }
};

function buildEmptyLayout() {
  return {
    segments: [baseSegment],
    gates: [],
    basketballPosts: [],
    floodlightColumns: [],
    goalUnits: [],
    kickboards: [],
    pitchDividers: [],
    sideNettings: []
  };
}

describe("historyReducer", () => {
  it("tracks gate-only changes in undo and redo history", () => {
    const initialState: HistoryState = {
      past: [],
      present: buildEmptyLayout(),
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
      present: buildEmptyLayout(),
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
        { ...buildEmptyLayout(), segments: [] }
      ],
      present: buildEmptyLayout(),
      future: [
        {
          ...buildEmptyLayout(),
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
        basketballPosts: [],
        floodlightColumns: [],
        goalUnits: [],
        kickboards: [],
        pitchDividers: [],
        sideNettings: []
      }
    });

    expect(reset.past).toEqual([]);
    expect(reset.future).toEqual([]);
    expect(reset.present).toEqual({
      segments: [],
      gates: [],
      basketballPosts: [],
      floodlightColumns: [],
      goalUnits: [],
      kickboards: [],
      pitchDividers: [],
      sideNettings: []
    });
  });

  it("tracks goal-unit-only changes in undo and redo history", () => {
    const initialState: HistoryState = {
      past: [],
      present: buildEmptyLayout(),
      future: []
    };

    const withGoalUnit = historyReducer(initialState, {
      type: "APPLY",
      updater: (layout) => ({
        ...layout,
        goalUnits: [
          {
            id: "goal-1",
            segmentId: "segment-1",
            centerOffsetMm: 500,
            side: "LEFT",
            widthMm: 3000,
            depthMm: 1200,
            goalHeightMm: 3000
          }
        ]
      })
    });

    expect(withGoalUnit.present.goalUnits).toHaveLength(1);
    expect(withGoalUnit.past).toHaveLength(1);

    const undone = historyReducer(withGoalUnit, { type: "UNDO" });
    expect(undone.present.goalUnits).toEqual([]);

    const redone = historyReducer(undone, { type: "REDO" });
    expect(redone.present.goalUnits).toHaveLength(1);
  });

  it("tracks kickboards, pitch dividers, and side netting as layout changes", () => {
    const initialState: HistoryState = {
      past: [],
      present: {
        ...buildEmptyLayout(),
        segments: [
          baseSegment,
          {
            ...baseSegment,
            id: "segment-2",
            start: { x: 0, y: 4000 },
            end: { x: 1000, y: 4000 }
          }
        ]
      },
      future: []
    };

    const withAttachments = historyReducer(initialState, {
      type: "APPLY",
      updater: (layout) => ({
        ...layout,
        kickboards: [
          {
            id: "kick-1",
            segmentId: "segment-1",
            sectionHeightMm: 200,
            thicknessMm: 50,
            profile: "SQUARE",
            boardLengthMm: 2500
          }
        ],
        pitchDividers: [
          {
            id: "divider-1",
            startAnchor: { segmentId: "segment-1", offsetMm: 250 },
            endAnchor: { segmentId: "segment-2", offsetMm: 250 }
          }
        ],
        sideNettings: [
          {
            id: "net-1",
            segmentId: "segment-1",
            additionalHeightMm: 2000,
            startOffsetMm: 100,
            endOffsetMm: 900,
            extendedPostInterval: 3
          }
        ]
      })
    });

    expect(withAttachments.present.kickboards).toHaveLength(1);
    expect(withAttachments.present.pitchDividers).toHaveLength(1);
    expect(withAttachments.present.sideNettings).toHaveLength(1);
    expect(withAttachments.past).toHaveLength(1);
  });
});

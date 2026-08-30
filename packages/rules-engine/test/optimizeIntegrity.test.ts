import type { LayoutModel } from "@fence-estimator/contracts";
import { describe, expect, it } from "vitest";

import { buildOptimizationSummary } from "../src/optimize.js";

describe("panel cut plan integrity", () => {
  it("maintains stock accounting across generated layouts", () => {
    let seed = 0xc0ffee;
    const random = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let iteration = 0; iteration < 250; iteration += 1) {
      const segmentCount = 1 + Math.floor(random() * 14);
      const layout: LayoutModel = {
        segments: Array.from({ length: segmentCount }, (_, index) => {
          const length = 100 + Math.round(random() * 14900);
          return {
            id: `line-${index}`,
            start: { x: 0, y: index * 1000 },
            end: { x: length, y: index * 1000 },
            spec: {
              system: "TWIN_BAR" as const,
              height: random() > 0.3 ? ("2m" as const) : ("3m" as const),
              twinBarVariant: random() > 0.2 ? ("STANDARD" as const) : ("SUPER_REBOUND" as const),
            },
          };
        }),
      };
      const summary = buildOptimizationSummary(layout);

      expect(summary.twinBar.stockPanelsOpened).toBeLessThanOrEqual(
        summary.twinBar.totalCutDemands,
      );
      expect(summary.twinBar.panelsSaved).toBe(
        summary.twinBar.totalCutDemands - summary.twinBar.stockPanelsOpened,
      );

      for (const bucket of summary.twinBar.buckets) {
        const demandIds = bucket.plans.flatMap((plan) =>
          plan.cuts.map(
            (cut) =>
              `${cut.demand.segmentId}:${cut.demand.startOffsetMm}:${cut.demand.endOffsetMm}:${cut.demand.lift ?? ""}`,
          ),
        );
        expect(new Set(demandIds).size).toBe(demandIds.length);
        expect(demandIds).toHaveLength(bucket.cutDemands);

        for (const plan of bucket.plans) {
          expect(plan.consumedMm + plan.leftoverMm).toBe(plan.stockPanelWidthMm);
          expect(plan.leftoverMm).toBeGreaterThanOrEqual(0);
          expect(plan.cuts[0]?.mode).toBe("OPEN_STOCK_PANEL");

          for (const [index, cut] of plan.cuts.entries()) {
            const consumedMm = index === 0 ? cut.lengthMm : cut.effectiveLengthMm;
            expect(cut.offcutBeforeMm - consumedMm).toBe(cut.offcutAfterMm);
            expect(cut.offcutAfterMm).toBeGreaterThanOrEqual(0);
            expect(cut.step).toBe(index + 1);
          }
        }
      }
    }
  });
});

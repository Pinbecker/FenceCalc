import type { LayoutModel } from "@fence-estimator/contracts";

export function buildDefaultDrawingName(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16).replace(":", "");
  return `Drawing ${date} ${time}`;
}

export function isEmptyLayout(layout: LayoutModel): boolean {
  return (
    layout.segments.length === 0 &&
    (layout.gates?.length ?? 0) === 0 &&
    (layout.basketballPosts?.length ?? 0) === 0 &&
    (layout.floodlightColumns?.length ?? 0) === 0
  );
}

export function normalizeLayout(layout: LayoutModel): LayoutModel {
  return {
    segments: layout.segments,
    gates: layout.gates ?? [],
    basketballPosts: layout.basketballPosts ?? [],
    floodlightColumns: layout.floodlightColumns ?? []
  };
}

import type {
  EstimateResult,
  FeatureQuantityLine,
  FloodlightColumnPlacement,
  GatePlacement,
  KickboardAttachment,
  LayoutModel,
  LayoutSegment,
  PitchDividerPlacement,
  PointMm,
  SideNettingAttachment
} from "@fence-estimator/contracts";
import { distanceMm, pointKey } from "@fence-estimator/geometry";

import { estimateLayout } from "./estimate.js";
import {
  buildBasketballReplacementOffsetsBySegmentId,
  buildGoalUnitEstimateSegments,
  findOppositeBasketballPairCandidate,
  getSegmentIntermediatePostOffsets,
  resolveBasketballFeaturePlacements,
  resolveGoalUnitPlacements,
  resolveKickboardAttachments,
  resolvePitchDividerPlacements,
  resolveSideNettingAttachments
} from "./features.js";

const MIN_SEGMENT_MM = 50;
const DRAW_INCREMENT_MM = 50;

interface OpeningSpan {
  startOffsetMm: number;
  endOffsetMm: number;
}

function interpolateAlongSegment(segment: LayoutSegment, offsetMm: number): PointMm {
  const lengthMm = distanceMm(segment.start, segment.end);
  if (lengthMm <= 0) {
    return segment.start;
  }
  const t = Math.max(0, Math.min(1, offsetMm / lengthMm));
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * t,
    y: segment.start.y + (segment.end.y - segment.start.y) * t
  };
}

function dedupeSortedOffsets(offsets: number[]): number[] {
  const deduped: number[] = [];
  const mergeThresholdMm = DRAW_INCREMENT_MM * 0.2;

  for (const offsetMm of offsets) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || Math.abs(offsetMm - last) > mergeThresholdMm) {
      deduped.push(offsetMm);
    }
  }

  return deduped;
}

function clampInlineFeatureOffset(offsetMm: number, segmentLengthMm: number): number {
  return Math.max(0, Math.min(segmentLengthMm, offsetMm));
}

function isOffsetWithinOpening(offsetMm: number, openings: OpeningSpan[]): boolean {
  const epsilon = 0.001;
  return openings.some(
    (opening) => offsetMm >= opening.startOffsetMm - epsilon && offsetMm <= opening.endOffsetMm + epsilon
  );
}

function buildSegmentRuns(
  segment: LayoutSegment,
  openings: OpeningSpan[],
  replacementOffsetsMm: number[]
): Array<{ start: PointMm; end: PointMm }> {
  const segmentLengthMm = distanceMm(segment.start, segment.end);
  if (segmentLengthMm <= 0) {
    return [];
  }

  const boundaries = dedupeSortedOffsets(
    [0, segmentLengthMm, ...openings.flatMap((opening) => [opening.startOffsetMm, opening.endOffsetMm]), ...replacementOffsetsMm]
      .map((offsetMm) => clampInlineFeatureOffset(offsetMm, segmentLengthMm))
      .sort((left, right) => left - right)
  );

  const runs: Array<{ start: PointMm; end: PointMm }> = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startOffsetMm = boundaries[index];
    const endOffsetMm = boundaries[index + 1];
    if (startOffsetMm === undefined || endOffsetMm === undefined || endOffsetMm - startOffsetMm < MIN_SEGMENT_MM) {
      continue;
    }

    const midpointMm = startOffsetMm + (endOffsetMm - startOffsetMm) / 2;
    if (isOffsetWithinOpening(midpointMm, openings)) {
      continue;
    }

    runs.push({
      start: interpolateAlongSegment(segment, startOffsetMm),
      end: interpolateAlongSegment(segment, endOffsetMm)
    });
  }

  return runs;
}

export interface DerivedFenceTopology {
  estimateSegments: LayoutSegment[];
  replacementNodeKeys: Set<string>;
  segmentSplitOffsetsBySegmentId: Map<string, number[]>;
  featureQuantities: FeatureQuantityLine[];
}

function clampGatePlacementToSegment(
  placement: GatePlacement,
  segmentLengthMm: number
): OpeningSpan | null {
  if (segmentLengthMm < MIN_SEGMENT_MM * 2 + DRAW_INCREMENT_MM) {
    return null;
  }

  const maxWidthMm = Math.max(DRAW_INCREMENT_MM, segmentLengthMm - MIN_SEGMENT_MM * 2);
  const requestedWidthMm = placement.endOffsetMm - placement.startOffsetMm;
  const widthMm = Math.max(DRAW_INCREMENT_MM, Math.min(maxWidthMm, requestedWidthMm));

  let startOffsetMm = Math.max(
    MIN_SEGMENT_MM,
    Math.min(segmentLengthMm - MIN_SEGMENT_MM - widthMm, placement.startOffsetMm)
  );
  let endOffsetMm = Math.min(segmentLengthMm - MIN_SEGMENT_MM, startOffsetMm + widthMm);

  startOffsetMm = Math.round(startOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;
  endOffsetMm = Math.round(endOffsetMm / DRAW_INCREMENT_MM) * DRAW_INCREMENT_MM;

  if (endOffsetMm - startOffsetMm < DRAW_INCREMENT_MM) {
    return null;
  }
  if (startOffsetMm < MIN_SEGMENT_MM || segmentLengthMm - endOffsetMm < MIN_SEGMENT_MM) {
    return null;
  }

  return {
    startOffsetMm,
    endOffsetMm
  };
}

function buildFeatureQuantities(input: {
  goalUnits: ReturnType<typeof resolveGoalUnitPlacements>;
  basketballFeatures: ReturnType<typeof resolveBasketballFeaturePlacements>;
  kickboards: ReturnType<typeof resolveKickboardAttachments>;
  pitchDividers: ReturnType<typeof resolvePitchDividerPlacements>;
  sideNettings: ReturnType<typeof resolveSideNettingAttachments>;
}): FeatureQuantityLine[] {
  const quantities: FeatureQuantityLine[] = [];

  for (const goalUnit of input.goalUnits) {
    const enclosureEstimate = estimateLayout({ segments: buildGoalUnitEstimateSegments(goalUnit) });
    const panelCount = enclosureEstimate.materials.twinBarPanels + enclosureEstimate.materials.twinBarPanelsSuperRebound;

    quantities.push(
      {
        key: `${goalUnit.id}::goal-unit`,
        kind: "GOAL_UNIT",
        component: "GOAL_UNIT",
        description: `Goal unit ${goalUnit.widthMm / 1000}m x ${goalUnit.goalHeightMm / 1000}m`,
        quantity: 1,
        unit: "item",
        relatedIds: [goalUnit.id]
      },
      {
        key: `${goalUnit.id}::lintel`,
        kind: "GOAL_UNIT",
        component: "LINTEL_PANEL",
        description: `Goal-unit lintel panel ${goalUnit.widthMm / 1000}m`,
        quantity: 1,
        unit: "panel",
        relatedIds: [goalUnit.id]
      },
      {
        key: `${goalUnit.id}::enclosure-panels`,
        kind: "GOAL_UNIT",
        component: "ENCLOSURE_PANELS",
        description: `Goal-unit side/rear panels at ${goalUnit.enclosureHeightMm / 1000}m`,
        quantity: panelCount,
        unit: "panel",
        relatedIds: [goalUnit.id]
      },
      {
        key: `${goalUnit.id}::enclosure-posts`,
        kind: "GOAL_UNIT",
        component: "ENCLOSURE_POSTS",
        description: `Goal-unit enclosure posts at ${goalUnit.enclosureHeightMm / 1000}m`,
        quantity: enclosureEstimate.posts.total,
        unit: "post",
        relatedIds: [goalUnit.id]
      },
      {
        key: `${goalUnit.id}::integrated-basketball`,
        kind: "BASKETBALL",
        component: "GOAL_UNIT_INTEGRATED",
        description: "Goal-unit integrated basketball assembly",
        quantity: 1,
        unit: "assembly",
        relatedIds: [goalUnit.id]
      }
    );
  }

  for (const basketballFeature of input.basketballFeatures) {
    if (basketballFeature.type === "DEDICATED_POST") {
      quantities.push({
        key: `${basketballFeature.id}::dedicated`,
        kind: "BASKETBALL",
        component: "DEDICATED_POST",
        description: `Dedicated basketball post ${basketballFeature.armLengthMm ?? 0}mm arm`,
        quantity: 1,
        unit: "post",
        relatedIds: [basketballFeature.id]
      });
      if (basketballFeature.replacesIntermediatePost) {
        quantities.push({
          key: `${basketballFeature.id}::replacement`,
          kind: "BASKETBALL",
          component: "INTERMEDIATE_POST_REPLACED",
          description: "Dedicated basketball post replaces one intermediate post",
          quantity: 1,
          unit: "post",
          relatedIds: [basketballFeature.id]
        });
      }
      continue;
    }

    if (basketballFeature.type === "MOUNTED_TO_EXISTING_POST") {
      quantities.push({
        key: `${basketballFeature.id}::mounted`,
        kind: "BASKETBALL",
        component: "POST_MOUNTED_ASSEMBLY",
        description: "Basketball backboard/hoop/net assembly mounted to existing post",
        quantity: 1,
        unit: "assembly",
        relatedIds: [basketballFeature.id]
      });
    }
  }

  for (const kickboard of input.kickboards) {
    quantities.push(
      {
        key: `${kickboard.id}::boards`,
        kind: "KICKBOARD",
        component: "BOARDS",
        description: `${kickboard.placement.sectionHeightMm} x ${kickboard.placement.thicknessMm} ${kickboard.placement.profile.toLowerCase()} kickboards`,
        quantity: kickboard.boardCount,
        unit: "board",
        relatedIds: [kickboard.id, kickboard.segmentId]
      },
      {
        key: `${kickboard.id}::run`,
        kind: "KICKBOARD",
        component: "RUN_LENGTH",
        description: "Kickboard run length",
        quantity: kickboard.lengthMm / 1000,
        unit: "m",
        relatedIds: [kickboard.id, kickboard.segmentId]
      }
    );
  }

  for (const pitchDivider of input.pitchDividers) {
    if (!pitchDivider.isValid) {
      continue;
    }
    quantities.push(
      {
        key: `${pitchDivider.id}::anchor-posts`,
        kind: "PITCH_DIVIDER",
        component: "ANCHOR_POSTS",
        description: "Pitch-divider anchor posts",
        quantity: 2,
        unit: "post",
        relatedIds: [pitchDivider.id]
      },
      {
        key: `${pitchDivider.id}::support-posts`,
        kind: "PITCH_DIVIDER",
        component: "SUPPORT_POSTS",
        description: "Pitch-divider support posts",
        quantity: pitchDivider.supportPostCount,
        unit: "post",
        relatedIds: [pitchDivider.id]
      },
      {
        key: `${pitchDivider.id}::netting`,
        kind: "PITCH_DIVIDER",
        component: "NETTING_RUN",
        description: "Pitch-divider netting run",
        quantity: pitchDivider.spanMm / 1000,
        unit: "m",
        relatedIds: [pitchDivider.id]
      }
    );
  }

  for (const sideNetting of input.sideNettings) {
    quantities.push(
      {
        key: `${sideNetting.id}::run`,
        kind: "SIDE_NETTING",
        component: "NETTING_RUN",
        description: "Side-netting run length",
        quantity: sideNetting.lengthMm / 1000,
        unit: "m",
        relatedIds: [sideNetting.id, sideNetting.segmentId]
      },
      {
        key: `${sideNetting.id}::area`,
        kind: "SIDE_NETTING",
        component: "NETTING_AREA",
        description: "Side-netting area",
        quantity: (sideNetting.lengthMm / 1000) * (sideNetting.additionalHeightMm / 1000),
        unit: "m2",
        relatedIds: [sideNetting.id, sideNetting.segmentId]
      },
      {
        key: `${sideNetting.id}::extended-posts`,
        kind: "SIDE_NETTING",
        component: "EXTENDED_POSTS",
        description: "Extended posts supporting side netting",
        quantity: sideNetting.extendedPostPoints.length,
        unit: "post",
        relatedIds: [sideNetting.id, sideNetting.segmentId]
      }
    );
  }

  return quantities.sort((left, right) => left.key.localeCompare(right.key));
}

export function buildDerivedFenceTopology(layout: LayoutModel): DerivedFenceTopology {
  const gatesBySegmentId = new Map<string, GatePlacement[]>();
  for (const gate of layout.gates ?? []) {
    const bucket = gatesBySegmentId.get(gate.segmentId);
    if (bucket) {
      bucket.push(gate);
    } else {
      gatesBySegmentId.set(gate.segmentId, [gate]);
    }
  }

  const segmentsById = new Map(layout.segments.map((segment) => [segment.id, segment] as const));
  const resolvedGoalUnits = resolveGoalUnitPlacements(segmentsById, layout.goalUnits ?? []);
  const goalUnitOpeningsBySegmentId = new Map<string, OpeningSpan[]>();
  for (const goalUnit of resolvedGoalUnits) {
    const bucket = goalUnitOpeningsBySegmentId.get(goalUnit.segmentId);
    const opening = {
      startOffsetMm: goalUnit.startOffsetMm,
      endOffsetMm: goalUnit.endOffsetMm
    };
    if (bucket) {
      bucket.push(opening);
    } else {
      goalUnitOpeningsBySegmentId.set(goalUnit.segmentId, [opening]);
    }
  }

  const basketballFeatures = layout.basketballFeatures ?? layout.basketballPosts ?? [];
  const resolvedBasketballFeatures = resolveBasketballFeaturePlacements(segmentsById, basketballFeatures);
  const basketballReplacementOffsetsBySegmentId = buildBasketballReplacementOffsetsBySegmentId(resolvedBasketballFeatures);

  const derived: LayoutSegment[] = [];
  const replacementNodeKeys = new Set<string>();
  const segmentSplitOffsetsBySegmentId = new Map<string, number[]>();

  for (const segment of layout.segments) {
    const segmentLengthMm = distanceMm(segment.start, segment.end);
    if (segmentLengthMm <= 0) {
      continue;
    }

    const gateOpenings = (gatesBySegmentId.get(segment.id) ?? [])
      .map((placement) => clampGatePlacementToSegment(placement, segmentLengthMm))
      .filter((opening): opening is OpeningSpan => opening !== null);
    const goalOpenings = goalUnitOpeningsBySegmentId.get(segment.id) ?? [];
    const openings = [...gateOpenings, ...goalOpenings].sort((left, right) => left.startOffsetMm - right.startOffsetMm);

    const floodlightOffsetsMm = (layout.floodlightColumns ?? [])
      .filter((placement): placement is FloodlightColumnPlacement => placement.segmentId === segment.id)
      .map((placement) => clampInlineFeatureOffset(placement.offsetMm, segmentLengthMm));
    const basketballReplacementOffsetsMm = basketballReplacementOffsetsBySegmentId.get(segment.id) ?? [];
    const replacementOffsetsMm = dedupeSortedOffsets(
      [...floodlightOffsetsMm, ...basketballReplacementOffsetsMm].sort((left, right) => left - right)
    );
    const interiorReplacementOffsetsMm = replacementOffsetsMm.filter(
      (offsetMm) => offsetMm > DRAW_INCREMENT_MM * 0.1 && offsetMm < segmentLengthMm - DRAW_INCREMENT_MM * 0.1
    );
    const labelSplitOffsetsMm = dedupeSortedOffsets(
      [
        ...interiorReplacementOffsetsMm,
        ...openings.flatMap((opening) => [opening.startOffsetMm, opening.endOffsetMm])
      ].sort((left, right) => left - right)
    );

    if (labelSplitOffsetsMm.length > 0) {
      segmentSplitOffsetsBySegmentId.set(segment.id, labelSplitOffsetsMm);
    }

    for (const offsetMm of replacementOffsetsMm) {
      if (isOffsetWithinOpening(offsetMm, openings)) {
        continue;
      }
      replacementNodeKeys.add(pointKey(interpolateAlongSegment(segment, offsetMm)));
    }

    const runs = buildSegmentRuns(segment, openings, interiorReplacementOffsetsMm);
    if (runs.length > 0) {
      runs.forEach((run, index) => {
        derived.push({
          id: `${segment.id}::run-${index}`,
          start: run.start,
          end: run.end,
          spec: segment.spec
        });
      });
    }
  }

  resolvedGoalUnits.forEach((goalUnit) => {
    replacementNodeKeys.add(pointKey(goalUnit.rearCenterPoint));
    derived.push(...buildGoalUnitEstimateSegments(goalUnit));
  });

  return {
    estimateSegments: derived,
    replacementNodeKeys,
    segmentSplitOffsetsBySegmentId,
    featureQuantities: buildFeatureQuantities({
      goalUnits: resolvedGoalUnits,
      basketballFeatures: resolvedBasketballFeatures,
      kickboards: resolveKickboardAttachments(segmentsById, layout.kickboards ?? []),
      pitchDividers: resolvePitchDividerPlacements(segmentsById, layout.pitchDividers ?? []),
      sideNettings: resolveSideNettingAttachments(segmentsById, layout.sideNettings ?? [])
    })
  };
}

export function buildEstimateSegmentsForLayout(layout: LayoutModel): LayoutSegment[] {
  return buildDerivedFenceTopology(layout).estimateSegments;
}

export function estimateDrawingLayout(layout: LayoutModel): EstimateResult {
  const derived = buildDerivedFenceTopology(layout);
  const estimate = estimateLayout(
    {
      segments: derived.estimateSegments
    },
    {
      excludedNodeKeys: derived.replacementNodeKeys
    }
  );

  return {
    ...estimate,
    featureQuantities: derived.featureQuantities
  };
}

export { findOppositeBasketballPairCandidate, getSegmentIntermediatePostOffsets };

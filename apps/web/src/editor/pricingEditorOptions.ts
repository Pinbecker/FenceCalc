import type { PricingWorkbookConfig, PricingWorkbookRow } from "@fence-estimator/contracts";
import {
  BASKETBALL_ARM_LENGTHS_MM,
  GOAL_UNIT_HEIGHTS_MM,
  GOAL_UNIT_WIDTHS_MM,
  KICKBOARD_SECTION_HEIGHTS_MM,
  buildDefaultPricingWorkbookConfig,
  mergePricingWorkbookWithTemplate,
} from "@fence-estimator/contracts";

export interface EditorKickboardOption {
  key: string;
  label: string;
  sectionHeightMm: number;
  thicknessMm: number;
  profile: string;
  boardLengthMm: number;
}

export interface EditorGoalUnitOption {
  key: string;
  label: string;
  widthMm: number;
  goalHeightMm: number;
  hasBasketballPost: boolean;
}

export interface EditorPricingOptions {
  goalUnitWidthOptionsMm: number[];
  goalUnitHeightOptionsMm: number[];
  goalUnitOptions: EditorGoalUnitOption[];
  basketballArmLengthOptionsMm: number[];
  floodlightColumnHeightOptionsMm: number[];
  kickboardOptions: EditorKickboardOption[];
  sideNettingHeightOptionsMm: number[];
}

export const DEFAULT_EDITOR_PRICING_OPTIONS: EditorPricingOptions = {
  goalUnitWidthOptionsMm: [...GOAL_UNIT_WIDTHS_MM],
  goalUnitHeightOptionsMm: [...GOAL_UNIT_HEIGHTS_MM],
  basketballArmLengthOptionsMm: [...BASKETBALL_ARM_LENGTHS_MM],
  floodlightColumnHeightOptionsMm: [6000],
  kickboardOptions: KICKBOARD_SECTION_HEIGHTS_MM.flatMap((sectionHeightMm) =>
    ["SQUARE", "CHAMFERED"].map((profile) => ({
      key: buildKickboardOptionKey(sectionHeightMm, 50, profile, 2500),
      label: buildKickboardOptionLabel(sectionHeightMm, 50, profile, 2500),
      sectionHeightMm,
      thicknessMm: 50,
      profile,
      boardLengthMm: 2500,
    })),
  ),
  goalUnitOptions: GOAL_UNIT_WIDTHS_MM.flatMap((widthMm) =>
    GOAL_UNIT_HEIGHTS_MM.map((goalHeightMm) => ({
      key: buildGoalUnitOptionKey(widthMm, goalHeightMm),
      label: buildGoalUnitOptionLabel(widthMm, goalHeightMm, false),
      widthMm,
      goalHeightMm,
      hasBasketballPost: false,
    })),
  ),
  sideNettingHeightOptionsMm: [500, 1000, 1500, 2000],
};

function addSortedOption(options: Set<number>, value: number): void {
  if (Number.isFinite(value) && value > 0) {
    options.add(Math.round(value));
  }
}

function isSupportedGoalUnitHeight(heightMm: number): boolean {
  return Number.isFinite(heightMm) && heightMm > 0 && heightMm <= 6000;
}

function formatProfileLabel(profile: string): string {
  return profile
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function buildKickboardOptionKey(
  sectionHeightMm: number,
  thicknessMm: number,
  profile: string,
  boardLengthMm: number,
): string {
  return `${sectionHeightMm}:${thicknessMm}:${profile}:${boardLengthMm}`;
}

export function buildKickboardOptionLabel(
  sectionHeightMm: number,
  thicknessMm: number,
  profile: string,
  boardLengthMm: number,
): string {
  return `${sectionHeightMm} x ${thicknessMm} ${formatProfileLabel(profile)} | ${boardLengthMm}mm`;
}

function buildGoalUnitOptionKey(widthMm: number, goalHeightMm: number, hasBasketballPost = false): string {
  return `${widthMm}:${goalHeightMm}:${hasBasketballPost ? "basketball" : "plain"}`;
}

function buildGoalUnitOptionLabel(widthMm: number, goalHeightMm: number, hasBasketballPost: boolean): string {
  return `${widthMm / 1000}m x ${goalHeightMm / 1000}m${hasBasketballPost ? " with basketball post" : ""}`;
}

function buildGoalUnitOption(widthMm: number, goalHeightMm: number, hasBasketballPost: boolean): EditorGoalUnitOption {
  return {
    key: buildGoalUnitOptionKey(widthMm, goalHeightMm, hasBasketballPost),
    label: buildGoalUnitOptionLabel(widthMm, goalHeightMm, hasBasketballPost),
    widthMm,
    goalHeightMm,
    hasBasketballPost,
  };
}

function buildKickboardOption(
  sectionHeightMm: number,
  thicknessMm: number,
  profile: string,
  boardLengthMm: number,
): EditorKickboardOption {
  return {
    key: buildKickboardOptionKey(sectionHeightMm, thicknessMm, profile, boardLengthMm),
    label: buildKickboardOptionLabel(sectionHeightMm, thicknessMm, profile, boardLengthMm),
    sectionHeightMm,
    thicknessMm,
    profile,
    boardLengthMm,
  };
}

function getCatalogQuantityKey(row: PricingWorkbookRow): string | null {
  return row.quantityRule.kind === "CATALOG_QUANTITY" ? row.quantityRule.quantityKey : null;
}

export function buildEditorPricingOptions(
  workbook: PricingWorkbookConfig | null | undefined,
): EditorPricingOptions {
  const merged = mergePricingWorkbookWithTemplate(workbook ?? buildDefaultPricingWorkbookConfig());
  const goalUnitWidths = new Set(DEFAULT_EDITOR_PRICING_OPTIONS.goalUnitWidthOptionsMm);
  const goalUnitHeights = new Set(DEFAULT_EDITOR_PRICING_OPTIONS.goalUnitHeightOptionsMm);
  const basketballArms = new Set(DEFAULT_EDITOR_PRICING_OPTIONS.basketballArmLengthOptionsMm);
  const floodlightHeights = new Set(DEFAULT_EDITOR_PRICING_OPTIONS.floodlightColumnHeightOptionsMm);
  const sideNettingHeights = new Set(DEFAULT_EDITOR_PRICING_OPTIONS.sideNettingHeightOptionsMm);
  const goalUnitOptions = new Map(DEFAULT_EDITOR_PRICING_OPTIONS.goalUnitOptions.map((option) => [option.key, option] as const));
  const kickboards = new Map(DEFAULT_EDITOR_PRICING_OPTIONS.kickboardOptions.map((option) => [option.key, option] as const));

  for (const row of merged.sections.flatMap((section) => section.rows)) {
    const quantityKey = getCatalogQuantityKey(row);
    if (!quantityKey) {
      continue;
    }

    const goalUnitMatch = quantityKey.match(/^goal-unit:(\d+):(\d+):count$/);
    if (goalUnitMatch) {
      const widthMm = Number(goalUnitMatch[1]);
      const goalHeightMm = Number(goalUnitMatch[2]);
      if (!isSupportedGoalUnitHeight(goalHeightMm)) {
        continue;
      }
      addSortedOption(goalUnitWidths, widthMm);
      addSortedOption(goalUnitHeights, goalHeightMm);
      const option = buildGoalUnitOption(widthMm, goalHeightMm, false);
      goalUnitOptions.set(option.key, option);
      continue;
    }

    const goalUnitWithBasketballMatch = quantityKey.match(/^goal-unit:(\d+):(\d+):basketball:count$/);
    if (goalUnitWithBasketballMatch) {
      const widthMm = Number(goalUnitWithBasketballMatch[1]);
      const goalHeightMm = Number(goalUnitWithBasketballMatch[2]);
      if (!isSupportedGoalUnitHeight(goalHeightMm)) {
        continue;
      }
      addSortedOption(goalUnitWidths, widthMm);
      addSortedOption(goalUnitHeights, goalHeightMm);
      const option = buildGoalUnitOption(widthMm, goalHeightMm, true);
      goalUnitOptions.set(option.key, option);
      continue;
    }

    const basketballMatch = quantityKey.match(/^basketball:dedicated:(\d+):count$/);
    if (basketballMatch) {
      addSortedOption(basketballArms, Number(basketballMatch[1]));
      continue;
    }

    const floodlightMatch = quantityKey.match(/^floodlight:column:(\d+):count$/);
    if (floodlightMatch) {
      addSortedOption(floodlightHeights, Number(floodlightMatch[1]));
      continue;
    }

    const legacyFloodlightMatch = quantityKey.match(/^floodlight:column:count$/);
    if (legacyFloodlightMatch) {
      addSortedOption(floodlightHeights, 6000);
      continue;
    }

    const richKickboardMatch = quantityKey.match(/^kickboard:(\d+):(\d+):([^:]+):(\d+):boards$/);
    if (richKickboardMatch) {
      const option = buildKickboardOption(
        Number(richKickboardMatch[1]),
        Number(richKickboardMatch[2]),
        richKickboardMatch[3] ?? "SQUARE",
        Number(richKickboardMatch[4]),
      );
      kickboards.set(option.key, option);
      continue;
    }

    const legacyKickboardMatch = quantityKey.match(/^kickboard:(\d+):([^:]+):boards$/);
    if (legacyKickboardMatch) {
      const option = buildKickboardOption(
        Number(legacyKickboardMatch[1]),
        50,
        legacyKickboardMatch[2] ?? "SQUARE",
        2500,
      );
      kickboards.set(option.key, option);
      continue;
    }

    const sideNettingMatch = quantityKey.match(/^side-netting:(\d+):area-m2$/);
    if (sideNettingMatch) {
      addSortedOption(sideNettingHeights, Number(sideNettingMatch[1]));
    }
  }

  return {
    goalUnitWidthOptionsMm: [...goalUnitWidths].sort((left, right) => left - right),
    goalUnitHeightOptionsMm: [...goalUnitHeights].sort((left, right) => left - right),
    goalUnitOptions: [...goalUnitOptions.values()].sort((left, right) => {
      if (left.widthMm !== right.widthMm) {
        return left.widthMm - right.widthMm;
      }
      if (left.goalHeightMm !== right.goalHeightMm) {
        return left.goalHeightMm - right.goalHeightMm;
      }
      return Number(left.hasBasketballPost) - Number(right.hasBasketballPost);
    }),
    basketballArmLengthOptionsMm: [...basketballArms].sort((left, right) => left - right),
    floodlightColumnHeightOptionsMm: [...floodlightHeights].sort((left, right) => left - right),
    kickboardOptions: [...kickboards.values()].sort((left, right) => {
      if (left.sectionHeightMm !== right.sectionHeightMm) {
        return left.sectionHeightMm - right.sectionHeightMm;
      }
      if (left.thicknessMm !== right.thicknessMm) {
        return left.thicknessMm - right.thicknessMm;
      }
      if (left.boardLengthMm !== right.boardLengthMm) {
        return left.boardLengthMm - right.boardLengthMm;
      }
      return left.profile.localeCompare(right.profile, "en-GB", { numeric: true });
    }),
    sideNettingHeightOptionsMm: [...sideNettingHeights].sort((left, right) => left - right),
  };
}

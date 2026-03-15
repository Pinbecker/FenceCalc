import type { ConcreteRule, FenceHeightKey } from "@fence-estimator/contracts";

export const TWIN_BAR_CONCRETE_RULES: Record<FenceHeightKey, ConcreteRule> = {
  "1.2m": { heightKey: "1.2m", depthMm: 600, widthMm: 300, lengthMm: 300 },
  "1.8m": { heightKey: "1.8m", depthMm: 800, widthMm: 300, lengthMm: 300 },
  "2m": { heightKey: "2m", depthMm: 850, widthMm: 300, lengthMm: 300 },
  "2.4m": { heightKey: "2.4m", depthMm: 850, widthMm: 350, lengthMm: 350 },
  "3m": { heightKey: "3m", depthMm: 900, widthMm: 350, lengthMm: 350 },
  "4m": { heightKey: "4m", depthMm: 900, widthMm: 400, lengthMm: 400 },
  "4.5m": { heightKey: "4.5m", depthMm: 1000, widthMm: 400, lengthMm: 400 },
  "5m": { heightKey: "5m", depthMm: 1050, widthMm: 450, lengthMm: 450 },
  "6m": { heightKey: "6m", depthMm: 1200, widthMm: 600, lengthMm: 600 }
};

export const FLOODLIGHT_COLUMN_BASE_MM = {
  depthMm: 1250,
  widthMm: 650,
  lengthMm: 650
} as const;

export const BASKETBALL_POST_BASE_MM = {
  depthMm: 1000,
  widthMm: 350,
  lengthMm: 350
} as const;

const HEIGHT_KEY_BY_MM: Record<string, FenceHeightKey> = {
  "1200": "1.2m",
  "1800": "1.8m",
  "2000": "2m",
  "2400": "2.4m",
  "3000": "3m",
  "4000": "4m",
  "4500": "4.5m",
  "5000": "5m",
  "6000": "6m"
};

const FLOODLIGHT_BOLTS_PER_COLUMN = 4;
const FLOODLIGHT_CHEMFIX_BASE_TUBES = 4;
const FLOODLIGHT_CHEMFIX_TUBES_PER_BOLT = 1;

export function getConcreteRuleForHeight(height: FenceHeightKey): ConcreteRule {
  return TWIN_BAR_CONCRETE_RULES[height];
}

export function getFenceHeightKeyForMm(heightMm: number): FenceHeightKey | null {
  return HEIGHT_KEY_BY_MM[String(Math.round(heightMm))] ?? null;
}

export function calculateConcreteVolumeFromDimensionsMm(dimensions: {
  depthMm: number;
  widthMm: number;
  lengthMm: number;
}): number {
  return (dimensions.depthMm / 1000) * (dimensions.widthMm / 1000) * (dimensions.lengthMm / 1000);
}

export function calculateFenceConcreteVolumeM3(postCountsByHeightMm: Record<string, number>): number {
  return Object.entries(postCountsByHeightMm).reduce((sum, [heightMm, count]) => {
    const heightKey = getFenceHeightKeyForMm(Number(heightMm));
    if (!heightKey || count <= 0) {
      return sum;
    }
    const perPostVolumeM3 = calculateConcreteVolumeFromDimensionsMm(getConcreteRuleForHeight(heightKey));
    return sum + perPostVolumeM3 * count;
  }, 0);
}

export function calculateFloodlightConsumables(columnCount: number): { bolts: number; chemfixTubes: number } {
  if (columnCount <= 0) {
    return { bolts: 0, chemfixTubes: 0 };
  }

  const bolts = columnCount * FLOODLIGHT_BOLTS_PER_COLUMN;
  return {
    bolts,
    chemfixTubes: FLOODLIGHT_CHEMFIX_BASE_TUBES + bolts * FLOODLIGHT_CHEMFIX_TUBES_PER_BOLT
  };
}

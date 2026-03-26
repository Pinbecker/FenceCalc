import type { PricingConfigRecord } from "@fence-estimator/contracts";

import { normalizePricingConfigRecord } from "./shared.js";
import type { UpsertPricingConfigInput } from "./types.js";

export interface InMemoryPricingState {
  pricingConfigs: Map<string, PricingConfigRecord>;
}

export class InMemoryPricingStore {
  public constructor(private readonly state: InMemoryPricingState) {}

  public getPricingConfig(companyId: string): PricingConfigRecord | null {
    const pricingConfig = this.state.pricingConfigs.get(companyId);
    return pricingConfig ? normalizePricingConfigRecord(pricingConfig) : null;
  }

  public upsertPricingConfig(input: UpsertPricingConfigInput): PricingConfigRecord {
    const record: PricingConfigRecord = {
      companyId: input.companyId,
      items: input.items,
      ...(input.workbook ? { workbook: input.workbook } : {}),
      updatedAtIso: input.updatedAtIso,
      updatedByUserId: input.updatedByUserId
    };
    this.state.pricingConfigs.set(input.companyId, record);
    return record;
  }
}

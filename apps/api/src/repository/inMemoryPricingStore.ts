import type { PricingConfigRecord } from "@fence-estimator/contracts";

import type { UpsertPricingConfigInput } from "./types.js";

export interface InMemoryPricingState {
  pricingConfigs: Map<string, PricingConfigRecord>;
}

export class InMemoryPricingStore {
  public constructor(private readonly state: InMemoryPricingState) {}

  public getPricingConfig(companyId: string): PricingConfigRecord | null {
    return this.state.pricingConfigs.get(companyId) ?? null;
  }

  public upsertPricingConfig(input: UpsertPricingConfigInput): PricingConfigRecord {
    const record: PricingConfigRecord = {
      companyId: input.companyId,
      items: input.items,
      updatedAtIso: input.updatedAtIso,
      updatedByUserId: input.updatedByUserId
    };
    this.state.pricingConfigs.set(input.companyId, record);
    return record;
  }
}

import Database from "better-sqlite3";
import type { PricingConfigRecord } from "@fence-estimator/contracts";

import { type PricingConfigRow, toPricingConfig } from "./shared.js";
import type { UpsertPricingConfigInput } from "./types.js";

export class SqlitePricingStore {
  public constructor(private readonly database: Database.Database) {}

  public getPricingConfig(companyId: string): PricingConfigRecord | null {
    const row = this.database
      .prepare("SELECT * FROM pricing_configs WHERE company_id = ?")
      .get(companyId) as PricingConfigRow | undefined;
    return row ? toPricingConfig(row) : null;
  }

  public upsertPricingConfig(input: UpsertPricingConfigInput): PricingConfigRecord {
    const record: PricingConfigRecord = {
      companyId: input.companyId,
      items: input.items,
      updatedAtIso: input.updatedAtIso,
      updatedByUserId: input.updatedByUserId
    };

    this.database
      .prepare(
        `
          INSERT INTO pricing_configs (
            company_id,
            config_json,
            updated_at_iso,
            updated_by_user_id
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(company_id) DO UPDATE SET
            config_json = excluded.config_json,
            updated_at_iso = excluded.updated_at_iso,
            updated_by_user_id = excluded.updated_by_user_id
        `
      )
      .run(
        input.companyId,
        JSON.stringify(record),
        input.updatedAtIso,
        input.updatedByUserId
      );

    return record;
  }
}

import Database from "better-sqlite3";
import type { QuoteRecord } from "@fence-estimator/contracts";

import { type QuoteRow, toQuoteRecord } from "./shared.js";
import type { CreateQuoteInput } from "./types.js";

export class SqliteQuoteStore {
  public constructor(private readonly database: Database.Database) {}

  public createQuote(input: CreateQuoteInput): QuoteRecord {
    const record: QuoteRecord = { ...input };

    this.database
      .prepare(
        `
          INSERT INTO quotes (
            id,
            company_id,
            drawing_id,
            drawing_version_number,
            quote_json,
            created_by_user_id,
            created_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        record.companyId,
        record.drawingId,
        record.drawingVersionNumber,
        JSON.stringify(record),
        record.createdByUserId,
        record.createdAtIso
      );

    return record;
  }

  public listQuotesForDrawing(drawingId: string, companyId: string): QuoteRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT *
          FROM quotes
          WHERE drawing_id = ? AND company_id = ?
          ORDER BY created_at_iso DESC
        `
      )
      .all(drawingId, companyId) as QuoteRow[];

    return rows.map((row) => toQuoteRecord(row));
  }
}

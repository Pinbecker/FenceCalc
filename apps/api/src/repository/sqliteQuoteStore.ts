import Database from "better-sqlite3";
import type { QuoteRecord } from "@fence-estimator/contracts";

import { type QuoteRow, toQuoteRecord } from "./shared.js";
import type { CreateQuoteInput } from "./types.js";

export class SqliteQuoteStore {
  public constructor(private readonly database: Database.Database) {}

  public createQuote(input: CreateQuoteInput): QuoteRecord {
    const jobId = input.jobId ?? input.sourceDrawingId ?? input.drawingId;
    if (!jobId) {
      throw new Error("Quotes must be associated with a job or drawing");
    }

    const record: QuoteRecord = {
      ...input,
      workspaceId: input.workspaceId ?? jobId,
      ...(input.jobId ? { jobId: input.jobId } : { jobId }),
      ...(input.sourceDrawingId ? {} : input.drawingId ? { sourceDrawingId: input.drawingId } : {}),
      ...(input.sourceDrawingVersionNumber !== undefined
        ? {}
        : input.drawingVersionNumber !== undefined
          ? { sourceDrawingVersionNumber: input.drawingVersionNumber }
          : {})
    };

    this.database
      .prepare(
        `
          INSERT INTO quotes (
            id,
            company_id,
            job_id,
            source_drawing_id,
            source_drawing_version_number,
            drawing_id,
            drawing_version_number,
            quote_json,
            created_by_user_id,
            created_at_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        record.companyId,
        record.jobId,
        record.sourceDrawingId,
        record.sourceDrawingVersionNumber,
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
          WHERE source_drawing_id = ? AND company_id = ?
          ORDER BY created_at_iso DESC
        `
      )
      .all(drawingId, companyId) as QuoteRow[];

    return rows.map((row) => toQuoteRecord(row));
  }

  public listQuotesForJob(jobId: string, companyId: string): QuoteRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT *
          FROM quotes
          WHERE job_id = ? AND company_id = ?
          ORDER BY created_at_iso DESC
        `
      )
      .all(jobId, companyId) as QuoteRow[];

    return rows.map((row) => toQuoteRecord(row));
  }
}

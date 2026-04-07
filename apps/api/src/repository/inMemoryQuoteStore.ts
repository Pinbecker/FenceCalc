import type { QuoteRecord } from "@fence-estimator/contracts";

import type { CreateQuoteInput } from "./types.js";

export interface InMemoryQuoteState {
  quotesByJobId: Map<string, QuoteRecord[]>;
}

export class InMemoryQuoteStore {
  public constructor(private readonly state: InMemoryQuoteState) {}

  public createQuote(input: CreateQuoteInput): QuoteRecord {
    const workspaceId = input.workspaceId ?? input.jobId ?? input.sourceDrawingId ?? input.drawingId;
    if (!workspaceId) {
      throw new Error("Quotes must be associated with a workspace or drawing");
    }

    const quotes = this.state.quotesByJobId.get(workspaceId) ?? [];
    const record: QuoteRecord = {
      ...input,
      workspaceId,
      ...(input.sourceDrawingId ? {} : input.drawingId ? { sourceDrawingId: input.drawingId } : {}),
      ...(input.sourceDrawingVersionNumber !== undefined
        ? {}
        : input.drawingVersionNumber !== undefined
          ? { sourceDrawingVersionNumber: input.drawingVersionNumber }
          : {})
    };
    quotes.unshift(record);
    this.state.quotesByJobId.set(workspaceId, quotes);
    return record;
  }

  public listQuotesForDrawing(drawingId: string, companyId: string): QuoteRecord[] {
    return [...this.state.quotesByJobId.values()]
      .flatMap((quotes) => quotes)
      .filter((quote) => quote.companyId === companyId && quote.sourceDrawingId === drawingId)
      .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
  }

  public listQuotesForJob(jobId: string, companyId: string): QuoteRecord[] {
    return (this.state.quotesByJobId.get(jobId) ?? [])
      .filter((quote) => quote.companyId === companyId)
      .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
  }
}

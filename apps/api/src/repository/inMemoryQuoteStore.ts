import type { QuoteRecord } from "@fence-estimator/contracts";

import type { CreateQuoteInput } from "./types.js";

export interface InMemoryQuoteState {
  quotesByDrawingId: Map<string, QuoteRecord[]>;
}

export class InMemoryQuoteStore {
  public constructor(private readonly state: InMemoryQuoteState) {}

  public createQuote(input: CreateQuoteInput): QuoteRecord {
    const quotes = this.state.quotesByDrawingId.get(input.drawingId) ?? [];
    const record: QuoteRecord = { ...input };
    quotes.unshift(record);
    this.state.quotesByDrawingId.set(input.drawingId, quotes);
    return record;
  }

  public listQuotesForDrawing(drawingId: string, companyId: string): QuoteRecord[] {
    return (this.state.quotesByDrawingId.get(drawingId) ?? []).filter((quote) => quote.companyId === companyId);
  }
}

export interface WriteRequestLimiter {
  allow(key: string): boolean;
}

export class InMemoryWriteRequestLimiter implements WriteRequestLimiter {
  private readonly attempts = new Map<string, { count: number; resetAtMs: number }>();

  public constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  public allow(key: string): boolean {
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || current.resetAtMs <= now) {
      this.attempts.set(key, {
        count: 1,
        resetAtMs: now + this.windowMs
      });
      return true;
    }

    if (current.count >= this.maxRequests) {
      return false;
    }

    current.count += 1;
    return true;
  }
}

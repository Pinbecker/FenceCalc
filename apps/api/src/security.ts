export interface WriteRequestLimiter {
  allow(key: string): boolean;
}

export interface LoginAttemptStatus {
  allowed: boolean;
  retryAfterMs: number;
}

export interface LoginAttemptLimiter {
  getStatus(key: string): LoginAttemptStatus;
  recordFailure(key: string): LoginAttemptStatus;
  recordSuccess(key: string): void;
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

interface LoginAttemptRecord {
  count: number;
  resetAtMs: number;
  lockedUntilMs: number;
}

export class InMemoryLoginAttemptLimiter implements LoginAttemptLimiter {
  private readonly attempts = new Map<string, LoginAttemptRecord>();

  public constructor(
    private readonly windowMs: number,
    private readonly maxAttempts: number,
    private readonly lockoutMs: number,
  ) {}

  public getStatus(key: string): LoginAttemptStatus {
    const now = Date.now();
    const current = this.getCurrentRecord(key, now);
    if (!current || current.lockedUntilMs <= now) {
      return { allowed: true, retryAfterMs: 0 };
    }

    return {
      allowed: false,
      retryAfterMs: Math.max(0, current.lockedUntilMs - now)
    };
  }

  public recordFailure(key: string): LoginAttemptStatus {
    const now = Date.now();
    const current = this.getCurrentRecord(key, now);
    if (!current) {
      const next: LoginAttemptRecord = {
        count: 1,
        resetAtMs: now + this.windowMs,
        lockedUntilMs: this.maxAttempts <= 1 ? now + this.lockoutMs : 0
      };
      this.attempts.set(key, next);
      if (next.lockedUntilMs > now) {
        return { allowed: false, retryAfterMs: this.lockoutMs };
      }

      return { allowed: true, retryAfterMs: 0 };
    }

    if (current.lockedUntilMs > now) {
      return {
        allowed: false,
        retryAfterMs: current.lockedUntilMs - now
      };
    }

    current.count += 1;
    if (current.count >= this.maxAttempts) {
      current.lockedUntilMs = now + this.lockoutMs;
      return {
        allowed: false,
        retryAfterMs: this.lockoutMs
      };
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  public recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  private getCurrentRecord(key: string, now: number): LoginAttemptRecord | null {
    const current = this.attempts.get(key);
    if (!current) {
      return null;
    }

    if (current.lockedUntilMs <= now && current.resetAtMs <= now) {
      this.attempts.delete(key);
      return null;
    }

    if (current.lockedUntilMs <= now) {
      current.lockedUntilMs = 0;
    }

    return current;
  }
}

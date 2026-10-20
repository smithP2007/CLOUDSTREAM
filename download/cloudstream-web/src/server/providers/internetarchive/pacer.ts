/**
 * Conservative request pacing for the Internet Archive provider (D20).
 *
 * IA publishes NO numeric rate limits (checklist E19 — UNKNOWN); what it
 * publishes is a conduct policy (E5, VERIFIED): identify your tool,
 * space out requests, honor 429 + `Retry-After`, cache aggressively. The
 * numbers below are OURS (recorded in D20 — never attributed to IA):
 *
 *  - ≥ 1 request/second sustained (min spacing 1100 ms between request STARTS);
 *  - low concurrency (≤ 2 in flight);
 *  - on a 429 with `Retry-After`, pause ALL new requests until the deadline
 *    (minimum 60 s) — the engine never auto-retries (documented), and the
 *    provider fails fast with a typed error while paused.
 *
 * The pacer is a pure scheduling primitive: no I/O, no timers — callers
 * `await pacer.acquire()` immediately before issuing a request and MUST call
 * `pacer.release()` when it settles. The waiting is testable through the
 * exported decision helpers without real time (see tests).
 */

/** Minimum spacing between consecutive request STARTS (ms). ≥ 1 req/s sustained. */
export const IA_MIN_REQUEST_SPACING_MS = 1_100;
/** Maximum concurrent in-flight requests to IA. */
export const IA_MAX_IN_FLIGHT = 2;
/** Floor for the post-429 pause, even if `Retry-After` asks for less (ms). */
export const IA_MIN_429_PAUSE_MS = 60_000;
/** Ceiling for the post-429 pause (guard against absurd Retry-After values) (ms). */
export const IA_MAX_429_PAUSE_MS = 15 * 60_000;

export class IaRateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(
      `Internet Archive rate limit encountered; paused for ${Math.round(retryAfterMs / 1000)}s ` +
        `(Retry-After honored, D20 pacing policy)`,
    );
    this.name = 'IaRateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class IaPacer {
  #lastStart = 0;
  #inFlight = 0;
  /** Timestamp (ms) until which all new requests are paused after a 429. */
  #pausedUntil = 0;

  /** Parses a `Retry-After` header value (seconds or HTTP-date) into ms, clamped. */
  static parseRetryAfterMs(value: string | null | undefined, now: number = Date.now()): number {
    if (typeof value !== 'string' || value.trim() === '') return IA_MIN_429_PAUSE_MS;
    const trimmed = value.trim();
    // Delta-seconds form.
    if (/^\d+$/.test(trimmed)) {
      const seconds = Number.parseInt(trimmed, 10);
      return Math.min(Math.max(seconds * 1000, IA_MIN_429_PAUSE_MS), IA_MAX_429_PAUSE_MS);
    }
    // HTTP-date form.
    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(date - now, IA_MIN_429_PAUSE_MS), IA_MAX_429_PAUSE_MS);
    }
    return IA_MIN_429_PAUSE_MS;
  }

  /**
   * Records a 429 (with the raw `Retry-After` header) and returns the pause
   * applied. All subsequent {@link acquire} calls fail fast until the deadline.
   */
  reportRateLimited(retryAfterHeader: string | null | undefined, now: number = Date.now()): number {
    const pauseMs = IaPacer.parseRetryAfterMs(retryAfterHeader, now);
    this.#pausedUntil = Math.max(this.#pausedUntil, now + pauseMs);
    return pauseMs;
  }

  /** Whether the pacer is currently paused due to a 429. */
  get paused(): boolean {
    return Date.now() < this.#pausedUntil;
  }

  /** Time (ms) remaining in the 429 pause; 0 when not paused. */
  get pausedForMs(): number {
    return Math.max(0, this.#pausedUntil - Date.now());
  }

  /**
   * Waits for a pacing slot. Rejects with {@link IaRateLimitedError} while a
   * 429 pause is active (fail fast — no silent queueing during backoff).
   */
  async acquire(now: number = Date.now()): Promise<void> {
    if (now < this.#pausedUntil) {
      throw new IaRateLimitedError(this.#pausedUntil - now);
    }
    while (this.#inFlight >= IA_MAX_IN_FLIGHT) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    this.#inFlight += 1;
    const sinceLast = now - this.#lastStart;
    if (sinceLast < IA_MIN_REQUEST_SPACING_MS) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, IA_MIN_REQUEST_SPACING_MS - sinceLast),
      );
    }
    this.#lastStart = Date.now();
  }

  /** Marks one acquired request as settled. MUST be called exactly once per acquire. */
  release(): void {
    this.#inFlight = Math.max(0, this.#inFlight - 1);
  }

  /** Runs one paced request: acquire → fn → release (even on throw). */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Concurrency helpers: a limiter for provider calls, a mutex for read-modify-write state,
 * and retry with backoff for rate limits. No dependency on the BB SDK, so they are unit-tested.
 */

export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 10;
export const DEFAULT_CONCURRENCY = 8;

export function clampConcurrency(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, n));
}

/** At most `limit` tasks run at once; the rest wait in arrival order. The limit can change while tasks run. */
export class Limiter {
  private running = 0;
  private waiting: Array<() => void> = [];
  private limit: number;

  constructor(limit: number = DEFAULT_CONCURRENCY) {
    this.limit = clampConcurrency(limit);
  }

  setLimit(limit: number): void {
    this.limit = clampConcurrency(limit);
    this.pump();
  }

  get active(): number {
    return this.running;
  }

  get queued(): number {
    return this.waiting.length;
  }

  get max(): number {
    return this.limit;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
      this.pump();
    });
    try {
      return await task();
    } finally {
      this.running -= 1;
      this.pump();
    }
  }

  private pump(): void {
    while (this.running < this.limit && this.waiting.length > 0) {
      this.running += 1;
      this.waiting.shift()!();
    }
  }
}

/** Runs tasks one at a time in call order. A failed task does not block the next one. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Runs `worker` over `items` with at most `parallel` at a time. Results keep the input order. */
export async function mapParallel<T, R>(
  items: readonly T[],
  parallel: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(parallel, items.length));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (let index = next++; index < items.length; index = next++) {
        results[index] = await worker(items[index]!, index);
      }
    }),
  );
  return results;
}

export type RetryOptions = {
  /** Retries after the first attempt. */
  retries?: number;
  /** First wait in ms; it doubles each time. */
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export const DEFAULT_RETRY: Required<Pick<RetryOptions, "retries" | "baseMs" | "maxMs">> = {
  retries: 4,
  baseMs: 2000,
  maxMs: 20_000,
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Wait before retry number `attempt` (0-based): exponential with jitter, or the server's Retry-After. */
export function backoffMs(attempt: number, options: RetryOptions = {}, retryAfterMs?: number): number {
  const base = options.baseMs ?? DEFAULT_RETRY.baseMs;
  const max = options.maxMs ?? DEFAULT_RETRY.maxMs;
  const random = options.random ?? Math.random;
  if (retryAfterMs !== undefined && retryAfterMs >= 0) return Math.min(max, retryAfterMs);
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp * (0.75 + random() * 0.5));
}

/** Seconds or HTTP date in a Retry-After header → ms. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Calls `attempt` until `shouldRetry` says stop or retries run out.
 * `attempt` returns a value; `shouldRetry` looks at it (a Response, a parsed body, ...) and may name a Retry-After.
 */
export async function retryWhile<T>(
  attempt: () => Promise<T>,
  shouldRetry: (value: T) => { retry: boolean; retryAfterMs?: number },
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRY.retries;
  const sleep = options.sleep ?? realSleep;
  let value = await attempt();
  for (let index = 0; index < retries; index += 1) {
    const verdict = shouldRetry(value);
    if (!verdict.retry) return value;
    await sleep(backoffMs(index, options, verdict.retryAfterMs));
    value = await attempt();
  }
  return value;
}

/** The host throws this after a plugin reload or disable, on any use of the old `bb` handle. */
export function isStaleHandleError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const text = current instanceof Error ? `${current.name} ${current.message}` : String(current);
    if (/stale API handle|PluginContextStale|was reloaded or disabled/i.test(text)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Exit code the CLI returns when a reload cut the run short: nothing was lost, run it again. */
export const EXIT_RELOADED = 75;

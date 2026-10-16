import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXIT_RELOADED,
  Limiter,
  Mutex,
  backoffMs,
  clampConcurrency,
  isStaleHandleError,
  mapParallel,
  parseRetryAfter,
  retryWhile,
} from "../src/queue.ts";

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("concurrency is clamped to 1..10 with 8 as the default", () => {
  assert.equal(clampConcurrency(undefined), 8);
  assert.equal(clampConcurrency("x"), 8);
  assert.equal(clampConcurrency(0), 1);
  assert.equal(clampConcurrency(-5), 1);
  assert.equal(clampConcurrency(99), 10);
  assert.equal(clampConcurrency(4.4), 4);
  assert.equal(clampConcurrency(10), 10);
});

test("the limiter never runs more than the limit, and runs everything", async () => {
  const limiter = new Limiter(3);
  let running = 0;
  let peak = 0;
  const done: number[] = [];
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      limiter.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await tick(5);
        running -= 1;
        done.push(i);
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.equal(done.length, 12);
  assert.equal(limiter.active, 0);
  assert.equal(limiter.queued, 0);
});

test("the limiter starts jobs in arrival order and frees a slot when a job fails", async () => {
  const limiter = new Limiter(1);
  const order: number[] = [];
  const jobs = [0, 1, 2].map((i) =>
    limiter
      .run(async () => {
        order.push(i);
        if (i === 0) throw new Error("fail");
      })
      .catch(() => undefined),
  );
  await Promise.all(jobs);
  assert.deepEqual(order, [0, 1, 2]);
});

test("raising the limit lets queued jobs start at once", async () => {
  const limiter = new Limiter(1);
  let running = 0;
  let peak = 0;
  const jobs = Array.from({ length: 6 }, () =>
    limiter.run(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick(20);
      running -= 1;
    }),
  );
  await tick(5);
  assert.equal(limiter.active, 1);
  limiter.setLimit(6);
  await tick(5);
  assert.equal(limiter.active, 6);
  await Promise.all(jobs);
  assert.equal(peak, 6);
});

test("the mutex runs tasks one at a time in call order, and survives a failure", async () => {
  const mutex = new Mutex();
  const log: string[] = [];
  const a = mutex.run(async () => {
    log.push("a1");
    await tick(10);
    log.push("a2");
  });
  const b = mutex.run(async () => {
    throw new Error("b failed");
  });
  const c = mutex.run(async () => {
    log.push("c");
    return 3;
  });
  await a;
  await assert.rejects(b, /b failed/);
  assert.equal(await c, 3);
  assert.deepEqual(log, ["a1", "a2", "c"]);
});

test("mapParallel keeps input order and respects the lane count", async () => {
  let running = 0;
  let peak = 0;
  const results = await mapParallel([5, 1, 4, 2, 3, 6], 2, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await tick(n);
    running -= 1;
    return n * 10;
  });
  assert.deepEqual(results, [50, 10, 40, 20, 30, 60]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapParallel([], 4, async () => 1), []);
});

test("backoff doubles, is capped, and prefers Retry-After", () => {
  const fixed = { baseMs: 1000, maxMs: 5000, random: () => 0.5 };
  assert.equal(backoffMs(0, fixed), 1000);
  assert.equal(backoffMs(1, fixed), 2000);
  assert.equal(backoffMs(2, fixed), 4000);
  assert.equal(backoffMs(3, fixed), 5000);
  assert.equal(backoffMs(0, fixed, 3000), 3000);
  assert.equal(backoffMs(0, fixed, 60_000), 5000);
  assert.equal(parseRetryAfter("7"), 7000);
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter("nonsense"), undefined);
  assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4_000), 6000);
});

test("retryWhile retries until the verdict says stop, with growing waits", async () => {
  const waits: number[] = [];
  let calls = 0;
  const value = await retryWhile(
    async () => ++calls,
    (n) => ({ retry: n < 4 }),
    { baseMs: 100, random: () => 0.5, sleep: async (ms) => void waits.push(ms) },
  );
  assert.equal(value, 4);
  assert.deepEqual(waits, [100, 200, 400]);
});

test("retryWhile gives up after the retry budget and returns the last value", async () => {
  let calls = 0;
  const value = await retryWhile(async () => ++calls, () => ({ retry: true }), { retries: 2, sleep: async () => undefined });
  assert.equal(calls, 3);
  assert.equal(value, 3);
});

test("stale handle errors are recognised, including wrapped ones", () => {
  assert.equal(isStaleHandleError(new Error("plugin used a stale API handle — it was reloaded or disabled")), true);
  const stale = new Error("PluginContextStaleError: image-studio");
  stale.name = "PluginContextStaleError";
  assert.equal(isStaleHandleError(stale), true);
  assert.equal(isStaleHandleError(new Error("save failed", { cause: new Error("stale API handle") })), true);
  assert.equal(isStaleHandleError(new Error("kie.ai key is missing")), false);
  assert.equal(isStaleHandleError(undefined), false);
  assert.equal(EXIT_RELOADED, 75);
});

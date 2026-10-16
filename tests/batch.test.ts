import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BATCH, parseBatchLines } from "../src/batch.ts";

const defaults: { model?: string; gateway?: string; profile?: string; images: string[]; aspectRatio?: string; resolution?: string; refs?: string; seed?: number } = { model: "nano-banana-2.1", gateway: "kie", profile: undefined, images: [] as string[], aspectRatio: "3:4", resolution: "2K", refs: undefined };

test("a batch line overrides the CLI defaults, the rest is inherited", () => {
  const parsed = parseBatchLines(
    [
      '{"prompt":"a red mug"}',
      "",
      "# a comment",
      '{"prompt":"edit it","model":"muse-image","image":"a.png","profile":"Vika","refs":"face-front","aspect":"1:1"}',
      '{"prompt":"three of these","count":3,"images":["x.png","y.png"]}',
    ].join("\n"),
    defaults,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.jobs.length, 5);
  assert.deepEqual(parsed.jobs[0], { prompt: "a red mug", model: "nano-banana-2.1", gateway: "kie", profile: undefined, images: [], aspectRatio: "3:4", resolution: "2K", refs: undefined, seed: undefined });
  assert.equal(parsed.jobs[1]!.model, "muse-image");
  assert.deepEqual(parsed.jobs[1]!.images, ["a.png"]);
  assert.equal(parsed.jobs[1]!.profile, "Vika");
  assert.equal(parsed.jobs[1]!.refs, "face-front");
  assert.equal(parsed.jobs[1]!.aspectRatio, "1:1");
  assert.deepEqual(parsed.jobs[2]!.images, ["x.png", "y.png"]);
  assert.equal(parsed.jobs.filter((job) => job.prompt === "three of these").length, 3);
});

test("the CLI --prompt is the default prompt of lines without one", () => {
  const parsed = parseBatchLines('{"model":"muse-image"}\n{"prompt":"own"}', defaults, "shared prompt");
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.jobs.map((job) => job.prompt), ["shared prompt", "own"]);
});

test("bad batches are rejected with the line number", () => {
  const noPrompt = parseBatchLines('{"model":"muse-image"}', defaults);
  assert.equal(noPrompt.ok, false);
  if (!noPrompt.ok) assert.match(noPrompt.error, /line 1 has no "prompt"/);
  const badJson = parseBatchLines('{"prompt":"ok"}\n{oops', defaults);
  assert.equal(badJson.ok, false);
  if (!badJson.ok) assert.match(badJson.error, /line 2 is not valid JSON/);
  const notObject = parseBatchLines('["a"]', defaults);
  assert.equal(notObject.ok, false);
  const badCount = parseBatchLines('{"prompt":"x","count":0}', defaults);
  assert.equal(badCount.ok, false);
  const empty = parseBatchLines("\n# nothing\n", defaults);
  assert.equal(empty.ok, false);
  const tooMany = parseBatchLines(`{"prompt":"x","count":${MAX_BATCH}}\n{"prompt":"y"}`, defaults);
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.match(tooMany.error, /at most 20/);
});

test("a batch line can carry a seed; a bad one is rejected", () => {
  const ok = parseBatchLines('{"prompt":"a","seed":42}', defaults);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.jobs[0]!.seed, 42);
  assert.equal(parseBatchLines('{"prompt":"a","seed":-1}', defaults).ok, false);
  assert.equal(parseBatchLines('{"prompt":"a","seed":1.5}', defaults).ok, false);
});

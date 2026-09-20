import assert from "node:assert/strict";
import { test } from "node:test";
import { falGenerate, falPollUrls, formatUnknownError } from "../src/providers.ts";

test("muse queue status lives on the model root, not the text-to-image suffix", () => {
  const urls = falPollUrls("meta/muse-image/text-to-image", "req-1", {
    status_url: "https://queue.fal.run/meta/muse-image/requests/req-1/status",
    response_url: "https://queue.fal.run/meta/muse-image/requests/req-1",
  });
  assert.equal(urls.statusUrl, "https://queue.fal.run/meta/muse-image/requests/req-1/status");
  assert.equal(urls.resultUrl, "https://queue.fal.run/meta/muse-image/requests/req-1");
});

test("fal banana keeps the submitted endpoint when queue URLs are absent", () => {
  const urls = falPollUrls("fal-ai/nano-banana-2", "req-2", {});
  assert.equal(urls.statusUrl, "https://queue.fal.run/fal-ai/nano-banana-2/requests/req-2/status");
});

test("formatUnknownError stringifies object and array detail", () => {
  const objectText = formatUnknownError({ msg: "bad key", loc: ["body"] });
  const arrayText = formatUnknownError([{ loc: ["prompt"], msg: "field required", type: "missing" }]);
  assert.equal(objectText.includes("[object Object]"), false);
  assert.equal(arrayText.includes("[object Object]"), false);
  assert.ok(objectText.includes("bad key"));
  assert.ok(arrayText.includes("field required"));
  assert.equal(formatUnknownError(new Error("boom")), "boom");
});

const job = { prompt: "red square", referenceDataUris: [] as string[] };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("fal submit with object detail is readable", async () => {
  const fetchImpl: typeof fetch = async () =>
    jsonResponse(422, { detail: [{ loc: ["body", "prompt"], msg: "field required" }] });
  await assert.rejects(
    () => falGenerate("k", "fal-ai/nano-banana-2", job, fetchImpl),
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      assert.equal(text.includes("[object Object]"), false);
      assert.ok(text.includes("fal.ai submit failed (422)"));
      assert.ok(text.includes("field required"));
      return true;
    },
  );
});

test("fal does not fetch the result after a poll timeout", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    urls.push(String(input));
    if (urls.length === 1) return jsonResponse(200, { request_id: "req-3" });
    throw new Error(`unexpected fetch ${input}`);
  };
  await assert.rejects(
    () => falGenerate("k", "fal-ai/nano-banana-2", job, fetchImpl, undefined, 0),
    /timed out/,
  );
  assert.equal(urls.length, 1);
});

test("fal COMPLETED with error is a failure", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (!url.includes("/requests/")) return jsonResponse(200, { request_id: "req-4" });
    if (url.endsWith("/status")) {
      return jsonResponse(200, { status: "COMPLETED", error: { type: "generation_error", msg: "nsfw" } });
    }
    throw new Error("result must not be fetched");
  };
  await assert.rejects(
    () => falGenerate("k", "fal-ai/nano-banana-2", job, fetchImpl, undefined, 80),
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      assert.equal(text.includes("[object Object]"), false);
      assert.ok(text.includes("nsfw"));
      return true;
    },
  );
});

test("gpt fal payload uses image_size and quality instead of aspect_ratio", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    if (!String(input).includes("/requests/")) {
      body = String(init?.body ?? "");
      return jsonResponse(422, { detail: "stop" });
    }
    throw new Error("poll must not run");
  };
  await assert.rejects(() =>
    falGenerate(
      "k",
      "openai/gpt-image-2.5/flare/text-to-image",
      { prompt: "red square", aspectRatio: "16:9", resolution: "2K", referenceDataUris: [] },
      fetchImpl,
    ),
  );
  const parsed = JSON.parse(body) as Record<string, unknown>;
  assert.equal(parsed.image_size, "landscape_16_9");
  assert.equal(parsed.quality, "high");
  assert.equal(parsed.aspect_ratio, undefined);
  assert.equal(parsed.resolution, undefined);
});

test("fal reads images nested under data", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (!url.includes("/requests/")) return jsonResponse(200, { request_id: "req-5" });
    if (url.endsWith("/status")) return jsonResponse(200, { status: "COMPLETED" });
    return jsonResponse(200, { data: { images: [{ url: "https://cdn.example/out.png", content_type: "image/png" }] } });
  };
  const image = await falGenerate("k", "fal-ai/nano-banana-2", job, fetchImpl, undefined, 80);
  assert.equal(image.url, "https://cdn.example/out.png");
});

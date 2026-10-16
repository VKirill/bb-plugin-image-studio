import assert from "node:assert/strict";
import { test } from "node:test";
import { falGenerate, falPollUrls, formatUnknownError, kieGenerate } from "../src/providers.ts";

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
  assert.equal("enable_prompt_expansion" in parsed, false);
  assert.equal(parsed.enable_safety_checker, false);
  assert.equal("safety_tolerance" in parsed, false);
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

test("kie payload disables nsfw checker on models that have the field", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = String(init?.body ?? "");
    return jsonResponse(200, { code: 400, msg: "stop" });
  };
  await assert.rejects(() =>
    kieGenerate("k", "seedream/5-pro-text-to-image", { prompt: "red square", referenceDataUris: [] }, fetchImpl),
  );
  const parsed = JSON.parse(body) as { model: string; input: Record<string, unknown> };
  assert.equal(parsed.model, "seedream/5-pro-text-to-image");
  assert.equal(parsed.input.nsfw_checker, false);
});

test("qwen kie maps 4:5 and 4K and uses image_urls", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("file-base64-upload") || url.includes("file-url-upload")) {
      return jsonResponse(200, { data: { downloadUrl: "https://cdn.example/ref.png" } });
    }
    body = String(init?.body ?? "");
    return jsonResponse(200, { code: 400, msg: "stop" });
  };
  await assert.rejects(() =>
    kieGenerate(
      "k",
      "qwen2-1/image-to-image",
      {
        prompt: "edit the mug",
        aspectRatio: "4:5",
        resolution: "4K",
        referenceDataUris: ["data:image/png;base64,QQ=="],
        kieRefField: "image_urls",
      },
      fetchImpl,
    ),
  );
  const parsed = JSON.parse(body) as { model: string; input: Record<string, unknown> };
  assert.equal(parsed.model, "qwen2-1/image-to-image");
  assert.equal(parsed.input.nsfw_checker, false);
  assert.equal(parsed.input.aspect_ratio, "3:4");
  assert.equal(parsed.input.resolution, "2K");
  assert.deepEqual(parsed.input.image_urls, ["https://cdn.example/ref.png"]);
});

// ---- rate limits and server errors ----

const noWait = { sleep: async () => undefined, baseMs: 1, random: () => 0.5 };

function kieFetch(script: Array<(url: string) => Response | undefined>, seen: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    for (const step of script) {
      const response = step(url);
      if (response) return response;
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

const taskOk = (url: string) =>
  url.includes("createTask") ? jsonResponse(200, { code: 200, data: { taskId: "t1" } }) : undefined;
const taskDone = (url: string) =>
  url.includes("recordInfo")
    ? jsonResponse(200, { data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://x/y.png"] }) } })
    : undefined;

test("kie createTask: a 429 in the body (HTTP 200) is retried, then succeeds", async () => {
  const seen: string[] = [];
  let creates = 0;
  const fetchImpl = kieFetch(
    [
      (url) => {
        if (!url.includes("createTask")) return undefined;
        creates += 1;
        return creates < 3 ? jsonResponse(200, { code: 429, msg: "rate limit" }) : jsonResponse(200, { code: 200, data: { taskId: "t1" } });
      },
      taskDone,
    ],
    seen,
  );
  const image = await kieGenerate("k", "nano-banana-2-1", { prompt: "p", referenceDataUris: [] }, fetchImpl, undefined, noWait);
  assert.equal(image.url, "https://x/y.png");
  assert.equal(creates, 3);
});

test("kie createTask: a 500 is NOT retried, so a paid task is never created twice", async () => {
  const seen: string[] = [];
  const fetchImpl = kieFetch([(url) => (url.includes("createTask") ? jsonResponse(500, { code: 500, msg: "server error" }) : undefined)], seen);
  await assert.rejects(
    () => kieGenerate("k", "nano-banana-2-1", { prompt: "p", referenceDataUris: [] }, fetchImpl, undefined, noWait),
    /server error/,
  );
  assert.equal(seen.filter((u) => u.includes("createTask")).length, 1);
});

test("kie createTask: still rate limited after the retries gives a readable error", async () => {
  const seen: string[] = [];
  const fetchImpl = kieFetch([(url) => (url.includes("createTask") ? jsonResponse(200, { code: 429, msg: "Rate limit exceeded" }) : undefined)], seen);
  await assert.rejects(
    () => kieGenerate("k", "nano-banana-2-1", { prompt: "p", referenceDataUris: [] }, fetchImpl, undefined, { ...noWait, retries: 2 }),
    /Rate limit exceeded/,
  );
  assert.equal(seen.length, 3);
});

test("kie reference upload and status polling retry 429 and 5xx", async () => {
  const seen: string[] = [];
  let uploads = 0;
  let polls = 0;
  const fetchImpl = kieFetch(
    [
      (url) => {
        if (!url.includes("file-base64-upload")) return undefined;
        uploads += 1;
        return uploads === 1
          ? new Response("Bad gateway", { status: 502 })
          : jsonResponse(200, { code: 200, data: { downloadUrl: "https://hosted/ref.png" } });
      },
      taskOk,
      (url) => {
        if (!url.includes("recordInfo")) return undefined;
        polls += 1;
        return polls === 1
          ? jsonResponse(200, { code: 429, msg: "slow down" })
          : jsonResponse(200, { data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://x/z.png"] }) } });
      },
    ],
    seen,
  );
  const image = await kieGenerate(
    "k",
    "nano-banana-2-1",
    { prompt: "p", referenceDataUris: ["data:image/png;base64,AAAA"] },
    fetchImpl,
    undefined,
    noWait,
  );
  assert.equal(image.url, "https://x/z.png");
  assert.equal(uploads, 2);
  assert.equal(polls, 2);
});

test("fal submit: 429 and gateway errors are retried and Retry-After is honored", async () => {
  const waits: number[] = [];
  let submits = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url === "https://queue.fal.run/fal-ai/nano-banana-2") {
      submits += 1;
      if (submits === 1) return new Response(JSON.stringify({ detail: "rate" }), { status: 429, headers: { "retry-after": "3" } });
      if (submits === 2) return new Response("bad gateway", { status: 502 });
      return jsonResponse(200, { request_id: "r1" });
    }
    if (url.endsWith("/status")) return jsonResponse(200, { status: "COMPLETED" });
    return jsonResponse(200, { images: [{ url: "https://fal/img.png" }] });
  };
  const image = await falGenerate("k", "fal-ai/nano-banana-2", job, fetchImpl, undefined, 80, {
    baseMs: 10,
    random: () => 0.5,
    sleep: async (ms) => void waits.push(ms),
  });
  assert.equal(image.url, "https://fal/img.png");
  assert.equal(submits, 3);
  assert.equal(waits[0], 3000);
  assert.equal(waits[1], 20);
});

test("fal: a content-policy 422 is not retried", async () => {
  let submits = 0;
  const fetchImpl: typeof fetch = async () => {
    submits += 1;
    return jsonResponse(422, { detail: [{ msg: "flagged", type: "content_policy_violation" }] });
  };
  await assert.rejects(() => falGenerate("k", "fal-ai/nano-banana-2", job, fetchImpl, undefined, 80, noWait), /submit failed \(422\)/);
  assert.equal(submits, 1);
});

test("qwen on kie: the prompt enhancer is off, the seed is sent only when given", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("createTask")) {
      bodies.push(JSON.parse(String(init?.body)).input);
      return jsonResponse(200, { code: 200, data: { taskId: "t1" } });
    }
    return jsonResponse(200, { data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://x/q.png"], seed: 77 }) } });
  };
  const first = await kieGenerate("k", "qwen2-1/image-to-image", { prompt: "p", referenceDataUris: [] }, fetchImpl, undefined, noWait);
  const second = await kieGenerate("k", "qwen2-1/text-to-image", { prompt: "p", referenceDataUris: [], seed: 5 }, fetchImpl, undefined, noWait);
  assert.equal(bodies[0]!.enhance_prompt, false);
  assert.equal("seed" in bodies[0]!, false);
  assert.equal(bodies[1]!.enhance_prompt, false);
  assert.equal(bodies[1]!.seed, 5);
  assert.equal(first.seed, 77);
  assert.equal(second.seed, 77);
});

test("other kie models are not sent enhance_prompt or a seed", async () => {
  let sent: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).includes("createTask")) {
      sent = JSON.parse(String(init?.body)).input;
      return jsonResponse(200, { code: 200, data: { taskId: "t1" } });
    }
    return jsonResponse(200, { data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://x/n.png"] }) } });
  };
  const image = await kieGenerate("k", "nano-banana-2-1", { prompt: "p", referenceDataUris: [], seed: 9 }, fetchImpl, undefined, noWait);
  assert.equal("enhance_prompt" in sent, false);
  assert.equal("seed" in sent, false);
  assert.equal(image.seed, 9);
});

test("fal gets the seed when one is given", async () => {
  let sent: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://queue.fal.run/fal-ai/nano-banana-2") {
      sent = JSON.parse(String(init?.body));
      return jsonResponse(200, { request_id: "r1" });
    }
    if (url.endsWith("/status")) return jsonResponse(200, { status: "COMPLETED" });
    return jsonResponse(200, { images: [{ url: "https://fal/s.png" }], seed: 123 });
  };
  const image = await falGenerate("k", "fal-ai/nano-banana-2", { ...job, seed: 123 }, fetchImpl, undefined, 80, noWait);
  assert.equal(sent.seed, 123);
  assert.equal(image.seed, 123);
});

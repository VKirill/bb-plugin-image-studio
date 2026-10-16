import assert from "node:assert/strict";
import { test } from "node:test";
import { FAL_ENDPOINTS, KIE_MODELS, MODEL_IDS, parseModel, resolveRoute, type EnabledModels } from "../src/models.ts";
import { falGenerate, kieGenerate, wanAspect } from "../src/providers.ts";
import { falHasPromptExpansion, falSafetyFields, kieHasNsfwChecker } from "../src/safety.ts";
import { refLimit } from "../src/refs.ts";
import { DEFAULT_SETTINGS, enabledFromSettings, mergeSettings } from "../src/settings.ts";

test("fal: which endpoints get which safety field (schema-checked)", () => {
  const tolerance = ["fal-ai/nano-banana-2", "fal-ai/nano-banana-2/edit", "google/nano-banana-2.1", "google/nano-banana-2.1/edit", "fal-ai/nano-banana-pro", "fal-ai/nano-banana-pro/edit"];
  for (const endpoint of tolerance) assert.deepEqual(falSafetyFields(endpoint), { safety_tolerance: "6" }, endpoint);
  for (const endpoint of ["fal-ai/flux-2-pro", "fal-ai/flux-2-pro/edit"]) {
    assert.deepEqual(falSafetyFields(endpoint), { safety_tolerance: "5", enable_safety_checker: false }, endpoint);
  }
  const checker = [
    "bytedance/seedream/v5/pro/text-to-image",
    "bytedance/seedream/v5/pro/edit",
    "openai/gpt-image-2.5/flare/text-to-image",
    "openai/gpt-image-2.5/flare/edit",
    "openai/gpt-image-2.5/sunburst/text-to-image",
    "openai/gpt-image-2.5/sunburst/edit",
    "xai/grok-imagine-image/v2.0/text-to-image",
    "xai/grok-imagine-image/v2.0/edit",
    "fal-ai/wan/v2.7/text-to-image",
    "fal-ai/wan/v2.7/edit",
  ];
  for (const endpoint of checker) assert.deepEqual(falSafetyFields(endpoint), { enable_safety_checker: false }, endpoint);
  // Muse has no safety field: nothing is sent.
  assert.deepEqual(falSafetyFields("meta/muse-image/text-to-image"), {});
  assert.deepEqual(falSafetyFields("meta/muse-image/edit"), {});
  assert.deepEqual(falSafetyFields("someone/new-model"), {});
  // Every configured fal endpoint is covered by a deliberate rule (or is Muse).
  for (const id of MODEL_IDS) {
    const endpoints = FAL_ENDPOINTS[id];
    if (!endpoints) continue;
    const fields = falSafetyFields(endpoints.generate);
    assert.equal(Object.keys(fields).length > 0, id !== "muse-image", id);
  }
});

test("fal payloads carry exactly the fields the endpoint takes", async () => {
  async function payload(endpoint: string): Promise<Record<string, unknown>> {
    let body = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ detail: "stop" }), { status: 422, headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(() => falGenerate("k", endpoint, { prompt: "p", referenceDataUris: [] }, fetchImpl));
    return JSON.parse(body) as Record<string, unknown>;
  }
  const nano = await payload("google/nano-banana-2.1");
  assert.equal(nano.safety_tolerance, "6");
  assert.equal("enable_safety_checker" in nano, false);
  assert.equal("enable_prompt_expansion" in nano, false);
  const flux = await payload("fal-ai/flux-2-pro");
  assert.equal(flux.safety_tolerance, "5");
  assert.equal(flux.enable_safety_checker, false);
  const muse = await payload("meta/muse-image/text-to-image");
  for (const key of ["safety_tolerance", "enable_safety_checker", "enable_prompt_expansion"]) assert.equal(key in muse, false, key);
  const seedream = await payload("bytedance/seedream/v5/pro/text-to-image");
  assert.equal(seedream.enable_safety_checker, false);
  assert.equal("enable_prompt_expansion" in seedream, false);
  const wanCreate = await payload("fal-ai/wan/v2.7/text-to-image");
  assert.equal(wanCreate.enable_safety_checker, false);
  assert.equal("enable_prompt_expansion" in wanCreate, false);
  assert.equal(wanCreate.image_size, "square_hd");
  const wanEdit = await payload("fal-ai/wan/v2.7/edit");
  assert.equal(wanEdit.enable_safety_checker, false);
  assert.equal(wanEdit.enable_prompt_expansion, false);
  assert.equal(falHasPromptExpansion("fal-ai/wan/v2.7/edit"), true);
  assert.equal(falHasPromptExpansion("fal-ai/wan/v2.7/text-to-image"), false);
});

test("kie: nsfw_checker only where the schema lists it", async () => {
  async function input(model: string): Promise<Record<string, unknown>> {
    let body = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ code: 400, msg: "stop" }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(() => kieGenerate("k", model, { prompt: "p", referenceDataUris: [] }, fetchImpl, undefined, { retries: 0 }));
    return (JSON.parse(body) as { input: Record<string, unknown> }).input;
  }
  for (const model of ["qwen2-1/text-to-image", "seedream/5-pro-text-to-image", "flux-2/pro-text-to-image", "grok-imagine/text-to-image", "wan/2-7-image"]) {
    assert.equal(kieHasNsfwChecker(model), true, model);
    assert.equal((await input(model)).nsfw_checker, false, model);
  }
  for (const model of ["nano-banana-2", "nano-banana-2-1", "nano-banana-pro", "gpt-image-2-5-flare-text-to-image"]) {
    assert.equal(kieHasNsfwChecker(model), false, model);
    assert.equal("nsfw_checker" in (await input(model)), false, model);
  }
});

test("Wan 2.7 on kie: one image, no output_format, nearest aspect, 4K becomes 2K", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (_url, init) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ code: 400, msg: "stop" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(() =>
    kieGenerate("k", "wan/2-7-image", { prompt: "p", aspectRatio: "4:5", resolution: "4K", referenceDataUris: [] }, fetchImpl, undefined, { retries: 0 }),
  );
  const parsed = JSON.parse(body) as { model: string; input: Record<string, unknown> };
  assert.equal(parsed.model, "wan/2-7-image");
  assert.equal(parsed.input.n, 1);
  assert.equal("output_format" in parsed.input, false);
  assert.equal(parsed.input.aspect_ratio, "3:4");
  assert.equal(parsed.input.resolution, "2K");
  assert.equal(parsed.input.nsfw_checker, false);
  // An aspect ratio without a resolution is refused by kie: the default 2K is sent.
  let second = "";
  const fetch2: typeof fetch = async (_url, init) => {
    second = String(init?.body ?? "");
    return new Response(JSON.stringify({ code: 400, msg: "stop" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(() => kieGenerate("k", "wan/2-7-image", { prompt: "p", aspectRatio: "1:1", referenceDataUris: [] }, fetch2, undefined, { retries: 0 }));
  assert.equal((JSON.parse(second) as { input: Record<string, unknown> }).input.resolution, "2K");
  await assert.rejects(() => kieGenerate("k", "wan/2-7-image", { prompt: "p", referenceDataUris: [] }, fetch2, undefined, { retries: 0 }));
  assert.equal("resolution" in (JSON.parse(second) as { input: Record<string, unknown> }).input, false);
  assert.equal(wanAspect("1:1"), "1:1");
  assert.equal(wanAspect("2:3"), "3:4");
  assert.equal(wanAspect("3:2"), "4:3");
  assert.equal(wanAspect("21:9"), "21:9");
});

test("Wan 2.7: aliases, endpoints, caps, routing, default on", () => {
  for (const alias of ["wan", "Wan 2.7", "wan2.7", "wan27", "wan-2.7"]) assert.equal(parseModel(alias), "wan-2.7", alias);
  assert.deepEqual(FAL_ENDPOINTS["wan-2.7"], { generate: "fal-ai/wan/v2.7/text-to-image", edit: "fal-ai/wan/v2.7/edit" });
  assert.deepEqual(KIE_MODELS["wan-2.7"], { generate: "wan/2-7-image", edit: "wan/2-7-image", refField: "input_urls" });
  assert.equal(refLimit("wan-2.7", "kie"), 9);
  assert.equal(refLimit("wan-2.7", "fal"), 4);
  assert.equal(DEFAULT_SETTINGS.wan27, true);
  assert.equal(mergeSettings({}).wan27, true);
  assert.equal(mergeSettings({ wan27: false }).wan27, false);
  const enabled = enabledFromSettings(DEFAULT_SETTINGS) as EnabledModels;
  assert.equal(enabled["wan-2.7"], true);
  const base = { requestedModel: "wan", defaultGateway: "kie" as const, hasFalKey: true, hasKieKey: true, enabled };
  assert.deepEqual(resolveRoute(base), { ok: true, model: "wan-2.7", gateway: "kie" });
  assert.deepEqual(resolveRoute({ ...base, requestedGateway: "fal" }), { ok: true, model: "wan-2.7", gateway: "fal" });
});

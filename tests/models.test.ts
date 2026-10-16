import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FAL_ENDPOINTS,
  KIE_MODELS,
  filterModelCatalog,
  parseModel,
  pickSecret,
  resolveRoute,
  type EnabledModels,
} from "../src/models.ts";

function enabled(overrides: Partial<EnabledModels> = {}): EnabledModels {
  return {
    "nano-banana-2": true,
    "nano-banana-2.1": true,
    "nano-banana-pro": true,
    "muse-image": true,
    "gpt-image-2.5-flare": false,
    "gpt-image-2.5-sunburst": false,
    "flux-2-pro": false,
    "seedream-5": false,
    "grok-imagine": false,
    "qwen-image-2.1": false,
    ...overrides,
  };
}

const enabledAll = enabled();

test("manual key wins over catalog", () => {
  assert.equal(pickSecret("  typed  ", "CATALOG"), "typed");
  assert.equal(pickSecret("", "CATALOG"), "CATALOG");
  assert.equal(pickSecret("", null), null);
});

test("muse image requires fal", () => {
  const route = resolveRoute({
    requestedModel: "muse-image",
    enabled: enabledAll,
    defaultGateway: "kie",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.deepEqual(route, { ok: true, model: "muse-image", gateway: "fal" });
});

test("disabled model is rejected", () => {
  const route = resolveRoute({
    requestedModel: "nano-banana-2",
    enabled: enabled({ "nano-banana-2": false }),
    defaultGateway: "fal",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.equal(route.ok, false);
});

test("muse plus kie is rejected", () => {
  const route = resolveRoute({
    requestedModel: "muse-image",
    requestedGateway: "kie",
    enabled: enabledAll,
    defaultGateway: "kie",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.equal(route.ok, false);
  if (!route.ok) assert.match(route.error, /fal\.ai only/);
});

test("banana uses kie when that is the preferred gateway", () => {
  const route = resolveRoute({
    requestedModel: "nano-banana-2",
    enabled: enabledAll,
    defaultGateway: "kie",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.deepEqual(route, { ok: true, model: "nano-banana-2", gateway: "kie" });
});

test("falls back to fal when kie key is missing", () => {
  const route = resolveRoute({
    requestedModel: "nano-banana-2",
    enabled: enabledAll,
    defaultGateway: "kie",
    hasFalKey: true,
    hasKieKey: false,
  });
  assert.deepEqual(route, { ok: true, model: "nano-banana-2", gateway: "fal" });
});

test("falls back to kie when fal key is missing", () => {
  const route = resolveRoute({
    requestedModel: "nano-banana-pro",
    enabled: enabledAll,
    defaultGateway: "fal",
    hasFalKey: false,
    hasKieKey: true,
  });
  assert.deepEqual(route, { ok: true, model: "nano-banana-pro", gateway: "kie" });
});

test("gpt image 2.5 flare uses kie when that is preferred", () => {
  const on = enabled({ "gpt-image-2.5-flare": true });
  const route = resolveRoute({
    requestedModel: "gpt",
    enabled: on,
    defaultGateway: "kie",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.deepEqual(route, { ok: true, model: "gpt-image-2.5-flare", gateway: "kie" });
});

test("legacy gpt-image-1.5 name maps to flare", () => {
  const on = enabled({ "gpt-image-2.5-flare": true });
  const route = resolveRoute({
    requestedModel: "gpt-image-1.5",
    enabled: on,
    defaultGateway: "fal",
    hasFalKey: true,
    hasKieKey: false,
  });
  assert.deepEqual(route, { ok: true, model: "gpt-image-2.5-flare", gateway: "fal" });
});

test("catalog search matches flare aliases", () => {
  const ids = filterModelCatalog("flare", (id) => id);
  assert.deepEqual(ids, ["gpt-image-2.5-flare"]);
});

test("qwen image 2.1 uses kie even when fal is preferred", () => {
  const on = enabled({ "qwen-image-2.1": true });
  const route = resolveRoute({
    requestedModel: "qwen",
    enabled: on,
    defaultGateway: "fal",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.deepEqual(route, { ok: true, model: "qwen-image-2.1", gateway: "kie" });
});

test("qwen plus fal is rejected", () => {
  const on = enabled({ "qwen-image-2.1": true });
  const route = resolveRoute({
    requestedModel: "qwen-image-2.1",
    requestedGateway: "fal",
    enabled: on,
    defaultGateway: "kie",
    hasFalKey: true,
    hasKieKey: true,
  });
  assert.equal(route.ok, false);
  if (!route.ok) assert.match(route.error, /kie\.ai only/);
});

test("nano banana 2.1: aliases, endpoints and kie fields", () => {
  for (const alias of ["nano-banana-2.1", "nano-banana-2-1", "nb2.1", "nb21", "NB 2.1", "banana 2.1", "Nano Banana 2.1"]) {
    assert.equal(parseModel(alias), "nano-banana-2.1", alias);
  }
  assert.equal(parseModel("nb2"), "nano-banana-2");
  assert.equal(parseModel("nano-banana-2"), "nano-banana-2");
  assert.deepEqual(FAL_ENDPOINTS["nano-banana-2.1"], {
    generate: "google/nano-banana-2.1",
    edit: "google/nano-banana-2.1/edit",
  });
  assert.deepEqual(KIE_MODELS["nano-banana-2.1"], {
    generate: "nano-banana-2-1",
    edit: "nano-banana-2-1",
    refField: "image_input",
  });
});

test("nano banana 2.1 routes on both gateways and honors the toggle", () => {
  const base = { requestedModel: "nb2.1", defaultGateway: "kie" as const, hasFalKey: true, hasKieKey: true };
  assert.deepEqual(resolveRoute({ ...base, enabled: enabled() }), { ok: true, model: "nano-banana-2.1", gateway: "kie" });
  assert.deepEqual(resolveRoute({ ...base, requestedGateway: "fal", enabled: enabled() }), {
    ok: true,
    model: "nano-banana-2.1",
    gateway: "fal",
  });
  assert.equal(resolveRoute({ ...base, enabled: enabled({ "nano-banana-2.1": false }) }).ok, false);
});

test("the model catalog finds nano banana 2.1 by name", () => {
  const found = filterModelCatalog("2.1", (id) => id);
  assert.ok(found.includes("nano-banana-2.1"));
  assert.ok(found.includes("qwen-image-2.1"));
});

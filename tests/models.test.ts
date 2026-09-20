import assert from "node:assert/strict";
import { test } from "node:test";
import { filterModelCatalog, pickSecret, resolveRoute, type EnabledModels } from "../src/models.ts";

function enabled(overrides: Partial<EnabledModels> = {}): EnabledModels {
  return {
    "nano-banana-2": true,
    "nano-banana-pro": true,
    "muse-image": true,
    "gpt-image-2.5-flare": false,
    "gpt-image-2.5-sunburst": false,
    "flux-2-pro": false,
    "seedream-5": false,
    "grok-imagine": false,
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

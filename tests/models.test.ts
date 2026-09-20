import assert from "node:assert/strict";
import { test } from "node:test";
import { pickSecret, resolveRoute } from "../src/models.ts";

const enabledAll = { nanoBanana2: true, nanoBananaPro: true, museImage: true };

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
    enabled: { nanoBanana2: false, nanoBananaPro: true, museImage: true },
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

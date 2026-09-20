import assert from "node:assert/strict";
import { test } from "node:test";
import { aspectLabel, resolvePickerSelection } from "../src/formats.ts";

const enabledAll = { nanoBanana2: true, nanoBananaPro: true, museImage: true };

test("remembered choice wins when the agent did not suggest a model", () => {
  const choice = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "kie",
    last: { model: "muse-image", gateway: "fal", aspectRatio: "9:16", resolution: "2K" },
  });
  assert.equal(choice.model, "muse-image");
  assert.equal(choice.aspectRatio, "9:16");
  assert.equal(choice.gateway, "fal");
});

test("a named model this turn overrides the remembered one", () => {
  const choice = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "fal",
    last: { model: "muse-image", gateway: "fal", aspectRatio: "1:1", resolution: "1K" },
    suggestedModel: "nano-banana-pro",
    suggestedAspect: "16:9",
  });
  assert.equal(choice.model, "nano-banana-pro");
  assert.equal(choice.aspectRatio, "16:9");
});

test("disabled remembered model falls back to an enabled one", () => {
  const choice = resolvePickerSelection({
    enabled: { nanoBanana2: true, nanoBananaPro: false, museImage: false },
    defaultGateway: "fal",
    last: { model: "muse-image", gateway: "fal", aspectRatio: "1:1", resolution: "1K" },
  });
  assert.equal(choice.model, "nano-banana-2");
});

test("nano banana defaults to 2K when nothing was named", () => {
  const choice = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "fal",
    last: null,
  });
  assert.equal(choice.model, "nano-banana-2");
  assert.equal(choice.resolution, "2K");
  assert.equal(choice.aspectRatio, "4:5");
});

test("a named aspect this turn overrides the remembered one", () => {
  const named = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "fal",
    last: { model: "nano-banana-2", gateway: "fal", aspectRatio: "4:5", resolution: "2K" },
    suggestedAspect: "16:9",
  });
  assert.equal(named.aspectRatio, "16:9");
});

test("aspectLabel maps pixel size to nearest named frame", () => {
  assert.equal(aspectLabel(1920, 1080), "16:9");
  assert.equal(aspectLabel(1080, 1920), "9:16");
  assert.equal(aspectLabel(1024, 1024), "1:1");
  assert.equal(aspectLabel(1080, 1350), "4:5");
});

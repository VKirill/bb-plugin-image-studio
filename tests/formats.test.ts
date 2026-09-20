import assert from "node:assert/strict";
import { test } from "node:test";
import { aspectLabel, gptImageQuality, gptImageSize, resolvePickerSelection } from "../src/formats.ts";
import type { EnabledModels } from "../src/models.ts";

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
    defaultGateway: "kie",
    last: { model: "muse-image", gateway: "fal", aspectRatio: "1:1", resolution: "1K" },
    suggestedModel: "nano-banana-pro",
    suggestedAspect: "16:9",
  });
  assert.equal(choice.model, "nano-banana-pro");
  assert.equal(choice.gateway, "kie");
  assert.equal(choice.aspectRatio, "16:9");
});

test("disabled remembered model falls back to an enabled one", () => {
  const choice = resolvePickerSelection({
    enabled: enabled({
      "nano-banana-2": true,
      "nano-banana-pro": false,
      "muse-image": false,
    }),
    defaultGateway: "fal",
    last: { model: "muse-image", gateway: "fal", aspectRatio: "1:1", resolution: "1K" },
  });
  assert.equal(choice.model, "nano-banana-2");
});

test("nano banana defaults to kie when nothing was named", () => {
  const choice = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "kie",
    last: null,
  });
  assert.equal(choice.model, "nano-banana-2");
  assert.equal(choice.gateway, "kie");
  assert.equal(choice.resolution, "2K");
  assert.equal(choice.aspectRatio, "4:5");
});

test("banana remembered fal still follows the kie preference", () => {
  const choice = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "kie",
    last: { model: "nano-banana-2", gateway: "fal", aspectRatio: "4:5", resolution: "2K" },
  });
  assert.equal(choice.model, "nano-banana-2");
  assert.equal(choice.gateway, "kie");
});

test("a named fal this turn still sends banana through fal", () => {
  const choice = resolvePickerSelection({
    enabled: enabledAll,
    defaultGateway: "kie",
    last: { model: "nano-banana-2", gateway: "kie", aspectRatio: "4:5", resolution: "2K" },
    suggestedGateway: "fal",
  });
  assert.equal(choice.gateway, "fal");
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

test("gpt image 2.5 maps aspect to fal presets and 4K to xhigh", () => {
  assert.equal(gptImageSize("16:9"), "landscape_16_9");
  assert.equal(gptImageSize("9:16"), "portrait_16_9");
  assert.equal(gptImageSize("1:1"), "square_hd");
  assert.equal(gptImageQuality("1K"), "medium");
  assert.equal(gptImageQuality("2K"), "high");
  assert.equal(gptImageQuality("4K"), "xhigh");
});

test("named gpt image uses the preferred gateway", () => {
  const choice = resolvePickerSelection({
    enabled: enabled({ "gpt-image-2.5-flare": true }),
    defaultGateway: "kie",
    last: null,
    suggestedModel: "gpt-image",
  });
  assert.equal(choice.model, "gpt-image-2.5-flare");
  assert.equal(choice.gateway, "kie");
});

test("aspectLabel maps pixel size to nearest named frame", () => {
  assert.equal(aspectLabel(1920, 1080), "16:9");
  assert.equal(aspectLabel(1080, 1920), "9:16");
  assert.equal(aspectLabel(1024, 1024), "1:1");
  assert.equal(aspectLabel(1080, 1350), "4:5");
});

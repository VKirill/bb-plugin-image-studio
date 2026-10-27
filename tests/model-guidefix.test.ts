import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeRgba, type Rgba } from "../src/image-io.ts";
import { buildTextureUvPrompt, guideFix } from "../src/model.ts";

test("guideFix on scepter fixtures matches expected stats within 1%", async () => {
  const guideBytes = readFileSync(new URL("./fixtures/model/scepter-guide.png", import.meta.url));
  const museBytes = readFileSync(new URL("./fixtures/model/scepter-muse.webp", import.meta.url));

  const guideRgba = await decodeRgba(guideBytes);
  const museRgba = await decodeRgba(museBytes);

  const result = guideFix(museRgba, guideRgba);

  const expectedDark = 49801;
  const expectedHue = 13823;
  const expectedMask = 780480;

  const darkDiff = Math.abs(result.darkFilled - expectedDark) / expectedDark;
  const hueDiff = Math.abs(result.hueFixed - expectedHue) / expectedHue;
  const maskDiff = Math.abs(result.maskPixels - expectedMask) / expectedMask;

  assert.ok(
    darkDiff <= 0.01,
    `darkFilled ${result.darkFilled} differs from ${expectedDark} by ${(darkDiff * 100).toFixed(2)}% (> 1%)`,
  );
  assert.ok(
    hueDiff <= 0.01,
    `hueFixed ${result.hueFixed} differs from ${expectedHue} by ${(hueDiff * 100).toFixed(2)}% (> 1%)`,
  );
  assert.ok(
    maskDiff <= 0.01,
    `maskPixels ${result.maskPixels} differs from ${expectedMask} by ${(maskDiff * 100).toFixed(2)}% (> 1%)`,
  );
});

test("guideFix synthetic test: checks each rule and leaves unmasked pixels unchanged", () => {
  // 4 pixels:
  // 0: background (guide sum <= 30) -> stays muse
  // 1: dark gap (guide sum > 30, muse sum < 60) -> guide * 1.25
  // 2: hue swap (guide sat > 0.35, muse sat > 0.25, dh > 22, not dark) -> guide with muse lum
  // 3: matching hue inside mask -> stays muse
  const guideData = new Uint8Array([
    0, 0, 0, 255,          // 0: sum 0 <= 30 (outside mask)
    40, 40, 40, 255,       // 1: sum 120 > 30 (mask)
    255, 0, 0, 255,        // 2: red, hue 0, sat 1.0 > 0.35
    0, 255, 0, 255,        // 3: green, hue 120, sat 1.0 > 0.35
  ]);
  const museData = new Uint8Array([
    100, 100, 100, 255,    // 0: should remain 100, 100, 100
    10, 10, 10, 255,       // 1: sum 30 < 60 (dark gap) -> 40 * 1.25 = 50
    0, 0, 255, 255,        // 2: blue, hue 240, sat 1.0 > 0.25, dh = 120 > 22 -> swap
    0, 220, 0, 255,        // 3: green, hue 120, sat 1.0, dh = 0 <= 22 -> stays muse
  ]);

  const guide: Rgba = { data: guideData, width: 2, height: 2 };
  const muse: Rgba = { data: museData, width: 2, height: 2 };

  const res = guideFix(muse, guide, { hue: true });
  assert.equal(res.maskPixels, 3);
  assert.equal(res.darkFilled, 1);
  assert.equal(res.hueFixed, 1);

  // Pixel 0: outside mask stays muse
  assert.equal(res.image.data[0], 100);
  assert.equal(res.image.data[1], 100);
  assert.equal(res.image.data[2], 100);

  // Pixel 1: dark gap filled with guide * 1.25
  assert.equal(res.image.data[4], 50);
  assert.equal(res.image.data[5], 50);
  assert.equal(res.image.data[6], 50);

  // Pixel 2: hue swapped to guide * clamp(muse_mean / guide_mean, 0.7, 1.4)
  // muse_mean = (0+0+255)/3 = 85. guide_mean = (255+0+0)/3 = 85. lumRatio = 1.0.
  // red guide (255, 0, 0) * 1.0 = (255, 0, 0)
  assert.equal(res.image.data[8], 255);
  assert.equal(res.image.data[9], 0);
  assert.equal(res.image.data[10], 0);

  // Pixel 3: matching hue stays muse
  assert.equal(res.image.data[12], 0);
  assert.equal(res.image.data[13], 220);
  assert.equal(res.image.data[14], 0);

  // When hue: false, hue swaps are not fixed
  const resNoHue = guideFix(muse, guide, { hue: false });
  assert.equal(resNoHue.maskPixels, 3);
  assert.equal(resNoHue.darkFilled, 1);
  assert.equal(resNoHue.hueFixed, 0);
  // Pixel 2 should stay blue muse (0, 0, 255)
  assert.equal(resNoHue.image.data[8], 0);
  assert.equal(resNoHue.image.data[9], 0);
  assert.equal(resNoHue.image.data[10], 255);
});

test("prompt with only base parts locks material colours; with a marker part it does not", () => {
  const baseOnlyPrompt = buildTextureUvPrompt({
    subject: "plunger scepter",
    parts: [
      { color: "#ffad1f", part: "gold crown", kind: "base", marker: false },
      { color: "#cc2222", part: "red rubber", kind: "base", marker: false },
    ],
    projected: false,
    hasConcept: false,
    hasStyle: false,
    task: "game prop",
  });
  assert.match(
    baseOnlyPrompt,
    /Must not change: the position, outline and size of every shape; the material color of every shape \(gold crown stays gold, red rubber stays red\); the black background\./,
  );

  const markerPrompt = buildTextureUvPrompt({
    subject: "plunger scepter",
    parts: [
      { color: "#ffad1f", part: "gold crown", kind: "base", marker: false },
      { color: "#e619e6", part: "accent", kind: "marker", marker: true },
    ],
    projected: false,
    hasConcept: false,
    hasStyle: false,
    task: "game prop",
  });
  assert.doesNotMatch(markerPrompt, /material color/);
  assert.doesNotMatch(markerPrompt, /the base colors/);
});

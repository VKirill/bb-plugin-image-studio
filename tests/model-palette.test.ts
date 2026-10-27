import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rgba } from "../src/image-io.ts";
import {
  buildTextureUvPrompt,
  extractGuidePalette,
  layoutColorPhrase,
  resolveTextureUvParts,
} from "../src/model.ts";

function rgba(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const p = (y * w + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = a;
    }
  }
  return { data, width: w, height: h };
}

test("extractGuidePalette finds white, light grey, brown and blue with English names", () => {
  const guide = rgba(40, 40, (x, y) => {
    if (x < 10) return [250, 250, 250, 255];
    if (x < 20) return [201, 201, 205, 255];
    if (x < 30) return [120, 72, 38, 255];
    return [70, 130, 210, 255];
  });
  const mask = rgba(40, 40, () => [255, 255, 255, 255]);
  const palette = extractGuidePalette(guide, mask);
  const names = palette.map((p) => p.name);
  assert.ok(names.includes("white"));
  assert.ok(names.includes("light grey"));
  assert.ok(names.some((n) => n.includes("brown")));
  assert.ok(names.some((n) => n.includes("blue")));
  assert.equal(palette.length, 4);
});

test("resolveTextureUvParts maps #hex parts to palette swatches in the LAYOUT line", () => {
  const palette = [
    { color: "#c9c9cd", name: "light grey", share: 0.25 },
    { color: "#f2f2f2", name: "white", share: 0.25 },
  ];
  const parts = resolveTextureUvParts(
    [{ material: "body", part: "body", color: "textured" }],
    palette,
    { "#c9c9cd": "grey metal clamp" },
  );
  const grey = parts.find((p) => p.color.toLowerCase() === "#c9c9cd");
  assert.equal(grey?.part, "grey metal clamp");
  assert.match(layoutColorPhrase(grey!), /light grey \(#c9c9cd\) = grey metal clamp/);
});

test("Game look line is lower priority than Task and reference images", () => {
  const prompt = buildTextureUvPrompt({
    subject: "fire mop",
    parts: [{ color: "#c9c9cd", part: "clamp", colorName: "light grey" }],
    projected: false,
    hasConcept: true,
    hasStyle: false,
    task: "basalt stone with warm cracks",
    theme: "warm volcanic sunset light",
    artStyle: "toon: bold outlines",
  });
  assert.match(prompt, /lower priority than the Task and the reference images/);
});

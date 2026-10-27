import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTextureUvPrompt, cutAndDilate } from "../src/model.ts";
import type { Rgba } from "../src/image-io.ts";

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

test("texture-uv prompt lists part colours and forbids outlines", () => {
  const prompt = buildTextureUvPrompt({
    parts: [{ color: "#dc382e", part: "wood_handle" }, { color: "#38a044", part: "cloth" }],
    style: "stylized lava arena props",
    hasConcept: true,
    hasStyle: false,
  });
  assert.match(prompt, /#dc382e = wood_handle/);
  assert.match(prompt, /#38a044 = cloth/);
  assert.match(prompt, /no outlines or frames/i);
  assert.match(prompt, /black background stays black/i);
  assert.match(prompt, /stylized lava arena props/);
});

test("cutAndDilate extends colour past the mask edge and leaves the rest empty", () => {
  const color = rgba(12, 12, (x, y) => (x === 5 && y === 5 ? [200, 40, 40, 255] : [0, 0, 0, 0]));
  const mask = rgba(12, 12, (x, y) => (x === 5 && y === 5 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
  const out = cutAndDilate(color, mask, 10);
  assert.equal(out.data[(5 * 12 + 6) * 4]!, 200);
  assert.equal(out.data[(5 * 12 + 6) * 4 + 3]!, 255);
  const far = out.data[(11 * 12 + 11) * 4 + 3]!;
  assert.equal(far, 0);
});

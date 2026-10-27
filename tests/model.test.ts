import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TEXTURE_UV_SCRIPT } from "../src/blender-scripts.ts";
import { buildTextureUvPrompt, cutAndDilate, mergeModelParts } from "../src/model.ts";
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

test("server.ts does not reference a server-side Blender script path", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(server, /blenderScriptPath/);
  assert.doesNotMatch(server, /pluginDir/);
});

test("TEXTURE_UV_SCRIPT matches blender/texture_uv.py byte for byte", () => {
  const disk = readFileSync(new URL("../blender/texture_uv.py", import.meta.url));
  assert.equal(TEXTURE_UV_SCRIPT, disk.toString("utf8"));
});

test("mergeModelParts applies material descriptions from a record", () => {
  const merged = mergeModelParts(
    [{ material: "fire-mop_baked", part: "fire-mop_baked", color: "textured" }],
    { "fire-mop_baked": "scorched rag head" },
  );
  assert.equal(merged[0]?.part, "scorched rag head");
});

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

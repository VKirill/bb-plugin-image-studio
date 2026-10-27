import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TEXTURE_UV_SCRIPT } from "../src/blender-scripts.ts";
import {
  buildTextureUvPrompt,
  cutAndDilate,
  cutConcept,
  hostPath,
  isHostPathAbsolute,
  mergeModelParts,
  subjectFromFile,
} from "../src/model.ts";
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

test("texture-uv projectConcept defaults to false unless explicitly true", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /projectConcept \?\? false/);
});

test("model.ts is browser-safe (no node:path import)", () => {
  const model = readFileSync(new URL("../src/model.ts", import.meta.url), "utf8");
  assert.doesNotMatch(model, /node:path/);
});

test("hostPath turns model take relative paths into absolute host paths", () => {
  const cwd = "/game/project";
  const rel = "image-studio/model/mop/abc123/take-1/preview.png";
  const absolute = hostPath(cwd, rel);
  assert.equal(absolute, "/game/project/image-studio/model/mop/abc123/take-1/preview.png");
  assert.equal(isHostPathAbsolute(absolute), true);
  assert.equal(isHostPathAbsolute(rel), false);
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

test("subjectFromFile turns a file name into a readable subject", () => {
  assert.equal(subjectFromFile("/assets/fire-mop.fbx"), "fire mop");
});

test("buildTextureUvPrompt follows the TZ layout with concept and projection", () => {
  const prompt = buildTextureUvPrompt({
    subject: "fire mop",
    parts: [{ color: "#dc382e", part: "rag head" }],
    projected: true,
    hasConcept: true,
    conceptNote: "a burning mop with charred rags",
    hasStyle: true,
    task: "scorch only at the bottom ends of the rags",
    theme: "lava arena",
    artStyle: "stylized props",
  });
  assert.match(prompt, /Image 1 is the LAYOUT/);
  assert.match(prompt, /projected from the design/);
  assert.match(prompt, /Image 2 is the STYLE AND DESIGN REFERENCE: a burning mop/);
  assert.match(prompt, /Image 3 is the STYLE SHEET/);
  assert.match(prompt, /Task: repaint image 1 as a final hand-painted game texture in the look of image 2: scorch only at the bottom ends of the rags\./);
  assert.match(prompt, /Game look \(lower priority than the Task and the reference images/);
  assert.match(prompt, /lava arena; stylized props/);
  assert.match(prompt, /Must not change:/);
  assert.match(prompt, /the base colors/);
  assert.match(prompt, /faces, eyes and patterns only where they already are/);
  assert.match(prompt, /Do not add outlines or frames/);
});

test("buildTextureUvPrompt for marker-only parts drops base colors lock and adds material colours task", () => {
  const prompt = buildTextureUvPrompt({
    subject: "rock stack",
    parts: [{ color: "#b4b4b4", part: "stone", marker: true }],
    projected: false,
    hasConcept: false,
    hasStyle: false,
    task: "hand-painted stone",
  });
  assert.match(prompt, /marks part \"stone\" \(paint it as stone\)/);
  assert.match(prompt, /real material colours/);
  assert.doesNotMatch(prompt, /the base colors/);
});

test("buildTextureUvPrompt omits Image 2 without a concept", () => {
  const prompt = buildTextureUvPrompt({
    subject: "rock stack",
    parts: [{ color: "#dc382e", part: "stone" }],
    projected: false,
    hasConcept: false,
    hasStyle: false,
    task: "hand-painted stone",
  });
  assert.match(prompt, /Image 1 is the LAYOUT/);
  assert.doesNotMatch(prompt, /Image 2 is the STYLE/);
  assert.match(prompt, /Task: repaint image 1 as a final hand-painted game texture: hand-painted stone/);
  assert.doesNotMatch(prompt, /projected from the design/);
});

test("cutConcept crops to the object and fills the background with the main colour", () => {
  const image = rgba(8, 8, (x, y) => {
    if (x >= 2 && x <= 4 && y >= 2 && y <= 4) return [200, 40, 40, 255];
    return [10, 200, 10, 255];
  });
  const cut = cutConcept(image);
  assert.equal(cut.width, 3);
  assert.equal(cut.height, 3);
  const corner = cut.data[0]!;
  const center = cut.data[(1 * cut.width + 1) * 4]!;
  assert.equal(center, 200);
  assert.equal(corner, center);
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

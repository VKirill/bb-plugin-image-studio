import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeRgba, type Rgba } from "../src/image-io.ts";
import {
  assembleBlueprint,
  buildSideOnlyPrompt,
  cutBlueprint,
  silhouetteSimilarity,
} from "../src/blueprint.ts";

const BG = [200, 200, 200, 255] as const;
const CLAY = [120, 120, 120, 255] as const;

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

function figure(w: number, h: number, wide = false): Rgba {
  return rgba(w, h, (x, y) => {
    if (y < h * 0.15) return [0, 0, 0, 0];
    const cx = wide ? w * 0.35 : w * 0.5;
    const rx = wide ? w * 0.12 : w * 0.22;
    const inside = Math.abs(x - cx) < rx && y > h * 0.2 && y < h * 0.95;
    return inside ? CLAY : [0, 0, 0, 0];
  });
}

function threeViewSheet(front: Rgba, side: Rgba, back: Rgba): Rgba {
  const gap = 24;
  const labelH = 20;
  const maxH = Math.max(front.height, side.height, back.height);
  const w = front.width + side.width + back.width + gap * 4;
  const h = maxH + labelH + 16;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    data[p] = BG[0];
    data[p + 1] = BG[1];
    data[p + 2] = BG[2];
    data[p + 3] = BG[3];
  }
  const blit = (img: Rgba, ox: number) => {
    const oy = labelH + maxH - img.height;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const a = img.data[(y * img.width + x) * 4 + 3]!;
        if (!a) continue;
        const dx = ox + x;
        const dy = oy + y;
        const dst = (dy * w + dx) * 4;
        const src = (y * img.width + x) * 4;
        data.set(img.data.subarray(src, src + 4), dst);
      }
    }
  };
  let x = gap;
  blit(front, x);
  x += front.width + gap;
  blit(side, x);
  x += side.width + gap;
  blit(back, x);
  return { data, width: w, height: h };
}

test("buildSideOnlyPrompt includes Image 2 FRONT VIEW role line", () => {
  const prompt = buildSideOnlyPrompt({ subject: "fire mop", style: "clay+wire", softParts: ["rags"] });
  assert.match(prompt, /Image 2 is the FRONT VIEW of this blueprint/);
});

test("assembleBlueprint replaces copied sheet side with scaled separate profile", () => {
  const front = figure(80, 120, false);
  const copiedSide = figure(80, 120, false);
  const back = figure(70, 100, false);
  const sheet = threeViewSheet(front, copiedSide, back);
  const sheetCut = cutBlueprint(sheet, ["front", "side", "back"]);
  const narrowSide = figure(40, 60, true);
  const sideOnlySheet = threeViewSheet(
    rgba(40, 60, () => BG),
    narrowSide,
    rgba(40, 60, () => BG),
  );
  const sideCut = cutBlueprint(sideOnlySheet, ["side"]);
  const assembled = assembleBlueprint(sheetCut, sideCut, { sideSeparate: true });
  assert.equal(assembled.sideRegenerated, true);
  assert.ok(assembled.sheetSideSimilarity !== undefined && assembled.sheetSideSimilarity > 0.85);
  const frontView = assembled.cut.rawViews.find((v) => v.name === "front");
  const sideView = assembled.cut.rawViews.find((v) => v.name === "side");
  assert.ok(frontView && sideView);
  assert.equal(sideView.image.height, frontView.image.height);
  assert.ok(silhouetteSimilarity(frontView.image, sideView.image) < 0.85);
});

function horizontalContentMargins(image: Rgba): { left: number; right: number } {
  const { data, width, height } = image;
  let minX = width;
  let maxX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < 32) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (minX >= width) return { left: 0, right: 0 };
  return { left: minX, right: width - maxX - 1 };
}

test("0.8.12 side-only sheet: tight crop and centred on the shared canvas", async () => {
  const sheet = await decodeRgba(
    readFileSync(new URL("./fixtures/model/blueprint-side-only-0812.png", import.meta.url)),
  );
  const cut = cutBlueprint(sheet, ["side"]);
  const box = cut.rawViews[0]!.box;
  assert.ok(box.w < sheet.width * 0.45, `box too wide: ${box.w} / ${sheet.width}`);
  const aligned = cut.views[0]!.image;
  const { left, right } = horizontalContentMargins(aligned);
  assert.ok(
    Math.abs(left - right) < aligned.width * 0.1,
    `not centred: left=${left} right=${right} canvasW=${aligned.width}`,
  );
});

test("assembleBlueprint keeps sheet side when sideSeparate is false", () => {
  const front = figure(80, 120, false);
  const copiedSide = figure(80, 120, false);
  const back = figure(70, 100, false);
  const sheet = threeViewSheet(front, copiedSide, back);
  const sheetCut = cutBlueprint(sheet, ["front", "side", "back"]);
  const simBefore = silhouetteSimilarity(
    sheetCut.views.find((v) => v.name === "front")!.image,
    sheetCut.views.find((v) => v.name === "side")!.image,
  );
  const assembled = assembleBlueprint(sheetCut, null, { sideSeparate: false });
  assert.equal(assembled.sideRegenerated, false);
  const simAfter = silhouetteSimilarity(
    assembled.cut.views.find((v) => v.name === "front")!.image,
    assembled.cut.views.find((v) => v.name === "side")!.image,
  );
  assert.equal(simAfter, simBefore);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rgba } from "../src/image-io.ts";
import { classifyViews, cutBlueprint, swapBlueprintBackSide } from "../src/blueprint.ts";

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

test("mislabeled back (edge-on) with copied side relabels and requests a back draw", () => {
  const front = figure(80, 120, false);
  const copiedSide = figure(80, 120, false);
  const edgeOn = figure(40, 120, true);
  const sheet = threeViewSheet(front, copiedSide, edgeOn);
  const cut = cutBlueprint(sheet, ["front", "side", "back"]);
  const classed = classifyViews(cut.views);
  assert.equal(classed.relabeled, true);
  assert.equal(classed.drawn, "back");
  const swapped = swapBlueprintBackSide(cut);
  const sideView = swapped.rawViews.find((v) => v.name === "side");
  assert.ok(sideView && sideView.image.width < 55);
});

test("true side profile is the odd silhouette: no relabel, no extra draw", () => {
  const front = figure(80, 120, false);
  const side = figure(40, 120, true);
  const back = figure(80, 120, false);
  const sheet = threeViewSheet(front, side, back);
  const cut = cutBlueprint(sheet, ["front", "side", "back"]);
  const classed = classifyViews(cut.views);
  assert.equal(classed.relabeled, false);
  assert.equal(classed.drawn, null);
});

test("three copied views fall back to drawing side separately", () => {
  const front = figure(80, 120, false);
  const sheet = threeViewSheet(front, front, front);
  const cut = cutBlueprint(sheet, ["front", "side", "back"]);
  const classed = classifyViews(cut.views);
  assert.equal(classed.drawn, "side");
});

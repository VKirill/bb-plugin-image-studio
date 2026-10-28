import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeRgba, type Rgba } from "../src/image-io.ts";
import {
  buildBlueprintPrompt,
  buildSideOnlyPrompt,
  cutBlueprint,
  findSoftAnchors,
  silhouetteSimilarity,
  SIDE_COPY_THRESHOLD,
} from "../src/blueprint.ts";

const BG = [200, 200, 200, 255] as const;
const CLAY = [120, 120, 120, 255] as const;
const LINE = [0, 0, 0, 255] as const;
const LABEL = [0, 0, 0, 255] as const;
const SOFT = [0xbf, 0xd8, 0xe6, 255] as const;

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

function drawRect(
  data: Uint8Array,
  w: number,
  color: [number, number, number, number],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4;
      data[p] = color[0];
      data[p + 1] = color[1];
      data[p + 2] = color[2];
      data[p + 3] = color[3];
    }
  }
}

/** Three views on light grey: labels on top, figures of different heights and baselines, blue soft on front. */
function syntheticSheet(): Rgba {
  const w = 360;
  const h = 200;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    data[p] = BG[0];
    data[p + 1] = BG[1];
    data[p + 2] = BG[2];
    data[p + 3] = BG[3];
  }
  const cols = [
    { x0: 20, x1: 100, foot: 170, bodyH: 70 },
    { x0: 130, x1: 210, foot: 160, bodyH: 90 },
    { x0: 240, x1: 320, foot: 175, bodyH: 55 },
  ];
  for (const col of cols) {
    drawRect(data, w, LABEL, col.x0 + 10, 8, col.x0 + 50, 22);
    const bodyY0 = col.foot - col.bodyH;
    drawRect(data, w, CLAY, col.x0 + 15, bodyY0, col.x1 - 15, col.foot);
    for (let y = bodyY0; y < col.foot; y += 8) {
      drawRect(data, w, LINE, col.x0 + 15, y, col.x1 - 15, y + 1);
    }
  }
  const front = cols[0]!;
  drawRect(data, w, SOFT, front.x0 + 20, front.foot - 25, front.x0 + 45, front.foot - 5);
  return { data, width: w, height: h };
}

function figure(w: number, h: number, wide = false): Rgba {
  return rgba(w, h, (x, y) => {
    if (y < h * 0.2) return [0, 0, 0, 0];
    const cx = wide ? w * 0.35 : w * 0.5;
    const rx = wide ? w * 0.15 : w * 0.25;
    const inside = Math.abs(x - cx) < rx && y > h * 0.25 && y < h * 0.95;
    return inside ? [80, 80, 80, 255] : [0, 0, 0, 0];
  });
}

test("buildBlueprintPrompt and buildSideOnlyPrompt follow TZ 3.2 structure", () => {
  const sheet = buildBlueprintPrompt({
    subject: "fire mop",
    viewNames: ["front", "side", "back"],
    style: "clay+wire",
    softParts: ["rags"],
  });
  assert.match(sheet, /DESIGN REFERENCE/);
  assert.match(sheet, /Task:/);
  assert.match(sheet, /plain light grey background/);
  assert.match(sheet, /light BLUE clay/);
  assert.match(sheet, /Must not change:/);
  assert.match(sheet, /No perspective/);
  assert.match(sheet, /SIDE: the object rotated 90 degrees/);
  assert.match(sheet, /No perspective, no shadows, no fire or effects, no text except the labels FRONT, SIDE, BACK/);

  const side = buildSideOnlyPrompt({ subject: "fire mop", style: "clean line", softParts: [] });
  assert.match(side, /DESIGN REFERENCE/);
  assert.match(side, /Image 2 is the FRONT VIEW of this blueprint/);
  assert.match(side, /90° side profile/);
  assert.match(side, /Must not change:/);
  assert.doesNotMatch(side, /light BLUE clay/);
});

test("cutBlueprint on synthetic sheet: three views, shared baseline canvas, soft anchor", () => {
  const cut = cutBlueprint(syntheticSheet(), ["front", "side", "back"]);
  assert.equal(cut.views.length, 3);
  assert.equal(cut.views[0]?.name, "front");
  assert.equal(cut.views[1]?.name, "side");
  assert.equal(cut.views[2]?.name, "back");
  const canvasH = cut.canvas.h;
  for (const v of cut.views) {
    assert.equal(v.image.height, canvasH);
    assert.equal(v.baseline, cut.canvas.baseline);
  }
  const heights = cut.rawViews.map((v) => v.image.height);
  assert.ok(new Set(heights).size > 1, "figures should have different trimmed heights");

  const { parts, warnings } = findSoftAnchors(cut.views, ["rags"], []);
  assert.equal(parts[0]?.kind, "soft");
  assert.ok(parts[0]?.anchor, "expected anchor near blue clay");
  const a = parts[0]!.anchor!;
  assert.ok(a.x > 0 && a.y > 0);

  const greyOnly = rgba(100, 120, (x, y) => (y > 40 && y < 100 && x > 30 && x < 70 ? CLAY : [0, 0, 0, 0]));
  const { warnings: miss } = findSoftAnchors(
    [{ name: "front", image: greyOnly, box: { x: 0, y: 0, w: 100, h: 120 }, baseline: 99, heightPx: 60 }],
    ["missing-soft"],
  );
  assert.ok(miss.some((w) => w.includes("missing-soft")));
});

test("silhouetteSimilarity detects copied side vs distinct profile", () => {
  const front = figure(80, 100, false);
  const copy = figure(80, 100, false);
  const side = figure(80, 100, true);
  const simCopy = silhouetteSimilarity(front, copy);
  const simSide = silhouetteSimilarity(front, side);
  assert.ok(simCopy > SIDE_COPY_THRESHOLD);
  assert.ok(simSide < SIDE_COPY_THRESHOLD);
});

test("cutBlueprint on real fire-mop Muse sheet keeps handle, flags side copy, rag anchor at mop head", async () => {
  const sheet = await decodeRgba(readFileSync(new URL("./fixtures/model/blueprint-mop-sheet.png", import.meta.url)));
  const cut = cutBlueprint(sheet, ["front", "side", "back"]);
  assert.equal(cut.views.length, 3);
  const front = cut.rawViews[0]!;
  const side = cut.rawViews[1]!;
  assert.ok(front.box.w >= 170, `front view too narrow (handle dropped): w=${front.box.w}`);
  const hDiff = Math.abs(front.image.height - side.image.height) / Math.max(front.image.height, 1);
  assert.ok(hDiff <= 0.03, `front/side height mismatch: ${hDiff}`);
  const sim = silhouetteSimilarity(front.image, side.image);
  assert.ok(sim > SIDE_COPY_THRESHOLD, `expected side copy flagged, sim=${sim}`);
  const { parts } = findSoftAnchors(cut.views, ["rags"], []);
  const anchor = parts[0]?.anchor;
  assert.ok(anchor);
  const frontView = cut.views[0]!;
  assert.ok(anchor.y <= frontView.image.height * 0.2, `anchor too low: y=${anchor.y} h=${frontView.image.height}`);
});

import type { Rgba } from "./image-io.ts";
import { crop, resize } from "./raster.ts";

export const SOFT_CLAY_HEX = "#8EC8FF";

export const BLUEPRINT_VIEW_NAMES = ["front", "side", "back", "top"] as const;
export type BlueprintViewName = (typeof BLUEPRINT_VIEW_NAMES)[number];

export type BlueprintStyle = "clay+wire" | "clean line";

export type BlueprintViewBox = { x: number; y: number; w: number; h: number };

export type BlueprintCutView = {
  name: BlueprintViewName;
  image: Rgba;
  box: BlueprintViewBox;
  baseline: number;
  heightPx: number;
};

export type BlueprintPart = {
  name: string;
  kind: "rigid" | "soft";
  anchor: { view: BlueprintViewName; x: number; y: number } | null;
};

export type BlueprintViewClassification = {
  pairs: Array<{ a: BlueprintViewName; b: BlueprintViewName; sim: number }>;
  relabeled: boolean;
  drawn: "side" | "back" | null;
};

export type BlueprintViewsJson = {
  views: Array<{
    name: BlueprintViewName;
    file: string;
    box: BlueprintViewBox;
    baseline: number;
    heightPx: number;
  }>;
  canvas: { w: number; h: number; baseline: number };
  parts: BlueprintPart[];
  sideRegenerated: boolean;
  sheetSideSimilarity?: number;
  classification?: BlueprintViewClassification;
  warnings: string[];
};

export type AssembleBlueprintResult = {
  cut: CutBlueprintResult;
  sideRegenerated: boolean;
  sheetSideSimilarity?: number;
  warnings: string[];
};

export const SIDE_STILL_COPY_THRESHOLD = 0.85;

export type CutBlueprintResult = {
  sheet: Rgba;
  /** Views on a shared baseline canvas. */
  views: BlueprintCutView[];
  /** Trimmed figures before alignment (for side replacement). */
  rawViews: BlueprintCutView[];
  canvas: { w: number; h: number; baseline: number };
  warnings: string[];
};

const VIEW_LABELS: Record<BlueprintViewName, string> = {
  front: "FRONT",
  side: "SIDE",
  back: "BACK",
  top: "TOP",
};

export function normalizeBlueprintStyle(style: string): BlueprintStyle {
  const s = style.trim().toLowerCase().replace(/-/g, " ");
  if (s === "clean line" || s === "cleanline") return "clean line";
  return "clay+wire";
}

export function defaultBlueprintViews(views?: readonly string[]): BlueprintViewName[] {
  const allowed = new Set(BLUEPRINT_VIEW_NAMES);
  const list = (views?.length ? views : ["front", "side", "back"]).map((v) => v.trim().toLowerCase() as BlueprintViewName);
  const out: BlueprintViewName[] = [];
  for (const v of list) {
    if (allowed.has(v) && !out.includes(v)) out.push(v);
  }
  return out.length ? out : ["front", "side", "back"];
}

const SIDE_TASK_LABEL = "SIDE (exact 90° profile, not a copy of the front)";

function viewLabelForTask(name: BlueprintViewName): string {
  return name === "side" ? SIDE_TASK_LABEL : VIEW_LABELS[name];
}

function viewLabelsLine(names: readonly BlueprintViewName[]): string {
  return names.map((n) => VIEW_LABELS[n]).join(", ");
}

function viewLabelsTaskLine(names: readonly BlueprintViewName[]): string {
  return names.map((n) => viewLabelForTask(n)).join(", ");
}

function clayStylePhrase(style: BlueprintStyle): string {
  return style === "clean line"
    ? "clean black outlines on flat grey clay"
    : "flat grey clay with a visible black quad wireframe";
}

export function buildBlueprintPrompt(input: {
  subject: string;
  viewNames: readonly BlueprintViewName[];
  style: BlueprintStyle;
  softParts: string[];
}): string {
  const n = input.viewNames.length;
  const labels = viewLabelsLine(input.viewNames);
  const taskLabels = viewLabelsTaskLine(input.viewNames);
  const soft =
    input.softParts.length > 0
      ? ` Soft dangling parts (${input.softParts.join(", ")}) in light BLUE clay.`
      : "";
  return [
    `Image 1 is the DESIGN REFERENCE: ${input.subject}.`,
    `Task: draw a technical modeling blueprint of exactly this object for a 3D artist — ${n} orthographic views side by side on a plain light grey background: ${taskLabels}; same scale and height, aligned on one baseline; ${clayStylePhrase(input.style)}.${soft}`,
    "Must not change: the proportions, part count and silhouette of the object in image 1.",
    "No perspective, no shadows, no fire or effects, no text except the labels " + labels + ".",
  ].join("\n");
}

export function buildSideOnlyPrompt(input: {
  subject: string;
  style: BlueprintStyle;
  softParts: string[];
  withFrontReference?: boolean;
}): string {
  const soft =
    input.softParts.length > 0
      ? ` Soft dangling parts (${input.softParts.join(", ")}) in light BLUE clay.`
      : "";
  const lines = [`Image 1 is the DESIGN REFERENCE: ${input.subject}.`];
  if (input.withFrontReference ?? true) {
    lines.push(
      "Image 2 is the FRONT VIEW of this blueprint: the side must have the same height, parts and clay style, seen turned 90°.",
    );
  }
  lines.push(
    `Task: draw only the exact 90° side profile of this object, seen edge-on, on a plain light grey background; ${clayStylePhrase(input.style)}.${soft}`,
    "Must not change: the proportions, part count and silhouette of the object in image 1.",
    "No perspective, no shadows, no fire or effects, no text except the label SIDE.",
  );
  return lines.join("\n");
}

export function buildBackOnlyPrompt(input: {
  subject: string;
  style: BlueprintStyle;
  softParts: string[];
  withFrontReference?: boolean;
}): string {
  const soft =
    input.softParts.length > 0
      ? ` Soft dangling parts (${input.softParts.join(", ")}) in light BLUE clay.`
      : "";
  const lines = [`Image 1 is the DESIGN REFERENCE: ${input.subject}.`];
  if (input.withFrontReference ?? true) {
    lines.push(
      "Image 2 is the FRONT VIEW of this blueprint: draw only the BACK view, the same object seen from behind, with the same height, parts and clay style.",
    );
  }
  lines.push(
    `Task: draw only the back view of this object on a plain light grey background; ${clayStylePhrase(input.style)}.${soft}`,
    "Must not change: the proportions, part count and silhouette of the object in image 1.",
    "No perspective, no shadows, no fire or effects, no text except the label BACK.",
  );
  return lines.join("\n");
}

/** Front figure on the sheet's light grey for the side-only Muse reference (image 2). */
export function frontReferencePlate(sheet: Rgba, frontFigure: Rgba, margin = 16): Rgba {
  const bg = sampleGreyBg(sheet);
  const w = frontFigure.width + margin * 2;
  const h = frontFigure.height + margin * 2;
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    data[p] = bg.r;
    data[p + 1] = bg.g;
    data[p + 2] = bg.b;
    data[p + 3] = 255;
  }
  const { data: src, width: sw, height: sh } = frontFigure;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const a = src[(y * sw + x) * 4 + 3]!;
      if (a === 0) continue;
      const dx = margin + x;
      const dy = margin + y;
      const dst = (dy * w + dx) * 4;
      const sp = (y * sw + x) * 4;
      data.set(src.subarray(sp, sp + 4), dst);
    }
  }
  return { data, width: w, height: h };
}

function sampleGreyBg(image: Rgba, tolerance = 28): { r: number; g: number; b: number } {
  const { data, width, height } = image;
  const pts = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
  ];
  let r = 0,
    g = 0,
    b = 0;
  for (const [x, y] of pts) {
    const p = (y * width + x) * 4;
    r += data[p]!;
    g += data[p + 1]!;
    b += data[p + 2]!;
  }
  return { r: Math.round(r / pts.length), g: Math.round(g / pts.length), b: Math.round(b / pts.length) };
}

function isBackground(data: Uint8Array, p: number, bg: { r: number; g: number; b: number }, tol: number, alphaMin = 200): boolean {
  if (data[p + 3]! < alphaMin) return true;
  const dr = data[p]! - bg.r;
  const dg = data[p + 1]! - bg.g;
  const db = data[p + 2]! - bg.b;
  return Math.abs(dr) <= tol && Math.abs(dg) <= tol && Math.abs(db) <= tol;
}

function keyedForegroundMask(image: Rgba, tol = 28): Uint8Array {
  const { data, width, height } = image;
  const bg = sampleGreyBg(image, tol);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    mask[i] = isBackground(data, p, bg, tol) ? 0 : 1;
  }
  return mask;
}

type Comp = { x0: number; y0: number; x1: number; y1: number; area: number; label: number };

function componentsMask(mask: Uint8Array, width: number, height: number, minArea: number): { labels: Int32Array; parts: Comp[] } {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const parts: Comp[] = [];
  let next = 0;
  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== 0 || mask[start] === 0) continue;
    next += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = next;
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % width;
      const y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const around = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of around) {
        if (q < 0 || labels[q] !== 0 || mask[q] === 0) continue;
        labels[q] = next;
        queue[tail++] = q;
      }
    }
    if (tail >= minArea) parts.push({ label: next, area: tail, x0, y0, x1: x1 + 1, y1: y1 + 1 });
  }
  return { labels, parts };
}

function columnHasForeground(mask: Uint8Array, width: number, height: number, x: number): boolean {
  for (let y = 0; y < height; y++) if (mask[y * width + x]) return true;
  return false;
}

/** Drop specks and view labels so thin links (e.g. a mop clamp) do not split columns. */
function maskWithoutSpecksAndLabels(mask: Uint8Array, width: number, height: number): Uint8Array {
  const labelMaxH = Math.max(4, Math.round(height * 0.08));
  const { labels: compLabels, parts } = componentsMask(mask, width, height, 8);
  const bodyParts = parts.filter((p) => p.y1 - p.y0 >= labelMaxH);
  let bodyY0 = height;
  let bodyY1 = 0;
  for (const p of bodyParts) {
    bodyY0 = Math.min(bodyY0, p.y0);
    bodyY1 = Math.max(bodyY1, p.y1);
  }
  const dropLabels = new Set<number>();
  for (const p of parts) {
    const compH = p.y1 - p.y0;
    if (compH >= labelMaxH) continue;
    const aboveBodies = bodyParts.length === 0 || p.y1 <= bodyY0 + 2;
    const belowBodies = bodyParts.length === 0 || p.y0 >= bodyY1 - 2;
    if (aboveBodies || belowBodies) dropLabels.add(p.label);
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    if (!mask[i]) continue;
    const lab = compLabels[i];
    if (lab && dropLabels.has(lab)) continue;
    out[i] = 1;
  }
  return out;
}

function labelComponentIds(mask: Uint8Array, width: number, height: number): Set<number> {
  const labelMaxH = Math.max(4, Math.round(height * 0.08));
  const { labels: compLabels, parts } = componentsMask(mask, width, height, 8);
  const bodyParts = parts.filter((p) => p.y1 - p.y0 >= labelMaxH);
  let bodyY0 = height;
  let bodyY1 = 0;
  for (const p of bodyParts) {
    bodyY0 = Math.min(bodyY0, p.y0);
    bodyY1 = Math.max(bodyY1, p.y1);
  }
  const dropLabels = new Set<number>();
  for (const p of parts) {
    const compH = p.y1 - p.y0;
    if (compH >= labelMaxH) continue;
    const aboveBodies = bodyParts.length === 0 || p.y1 <= bodyY0 + 2;
    const belowBodies = bodyParts.length === 0 || p.y0 >= bodyY1 - 2;
    if (aboveBodies || belowBodies) dropLabels.add(p.label);
  }
  return dropLabels;
}

function findViewColumns(mask: Uint8Array, width: number, height: number, expect: number): { x0: number; x1: number }[] {
  const work = maskWithoutSpecksAndLabels(mask, width, height);
  const runs: { x0: number; x1: number }[] = [];
  let inRun = false;
  let runStart = 0;
  for (let x = 0; x < width; x++) {
    const has = columnHasForeground(work, width, height, x);
    if (has) {
      if (!inRun) {
        runStart = x;
        inRun = true;
      }
    } else if (inRun) {
      runs.push({ x0: runStart, x1: x });
      inRun = false;
    }
  }
  if (inRun) runs.push({ x0: runStart, x1: width });

  const merged = [...runs];
  while (merged.length > expect && merged.length > 1) {
    let bestI = 0;
    let bestGap = width + 1;
    for (let i = 0; i < merged.length - 1; i++) {
      const gap = merged[i + 1]!.x0 - merged[i]!.x1;
      if (gap < bestGap) {
        bestGap = gap;
        bestI = i;
      }
    }
    merged[bestI] = { x0: merged[bestI]!.x0, x1: merged[bestI + 1]!.x1 };
    merged.splice(bestI + 1, 1);
  }
  if (merged.length < expect && merged.length > 0) {
    const widest = merged.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
    const w = widest.x1 - widest.x0;
    const slice = Math.max(1, Math.floor(w / expect));
    const split: { x0: number; x1: number }[] = [];
    for (let k = 0; k < expect; k++) {
      split.push({ x0: widest.x0 + k * slice, x1: k === expect - 1 ? widest.x1 : widest.x0 + (k + 1) * slice });
    }
    return split;
  }
  return merged;
}

function cropRgba(image: Rgba, x0: number, y0: number, w: number, h: number): Rgba {
  return crop(image, x0, y0, w, h);
}

function extractViewColumn(image: Rgba, mask: Uint8Array, col: { x0: number; x1: number }): { image: Rgba; box: BlueprintViewBox; baseline: number } {
  const { width, height, data } = image;
  const subMask = new Uint8Array((col.x1 - col.x0) * height);
  for (let y = 0; y < height; y++) {
    for (let x = col.x0; x < col.x1; x++) subMask[y * (col.x1 - col.x0) + (x - col.x0)] = mask[y * width + x];
  }
  const sw = col.x1 - col.x0;
  const { labels, parts } = componentsMask(subMask, sw, height, 8);
  if (parts.length === 0) {
    const empty = new Uint8Array(sw * height * 4);
    return { image: { data: empty, width: sw, height }, box: { x: col.x0, y: 0, w: sw, h: height }, baseline: height - 1 };
  }
  const dropLabels = labelComponentIds(subMask, sw, height);
  const keep = new Set<number>();
  for (const p of parts) {
    if (!dropLabels.has(p.label)) keep.add(p.label);
  }
  let x0 = sw,
    y0 = height,
    x1 = 0,
    y1 = 0;
  const out = new Uint8Array(sw * height * 4);
  let baseline = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;
      const lab = labels[idx];
      if (!lab || !keep.has(lab)) continue;
      const src = (y * width + col.x0 + x) * 4;
      const dst = idx * 4;
      out[dst] = data[src]!;
      out[dst + 1] = data[src + 1]!;
      out[dst + 2] = data[src + 2]!;
      out[dst + 3] = data[src + 3]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (out[dst + 3]! > 128) baseline = Math.max(baseline, y);
    }
  }
  if (x1 < x0) {
    return { image: { data: out, width: sw, height }, box: { x: col.x0, y: 0, w: sw, h: height }, baseline: height - 1 };
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const trimmed = cropRgba({ data: out, width: sw, height }, x0, y0, w, h);
  return {
    image: trimmed,
    box: { x: col.x0 + x0, y: y0, w, h },
    baseline: baseline >= 0 ? baseline - y0 : h - 1,
  };
}

function alignViewsOnCanvas(views: BlueprintCutView[], margin = 8): { views: BlueprintCutView[]; canvas: { w: number; h: number; baseline: number } } {
  const maxW = Math.max(...views.map((v) => v.image.width), 1);
  const maxH = Math.max(...views.map((v) => v.image.height), 1);
  const canvasW = maxW + margin * 2;
  const canvasH = maxH + margin * 2;
  const baseline = margin + maxH - 1;
  const aligned: BlueprintCutView[] = views.map((v) => {
    const out = new Uint8Array(canvasW * canvasH * 4);
    const ox = margin + Math.floor((maxW - v.image.width) / 2);
    const oy = baseline - v.baseline;
    const { data, width, height } = v.image;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3]!;
        if (a === 0) continue;
        const dx = ox + x;
        const dy = oy + y;
        if (dx < 0 || dy < 0 || dx >= canvasW || dy >= canvasH) continue;
        const dst = (dy * canvasW + dx) * 4;
        out.set(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), dst);
      }
    }
    return {
      ...v,
      image: { data: out, width: canvasW, height: canvasH },
      baseline,
      heightPx: v.image.height,
    };
  });
  return { views: aligned, canvas: { w: canvasW, h: canvasH, baseline } };
}

export function cutBlueprint(sheet: Rgba, viewNames: readonly BlueprintViewName[]): CutBlueprintResult {
  const warnings: string[] = [];
  const mask = keyedForegroundMask(sheet);
  const cols = findViewColumns(mask, sheet.width, sheet.height, viewNames.length);
  if (cols.length !== viewNames.length) {
    warnings.push(`expected ${viewNames.length} view columns, found ${cols.length}`);
  }
  const raw: BlueprintCutView[] = [];
  for (let i = 0; i < viewNames.length; i++) {
    const col = cols[i] ?? { x0: Math.floor((i * sheet.width) / viewNames.length), x1: Math.floor(((i + 1) * sheet.width) / viewNames.length) };
    const ex = extractViewColumn(sheet, mask, col);
    raw.push({ name: viewNames[i]!, image: ex.image, box: ex.box, baseline: ex.baseline, heightPx: ex.image.height });
  }
  const { views, canvas } = alignViewsOnCanvas(raw);
  return { sheet, views, rawViews: raw, canvas, warnings };
}

function alphaMask(image: Rgba, threshold = 128): Uint8Array {
  const m = new Uint8Array(image.width * image.height);
  const { data, width, height } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      m[y * width + x] = data[(y * width + x) * 4 + 3]! > threshold ? 1 : 0;
    }
  }
  return m;
}

export function silhouetteSimilarity(a: Rgba, b: Rgba): number {
  const h = 128;
  const aw = Math.max(1, Math.round((a.width * h) / Math.max(a.height, 1)));
  const bw = Math.max(1, Math.round((b.width * h) / Math.max(b.height, 1)));
  const ra = resize(a, aw, h);
  const rb = resize(b, bw, h);
  const w = Math.max(aw, bw);
  const ma = alphaMask(ra);
  const mb = alphaMask(rb);
  let inter = 0;
  let union = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xa = Math.min(x, aw - 1);
      const xb = Math.min(x, bw - 1);
      const fa = x < aw ? ma[y * aw + xa]! : 0;
      const fb = x < bw ? mb[y * bw + xb]! : 0;
      if (fa && fb) inter++;
      if (fa || fb) union++;
    }
  }
  return union === 0 ? 0 : inter / union;
}

function flipRgbaHorizontal(image: Rgba): Rgba {
  const { width, height, data } = image;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = (y * width + (width - 1 - x)) * 4;
      out.set(data.subarray(src, src + 4), dst);
    }
  }
  return { data: out, width, height };
}

const VIEW_CLASSIFY_SIM = 0.72;

function viewPairSimilarity(a: Rgba, b: Rgba, mirrored: boolean): number {
  const base = silhouetteSimilarity(a, b);
  if (!mirrored) return base;
  return Math.max(base, silhouetteSimilarity(a, flipRgbaHorizontal(b)));
}

function averageSimilarityToOthers(
  name: BlueprintViewName,
  byName: Map<BlueprintViewName, Rgba>,
): number {
  const self = byName.get(name);
  if (!self) return 1;
  const others = [...byName.entries()].filter(([n]) => n !== name);
  if (others.length === 0) return 1;
  let sum = 0;
  for (const [other, img] of others) {
    const mirrored = (name === "front" && other === "back") || (name === "back" && other === "front");
    sum += viewPairSimilarity(self, img, mirrored);
  }
  return sum / others.length;
}

export function classifyViews(views: readonly BlueprintCutView[]): BlueprintViewClassification {
  const byName = new Map<BlueprintViewName, Rgba>();
  for (const v of views) byName.set(v.name, v.image);
  const front = byName.get("front");
  const side = byName.get("side");
  const back = byName.get("back");
  const pairs: BlueprintViewClassification["pairs"] = [];
  if (front && side) pairs.push({ a: "front", b: "side", sim: viewPairSimilarity(front, side, false) });
  if (front && back) pairs.push({ a: "front", b: "back", sim: viewPairSimilarity(front, back, true) });
  if (side && back) pairs.push({ a: "side", b: "back", sim: viewPairSimilarity(side, back, false) });
  pairs.sort((a, b) => b.sim - a.sim);
  const relabeled = false;
  let drawn: BlueprintViewClassification["drawn"] = null;
  if (!front || !side || !back) {
    return { pairs, relabeled, drawn };
  }
  const odd = (["front", "side", "back"] as const).reduce((best, name) =>
    averageSimilarityToOthers(name, byName) < averageSimilarityToOthers(best, byName) ? name : best,
  );
  const best = pairs[0];
  const fs = pairs.find((p) => (p.a === "front" && p.b === "side") || (p.a === "side" && p.b === "front"))?.sim ?? 0;
  const fb = pairs.find((p) => (p.a === "front" && p.b === "back") || (p.a === "back" && p.b === "front"))?.sim ?? 0;
  const sb = pairs.find((p) => (p.a === "side" && p.b === "back") || (p.a === "back" && p.b === "side"))?.sim ?? 0;
  if (fs >= VIEW_CLASSIFY_SIM && fb >= VIEW_CLASSIFY_SIM && sb >= VIEW_CLASSIFY_SIM) {
    drawn = "side";
  } else if (best && best.sim >= VIEW_CLASSIFY_SIM) {
    const isFrontSide =
      (best.a === "front" && best.b === "side") || (best.a === "side" && best.b === "front");
    const isFrontBack =
      (best.a === "front" && best.b === "back") || (best.a === "back" && best.b === "front");
    if (isFrontSide && odd === "back") {
      return { pairs, relabeled: true, drawn: "back" };
    }
    if (isFrontBack && odd === "side") {
      return { pairs, relabeled: false, drawn: null };
    }
  }
  return { pairs, relabeled, drawn: "side" };
}

export function swapBlueprintBackSide(cut: CutBlueprintResult): CutBlueprintResult {
  const swapName = (name: BlueprintViewName): BlueprintViewName => {
    if (name === "back") return "side";
    if (name === "side") return "back";
    return name;
  };
  const mapViews = (list: BlueprintCutView[]) => list.map((v) => ({ ...v, name: swapName(v.name) }));
  const rawViews = mapViews(cut.rawViews);
  const { views, canvas } = alignViewsOnCanvas(rawViews);
  return { ...cut, rawViews, views, canvas };
}

function rgbHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** Pale light-blue modelling clay (not saturated tape/decal blues). */
function isSoftBlue(data: Uint8Array, p: number): boolean {
  const r = data[p]!;
  const g = data[p + 1]!;
  const b = data[p + 2]!;
  const a = data[p + 3]!;
  if (a < 100) return false;
  const { h, s, l } = rgbHsl(r, g, b);
  if (l < 0.68 || l > 0.96) return false;
  if (h < 165 || h > 235) return false;
  if (s > 0.48 && l < 0.62) return false;
  if (s < 0.06 || s > 0.45) return false;
  return b >= g - 8 && b >= r + 12;
}

function isGreyClay(data: Uint8Array, p: number, bg: { r: number; g: number; b: number }): boolean {
  const a = data[p + 3]!;
  if (a < 100) return false;
  if (isSoftBlue(data, p)) return false;
  const r = data[p]!;
  const g = data[p + 1]!;
  const b = data[p + 2]!;
  const dr = r - bg.r;
  const dg = g - bg.g;
  const db = b - bg.b;
  return Math.abs(dr) < 55 && Math.abs(dg) < 55 && Math.abs(db) < 55;
}

export function findSoftAnchors(
  views: readonly BlueprintCutView[],
  softParts: string[],
  rigidParts: string[] = [],
): { parts: BlueprintPart[]; warnings: string[] } {
  const warnings: string[] = [];
  const anchorView = views.find((v) => v.name === "front") ?? views[0];
  const parts: BlueprintPart[] = [];
  const bg = anchorView ? sampleGreyBg(anchorView.image) : { r: 180, g: 180, b: 180 };

  for (const name of rigidParts) parts.push({ name, kind: "rigid", anchor: null });

  if (!anchorView) {
    for (const name of softParts) {
      parts.push({ name, kind: "soft", anchor: null });
      warnings.push(`soft part "${name}": no view image to scan`);
    }
    return { parts, warnings };
  }

  const { data, width, height } = anchorView.image;
  const blueMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    blueMask[i] = isSoftBlue(data, i * 4) ? 1 : 0;
  }
  const { parts: blueComps } = componentsMask(blueMask, width, height, 12);
  let anchor: { view: BlueprintViewName; x: number; y: number } | null = null;
  if (blueComps.length > 0) {
    const union = blueComps.reduce(
      (u, c) => ({
        x0: Math.min(u.x0, c.x0),
        y0: Math.min(u.y0, c.y0),
        x1: Math.max(u.x1, c.x1),
        y1: Math.max(u.y1, c.y1),
      }),
      { x0: width, y0: height, x1: 0, y1: 0 },
    );
    const bandH = Math.max(1, Math.round((union.y1 - union.y0) * 0.04));
    const bandY1 = Math.min(union.y1, union.y0 + bandH);
    const touchesRigid = (idx: number, x: number, y: number): boolean => {
      const p = idx * 4;
      if (isGreyClay(data, p, bg)) return true;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (blueMask[ni]) continue;
          const np = ni * 4;
          if (data[np + 3]! < 100) continue;
          if (isBackground(data, np, bg, 28)) continue;
          return true;
        }
      }
      return false;
    };
    let sx = 0,
      sy = 0,
      n = 0;
    let fx = 0,
      fy = 0,
      fn = 0;
    for (let y = union.y0; y < bandY1; y++) {
      for (let x = union.x0; x < union.x1; x++) {
        const idx = y * width + x;
        if (!blueMask[idx]) continue;
        fx += x;
        fy += y;
        fn++;
        if (touchesRigid(idx, x, y)) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    if (n === 0 && fn > 0) {
      sx = fx;
      sy = fy;
      n = fn;
    } else if (n === 0) {
      sx = (union.x0 + union.x1) / 2;
      sy = union.y0;
      n = 1;
    }
    anchor = { view: anchorView.name, x: Math.round(sx / n), y: Math.round(sy / n) };
  }

  const anyBlue = blueComps.length > 0;
  for (const name of softParts) {
    if (!anyBlue) warnings.push(`soft part "${name}": no light-blue clay found on sheet`);
    parts.push({ name, kind: "soft", anchor: anyBlue ? anchor : null });
  }
  return { parts, warnings };
}

export function blueprintAspect(viewCount: number): string {
  return viewCount >= 4 ? "21:9" : "16:9";
}

export function viewsJsonFromCut(
  cut: CutBlueprintResult,
  parts: BlueprintPart[],
  sideRegenerated: boolean,
  extraWarnings: string[] = [],
  sheetSideSimilarity?: number,
  classification?: BlueprintViewClassification,
): BlueprintViewsJson {
  return {
    views: cut.views.map((v) => ({
      name: v.name,
      file: `${v.name}.png`,
      box: v.box,
      baseline: v.baseline,
      heightPx: v.heightPx,
    })),
    canvas: cut.canvas,
    parts,
    sideRegenerated,
    sheetSideSimilarity,
    classification,
    warnings: [...cut.warnings, ...extraWarnings],
  };
}

export function assembleBlueprint(
  sheetCut: CutBlueprintResult,
  sideCut: CutBlueprintResult | null,
  options?: { sideSeparate?: boolean },
): AssembleBlueprintResult {
  const sideSeparate = options?.sideSeparate ?? true;
  const hasSide = sheetCut.rawViews.some((v) => v.name === "side");
  const frontView = sheetCut.views.find((v) => v.name === "front");
  const sideView = sheetCut.views.find((v) => v.name === "side");
  let sheetSideSimilarity: number | undefined;
  if (frontView && sideView) {
    sheetSideSimilarity = silhouetteSimilarity(frontView.image, sideView.image);
  }
  const warnings: string[] = [];
  if (!hasSide || !sideSeparate || !sideCut) {
    return { cut: sheetCut, sideRegenerated: false, sheetSideSimilarity, warnings };
  }
  const sideRaw = sideCut.rawViews.find((v) => v.name === "side")?.image ?? sideCut.rawViews[0]?.image;
  if (!sideRaw) {
    warnings.push("side regeneration: could not cut the new side sheet");
    return { cut: sheetCut, sideRegenerated: false, sheetSideSimilarity, warnings };
  }
  const cut = replaceSideView(sheetCut, sideRaw);
  const newSide = cut.views.find((v) => v.name === "side");
  if (frontView && newSide && silhouetteSimilarity(frontView.image, newSide.image) > SIDE_STILL_COPY_THRESHOLD) {
    warnings.push("side may still copy the front");
  }
  return { cut, sideRegenerated: true, sheetSideSimilarity, warnings };
}

export function replaceBackView(cut: CutBlueprintResult, backRaw: Rgba): CutBlueprintResult {
  const front = cut.rawViews.find((v) => v.name === "front");
  const targetH = front?.image.height ?? backRaw.height;
  const scaled =
    backRaw.height === targetH
      ? backRaw
      : resize(backRaw, Math.max(1, Math.round((backRaw.width * targetH) / Math.max(backRaw.height, 1))), targetH);
  let baseline = scaled.height - 1;
  const { data, width, height } = scaled;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 128) {
        baseline = y;
        break;
      }
    }
    if (baseline < height - 1) break;
  }
  const nextRaw = cut.rawViews.map((v) =>
    v.name === "back"
      ? { ...v, image: scaled, baseline, heightPx: scaled.height, box: { ...v.box, w: scaled.width, h: scaled.height } }
      : v,
  );
  const { views, canvas } = alignViewsOnCanvas(nextRaw);
  return { ...cut, views, rawViews: nextRaw, canvas };
}

export function replaceSideView(cut: CutBlueprintResult, sideRaw: Rgba): CutBlueprintResult {
  const front = cut.rawViews.find((v) => v.name === "front");
  const targetH = front?.image.height ?? sideRaw.height;
  const scaled =
    sideRaw.height === targetH
      ? sideRaw
      : resize(sideRaw, Math.max(1, Math.round((sideRaw.width * targetH) / Math.max(sideRaw.height, 1))), targetH);
  let baseline = scaled.height - 1;
  const { data, width, height } = scaled;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 128) {
        baseline = y;
        break;
      }
    }
    if (baseline < height - 1) break;
  }
  const nextRaw = cut.rawViews.map((v) =>
    v.name === "side"
      ? { ...v, image: scaled, baseline, heightPx: scaled.height, box: { ...v.box, w: scaled.width, h: scaled.height } }
      : v,
  );
  const { views, canvas } = alignViewsOnCanvas(nextRaw);
  return { ...cut, views, rawViews: nextRaw, canvas };
}

export const SIDE_COPY_THRESHOLD = 0.8;

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
  warnings: string[];
};

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

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

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

function viewLabelsLine(names: readonly BlueprintViewName[]): string {
  return names.map((n) => VIEW_LABELS[n]).join(", ");
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
  const soft =
    input.softParts.length > 0
      ? ` Soft dangling parts (${input.softParts.join(", ")}) in light BLUE clay.`
      : "";
  return [
    `Image 1 is the DESIGN REFERENCE: ${input.subject}.`,
    `Task: draw a technical modeling blueprint of exactly this object for a 3D artist — ${n} orthographic views side by side on a plain light grey background: ${labels}; same scale and height, aligned on one baseline; ${clayStylePhrase(input.style)}.${soft}`,
    "Must not change: the proportions, part count and silhouette of the object in image 1.",
    "No perspective, no shadows, no fire or effects, no text except the labels " + labels + ".",
  ].join("\n");
}

export function buildSideOnlyPrompt(input: { subject: string; style: BlueprintStyle; softParts: string[] }): string {
  const soft =
    input.softParts.length > 0
      ? ` Soft dangling parts (${input.softParts.join(", ")}) in light BLUE clay.`
      : "";
  return [
    `Image 1 is the DESIGN REFERENCE: ${input.subject}.`,
    `Task: draw only the exact 90° side profile of this object, seen edge-on, on a plain light grey background; ${clayStylePhrase(input.style)}.${soft}`,
    "Must not change: the proportions, part count and silhouette of the object in image 1.",
    "No perspective, no shadows, no fire or effects, no text except the label SIDE.",
  ].join("\n");
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

function columnProjection(mask: Uint8Array, width: number, height: number): number[] {
  const counts = new Array<number>(width).fill(0);
  for (let x = 0; x < width; x++) {
    let c = 0;
    for (let y = 0; y < height; y++) if (mask[y * width + x]) c++;
    counts[x] = c;
  }
  return counts;
}

function findViewColumns(mask: Uint8Array, width: number, height: number, expect: number): { x0: number; x1: number }[] {
  const counts = columnProjection(mask, width, height);
  const max = Math.max(...counts, 1);
  const thresh = Math.max(2, Math.round(max * 0.08));
  const active: boolean[] = counts.map((c) => c >= thresh);
  const runs: { x0: number; x1: number }[] = [];
  let i = 0;
  while (i < width) {
    if (!active[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < width && active[j]) j++;
    runs.push({ x0: i, x1: j });
    i = j;
  }
  if (runs.length > expect) {
    const scored = runs.map((r) => ({ r, score: counts.slice(r.x0, r.x1).reduce((a, b) => a + b, 0) }));
    scored.sort((a, b) => b.score - a.score);
    const keep = scored.slice(0, expect).map((s) => s.r).sort((a, b) => a.x0 - b.x0);
    return keep;
  }
  if (runs.length < expect && runs.length > 0) {
    const widest = runs.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
    const w = widest.x1 - widest.x0;
    const slice = Math.max(1, Math.floor(w / expect));
    const split: { x0: number; x1: number }[] = [];
    for (let k = 0; k < expect; k++) {
      split.push({ x0: widest.x0 + k * slice, x1: k === expect - 1 ? widest.x1 : widest.x0 + (k + 1) * slice });
    }
    return split;
  }
  return runs;
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
  const major = parts.reduce((a, b) => (b.area > a.area ? b : a));
  const keep = new Set<number>([major.label]);
  for (const p of parts) {
    if (p.label === major.label) continue;
    const touch =
      p.x1 >= major.x0 - 2 &&
      p.x0 <= major.x1 + 2 &&
      p.y1 >= major.y0 - 2 &&
      p.y0 <= major.y1 + 2;
    if (touch) keep.add(p.label);
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

const softRgb = parseHex(SOFT_CLAY_HEX);

function isSoftBlue(data: Uint8Array, p: number): boolean {
  const r = data[p]!;
  const g = data[p + 1]!;
  const b = data[p + 2]!;
  const a = data[p + 3]!;
  if (a < 100) return false;
  if (b < 140 || b < r + 20 || b < g + 10) return false;
  const dr = r - softRgb.r;
  const dg = g - softRgb.g;
  const db = b - softRgb.b;
  return Math.hypot(dr, dg, db) < 90 || (b > 160 && g > 120 && r < 200);
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
    const main = blueComps.reduce((a, b) => (b.area > a.area ? b : a));
    let sx = 0,
      sy = 0,
      n = 0;
    for (let y = main.y0; y < main.y1; y++) {
      for (let x = main.x0; x < main.x1; x++) {
        const idx = y * width + x;
        if (!blueMask[idx]) continue;
        const p = idx * 4;
        const touchesGrey =
          (x > 0 && isGreyClay(data, (idx - 1) * 4, bg)) ||
          (x < width - 1 && isGreyClay(data, (idx + 1) * 4, bg)) ||
          (y > 0 && isGreyClay(data, (idx - width) * 4, bg)) ||
          (y < height - 1 && isGreyClay(data, (idx + width) * 4, bg));
        if (touchesGrey || n === 0) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    if (n === 0) {
      sx = (main.x0 + main.x1) / 2;
      sy = (main.y1 - 1);
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
    warnings: [...cut.warnings, ...extraWarnings],
  };
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

export const SIDE_COPY_THRESHOLD = 0.9;

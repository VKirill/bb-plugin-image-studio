import { basename } from "node:path";
import type { Rgba } from "./image-io.ts";

export const MODEL_MODES = ["texture-uv", "blueprint"] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

export const MODEL_MUSE = "muse-image" as const;

export const MODEL_TEXTURE_SIZES = [1024, 2048] as const;
export type ModelTextureSize = (typeof MODEL_TEXTURE_SIZES)[number];

export const DEFAULT_DILATE_PX = 12;

export type TextureUvPart = { color: string; part: string };

export type ModelPartRow = { material: string; part: string };
export type ModelPartsParam = Record<string, string> | ModelPartRow[];

/** Apply user material→description overrides onto baked parts.json rows. */
export function mergeModelParts(
  baked: Array<{ material: string; part: string; color: string }>,
  user?: ModelPartsParam,
): TextureUvPart[] {
  const byMaterial = new Map<string, string>();
  if (user) {
    if (Array.isArray(user)) {
      for (const row of user) byMaterial.set(row.material, row.part);
    } else {
      for (const [material, part] of Object.entries(user)) byMaterial.set(material, part);
    }
  }
  return baked.map((row) => ({
    color: row.color,
    part: byMaterial.get(row.material) ?? row.part,
  }));
}

export const MODEL_CONCEPT_VIEWS = ["front", "back", "left", "right"] as const;
export type ModelConceptView = (typeof MODEL_CONCEPT_VIEWS)[number];

/** `fire-mop.fbx` → `fire mop`. */
export function subjectFromFile(path: string): string {
  const base = basename(path.trim());
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  return stem.replace(/[-_]+/g, " ").trim() || "model";
}

function medianChannel(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/** Crop to the object's alpha box; fill the background with the object's main colour (median of opaque pixels). */
export function cutConcept(image: Rgba, alphaThreshold = 12): Rgba {
  const { width, height, data } = image;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const bg = { r: 0, g: 0, b: 0 };
  for (const [cx, cy] of corners) {
    const p = (cy * width + cx) * 4;
    bg.r += data[p]!;
    bg.g += data[p + 1]!;
    bg.b += data[p + 2]!;
  }
  bg.r = Math.round(bg.r / corners.length);
  bg.g = Math.round(bg.g / corners.length);
  bg.b = Math.round(bg.b / corners.length);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const a = data[p + 3]!;
      const dr = Math.abs(data[p]! - bg.r);
      const dg = Math.abs(data[p + 1]! - bg.g);
      const db = Math.abs(data[p + 2]! - bg.b);
      const keyed = a > alphaThreshold && dr + dg + db > 40;
      if (!keyed) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      rs.push(data[p]!);
      gs.push(data[p + 1]!);
      bs.push(data[p + 2]!);
    }
  }
  if (maxX < minX || maxY < minY) return image;
  const fill = { r: medianChannel(rs), g: medianChannel(gs), b: medianChannel(bs) };
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = minX + x;
      const sy = minY + y;
      const sp = (sy * width + sx) * 4;
      const dp = (y * cw + x) * 4;
      const a = data[sp + 3]!;
      const dr = Math.abs(data[sp]! - bg.r);
      const dg = Math.abs(data[sp + 1]! - bg.g);
      const db = Math.abs(data[sp + 2]! - bg.b);
      const keyed = a > alphaThreshold && dr + dg + db > 40;
      if (keyed) {
        out[dp] = data[sp]!;
        out[dp + 1] = data[sp + 1]!;
        out[dp + 2] = data[sp + 2]!;
        out[dp + 3] = 255;
      } else {
        out[dp] = fill.r;
        out[dp + 1] = fill.g;
        out[dp + 2] = fill.b;
        out[dp + 3] = 255;
      }
    }
  }
  return { data: out, width: cw, height: ch };
}

export function buildTextureUvPrompt(input: {
  subject: string;
  parts: TextureUvPart[];
  projected: boolean;
  hasConcept: boolean;
  conceptNote?: string;
  hasStyle: boolean;
  task: string;
  theme?: string;
}): string {
  const colorList = input.parts.map((p) => `${p.color} = ${p.part}`).join(", ");
  const projectedClause = input.projected
    ? "; colors and shading were projected from the design, so faces, eyes and patterns are already where they belong"
    : "";
  const layout =
    `Image 1 is the LAYOUT: a texture atlas (UV map) of a 3D ${input.subject} laid flat on black. ` +
    `Each separate shape is one piece of the model surface; flat colors mark the parts (${colorList}); ` +
    `the top of each shape is the top of the model${projectedClause}.`;
  const lines = [layout];
  if (input.hasConcept) {
    const note = input.conceptNote?.trim() || "the design of this object";
    lines.push(`Image 2 is the STYLE AND DESIGN REFERENCE: ${note}.`);
  }
  if (input.hasStyle) {
    lines.push("Image 3 is the STYLE SHEET: overall colour and material finish for the repaint.");
  }
  const taskBody = [input.task.trim(), input.theme?.trim()].filter(Boolean).join("; ");
  const taskLine = input.hasConcept
    ? `Task: repaint image 1 as a final hand-painted game texture in the look of image 2: ${taskBody || "a cohesive hand-painted game texture"}.`
    : `Task: repaint image 1 as a final hand-painted game texture: ${taskBody || "a cohesive hand-painted game texture"}.`;
  lines.push(taskLine);
  const faceClause = input.projected ? "faces, eyes and patterns only where they already are, never add new ones; " : "";
  lines.push(
    `Must not change: the position, outline and size of every shape; ${faceClause}the black background; the base colors.`,
  );
  lines.push("Do not add outlines or frames around shapes, text or any new objects.");
  return lines.join("\n");
}

function maskAlpha(mask: Rgba, x: number, y: number, threshold = 8): boolean {
  return mask.data[(y * mask.width + x) * 4 + 3]! > threshold;
}

/** Cut `color` to the mask, then grow visible pixels `px` outward so UV seams do not gap (pure TS). */
export function cutAndDilate(color: Rgba, mask: Rgba, px: number): Rgba {
  if (color.width !== mask.width || color.height !== mask.height) {
    throw new Error("cutAndDilate: color and mask must be the same size");
  }
  const { width, height } = color;
  const dilate = Math.max(8, Math.min(16, Math.round(px)));
  const inside = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (maskAlpha(mask, x, y)) inside[y * width + x] = 1;
    }
  }
  const dist = new Int32Array(width * height);
  dist.fill(1_000_000);
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (inside[i]) {
        dist[i] = 0;
        queue.push(i);
      }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]!;
    const x = i % width;
    const y = (i / width) | 0;
    const d = dist[i]!;
    if (d >= dilate) continue;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (dist[j]! > d + 1) {
        dist[j] = d + 1;
        queue.push(j);
      }
    }
  }
  const out = new Uint8Array(color.data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      if (dist[i]! > dilate) continue;
      let sx = x;
      let sy = y;
      if (!inside[i]) {
        let best = 1_000_000;
        const r = dilate + 2;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = ny * width + nx;
            if (!inside[j]) continue;
            const d = dx * dx + dy * dy;
            if (d < best) {
              best = d;
              sx = nx;
              sy = ny;
            }
          }
        }
      }
      const sp = (sy * width + sx) * 4;
      out[p] = color.data[sp]!;
      out[p + 1] = color.data[sp + 1]!;
      out[p + 2] = color.data[sp + 2]!;
      out[p + 3] = inside[i] || dist[i]! <= dilate ? 255 : 0;
    }
  }
  return { data: out, width, height };
}

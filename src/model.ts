import type { Rgba } from "./image-io.ts";

export const MODEL_MODES = ["texture-uv", "blueprint"] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

export const MODEL_MUSE = "muse-image" as const;

export const MODEL_TEXTURE_SIZES = [1024, 2048] as const;
export type ModelTextureSize = (typeof MODEL_TEXTURE_SIZES)[number];

export const DEFAULT_DILATE_PX = 12;

export type TextureUvPart = { color: string; part: string };

export function buildTextureUvPrompt(input: {
  parts: TextureUvPart[];
  style: string;
  effects?: string;
  hasConcept: boolean;
  hasStyle: boolean;
}): string {
  const colorList = input.parts.map((p) => `${p.color} = ${p.part}`).join(", ");
  let look = "";
  if (input.hasConcept && input.hasStyle) look = ", in the look of image 2 and image 3";
  else if (input.hasConcept || input.hasStyle) look = ", in the look of image 2";
  const effects = input.effects?.trim() ? ` ${input.effects.trim()}` : "";
  const style = input.style.trim() || "a cohesive hand-painted game texture";
  return (
    `Texture atlas for a 3D game model. Image 1 is the UV layout: every shape is one piece of the model surface, its flat color tells the material (${colorList}); the top of each shape is the top of the model. ` +
    `Repaint EVERY shape in place with ${style}${look}.${effects} ` +
    `Keep every shape exactly where it is with the same outline, size and base color; no outlines or frames; black background stays black; no text.`
  );
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

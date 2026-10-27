import { z } from "zod";
import type { GuiStyle } from "./gui.ts";
import type { Rgba } from "./image-io.ts";

export const MODEL_MODES = ["texture-uv", "blueprint"] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

export const MODEL_TAKE_PREFIX = "model-take:" as const;
export const MODEL_TAKE_MAX = 200;

export const modelTakeRecordSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(MODEL_MODES),
  createdAt: z.string(),
  prompt: z.string(),
  folder: z.string(),
  files: z.record(z.string(), z.string()),
  warnings: z.array(z.string()).default([]),
  sideRegenerated: z.boolean().optional(),
});
export type ModelTakeRecord = z.infer<typeof modelTakeRecordSchema>;

export const modelTakeThumbSchema = z.object({ mimeType: z.string(), base64: z.string() });
export const modelTakeWithThumbsSchema = modelTakeRecordSchema.extend({
  thumbs: z.record(z.string(), modelTakeThumbSchema),
});
export type ModelTakeWithThumbs = z.infer<typeof modelTakeWithThumbsSchema>;

export function modelTakeKvKey(styleId: string): string {
  return `${MODEL_TAKE_PREFIX}${styleId}`;
}

export function parseModelTakeRecords(raw: unknown): ModelTakeRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = modelTakeRecordSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Snapshot lists every section; each app tab filters to its own. */
export function snapshotGuiStyles(styles: readonly GuiStyle[]): GuiStyle[] {
  return [...styles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function stylesForAppTab(
  styles: readonly GuiStyle[],
  tab: "gui" | "characters" | "roblox" | "model",
): GuiStyle[] {
  return styles.filter((style) => style.section === tab && !style.gameId);
}

export function parseModelPartsText(text: string): ModelPartRow[] {
  const rows: ModelPartRow[] = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const colon = trimmed.indexOf(":");
    const splitAt = eq > 0 ? eq : colon > 0 ? colon : -1;
    if (splitAt < 0) continue;
    const material = trimmed.slice(0, splitAt).trim();
    const part = trimmed.slice(splitAt + 1).trim();
    if (material && part) rows.push({ material, part });
  }
  return rows;
}

export const MODEL_MUSE = "muse-image" as const;

export const MODEL_TEXTURE_SIZES = [1024, 2048] as const;
export type ModelTextureSize = (typeof MODEL_TEXTURE_SIZES)[number];

export const DEFAULT_DILATE_PX = 12;

export type TextureUvPart = { color: string; part: string; marker?: boolean };

export type ModelPartRow = { material: string; part: string };
export type ModelPartsParam = Record<string, string> | ModelPartRow[];

/** Apply user material→description overrides onto baked parts.json rows. */
export function mergeModelParts(
  baked: Array<{ material: string; part: string; color: string; marker?: boolean }>,
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
    marker: row.marker,
  }));
}

export const MODEL_CONCEPT_VIEWS = ["front", "back", "left", "right"] as const;
export type ModelConceptView = (typeof MODEL_CONCEPT_VIEWS)[number];

/** Absolute path for bb.sdk.files on the project host (relative paths stay relative in manifests). */
export function hostPath(cwd: string, relOrAbs: string): string {
  const normalized = relOrAbs.trim().replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return normalized;
  const base = cwd.trim().replace(/\\/g, "/").replace(/\/$/, "");
  const rel = normalized.replace(/^\.\//, "");
  return `${base}/${rel}`;
}

export function isHostPathAbsolute(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/");
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}

/** CLI flags whose values must not end up in the free-text prompt tail. */
export const MODEL_CLI_REST_SKIP_FLAGS = [
  "--mode",
  "--file",
  "--model",
  "--object",
  "--size",
  "--variants",
  "--image",
  "--subject",
  "--concept-note",
  "--project-concept",
  "--concept-view",
  "--parts",
  "--views",
  "--soft",
  "--rigid",
  "--sheet-style",
  "--project",
  "--style",
  "--prompt",
  "--json",
] as const;

export function cliFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

export function cliFlags(argv: readonly string[], name: string): string[] {
  const out: string[] = [];
  argv.forEach((token, index) => {
    const value = argv[index + 1];
    if (token === name && value) out.push(value);
  });
  return out;
}

export function parseOptionalBoolFlag(value?: string): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  throw new Error(`--project-concept expects true or false, got "${value}"`);
}

export function parseModelPartsCli(text: string): ModelPartRow[] {
  const rows: ModelPartRow[] = [];
  for (const chunk of text.split(/;/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const material = trimmed.slice(0, eq).trim();
    const part = trimmed.slice(eq + 1).trim();
    if (material && part) rows.push({ material, part });
  }
  return rows;
}

export type ModelCliTextureUv = {
  mode: "texture-uv";
  modelPath: string;
  prompt: string;
  object?: string;
  size: ModelTextureSize;
  variants: number;
  images: string[];
  subject?: string;
  conceptNote?: string;
  projectConcept?: boolean;
  conceptView?: ModelConceptView;
  parts?: ModelPartsParam;
  projectStyleId?: string;
};

export type ModelCliBlueprint = {
  mode: "blueprint";
  conceptImage: string;
  prompt: string;
  views?: string[];
  sheetStyle?: string;
  subject?: string;
  soft?: string[];
  rigid?: string[];
  projectStyleId?: string;
};

export function parseModelGenerateCli(argv: readonly string[]): ModelCliTextureUv | ModelCliBlueprint {
  const modeRaw = cliFlag(argv, "--mode") ?? "texture-uv";
  if (!MODEL_MODES.includes(modeRaw as ModelMode)) {
    throw new Error(`--mode must be ${MODEL_MODES.join(" or ")}.`);
  }
  const mode = modeRaw as ModelMode;
  const projectStyleId = cliFlag(argv, "--project") ?? cliFlag(argv, "--style");
  const images = cliFlags(argv, "--image");
  const skip = new Set<string>(MODEL_CLI_REST_SKIP_FLAGS);
  const promptTail = modelCliRestAfter(argv, "generate", skip);

  if (mode === "blueprint") {
    const conceptImage = images[0] ?? cliFlag(argv, "--image");
    if (!conceptImage) throw new Error("Blueprint mode requires --image <concept>.");
    const viewsFlag = cliFlag(argv, "--views");
    const views = viewsFlag ? viewsFlag.split(",").map((part) => part.trim()).filter(Boolean) : undefined;
    const softFlag = cliFlag(argv, "--soft");
    const soft = softFlag ? softFlag.split(/[;,]/).map((part) => part.trim()).filter(Boolean) : undefined;
    const rigidFlag = cliFlag(argv, "--rigid");
    const rigid = rigidFlag ? rigidFlag.split(/[;,]/).map((part) => part.trim()).filter(Boolean) : undefined;
    const prompt = cliFlag(argv, "--prompt") ?? promptTail.replace(/^model\s*/, "");
    return {
      mode: "blueprint",
      conceptImage,
      prompt,
      views,
      sheetStyle: cliFlag(argv, "--sheet-style"),
      subject: cliFlag(argv, "--subject"),
      soft,
      rigid,
      projectStyleId,
    };
  }

  const modelPath = cliFlag(argv, "--file") ?? cliFlag(argv, "--model");
  const prompt = cliFlag(argv, "--prompt") ?? promptTail.replace(/^model\s*/, "");
  if (!modelPath || !prompt) throw new Error("texture-uv requires --file/--model and --prompt.");
  const sizeRaw = cliFlag(argv, "--size");
  const size = sizeRaw ? (Number(sizeRaw) as ModelTextureSize) : 1024;
  if (!MODEL_TEXTURE_SIZES.includes(size)) throw new Error("--size must be 1024 or 2048.");
  const variantsRaw = cliFlag(argv, "--variants");
  const variants = variantsRaw ? Number(variantsRaw) : 1;
  const conceptViewRaw = cliFlag(argv, "--concept-view");
  if (conceptViewRaw && !MODEL_CONCEPT_VIEWS.includes(conceptViewRaw as ModelConceptView)) {
    throw new Error(`--concept-view must be ${MODEL_CONCEPT_VIEWS.join(", ")}.`);
  }
  const partsFlag = cliFlag(argv, "--parts");
  const partRows = partsFlag ? parseModelPartsCli(partsFlag) : undefined;
  return {
    mode: "texture-uv",
    modelPath,
    prompt,
    object: cliFlag(argv, "--object"),
    size,
    variants,
    images,
    subject: cliFlag(argv, "--subject"),
    conceptNote: cliFlag(argv, "--concept-note"),
    projectConcept: parseOptionalBoolFlag(cliFlag(argv, "--project-concept")),
    conceptView: conceptViewRaw as ModelConceptView | undefined,
    parts: partRows?.length ? partRows : undefined,
    projectStyleId,
  };
}

export function modelCliRestAfter(argv: readonly string[], command: string, skip: Set<string>): string {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === command) continue;
    if (skip.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith("--")) continue;
    out.push(token);
  }
  return out.join(" ").trim();
}

function fileBaseName(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

/** `fire-mop.fbx` → `fire mop`. */
export function subjectFromFile(path: string): string {
  const base = fileBaseName(path);
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
  const hasMarker = input.parts.some((p) => p.marker);
  const locksBaseColors = input.parts.some((p) => p.color === "textured" || !p.marker);
  const colorList = input.parts
    .map((p) =>
      p.marker ? `${p.color} marks part "${p.part}"` : p.color === "textured" ? `textured = ${p.part}` : `${p.color} = ${p.part}`,
    )
    .join(", ");
  const projectedClause = input.projected
    ? "; colors and shading were projected from the design, so faces, eyes and patterns are already where they belong"
    : "";
  const markerPhrase = hasMarker ? "flat marker colors distinguish" : "flat colors mark";
  const layout =
    `Image 1 is the LAYOUT: a texture atlas (UV map) of a 3D ${input.subject} laid flat on black. ` +
    `Each separate shape is one piece of the model surface; ${markerPhrase} the parts (${colorList}); ` +
    `the top of each shape is the top of the model${projectedClause}.`;
  const lines = [layout];
  if (input.hasConcept) {
    const note = input.conceptNote?.trim() || "the design of this object";
    lines.push(`Image 2 is the STYLE AND DESIGN REFERENCE: ${note}.`);
  }
  if (input.hasStyle) {
    lines.push("Image 3 is the STYLE SHEET: overall colour and material finish for the repaint.");
  }
  const markerTask = hasMarker
    ? " The flat marker colors only tell the parts apart: paint each part in its real material colours."
    : "";
  const taskBody = [input.task.trim(), input.theme?.trim()].filter(Boolean).join("; ");
  const taskLine = input.hasConcept
    ? `Task: repaint image 1 as a final hand-painted game texture in the look of image 2: ${taskBody || "a cohesive hand-painted game texture"}.${markerTask}`
    : `Task: repaint image 1 as a final hand-painted game texture: ${taskBody || "a cohesive hand-painted game texture"}.${markerTask}`;
  lines.push(taskLine);
  const faceClause = input.projected ? "faces, eyes and patterns only where they already are, never add new ones; " : "";
  const baseColorsClause = locksBaseColors ? "; the base colors" : "";
  lines.push(
    `Must not change: the position, outline and size of every shape; ${faceClause}the black background${baseColorsClause}.`,
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

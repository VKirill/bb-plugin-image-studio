import type { Rgba } from "./image-io.ts";
import { sheetAspect, sheetLayout, slugify, type GuiStyle, type SheetLayout } from "./gui.ts";

/**
 * Characters section: game characters drawn as clean input for image-to-3D (Hunyuan3D, TRELLIS) and auto-rigging
 * (Roblox Avatar Setup, UniRig). A project holds the look (theme, presets, approved characters as references), like
 * a GUI project. The plugin wraps every request in a mode prompt: the body in a strict A-pose with empty hands on
 * white, a four-view turnaround, and held items drawn apart on their own sheet. Sheets are cut by their white gaps.
 */

export const CHARACTER_MODEL = "muse-image" as const;
export const CHARACTER_MODES = ["ideas", "model", "turnaround", "equipment"] as const;
export type CharacterMode = (typeof CHARACTER_MODES)[number];
export const CHARACTER_IDEAS = 4;
export const MAX_EQUIPMENT = 8;

/** Body proportions and finish: the chips in the panel, and the four directions of a project with nothing fixed. */
export const CHARACTER_PRESETS = {
  stylized:
    "stylized 3D game character: slightly exaggerated proportions (head about one sixth of the height), sturdy hands and feet, clean readable shapes, hand-painted textures",
  blocky:
    "blocky Roblox-style avatar: a square head, a boxy torso, straight cylindrical arms and legs, simple mitten-like hands, clean smooth plastic-toy surfaces",
  chibi: "chibi: a big head about one third of the height, a short stubby body and limbs, cute rounded shapes",
  lowpoly: "low-poly 3D: flat-shaded faceted surfaces, simple blocky shapes, flat colours, no fine detail",
  realistic: "realistic adult proportions (head about one seventh of the height), detailed physically based materials, no stylization",
  toon: "toon-shaded cartoon: bold flat colours, clean dark outlines, simple two-tone shading",
  painted: "hand-painted fantasy RPG: painterly textures, chunky armour and clothing shapes, warm saturated colours",
} as const;
export type CharacterPreset = keyof typeof CHARACTER_PRESETS;
export const CHARACTER_PRESET_IDS = Object.keys(CHARACTER_PRESETS) as CharacterPreset[];

/** The views of a turnaround, left to right; the file names in views/. */
export const TURNAROUND_VIEWS = ["front", "right", "back", "left"] as const;

const VARIATIONS = [
  "Take 1 of 4: the most faithful, straightforward reading of the description.",
  "Take 2 of 4: a bolder, more distinctive silhouette and stronger shapes, the same role and mood.",
  "Take 3 of 4: a calmer, simpler design with fewer, larger details that read well from far away.",
  "Take 4 of 4: an unexpected but fitting twist in clothing, materials or colour accents.",
];

/** Body plans: each has its own neutral rigging pose, camera and frame. */
export const BODY_TYPES = ["humanoid", "quadruped", "winged", "legless"] as const;
export type BodyType = (typeof BODY_TYPES)[number];

// The "system message" every 3D-ready picture carries: one figure, a riggable pose, nothing held.
const ONE_RULE = "Exactly one character, complete, nothing cut off by the frame; no other people, creatures, pets or objects in the picture.";
const ARMS = "arms straight and lowered about 45 degrees from the shoulders, clearly away from the body with a visible gap between each arm and the torso; hands open and relaxed, fingers together, palms facing the thighs";
const LEGS = "legs straight, feet shoulder-width apart and pointing forward, with open background visible between the legs from the crotch down to the feet";
const CLOTH =
  "Nothing hangs between or in front of the legs: tabards, loincloths, robes, skirts, coat tails and belts' flaps end above the knees or are split at the sides, so each leg is fully visible and separate. Long hair and capes fall behind the shoulders and never cover the arms.";
const POSES: Record<BodyType, string> = {
  humanoid: `Pose: a symmetric A-pose for 3D rigging. Standing straight, weight on both feet; ${ARMS}; ${LEGS}. Head upright, looking straight ahead, neutral expression. No action, no lean, no twist, no tilt. A tail, if any, points out behind the body or to one side, never between the legs. ${CLOTH}`,
  winged: `Pose: a symmetric neutral pose for 3D rigging with the wings fully spread out to both sides, flat to the camera, each wing whole and clear of the body, the head and the other wing. Arms only if the description gives the character arms besides its wings (wings "instead of arms" grow from the shoulders and there are no arms at all); arms it has: ${ARMS}. If it stands on legs: ${LEGS}. Head upright, looking straight ahead. A tail, if any, points out behind the body or to one side and never hangs between or in front of the legs. No flapping, no flight action. ${CLOTH}`,
  quadruped:
    "Pose: a neutral standing pose for 3D rigging. Standing square on all four legs, every leg straight and vertical, the front pair apart and the hind pair apart so all four legs are visible and separate; weight even; back level; head level, looking straight ahead, mouth closed; the tail stretched straight out behind, not curled over the body. Any arms of an upright upper body in an A-pose with open empty hands. No walking, running or crouching.",
  legless:
    `Pose: a neutral symmetric resting pose for 3D rigging in the body's natural shape: a serpent body laid in one loose curve that never crosses itself, a slime, ghost or floating body upright and level; tails and tentacles spread out to the sides so they do not overlap the body. If it has arms: ${ARMS}. Head upright, looking straight ahead. No action.`,
};
const CARRY_RULE =
  "Carries nothing: no weapons, tools, shields, bags, torches or other props anywhere: not in the hands, paws or mouth, not slung on the back or over a shoulder, not holstered, not lying at the feet. Gear worn on the body stays (helmet, hat, mask, goggles, armour, vest, pouches, belt, gloves, boots, saddle), kept close to the body so nothing sticks out of the silhouette.";
const BACKGROUND_RULE =
  "Background: plain flat pure white (#FFFFFF) everywhere, no floor, no ground shadow, no scenery, no frame, no gradient, no vignette. No text, labels, arrows, measurements, logos or watermark.";
const LIGHT_RULE =
  "Lighting: soft even studio light from the front, no strong cast shadows, no rim light or glow, true colours: the picture is the texture source for a 3D model.";
const FINISH_RULE = "Rendering: a clean game character in the character style above, crisp edges, the same design and colours in every view.";

/** The 3D front: humanoids from the front; a quadruped from three-quarters, where its length shows. */
const MODEL_CAMERA: Record<BodyType, { camera: string; aspect: string }> = {
  humanoid: { camera: "straight-on front view, orthographic, camera at chest height, no perspective distortion; the character centred and filling about 88% of the frame height", aspect: "2:3" },
  winged: { camera: "straight-on front view, orthographic, camera at chest height, no perspective distortion; the character centred, the spread wings filling about 90% of the frame width", aspect: "4:3" },
  quadruped: { camera: "three-quarter front view from about 45 degrees to the side and slightly above, showing the face, one whole side and the full length of the body, orthographic, no perspective distortion; the character centred and filling about 88% of the frame width", aspect: "3:2" },
  legless: { camera: "straight-on front view, orthographic, camera at chest height, no perspective distortion; the whole body centred and filling about 88% of the frame", aspect: "1:1" },
};

const designLine = (first: number, count: number, what: string): string | null =>
  count > 0 ? `${count === 1 ? `Image ${first}` : `Images ${first}–${first + count - 1}`} ${count === 1 ? "is" : "are"} ${what}` : null;

export type CharacterRequest = {
  /** Who the character is ("colony soldier in an olive uniform, steel helmet, gas mask"). */
  description: string;
  /** Body plan: picks the pose, camera and frame. */
  body: BodyType;
  /** Things held in the hands or carried apart from the body: left out of model/turnaround, drawn by equipment. */
  equipment: string[];
  /** Short name for files ("soldier"); falls back to the description's first words. */
  name: string;
  /** Style references go first as Image 1…N; the user's design pictures follow them. */
  refCount: number;
  designCount: number;
};

export type CharacterJob = {
  prompt: string;
  aspectRatio: string;
  /** "idea 2", "model", "turnaround", "equipment". */
  label: string;
  /** Turnaround and equipment sheets: the grid and the name of every cell. */
  layout?: SheetLayout;
};

/** One list of held items from a free text: lines, ";" or "," (an item list, not a description). */
export function parseEquipment(text: string | undefined): string[] {
  return (text ?? "")
    .split(/[\n;,]+/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((item) => item !== "");
}

/** "soldier" from "Soldier of the colony, olive uniform…"; the explicit name wins. */
export function characterSlug(name: string, description: string): string {
  const base = name.trim() || description.split(/[,.;:\n]/)[0]!.split(/\s+/).slice(0, 4).join(" ");
  return slugify(base, "character");
}

function lookLines(style: GuiStyle | null, refCount: number): string[] {
  // The GUI style lines speak of UI; a character project's references are approved characters or game art.
  const lines: string[] = [];
  if (style?.theme.trim()) lines.push(`Game and mood: ${style.theme.trim()}.`);
  if (style && style.tags.length > 0) lines.push(`Character style: ${style.tags.map((tag) => (CHARACTER_PRESETS as Record<string, string>)[tag] ?? tag).join("; ")}.`);
  if (style?.notes.trim()) lines.push(`Also: ${style.notes.trim()}`);
  if (style && refCount > 0) {
    const concepts: number[] = [];
    const art: number[] = [];
    style.refs.slice(0, refCount).forEach((ref, index) => (ref.role === "art" ? art : concepts).push(index + 1));
    if (concepts.length > 0) {
      lines.push(
        `${list(concepts)} ${concepts.length === 1 ? "shows an approved character" : "show approved characters"} of this game: match the body proportions, head size, level of detail, materials, outline and render finish exactly, as if from the same game; do not copy their clothes, faces or colours unless the description asks for them.`,
      );
    }
    if (art.length > 0) lines.push(`${list(art)} ${art.length === 1 ? "shows" : "show"} the game's art: match its palette and finish only.`);
  }
  return lines;
}

function list(numbers: readonly number[]): string {
  return numbers.length === 1 ? `Image ${numbers[0]}` : `Images ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** Fixed: references, presets or notes. Otherwise ideas try four presets. */
export function characterStyleIsFixed(style: GuiStyle | null): boolean {
  return Boolean(style && (style.refs.length > 0 || style.tags.length > 0 || style.notes.trim() !== ""));
}

function bodyLines(request: CharacterRequest): string[] {
  const held = request.equipment.length > 0
    ? [`Leave out what the character holds (${request.equipment.join("; ")}): it is made separately and attached in the game.`]
    : [];
  const design = designLine(
    request.refCount + 1,
    request.designCount,
    "the approved design of this character (it may hold things or stand in another pose): redraw exactly this character, the same face, body, proportions, clothes, colours, materials and worn gear, in the pose and framing below, carrying nothing.",
  );
  const who = request.description.trim() ? [`Character: ${request.description.trim()}.`] : [];
  return [...who, ...held, ...(design ? [design] : [])];
}

export function ideasJobs(request: CharacterRequest, style: GuiStyle | null): CharacterJob[] {
  const held = request.equipment.length > 0 ? ` holding its equipment (${request.equipment.join("; ")})` : "";
  const design = designLine(request.refCount + 1, request.designCount, "extra references from the user: follow them as the description says.");
  const base = [
    `Deliverable: a character design concept for a 3D game: ${request.description.trim()}.`,
    `Presentation: the whole character, nothing cut off, in a relaxed confident natural pose${held}, three-quarter front view, centred, filling about 85% of the frame.`,
    ONE_RULE,
    BACKGROUND_RULE,
    ...(design ? [design] : []),
  ];
  if (characterStyleIsFixed(style)) {
    const look = lookLines(style, request.refCount);
    return VARIATIONS.map((variation, index) => ({
      prompt: [...base, ...look, variation, FINISH_RULE].join("\n"),
      aspectRatio: request.body === "humanoid" ? "2:3" : MODEL_CAMERA[request.body].aspect,
      label: `idea ${index + 1}`,
    }));
  }
  const theme = style?.theme.trim() ? [`Game and mood: ${style.theme.trim()}.`] : [];
  return CHARACTER_PRESET_IDS.slice(0, CHARACTER_IDEAS).map((preset, index) => ({
    prompt: [...base, ...theme, `Character style: ${CHARACTER_PRESETS[preset]}.`, FINISH_RULE].join("\n"),
    aspectRatio: request.body === "humanoid" ? "2:3" : MODEL_CAMERA[request.body].aspect,
    label: `idea ${index + 1}: ${preset}`,
  }));
}

/** The front view a 3D generator takes: one figure, full size, orthographic, A-pose, empty hands. */
export function modelJob(request: CharacterRequest, style: GuiStyle | null): CharacterJob {
  return {
    prompt: [
      `Deliverable: the ${request.body === "quadruped" ? "three-quarter" : "front"} view of a game character, the single input picture for an image-to-3D generator and auto-rigging.`,
      ...bodyLines(request),
      `Camera: ${MODEL_CAMERA[request.body].camera}.`,
      ONE_RULE,
      POSES[request.body],
      CARRY_RULE,
      BACKGROUND_RULE,
      LIGHT_RULE,
      ...lookLines(style, request.refCount),
      FINISH_RULE,
    ].join("\n"),
    aspectRatio: MODEL_CAMERA[request.body].aspect,
    label: "model",
  };
}

/** Four views in one row: the same design from every side, cut into views/front|right|back|left.png. */
export function turnaroundJob(request: CharacterRequest, style: GuiStyle | null): CharacterJob {
  // Tall bodies fit four in a row; long or wide ones (spread wings, a horse) need a 2×2 grid to stay large.
  const row = request.body === "humanoid" || request.body === "legless";
  const layout: SheetLayout = {
    rows: row ? 1 : 2,
    cols: row ? 4 : 2,
    cells: TURNAROUND_VIEWS.map((view) => ({ name: view, element: view })),
  };
  const order =
    "1. front view, facing the camera; 2. right side view, a strict profile with the nose pointing to the right edge of the image; 3. back view, the back of the head toward the camera; 4. left side view, a strict profile with the nose pointing to the left edge of the image";
  return {
    prompt: [
      "Deliverable: a character turnaround sheet for 3D modelling: the same character seen from four sides.",
      ...bodyLines(request),
      row
        ? `Layout: four full-body views in one row, left to right, STRICTLY in this order: ${order}.`
        : `Layout: a 2×2 grid of four full-body views, STRICTLY: top left, top right, bottom left, bottom right = ${order}.`,
      `All four views the same scale, the feet on one horizontal line${row ? "" : " within each row"}. Each view sits in its own ${row ? "quarter of the image width" : "quarter of the image"}, centred in it and taking at most three quarters of its width and height, so a wide empty white gap separates every pair of neighbours: no spike, wing, hoof, hair or cloth reaches into the next view. Orthographic camera at chest height in every view, no perspective.`,
      "Identical character in every view: the same face, body, proportions, clothes, colours and worn gear, in the same pose; in the side views the limbs stay where the pose puts them and do not hide the torso.",
      ...(request.body === "winged"
        ? ["The wings are in every view, spread exactly as in the front view: in the side views they are seen edge-on and foreshortened, the near wing reaching toward the camera and the far wing showing behind the body; in the back view both wings are spread wide. Never fold or drop the wings in any view."]
        : []),
      POSES[request.body],
      CARRY_RULE,
      BACKGROUND_RULE,
      LIGHT_RULE,
      ...lookLines(style, request.refCount),
      FINISH_RULE,
    ].join("\n"),
    aspectRatio: row ? "16:9" : "4:3",
    label: "turnaround",
    layout,
  };
}

/** Held items on their own: side view, horizontal, one per cell, cut into parts/<item>.png. */
export function equipmentJob(request: CharacterRequest, style: GuiStyle | null): CharacterJob {
  const items = request.equipment;
  const layout = sheetLayout(items, false);
  const rows = Array.from({ length: layout.rows }, (_, row) => {
    const cells = layout.cells.slice(row * layout.cols, (row + 1) * layout.cols);
    return `Row ${row + 1}, left to right: ${cells.map((cell, col) => `${row * layout.cols + col + 1}. ${cell.element}`).join("; ")}`;
  });
  const look = lookLines(style, request.refCount);
  const design = designLine(
    request.refCount + 1,
    request.designCount,
    "the approved design of the character who uses these items: draw each item exactly as it looks there (shape, colours, materials, wear), on its own.",
  );
  return {
    prompt: [
      `Deliverable: a sheet of separate game props, each to be made into its own 3D model and attached to a character's hand.${request.description.trim() ? ` They belong to: ${request.description.trim()}.` : ""}`,
      `Items, in this exact order:\n${rows.join("\n")}`,
      `Layout: a strict grid of ${layout.rows} rows and ${layout.cols} columns, exactly the rows above, one item per cell${layout.cells.length < layout.rows * layout.cols ? "; the cells after the last item stay empty" : ""}, with wide empty white gaps between cells; every item centred, complete and fully visible, never touching another item or the image border.`,
      "Each item alone: shown from the side, lying horizontal and flat to the camera (orthographic, no perspective), long items with the tip, blade or muzzle pointing to the right and the handle or grip on the left, a clearly visible grip. No hands, no character, no holster, stand or display, no straps hanging loose.",
      ...(design ? [design] : []),
      BACKGROUND_RULE,
      LIGHT_RULE,
      ...look,
      look.length > 0
        ? "Rendering: exactly the same art style and finish as the character style above (painting, shading, materials, outline), as if made for the same game; crisp edges; real-world proportions between the items."
        : "Rendering: clean game prop renders, crisp edges, real-world proportions between the items.",
    ].join("\n"),
    aspectRatio: sheetAspect(layout, 1.8),
    label: "equipment",
    layout,
  };
}

/** The jobs of one request; throws a readable error for a missing description or item list. */
export function characterJobs(mode: CharacterMode, request: CharacterRequest, style: GuiStyle | null): CharacterJob[] {
  if (mode !== "equipment" && !request.description.trim() && request.designCount === 0) {
    throw new Error('Describe the character, e.g. "colony soldier: olive uniform, steel helmet, gas mask, leather boots", or pass its approved picture in images.');
  }
  switch (mode) {
    case "ideas":
      return ideasJobs(request, style);
    case "model":
      return [modelJob(request, style)];
    case "turnaround":
      return [turnaroundJob(request, style)];
    case "equipment":
      if (request.equipment.length === 0) throw new Error('List the held items in equipment, e.g. "rifle; combat knife".');
      if (request.equipment.length > MAX_EQUIPMENT) throw new Error(`At most ${MAX_EQUIPMENT} items per sheet; got ${request.equipment.length}. Split the list.`);
      return [equipmentJob(request, style)];
  }
}

// ---- cutting on white -----------------------------------------------------------------

export type WhiteCut = { name: string; image: Rgba; box: { x0: number; y0: number; x1: number; y1: number } };
/** `clean`: every cut went through empty white; false: some figures touched and were cut at their narrowest point. */
export type WhiteCutResult = { parts: WhiteCut[]; missing: string[]; clean: boolean };

const INK = 232;
const inked = (data: Uint8Array, p: number): boolean => Math.min(data[p]!, data[p + 1]!, data[p + 2]!) < INK && data[p + 3]! > 128;
/** A line with this few inked samples counts as empty (noise, a stray antialiased pixel). */
const EMPTY = 2;

/**
 * Cut positions for `parts` pieces along a line of ink counts. The `parts - 1` widest empty runs away from the edges
 * when there are enough; otherwise each cut goes to the least inked spot near where an even split would put it, so
 * figures that touch (a pauldron, a hoof) are parted at their narrowest point instead of halfway through a body.
 */
function gutters(ink: readonly number[], parts: number, minGap: number): { cuts: number[]; clean: boolean } {
  const n = ink.length;
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const empty = i < n && ink[i]! <= EMPTY;
    if (empty && start < 0) start = i;
    else if (!empty && start >= 0) {
      if (start > 0 && i < n && i - start >= minGap) runs.push([i - start, Math.floor((start + i) / 2)]);
      start = -1;
    }
  }
  runs.sort((a, b) => b[0] - a[0]);
  if (runs.length >= parts - 1) return { cuts: [0, ...runs.slice(0, parts - 1).map((run) => run[1]).sort((a, b) => a - b), n], clean: true };
  const smooth = ink.map((_, i) => {
    let sum = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) sum += ink[j]!;
    return sum;
  });
  const reach = Math.round((n * 0.4) / parts);
  const cuts = [0];
  for (let k = 1; k < parts; k++) {
    const expected = Math.round((n * k) / parts);
    let best = expected;
    for (let i = Math.max(cuts[cuts.length - 1]! + 1, expected - reach); i <= Math.min(n - 1, expected + reach); i++) {
      if (smooth[i]! < smooth[best]! || (smooth[i] === smooth[best] && Math.abs(i - expected) < Math.abs(best - expected))) best = i;
    }
    cuts.push(best);
  }
  cuts.push(n);
  return { cuts, clean: false };
}

/**
 * The span of a cell's own drawing along one axis: ink segments split by empty lines; the heaviest is the figure.
 * A segment touching the cell edge that is not the figure is a neighbour's tip (a spike, a hoof) and is dropped.
 */
function ownSpan(ink: readonly number[]): [number, number] | null {
  const segments: Array<{ lo: number; hi: number; sum: number }> = [];
  for (let i = 0; i < ink.length; i++) {
    if (ink[i]! <= EMPTY) continue;
    const last = segments[segments.length - 1];
    if (last && last.hi === i) {
      last.hi = i + 1;
      last.sum += ink[i]!;
    } else segments.push({ lo: i, hi: i + 1, sum: ink[i]! });
  }
  if (segments.length === 0) return null;
  const main = segments.reduce((a, b) => (b.sum > a.sum ? b : a));
  const kept = segments.filter((seg) => seg === main || (seg.lo > 0 && seg.hi < ink.length));
  return [Math.min(...kept.map((seg) => seg.lo)), Math.max(...kept.map((seg) => seg.hi))];
}

/**
 * Cuts a white-background sheet into its views or items (generators rarely centre the cells): columns over the whole
 * sheet, then rows inside each column. Every cell is cropped to its own drawing and padded onto a white square, so a
 * view or a prop goes straight into an image-to-3D model. An empty cell is reported in `missing`.
 */
export function cutOnWhite(image: Rgba, layout: SheetLayout): WhiteCutResult {
  const { data, width, height } = image;
  const columnInk = (x: number, y0: number, y1: number) => {
    let count = 0;
    for (let y = y0; y < y1; y += 2) if (inked(data, (y * width + x) * 4)) count++;
    return count;
  };
  const rowInk = (y: number, x0: number, x1: number) => {
    let count = 0;
    for (let x = x0; x < x1; x += 2) if (inked(data, (y * width + x) * 4)) count++;
    return count;
  };
  const cols = gutters(Array.from({ length: width }, (_, x) => columnInk(x, 0, height)), layout.cols, Math.max(4, Math.round(width / 100)));
  let clean = cols.clean;
  const parts: WhiteCut[] = [];
  const missing: string[] = [];
  const cells: Array<{ index: number; x0: number; x1: number; y0: number; y1: number }> = [];
  for (let c = 0; c < layout.cols; c++) {
    const x0 = cols.cuts[c]!;
    const x1 = cols.cuts[c + 1]!;
    const rows = gutters(Array.from({ length: height }, (_, y) => rowInk(y, x0, x1)), layout.rows, Math.max(4, Math.round(height / 100)));
    if (layout.rows > 1) clean &&= rows.clean;
    for (let r = 0; r < layout.rows; r++) cells.push({ index: r * layout.cols + c, x0, x1, y0: rows.cuts[r]!, y1: rows.cuts[r + 1]! });
  }
  cells.sort((a, b) => a.index - b.index);
  for (const cell of cells) {
    const named = layout.cells[cell.index];
    if (!named) continue;
    const xs = ownSpan(Array.from({ length: cell.x1 - cell.x0 }, (_, i) => columnInk(cell.x0 + i, cell.y0, cell.y1)));
    const ys = xs && ownSpan(Array.from({ length: cell.y1 - cell.y0 }, (_, i) => rowInk(cell.y0 + i, cell.x0 + xs[0], cell.x0 + xs[1])));
    if (!xs || !ys || xs[1] - xs[0] < 8 || ys[1] - ys[0] < 8) {
      missing.push(named.name);
      continue;
    }
    const bx0 = cell.x0 + xs[0];
    const bx1 = cell.x0 + xs[1];
    const by0 = cell.y0 + ys[0];
    const by1 = cell.y0 + ys[1];
    const w = bx1 - bx0;
    const h = by1 - by0;
    // White square with an 8% margin: what image-to-3D crops to anyway, and the figure is never cut at the edge.
    const side = Math.round(Math.max(w, h) * 1.16);
    const out = new Uint8Array(side * side * 4).fill(255);
    const ox = Math.floor((side - w) / 2);
    const oy = Math.floor((side - h) / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = ((by0 + y) * width + bx0 + x) * 4;
        const q = ((oy + y) * side + ox + x) * 4;
        out[q] = data[p]!;
        out[q + 1] = data[p + 1]!;
        out[q + 2] = data[p + 2]!;
      }
    }
    parts.push({ name: named.name, image: { data: out, width: side, height: side }, box: { x0: bx0, y0: by0, x1: bx1, y1: by1 } });
  }
  return { parts, missing, clean };
}

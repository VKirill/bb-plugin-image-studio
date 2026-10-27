import { z } from "zod";
import type { Rgba } from "./image-io.ts";

/**
 * GUI section: a style (the user's "GUI project") holds the theme, tags, palette and approved reference pictures of one
 * game's interface. Every GUI request is wrapped in a mode prompt (ideas / screen / elements / kit) that makes Muse draw
 * a sliceable UI instead of an illustration; element sheets are keyed off a green background and cut into PNGs.
 */

export const GUI_MODEL = "muse-image" as const;
export const GUI_MODES = ["ideas", "screen", "elements", "kit"] as const;
export type GuiMode = (typeof GUI_MODES)[number];
export const GUI_IDEAS = 4;
export const GUI_STATES = ["normal", "hover", "pressed", "disabled"] as const;
/** Muse takes up to 10 references; style pictures leave room for the user's own. */
export const GUI_MAX_REFS = 6;

export const PALETTE_KEYS = ["background", "button", "outline", "highlight", "text"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

const hexColor = z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal("")]);

export const guiRefSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  /** concept: an approved UI picture; art: the game's art (palette and finish only). */
  role: z.enum(["concept", "art"]).default("concept"),
});
export type GuiRef = z.infer<typeof guiRefSchema>;

/** A GUI project: its own history of generations and the style every GUI prompt of it carries. */
export const guiStyleSchema = z.object({
  id: z.string(),
  /** BB project it was made in (informational; projects are listed everywhere). */
  projectId: z.string(),
  /** The folder (or BB project) whose generations go here when no project is named. */
  origin: z.string().default(""),
  /** Which section the project belongs to: interface, characters for 3D, Roblox game assets, or texture-by-model. */
  section: z.enum(["gui", "characters", "roblox", "model"]).default("gui"),
  /** GUI and Characters projects of a Roblox game: the game's id (they inherit its theme and art). */
  gameId: z.string().default(""),
  name: z.string(),
  theme: z.string().default(""),
  tags: z.array(z.string()).default([]),
  palette: z
    .object({
      background: hexColor.default(""),
      button: hexColor.default(""),
      outline: hexColor.default(""),
      highlight: hexColor.default(""),
      text: hexColor.default(""),
    })
    .default({ background: "", button: "", outline: "", highlight: "", text: "" }),
  notes: z.string().default(""),
  refs: z.array(guiRefSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GuiStyle = z.infer<typeof guiStyleSchema>;

export function parseGuiStyles(raw: unknown): GuiStyle[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = guiStyleSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** By id, then by name (case-insensitive); a project of the same origin wins a name clash. */
export function findGuiStyle(styles: readonly GuiStyle[], key: string, origin?: string | null): GuiStyle | null {
  const wanted = key.trim().toLowerCase();
  const named = styles.filter((style) => style.name.toLowerCase() === wanted);
  return (
    styles.find((style) => style.id === key.trim()) ??
    named.find((style) => origin && style.origin === origin) ??
    named[0] ??
    null
  );
}

/** The project a folder writes to when none is named: the most recently used one bound to that folder. */
export function originProject(styles: readonly GuiStyle[], origin: string): GuiStyle | null {
  if (!origin) return null;
  return [...styles].filter((style) => style.origin === origin).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

/** "…/Roblox - Vampirism Fire" → "Roblox - Vampirism Fire". */
export function originName(origin: string): string {
  return origin.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || origin;
}

/** Style presets: the chips in the panel, and the four directions of a style that has nothing fixed yet. */
export const GUI_PRESETS = {
  cartoon:
    "glossy chunky Roblox simulator style: rounded shapes, thick dark outlines, candy-like glossy buttons with a white top shine, bright saturated colours",
  gothic:
    "dark gothic: black wrought-iron frames with sharp spiked corners, crimson accents, faceted ruby gems, a small bat-wing crest",
  fantasy:
    "classic fantasy RPG: carved stone and polished wood frames with gold trim and small gem studs, parchment-coloured inner panels",
  scifi: "sci-fi: dark brushed-metal panels with cyan neon edge lights, angular chamfered corners, holographic glow accents",
  horror: "horror: aged bone and rusted iron frames, dark stone panels, dripping red wax, warm candlelight highlights",
  cozy: "cozy: warm light wood planks, soft rounded corners, stitched fabric panels, soft pastel accents",
  minimal: "clean minimal: flat dark smoked-glass panels, thin bright outlines with a soft glow, almost no ornaments",
  crystal: "faceted crystal: frames and buttons cut from glowing gem crystal with bright facet edges, dark navy inner panels",
  pixel: "crisp pixel-art UI: chunky 2-pixel outlines, limited palette, hard-edged pixel bevels, no blur",
} as const;
export type GuiPreset = keyof typeof GUI_PRESETS;
export const GUI_PRESET_IDS = Object.keys(GUI_PRESETS) as GuiPreset[];

/** Four takes on one fixed style: same identity, a different layout and treatment each, so the four ideas differ. */
const VARIATIONS = [
  "Idea 1 of 4: the most faithful, clean version of this style, with the most straightforward classic layout.",
  "Idea 2 of 4: a different layout: if content would sit in a row, stack it in a vertical list (or the reverse); move the title and counters to new places. Bolder shapes and stronger ornaments.",
  "Idea 3 of 4: a featured layout: one main element large and prominent, the rest smaller around it. Slimmer frames and more breathing room.",
  "Idea 4 of 4: a compact layout that splits the content with tabs, pages or a side menu; an unexpected but fitting material or motif detail.",
];

const TEXT_RULE =
  "Text: every visible label is English, short, in a bold clean sans-serif and spelled exactly; translate any label written in another language into short natural English. No paragraphs, no version numbers, no dates, no logos, no watermark.";
const RENDER_RULE =
  "Rendering: crisp clean game UI art, smooth gradients and soft bevels, no noise or grunge over text areas, strong contrast between labels and panels.";
const KEY_RULE =
  "Background: one flat solid pure green colour (#00FF00) everywhere around the elements, with no shadow, glow or gradient on it; nothing inside the elements is green (use another colour instead).";

function presetText(tag: string): string {
  return (GUI_PRESETS as Record<string, string>)[tag] ?? tag;
}

function paletteLine(style: GuiStyle): string | null {
  const parts = PALETTE_KEYS.flatMap((key) => {
    const value = style.palette[key];
    if (!value) return [];
    const label = key === "background" ? "panel background" : key === "button" ? "buttons" : key === "outline" ? "outlines and borders" : key === "highlight" ? "highlights and selected states" : "label text";
    return [`${label} ${value.toUpperCase()}`];
  });
  return parts.length > 0 ? `Colour palette: ${parts.join(", ")}.` : null;
}

/** Image lines for the style references; they come first, as Image 1…N. */
function refLines(refs: readonly GuiRef[]): string[] {
  const concepts: number[] = [];
  const art: number[] = [];
  refs.forEach((ref, index) => (ref.role === "art" ? art : concepts).push(index + 1));
  const lines: string[] = [];
  if (concepts.length > 0) {
    lines.push(
      `${imageList(concepts)} ${concepts.length === 1 ? "shows" : "show"} the approved UI style of this project. Match ${concepts.length === 1 ? "its" : "their"} materials, colours, outline thickness, bevels, shine and ornament motifs exactly, as if from the same UI kit; do not copy ${concepts.length === 1 ? "its" : "their"} layout or labels.`,
    );
  }
  if (art.length > 0) {
    lines.push(`${imageList(art)} ${art.length === 1 ? "shows" : "show"} the project's art (game art, brand or site visuals). Match its colour palette and finish only; do not draw its characters or scenes.`);
  }
  return lines;
}

function imageList(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Image ${numbers[0]}`;
  return `Images ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** Everything the style fixes: game theme, chips, palette, notes, references. Empty for a fresh style. */
export function styleLines(style: GuiStyle | null, refs: readonly GuiRef[] = style?.refs ?? []): string[] {
  if (!style) return refLines(refs);
  const lines: string[] = [];
  if (style.theme.trim()) lines.push(`Project and mood: ${style.theme.trim()}.`);
  if (style.tags.length > 0) lines.push(`Style: ${style.tags.map(presetText).join("; ")}.`);
  const palette = paletteLine(style);
  if (palette) lines.push(palette);
  if (style.notes.trim()) lines.push(`Also: ${style.notes.trim()}`);
  lines.push(...refLines(refs));
  return lines;
}

/** A style with references, chips, palette or notes is "fixed": ideas vary inside it. Otherwise ideas explore presets. */
export function styleIsFixed(style: GuiStyle | null): boolean {
  if (!style) return false;
  return (
    style.refs.length > 0 ||
    style.tags.length > 0 ||
    style.notes.trim() !== "" ||
    PALETTE_KEYS.some((key) => style.palette[key] !== "")
  );
}

function mockupPrompt(request: string, lines: readonly string[]): string {
  return [
    `Deliverable: a production-ready UI design mockup (the project and mood below say what it is for): ${request.trim()}.`,
    "Presentation: only this UI, shown flat and straight-on (orthographic, no perspective, no tilt), centered, filling about 85% of the frame, on a plain solid pure black background. Nothing around it: no scene, no characters, no hands, no device, no cursor.",
    "Construction, so a UI artist can slice it into reusable pieces: frames with ornaments only on the corners and at the top and bottom center, and straight edges of even thickness between them; flat inner panels with simple rounded corners; every button of one shape, with a normal and a highlighted selected state; sliders made of a track, a fill and a knob; toggles as pill switches; a round close button where a window can close. The same outline thickness and bevel on every piece.",
    "Readable on a phone: clear large controls, generous spacing, few elements, large icons.",
    TEXT_RULE,
    ...lines,
    RENDER_RULE,
  ].join("\n");
}

export type GuiJob = {
  /** Composed prompt sent as is. */
  prompt: string;
  aspectRatio: string;
  /** What the job is, for the record and file names: "idea 2: gothic", "screen", "elements", "kit wide". */
  label: string;
  /** Element sheets: the grid and the name of every cell, in order. */
  layout?: SheetLayout;
};

/** Mockups: 16:9 is Muse's widest sharp frame (2048×1152) and fits a game screen. */
export const MOCKUP_ASPECT = "16:9";

export function ideasJobs(request: string, style: GuiStyle | null): GuiJob[] {
  if (styleIsFixed(style)) {
    const lines = styleLines(style);
    return VARIATIONS.map((variation, index) => ({
      prompt: mockupPrompt(request, [...lines, variation]),
      aspectRatio: MOCKUP_ASPECT,
      label: `idea ${index + 1}`,
    }));
  }
  // Nothing fixed: four different presets; the theme (if any) still applies to all four.
  const theme = style?.theme.trim() ? [`Project and mood: ${style.theme.trim()}.`] : [];
  return GUI_PRESET_IDS.slice(0, GUI_IDEAS).map((preset, index) => ({
    prompt: mockupPrompt(request, [...theme, `Style direction: ${GUI_PRESETS[preset]}.`]),
    aspectRatio: MOCKUP_ASPECT,
    label: `idea ${index + 1}: ${preset}`,
  }));
}

export function screenJob(request: string, style: GuiStyle | null): GuiJob {
  return { prompt: mockupPrompt(request, styleLines(style)), aspectRatio: MOCKUP_ASPECT, label: "screen" };
}

// ---- element sheets ------------------------------------------------------------------

export type SheetCell = { name: string; element: string; state?: (typeof GUI_STATES)[number] };
export type SheetLayout = { rows: number; cols: number; cells: SheetCell[] };

/** One element per line or per ";" (commas stay inside a description). Numbering like "1." or "-" is dropped. */
export function parseElementList(text: string): string[] {
  return text
    .split(/[\n;]+/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((item) => item !== "");
}

export function slugify(text: string, fallback = "part"): string {
  const slug = text
    .toLowerCase()
    .replace(/\s*with (?:the |a )?(?:label|text|caption)\s*(["'«][^"'»]*["'»])?/g, "")
    .replace(/["'«»]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || fallback;
}

export const MAX_ELEMENTS = 16;

/** Grid for a list: with states every row is one element in its four states; otherwise up to 4 per row. */
export function sheetLayout(elements: readonly string[], states: boolean): SheetLayout {
  const used = new Set<string>();
  const unique = (base: string): string => {
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
    used.add(name);
    return name;
  };
  if (states) {
    const cells = elements.flatMap((element, index) => {
      const base = unique(slugify(element, `element-${index + 1}`));
      return GUI_STATES.map((state) => ({ name: `${base}_${state}`, element, state }));
    });
    return { rows: elements.length, cols: GUI_STATES.length, cells };
  }
  const cols = elements.length <= 2 ? elements.length : elements.length <= 4 ? 2 : elements.length <= 9 ? 3 : 4;
  return {
    rows: Math.ceil(elements.length / cols),
    cols,
    cells: elements.map((element, index) => ({ name: unique(slugify(element, `element-${index + 1}`)), element })),
  };
}

/** The Muse frame closest to the grid's shape, so every cell gets as many pixels as possible. */
export function sheetAspect(layout: { rows: number; cols: number }, cellRatio = 1): string {
  const want = (layout.cols / layout.rows) * cellRatio;
  const frames: Array<[string, number]> = [
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
  ];
  let best = frames[0]!;
  for (const frame of frames) {
    if (Math.abs(Math.log(frame[1] / want)) < Math.abs(Math.log(best[1] / want))) best = frame;
  }
  return best[0];
}

function sheetPrompt(intro: string, layout: SheetLayout, lines: readonly string[], states: boolean): string {
  const list = states
    ? layout.cells.filter((cell) => cell.state === "normal").map((cell, index) => `${index + 1}. ${cell.element}`)
    : Array.from({ length: layout.rows }, (_, row) => {
        const cells = layout.cells.slice(row * layout.cols, (row + 1) * layout.cols);
        return `Row ${row + 1}, left to right: ${cells.map((cell, col) => `${row * layout.cols + col + 1}. ${cell.element}`).join("; ")}`;
      });
  return [
    intro,
    `Elements, in this exact order:\n${list.join("\n")}`,
    states
      ? `Layout: a strict grid of ${layout.rows} rows and ${layout.cols} columns. Each row is one element of the list, in order from the top; its four cells, left to right, are the states normal, hover, pressed and disabled. Normal: as designed. Hover: slightly brighter with a soft rim glow. Pressed: slightly darker with a soft inner shadow. Disabled: desaturated grey with lower contrast. Every state the same size and outline.`
      : `Layout: a strict grid of ${layout.rows} rows and ${layout.cols} columns, exactly the rows above: each row holds only its own elements, one per cell${layout.cells.length < layout.rows * layout.cols ? "; the cells after the last element stay empty" : ""}. A large element stays inside its own row; never draw two elements as one piece.`,
    "Every element is centered in its own equal grid cell, complete and fully visible, front view and flat (no perspective), never touching another element or the image border, with wide empty gaps between cells. Nothing else on the sheet: no captions, no numbers, no grid lines.",
    KEY_RULE,
    "Text: no text, letters or numbers on the elements, unless an element names its label in quotes; such a label is English.",
    ...lines,
    RENDER_RULE,
  ].join("\n");
}

export function elementsJob(elements: readonly string[], style: GuiStyle | null, states: boolean): GuiJob {
  const layout = sheetLayout(elements, states);
  const intro = `Deliverable: a sprite sheet of separate UI elements (the project and mood below say what they are for), to be cut into individual images.`;
  return {
    prompt: sheetPrompt(intro, layout, styleLines(style), states),
    aspectRatio: sheetAspect(layout),
    label: states ? "elements with states" : "elements",
    layout,
  };
}

/** The standard parts of a UI kit, in two sheets: wide pieces (2 per row) and compact controls (4 per row). */
export const KIT_SHEETS: ReadonlyArray<{ label: string; cellRatio: number; elements: readonly string[] }> = [
  {
    label: "kit wide",
    cellRatio: 1.8,
    elements: [
      "window frame, empty inside (the inside one flat dark colour), with its corner and top/bottom ornaments",
      "inner content panel, empty",
      "wide button, empty face",
      "wide button in the selected/highlighted state, empty face",
      "slider track, empty (no fill, no knob)",
      "slider fill bar on its own",
      "progress bar frame, empty (no fill)",
      "progress bar fill on its own",
      "horizontal divider line",
      "the decorative crest from the top of the window frame, on its own",
    ],
  },
  {
    label: "kit controls",
    cellRatio: 1,
    elements: [
      "tab button, empty face",
      "tab button in the selected state, empty face",
      "round close button with an X",
      "slider knob",
      "toggle switch, off",
      "toggle switch, on",
      "checkbox, empty",
      "checkbox, checked",
      "square inventory or ability slot frame, empty",
      "square slot frame in the selected state, empty",
      "small round notification badge, empty",
      "small round icon button, empty face",
    ],
  },
];

const KIT_NAMES: readonly string[][] = [
  ["window-frame", "panel", "button", "button-selected", "slider-track", "slider-fill", "bar-frame", "bar-fill", "divider", "crest"],
  ["tab", "tab-selected", "close-button", "slider-knob", "toggle-off", "toggle-on", "checkbox-off", "checkbox-on", "slot", "slot-selected", "badge", "icon-button"],
];

export function kitJobs(style: GuiStyle | null): GuiJob[] {
  const intro = "Deliverable: a sprite sheet of the standard parts of this project's UI kit, to be cut into individual images.";
  return KIT_SHEETS.map((sheet, index) => {
    const cols = index === 0 ? 2 : 4;
    const names = KIT_NAMES[index]!;
    const layout: SheetLayout = {
      rows: Math.ceil(sheet.elements.length / cols),
      cols,
      cells: sheet.elements.map((element, cell) => ({ name: names[cell]!, element })),
    };
    return {
      prompt: sheetPrompt(intro, layout, styleLines(style), false),
      aspectRatio: sheetAspect(layout, sheet.cellRatio),
      label: sheet.label,
      layout,
    };
  });
}

// ---- chroma key and cutting ----------------------------------------------------------

/** Green key: alpha from how much greener a pixel is than its other channels; green fringes pulled back to neutral. */
export function keyGreen(image: Rgba): Rgba {
  const { data, width, height } = image;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const other = Math.max(r, b);
    const greener = g - other;
    // ≥140 greener: background; ≤40: opaque; soft edge between.
    const alpha = Math.max(0, Math.min(255, Math.round(((140 - greener) * 255) / 100)));
    out[i] = r;
    out[i + 1] = Math.min(g, other + 10);
    out[i + 2] = b;
    out[i + 3] = Math.min(alpha, data[i + 3]!);
  }
  return { data: out, width, height };
}

export type Box = { x0: number; y0: number; x1: number; y1: number };
type Component = Box & { label: number; area: number; cx: number; cy: number };

/** 4-connected components of alpha > 128, full resolution. */
function components(image: Rgba, minArea: number): { labels: Int32Array; parts: Component[] } {
  const { data, width, height } = image;
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  const parts: Component[] = [];
  let next = 0;
  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== 0 || data[start * 4 + 3]! <= 128) continue;
    next += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = next;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    let sx = 0;
    let sy = 0;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % width;
      const y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      sx += x;
      sy += y;
      const around = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of around) {
        if (q < 0 || labels[q] !== 0 || data[q * 4 + 3]! <= 128) continue;
        labels[q] = next;
        queue[tail++] = q;
      }
    }
    if (tail >= minArea) parts.push({ label: next, area: tail, x0, y0, x1: x1 + 1, y1: y1 + 1, cx: sx / tail, cy: sy / tail });
  }
  return { labels, parts };
}

/** Boxes grouped into rows by vertical overlap, top to bottom, each row left to right. */
function clusterRows<T extends Box>(boxes: readonly T[]): T[][] {
  const sorted = [...boxes].sort((a, b) => a.y0 - b.y0);
  const rows: T[][] = [];
  let bottom = -1;
  for (const box of sorted) {
    const row = rows[rows.length - 1];
    if (row && box.y0 < bottom) {
      row.push(box);
      bottom = Math.max(bottom, box.y1);
    } else {
      rows.push([box]);
      bottom = box.y1;
    }
  }
  return rows.map((row) => row.sort((a, b) => a.x0 - b.x0));
}

function rowMajor<T extends Box>(boxes: readonly T[]): T[] {
  return clusterRows(boxes).flat();
}

function gap(a: Box, b: Box): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

export type CutPart = { name: string; box: Box; image: Rgba; cell?: SheetCell };
export type CutResult = { parts: CutPart[]; named: boolean; missing: string[] };

/**
 * Cuts a keyed sheet into parts. With a layout: pieces land in grid cells by their center, and the pieces of one cell
 * (a crest in three bits, an X apart from its ring) become one part named after the cell. If the drawing ignored the
 * grid but has exactly one piece per element, they are named in reading order. Otherwise parts are numbered.
 */
export function cutSheet(keyed: Rgba, layout?: SheetLayout): CutResult {
  const { width, height } = keyed;
  const minMajor = Math.max(400, Math.round(width * height * 0.0004));
  const { labels, parts } = components(keyed, 24);
  const major = parts.filter((part) => part.area >= minMajor);
  const minor = parts.filter((part) => part.area < minMajor);

  // groups: major pieces that form one part, plus the minor bits nearest to them
  let groups: Array<{ members: Component[]; cell?: SheetCell; name: string }> | null = null;
  let named = false;
  const missing: string[] = [];

  if (layout && layout.cells.length > 0) {
    const cellW = width / layout.cols;
    const cellH = height / layout.rows;
    const column = (part: Component) => Math.min(layout.cols - 1, Math.floor(part.cx / cellW));
    const place = (assign: (byCell: Map<number, Component[]>) => void) => {
      const byCell = new Map<number, Component[]>();
      assign(byCell);
      const outside = [...byCell.keys()].some((index) => index >= layout.cells.length);
      const filled = layout.cells.filter((_, index) => byCell.has(index)).length;
      return !outside && filled >= Math.ceil(layout.cells.length * 0.75) ? byCell : null;
    };
    const add = (byCell: Map<number, Component[]>, index: number, part: Component) =>
      byCell.set(index, [...(byCell.get(index) ?? []), part]);
    // Rows as drawn (Muse often makes rows of different heights), matched to the grid rows in order; then by position.
    const rows = clusterRows(major);
    const byCell =
      (rows.length === layout.rows
        ? place((map) =>
            rows.forEach((row, r) => {
              const inRow = Math.min(layout.cols, layout.cells.length - r * layout.cols);
              if (row.length === inRow) row.forEach((part, c) => add(map, r * layout.cols + c, part));
              else row.forEach((part) => add(map, r * layout.cols + column(part), part));
            }),
          )
        : null) ??
      (major.length === layout.cells.length ? null : place((map) =>
        major.forEach((part) => add(map, Math.min(layout.rows - 1, Math.floor(part.cy / cellH)) * layout.cols + column(part), part)),
      ));
    if (byCell) {
      groups = [];
      layout.cells.forEach((cell, index) => {
        const members = byCell.get(index);
        if (members) groups!.push({ members, cell, name: cell.name });
        else missing.push(cell.name);
      });
      named = true;
    } else if (major.length === layout.cells.length) {
      groups = rowMajor(major).map((part, index) => ({ members: [part], cell: layout.cells[index], name: layout.cells[index]!.name }));
      named = true;
    }
  }
  groups ??= rowMajor(major).map((part, index) => ({ members: [part], name: `part-${String(index + 1).padStart(2, "0")}` }));

  // minor bits (sparkles, the X of a close button) join the nearest group within reach
  const reach = Math.max(width, height) * 0.03;
  for (const bit of minor) {
    let best: (typeof groups)[number] | null = null;
    let bestGap = reach;
    for (const group of groups) {
      for (const member of group.members) {
        const d = gap(bit, member);
        if (d <= bestGap) {
          bestGap = d;
          best = group;
        }
      }
    }
    best?.members.push(bit);
  }

  const out: CutPart[] = groups.map((group) => {
    const own = new Set(group.members.map((member) => member.label));
    const pad = 2;
    const box = {
      x0: Math.max(0, Math.min(...group.members.map((m) => m.x0)) - pad),
      y0: Math.max(0, Math.min(...group.members.map((m) => m.y0)) - pad),
      x1: Math.min(width, Math.max(...group.members.map((m) => m.x1)) + pad),
      y1: Math.min(height, Math.max(...group.members.map((m) => m.y1)) + pad),
    };
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (box.y0 + y) * width + box.x0 + x;
        const label = labels[p]!;
        // own pieces, and the soft unlabelled edge around them; never a neighbour's piece
        if (label !== 0 ? !own.has(label) : keyed.data[p * 4 + 3] === 0) continue;
        data.set(keyed.data.subarray(p * 4, p * 4 + 4), (y * w + x) * 4);
      }
    }
    return { name: group.name, box, image: { data, width: w, height: h }, ...(group.cell ? { cell: group.cell } : {}) };
  });
  return { parts: out, named, missing };
}

import {
  GUI_MAX_REFS,
  originName,
  sheetAspect,
  sheetLayout,
  type GuiRef,
  type GuiStyle,
  type SheetLayout,
} from "./gui.ts";

/**
 * Roblox section: one project per game. The game holds the shared look (theme, art style, notes, approved art) and
 * its asset kinds: the game page (icon, thumbnails, logo), monetization (badges, passes, developer products), item
 * icons, props for 3D, world textures and skies, and VFX. Its GUI and Characters live in their own projects linked
 * to the game (gameId), which inherit the game's theme and art. Every asset is drawn by Muse and then fitted to
 * what Roblox takes: exact sizes, transparent cut-outs, round-safe icons, tiling textures, the six Sky faces.
 */

export const ROBLOX_MODEL = "muse-image" as const;

export const ROBLOX_MODES = [
  "icon",
  "thumbnail",
  "logo",
  "badges",
  "passes",
  "products",
  "items",
  "props",
  "texture",
  "skybox",
  "decal",
  "vfx",
  "flipbook",
] as const;
export type RobloxMode = (typeof ROBLOX_MODES)[number];

/** The game's tabs: asset groups (folders in image-studio/roblox/<game>/) plus the linked GUI and Characters. */
export const ROBLOX_CATEGORIES = ["store", "monetization", "items", "props", "world", "vfx", "gui", "characters"] as const;
export type RobloxCategory = (typeof ROBLOX_CATEGORIES)[number];

export const MODE_CATEGORY: Record<RobloxMode, RobloxCategory> = {
  icon: "store",
  thumbnail: "store",
  logo: "store",
  badges: "monetization",
  passes: "monetization",
  products: "monetization",
  items: "items",
  props: "props",
  texture: "world",
  skybox: "world",
  decal: "world",
  vfx: "vfx",
  flipbook: "vfx",
};

/** Modes whose prompt is a list of things, one per line or ";": one sheet, cut into parts. */
export const LIST_MODES: readonly RobloxMode[] = ["badges", "passes", "products", "items", "props", "vfx"];
export const MAX_LIST: Record<string, number> = { badges: 6, passes: 6, products: 6, items: 16, props: 6, vfx: 9 };
/** Modes that can draw a few takes of one request. */
export const VARIANT_MODES: readonly RobloxMode[] = ["icon", "thumbnail", "logo", "texture", "skybox", "decal", "flipbook"];
export const MAX_VARIANTS = 4;
export const FLIPBOOK_FRAMES = [4, 16] as const;
export const DECAL_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "2:1"] as const;

/** The game's art style: chips in the panel, a line in every asset prompt. */
export const ROBLOX_PRESETS = {
  simulator: "bright glossy Roblox simulator style: chunky rounded shapes, saturated candy colours, soft shine, playful",
  stylized: "stylized 3D game art: clean readable shapes, hand-painted textures, warm saturated colours",
  lowpoly: "low-poly 3D: flat-shaded faceted shapes, simple flat colours",
  realistic: "realistic game art: physically based materials, natural light, detailed but readable",
  anime: "anime game art: cel shading, clean line art, vivid colours",
  horror: "dark horror game art: low-key light, desaturated colours with red accents, eerie fog",
  cartoon: "toon cartoon: bold outlines, flat colours, two-tone shading, expressive shapes",
  voxel: "voxel art: everything built from small cubes, crisp blocky edges",
} as const;
export type RobloxPreset = keyof typeof ROBLOX_PRESETS;
export const ROBLOX_PRESET_IDS = Object.keys(ROBLOX_PRESETS) as RobloxPreset[];

/** What the plugin does with the picture after Muse: written next to the original in the job's folder. */
export type RobloxOutput =
  | { kind: "cover"; file: string; width: number; height: number }
  | { kind: "limit"; file: string; max: number; transparent: boolean }
  | { kind: "parts"; size: number; key: "green" | "black" }
  | { kind: "white-parts" }
  | { kind: "texture"; size: number }
  | { kind: "skybox"; size: number }
  | { kind: "flipbook"; grid: number; size: number };

export type RobloxJob = {
  prompt: string;
  aspectRatio: string;
  /** "icon 2", "badges", "skybox". */
  label: string;
  layout?: SheetLayout;
  output: RobloxOutput;
};

export type RobloxRequest = {
  mode: RobloxMode;
  /** What to draw; for list modes the list itself. */
  prompt: string;
  /** Takes of one request (single-picture modes). */
  variants: number;
  /** Flipbook frames: 4 (2×2) or 16 (4×4). */
  frames: number;
  /** Decal frame. */
  aspect: string;
  /** Style references first as Image 1…N, then the user's pictures. */
  refCount: number;
  designCount: number;
};

const NO_TEXT = "Text: no letters, words, numbers or logos anywhere in the picture.";
const QUOTED_TEXT =
  "Text: no title, caption, slogan or description written anywhere (the game line below is context, never text in the picture), except text the request gives in quotes, drawn exactly as written in big bold readable letters; no watermark.";
const GREEN = "Background: one flat solid pure green colour (#00FF00) everywhere around the items, with no shadow, glow or gradient on it; nothing inside the items is green (use another colour instead).";
const BLACK = "Background: pure black (#000000) everywhere; the effects are made only of light (glowing colour on black), with no dark outlines and nothing else in the picture.";
const WHITE =
  "Background: plain flat pure white (#FFFFFF) everywhere, no floor, no ground shadow, no scenery. Lighting: soft even studio light from the front, no strong cast shadows, true colours: the picture is the texture source for a 3D model.";

/** The first text in quotes: "\"Treasure Dig\", a skull" → Treasure Dig. */
export function quoted(text: string): string | null {
  return /["«“']([^"»”']+)["»”']/.exec(text)?.[1]?.trim() || null;
}

function presetText(tag: string): string {
  return (ROBLOX_PRESETS as Record<string, string>)[tag] ?? tag;
}

function imageList(numbers: readonly number[]): string {
  return numbers.length === 1 ? `Image ${numbers[0]}` : `Images ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** The game's look, for every asset prompt: theme, art style, notes, approved art as Image 1…N. */
export function gameLines(game: GuiStyle | null, refCount: number, designCount: number): string[] {
  const lines: string[] = [];
  if (game?.theme.trim()) lines.push(`Game (context for the look, not text to write): a Roblox game. ${game.theme.trim()}.`);
  else lines.push("Game: a Roblox game.");
  if (game && game.tags.length > 0) lines.push(`Art style: ${game.tags.map(presetText).join("; ")}.`);
  if (game?.notes.trim()) lines.push(`Also: ${game.notes.trim()}`);
  if (refCount > 0) {
    const numbers = Array.from({ length: refCount }, (_, index) => index + 1);
    lines.push(
      `${imageList(numbers)} ${refCount === 1 ? "shows" : "show"} this game's approved art: match ${refCount === 1 ? "its" : "their"} art style, colour palette, materials, lighting and finish exactly, as if made by the same artist; reuse its characters and world only where the request asks for them.`,
    );
  }
  if (designCount > 0) {
    const numbers = Array.from({ length: designCount }, (_, index) => refCount + index + 1);
    lines.push(`${imageList(numbers)} ${designCount === 1 ? "is an extra reference" : "are extra references"} from the user: use ${designCount === 1 ? "it" : "them"} as the request says.`);
  }
  return lines;
}

export function parseList(text: string): string[] {
  return text
    .split(/[\n;]+/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((item) => item !== "");
}

function listRows(layout: SheetLayout): string {
  return Array.from({ length: layout.rows }, (_, row) => {
    const cells = layout.cells.slice(row * layout.cols, (row + 1) * layout.cols);
    return `Row ${row + 1}, left to right: ${cells.map((cell, col) => `${row * layout.cols + col + 1}. ${cell.element}`).join("; ")}`;
  }).join("\n");
}

function gridRule(layout: SheetLayout, gap: string): string {
  return `Layout: a strict grid of ${layout.rows} rows and ${layout.cols} columns, exactly the rows above, one item per cell${layout.cells.length < layout.rows * layout.cols ? "; the cells after the last item stay empty" : ""}; every item centred in its own cell, complete and fully visible, never touching another item or the image border, with ${gap} between cells. No captions, numbers or grid lines.`;
}

const VARIANT_HINTS = [
  "",
  "Take 2: a different composition and camera angle from the obvious one.",
  "Take 3: a bolder, more dramatic treatment with stronger colours and contrast.",
  "Take 4: an unexpected but fitting idea for the same request.",
];

function single(base: string[], lines: string[], request: RobloxRequest, aspect: string, label: string, output: RobloxOutput): RobloxJob[] {
  const count = Math.max(1, Math.min(MAX_VARIANTS, request.variants));
  return Array.from({ length: count }, (_, index) => ({
    prompt: [...base, ...lines, ...(index > 0 ? [VARIANT_HINTS[index]!] : [])].join("\n"),
    aspectRatio: aspect,
    label: count > 1 ? `${label} ${index + 1}` : label,
    output,
  }));
}

function sheet(request: RobloxRequest, intro: string, view: string, background: string, lines: string[], cellRatio: number, output: RobloxOutput): RobloxJob {
  const items = parseList(request.prompt);
  const layout = sheetLayout(items, false);
  return {
    prompt: [intro, `Items, in this exact order:\n${listRows(layout)}`, gridRule(layout, "wide empty gaps"), view, background, ...lines].join("\n"),
    aspectRatio: sheetAspect(layout, cellRatio),
    label: request.mode,
    layout,
    output,
  };
}

/** The jobs of one Roblox request; throws a readable error for a missing prompt or an oversized list. */
export function robloxJobs(request: RobloxRequest, game: GuiStyle | null): RobloxJob[] {
  const what = request.prompt.trim();
  const lines = gameLines(game, request.refCount, request.designCount);
  if (LIST_MODES.includes(request.mode)) {
    const count = parseList(what).length;
    if (count === 0) throw new Error(`List the ${request.mode}, one per line or separated by ";", e.g. "VIP; 2x Coins; Speed boost".`);
    if (count > MAX_LIST[request.mode]!) throw new Error(`At most ${MAX_LIST[request.mode]} ${request.mode} per sheet; got ${count}. Split the list.`);
  } else if (!what && request.mode !== "logo") {
    throw new Error(`Describe the ${request.mode}, e.g. "${request.mode === "skybox" ? "sunset over a pirate sea" : "a hero vampire in front of a burning castle"}".`);
  }
  switch (request.mode) {
    case "icon":
      return single(
        [
          `Deliverable: the icon of a Roblox game on its game page: ${what}.`,
          "Composition: one bold central subject (a character, a creature or the key object) large and close, filling the square edge to edge with a simple dramatic background behind it; readable at 150 pixels: strong silhouette, high contrast, few big shapes, vivid colours. Square, full-bleed, no border, no frame, no rounded corners.",
          QUOTED_TEXT,
        ],
        lines,
        request,
        "1:1",
        "icon",
        { kind: "cover", file: "icon.png", width: 512, height: 512 },
      );
    case "thumbnail":
      return single(
        [
          `Deliverable: a thumbnail of a Roblox game for its game page carousel (16:9): ${what}.`,
          "Composition: exciting key art of the game in action, a clear focal point, depth and dramatic light, the main subject large in the frame; reads well small. Full-bleed, no border, no UI, no cursor.",
          QUOTED_TEXT,
        ],
        lines,
        request,
        "16:9",
        "thumbnail",
        { kind: "cover", file: "thumbnail.png", width: 1920, height: 1080 },
      );
    case "logo":
      return single(
        [
          `Deliverable: the title logo of a Roblox game${what ? `: ${what}` : ""}.`,
          "The game's name as a bold 3D game logo: chunky stylized letters with depth, outline and shine, in the game's style, optionally with a small fitting emblem; one compact piece, centred, filling about 80% of the width.",
          `Text: only the words "${quoted(what) ?? game?.name ?? "the game's name"}", spelled exactly; nothing else written.`,
          GREEN,
        ],
        lines,
        request,
        "16:9",
        "logo",
        { kind: "limit", file: "logo.png", max: 1024, transparent: true },
      );
    case "badges":
      return [
        sheet(
          request,
          "Deliverable: a sheet of Roblox badge icons (achievements a player earns), to be cut apart; Roblox crops every badge to a circle.",
          "Each badge is a round medallion seen straight from the front: the whole design inside one circle (a rim and an emblem of the achievement, a bold simple symbol), nothing outside the circle; readable at 150 pixels.",
          GREEN,
          [NO_TEXT, ...lines],
          1,
          { kind: "parts", size: 512, key: "green" },
        ),
      ];
    case "passes":
      return [
        sheet(
          request,
          "Deliverable: a sheet of Roblox game pass icons (perks players buy), to be cut apart; Roblox shows every pass in a circle.",
          "Each pass is a round icon seen straight from the front: a bold symbol of the perk (a crown for VIP, a coin stack for 2x coins, a lightning bolt for speed) on a coloured round plate with a rim, the whole design inside the circle; readable at 150 pixels.",
          GREEN,
          [QUOTED_TEXT, ...lines],
          1,
          { kind: "parts", size: 512, key: "green" },
        ),
      ];
    case "products":
      return [
        sheet(
          request,
          "Deliverable: a sheet of Roblox developer product icons (repeatable purchases such as currency packs, boosts, revives), to be cut apart.",
          "Each product is one bold object or pile shown straight from the front or slightly from above, like a shop item: bigger packs look bigger and richer; readable at 150 pixels.",
          GREEN,
          [QUOTED_TEXT, ...lines],
          1,
          { kind: "parts", size: 512, key: "green" },
        ),
      ];
    case "items":
      return [
        sheet(
          request,
          "Deliverable: a sheet of in-game item icons (inventory items, resources, currency, tools) for a Roblox game, to be cut into separate transparent icons.",
          "Each item alone, straight from the front or at a slight three-quarter angle, the same size class and the same light from the top left, a clean readable silhouette; no slot frames, no backgrounds behind the items.",
          GREEN,
          [NO_TEXT, ...lines],
          1,
          { kind: "parts", size: 256, key: "green" },
        ),
      ];
    case "props":
      return [
        sheet(
          request,
          "Deliverable: a sheet of separate game props and buildings for a Roblox game, each to be made into its own 3D model by an image-to-3D generator.",
          "Each prop alone, complete, in a three-quarter view from the front and slightly above (orthographic, no perspective distortion), showing its front, one side and its top; standing upright on nothing; nothing attached around it.",
          WHITE,
          [NO_TEXT, ...lines],
          1,
          { kind: "white-parts" },
        ),
      ];
    case "texture":
      return single(
        [
          `Deliverable: a square seamless tileable surface texture for a Roblox game (a material for walls, floors or terrain): ${what}.`,
          "Seen straight from above, perfectly flat and evenly lit (no shadows, no light falloff, no vignette), the pattern spread evenly over the whole square with no single focal point, tileable on all sides; no objects, no perspective, no border.",
          NO_TEXT,
        ],
        lines,
        request,
        "1:1",
        "texture",
        { kind: "texture", size: 1024 },
      );
    case "skybox":
      return single(
        [
          `Deliverable: a 360-degree panorama of a sky and distant horizon for a Roblox game skybox: ${what}.`,
          "A very wide continuous panorama all around the viewer: the horizon a straight level line across the middle of the image, sky above with clouds, sun or moon, stars, the distant landscape or sea below the horizon; the left edge continues seamlessly into the right edge. No nearby objects, no ground details close to the viewer, no people, no frame.",
          NO_TEXT,
        ],
        lines,
        request,
        "4:1",
        "skybox",
        { kind: "skybox", size: 1024 },
      );
    case "decal":
      return single(
        [
          `Deliverable: a flat decal image for a surface inside a Roblox game (a poster, sign, painting, mural or graffiti): ${what}.`,
          "Shown straight-on and flat, filling the whole frame edge to edge, as the printed picture itself (not a photo of it on a wall), no perspective, no frame around it unless asked.",
          QUOTED_TEXT,
        ],
        lines,
        request,
        request.aspect || "1:1",
        "decal",
        { kind: "limit", file: "decal.png", max: 1024, transparent: false },
      );
    case "vfx":
      return [
        sheet(
          request,
          "Deliverable: a sheet of particle and effect textures for a Roblox game (ParticleEmitter, Beam and Trail textures), to be cut apart.",
          "Each effect a single soft glowing shape (a spark, a puff of smoke, a flame, a magic swirl, a star burst, a ring) seen straight-on, symmetric where natural, fading softly at its edges.",
          BLACK,
          [NO_TEXT, ...lines],
          1,
          { kind: "parts", size: 256, key: "black" },
        ),
      ];
    case "flipbook": {
      const grid = request.frames >= 16 ? 4 : 2;
      return single(
        [
          `Deliverable: a flipbook sprite sheet for a Roblox ParticleEmitter: ${grid * grid} frames of one short looping animation: ${what}.`,
          `Layout: a strict ${grid}×${grid} grid of equal square cells, frames in reading order (left to right, then top to bottom); each frame centred in its own cell at the same scale, never crossing into the next cell; the motion changes smoothly from frame to frame and the last frame leads back into the first.`,
          BLACK,
          NO_TEXT,
        ],
        lines,
        request,
        "1:1",
        "flipbook",
        { kind: "flipbook", grid, size: 1024 },
      );
    }
  }
}

// ---- the game and its linked projects --------------------------------------------------

/**
 * A GUI or Characters project linked to a game, as its prompts see it: its own theme, else the game's; the game's
 * notes and art style after its own; the game's approved art after its own references, as art (palette and finish),
 * up to the reference cap. `owners[i]` is the project whose folder holds `refs[i]`.
 */
export function mergeGameStyle(style: GuiStyle, game: GuiStyle | null): { style: GuiStyle; owners: string[] } {
  if (!game) return { style, owners: style.refs.map(() => style.id) };
  const gameRefs: GuiRef[] = game.refs.map((ref) => ({ ...ref, role: "art" as const }));
  const refs = [...style.refs, ...gameRefs].slice(0, GUI_MAX_REFS);
  const owners = refs.map((_, index) => (index < style.refs.length ? style.id : game.id));
  const notes = [
    style.notes.trim(),
    game.tags.length > 0 ? `Game art style: ${game.tags.map(presetText).join("; ")}.` : "",
    game.notes.trim(),
  ].filter(Boolean).join(" ");
  return {
    style: { ...style, theme: style.theme.trim() || game.theme, notes, refs },
    owners,
  };
}

export type GameMigration = {
  /** Games to create, one per folder. */
  games: GuiStyle[];
  /** GUI / Characters project id → its game's id. */
  links: Record<string, string>;
};

/**
 * Moving the GUI and Characters projects into games: one game per folder (origin); a project made in a chat's
 * scratch folder (.bb/chats/…) becomes a game of its own, named after the project. The game takes the GUI project's
 * theme (else the Characters one's); the projects keep theirs.
 */
export function planGameMigration(styles: readonly GuiStyle[], now: string, newId: () => string): GameMigration {
  const games: GuiStyle[] = [];
  const links: Record<string, string> = {};
  const byOrigin = new Map<string, GuiStyle>();
  const loose = styles.filter((style) => (style.section === "gui" || style.section === "characters") && !style.gameId);
  // GUI first, so a folder's game takes the GUI project's theme and the order of projects stays stable.
  const ordered = [...loose].sort((a, b) => (a.section === b.section ? a.createdAt.localeCompare(b.createdAt) : a.section === "gui" ? -1 : 1));
  for (const style of ordered) {
    const key = style.origin || `style:${style.id}`;
    let game = byOrigin.get(key) ?? styles.find((item) => item.section === "roblox" && item.origin && item.origin === style.origin) ?? null;
    if (!game) {
      const scratch = !style.origin || /[\\/]\.bb[\\/]chats[\\/]/.test(style.origin);
      game = {
        id: newId(),
        projectId: style.projectId,
        origin: style.origin,
        section: "roblox",
        gameId: "",
        name: (scratch ? style.name : originName(style.origin)).slice(0, 80),
        theme: style.theme,
        tags: [],
        palette: { background: "", button: "", outline: "", highlight: "", text: "" },
        notes: "",
        refs: [],
        createdAt: now,
        updatedAt: style.updatedAt,
      };
      games.push(game);
    }
    if (!game.theme && style.theme) game.theme = style.theme;
    if (style.updatedAt > game.updatedAt) game.updatedAt = style.updatedAt;
    byOrigin.set(key, game);
    links[style.id] = game.id;
  }
  return { games, links };
}

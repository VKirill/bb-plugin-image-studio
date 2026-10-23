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
  "loading",
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
  loading: "store",
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
export const VARIANT_MODES: readonly RobloxMode[] = ["icon", "thumbnail", "logo", "loading", "texture", "skybox", "decal", "flipbook"];
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

/**
 * What the plugin does with the picture after Muse: written next to the original in the job's folder. `round`:
 * badges, passes and products are shown in a circle, and a transparent icon shows up on black or white after the
 * upload, so each is put on an opaque square filled with its own rim colour.
 */
export type RobloxOutput =
  | { kind: "cover"; file: string; width: number; height: number }
  | { kind: "limit"; file: string; max: number; transparent: boolean }
  | { kind: "parts"; size: number; key: "green" | "black"; round?: boolean }
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

// Rules from how top Roblox games make their art and what Roblox moderation and upload do (see references/roblox.md).
const SAFE =
  "Moderation-safe: no URLs, social handles, QR codes or barcodes, no prices, discounts or the word FREE, no real brands; characters fully clothed in non-suggestive poses.";
const NO_TEXT = "Text: no letters, words, numbers or logos anywhere in the picture.";
const QUOTED_TEXT =
  "Text: no title, caption, slogan or description written anywhere (the game line below is context, never text in the picture), except text the request gives in quotes, drawn exactly as written in big bold readable letters; no watermark.";
const AVATARS =
  "Player characters are Roblox avatars (blocky Roblox bodies and classic Roblox faces) rendered like Blender game GFX, unless the request or the game says otherwise; creatures, pets and bosses keep their own designs.";
const GREEN = "Background: one flat solid pure green colour (#00FF00) everywhere around the items, with no shadow, glow or gradient on it; nothing inside the items is green (use another colour instead).";
const BLACK = "Background: pure black (#000000) everywhere, nothing else in the picture.";
const WHITE =
  "Background: plain flat pure white (#FFFFFF) everywhere, no floor, no ground shadow, no scenery. Lighting: soft even studio light from the front, no strong cast shadows, no coloured light, no baked reflections, true colours: the picture is the texture source for a 3D model.";
/** Roblox tints particle textures with ParticleEmitter.Color, so they are drawn white. */
const TINTABLE =
  "Colour: white and light grey light only (Roblox colours the texture with the emitter's Color), unless the item itself names a colour; the brightest core white, fading softly to black at the edges, nothing touching the cell border.";

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

const TAKES = [
  "Take 2: a different composition and camera angle from the obvious one.",
  "Take 3: a bolder, more dramatic treatment with stronger colours and contrast.",
  "Take 4: an unexpected but fitting idea for the same request.",
];
/** Roblox tests 2–5 thumbnails per game against each other: the takes are a set of different shots, not retries. */
const THUMBNAIL_TAKES = [
  "Shot 1 of the set: a close-up hero shot, like a widened game icon: the main character or creature big, with its strongest emotion.",
  "Shot 2 of the set: a gameplay scene: players in the middle of the core activity, the game's mechanic obvious at a glance.",
  "Shot 3 of the set: the reward or feature shot: the rarest prize, the biggest boss or the best upgrade, players reacting to it.",
  "Shot 4 of the set: a social or event moment: a group of players together, a dramatic moment of the world, a different colour mood from the others.",
];

function single(base: string[], lines: string[], request: RobloxRequest, aspect: string, label: string, output: RobloxOutput, takes = TAKES): RobloxJob[] {
  const count = Math.max(1, Math.min(MAX_VARIANTS, request.variants));
  const set = takes === THUMBNAIL_TAKES && count > 1;
  return Array.from({ length: count }, (_, index) => ({
    prompt: [...base, ...lines, ...(set ? [takes[index]!] : index > 0 ? [takes[index - 1]!] : []), SAFE].join("\n"),
    aspectRatio: aspect,
    label: count > 1 ? `${label} ${index + 1}` : label,
    output,
  }));
}

function sheet(request: RobloxRequest, intro: string, view: string, background: string, lines: string[], cellRatio: number, output: RobloxOutput): RobloxJob {
  const items = parseList(request.prompt);
  const layout = sheetLayout(items, false);
  return {
    prompt: [intro, `Items, in this exact order:\n${listRows(layout)}`, gridRule(layout, "wide empty gaps"), view, background, ...lines, SAFE].join("\n"),
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
  } else if (!what && request.mode !== "logo" && request.mode !== "loading") {
    throw new Error(`Describe the ${request.mode}, e.g. "${request.mode === "skybox" ? "sunset over a pirate sea" : "a hero vampire in front of a burning castle"}".`);
  }
  const round = "Roblox shows it in a circle: the whole design inside one circle, nothing important outside it.";
  switch (request.mode) {
    case "icon":
      return single(
        [
          `Deliverable: the icon of a Roblox game on its game page: ${what}.`,
          "Composition: one hero subject (a character, creature, pet or the key object) cropped tight, filling 60–80% of the square, with an exaggerated readable emotion (huge glossy eyes, a wide grin or a scream) when it has a face; at most one secondary element; nothing important within 8% of the edges (the tile has rounded corners). The genre reads at 150 pixels.",
          "Background: simple, a single-hue gradient or radial burst in a colour complementary to the hero, with a soft rim light around the hero to separate it; no scenery, no small symbols in the corners. Square, full-bleed, no border.",
          "Text: no title, caption, slogan or description (the game line below is context, never text in the picture), unless the request gives a title in quotes: then 1–3 ultra-chunky words in white or gold with a thick dark outline in the bottom third, nothing smaller.",
          AVATARS,
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
          "Composition: one focal subject big in the frame plus one clearly readable secondary element that explains the mechanic (an egg being carried, a boss behind the player); exaggerated action poses; high contrast between subject and background, one clear light direction; the main content in the central 80%, and the bottom 15% holds nothing important (Roblox puts the player count there). Full-bleed, no border, no UI, no cursor.",
          "Text: no title, caption, slogan or description (the game line below is context, never text in the picture), unless the request gives a hook in quotes: then 1–3 big words or a big number in capitals with a thick outline, in the upper two thirds.",
          AVATARS,
        ],
        lines,
        request,
        "16:9",
        "thumbnail",
        { kind: "cover", file: "thumbnail.png", width: 1920, height: 1080 },
        THUMBNAIL_TAKES,
      );
    case "loading":
      return single(
        [
          `Deliverable: the loading screen background of a Roblox game (16:9)${what ? `: ${what}` : ""}.`,
          "Composition: atmospheric key art of the game's world with the hero subjects on the left and right thirds and a calm, darker, uncluttered area in the centre and along the bottom, where the game's logo and the loading bar go on top; full-bleed, no UI drawn.",
          NO_TEXT,
          AVATARS,
        ],
        lines,
        request,
        "16:9",
        "loading",
        { kind: "cover", file: "loading.png", width: 1920, height: 1080 },
      );
    case "logo":
      return single(
        [
          `Deliverable: the title logo of a Roblox game${what ? `: ${what}` : ""}.`,
          "The game's name as a chunky 3D game logo: thick extruded letters with a two-layer outline (a light inner line and a dark outer line), a gradient of at most two colours with a highlight on the top edges, a soft drop shadow, a slight upward arc; one small fitting ornament (an icon in place of a letter, a flame, a leaf), much smaller than the letters; no texture inside the letters; readable at a quarter size. One compact piece, centred, filling about 80% of the width.",
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
          `Deliverable: a sheet of Roblox badge icons (achievements a player earns), to be cut apart. ${round}`,
          "Each badge is one round medallion seen straight from the front, all of one series: the same ring (border) design, thickness and lighting on every badge; inside the ring full-bleed art of the achievement with one bold central symbol, readable at 150 pixels; only the central symbol and the accent colour change between badges.",
          GREEN,
          ["Text: none, except a short number or word the badge name gives in quotes, big with a thick outline.", ...lines],
          1,
          { kind: "parts", size: 512, key: "green", round: true },
        ),
      ];
    case "passes":
      return [
        sheet(
          request,
          `Deliverable: a sheet of Roblox game pass icons (perks players buy), to be cut apart. ${round}`,
          "Each pass is a glossy round disc with a golden ring: inside, a saturated radial burst in the colour of the benefit (gold for premium and VIP, green for money, pink for pets, blue for speed) with faint sparkles, and one big glossy 3D symbol of the perk filling 55–70% of the disc (a crown for VIP, a coin stack for money, a lightning bolt for speed). All passes the same light direction and outline thickness.",
          GREEN,
          [
            "Text: a multiplier in the name (2x, x3) is drawn as a chunky outlined numeral at the lower right of the symbol; VIP as gold 3D block letters; otherwise at most one short word from the name in bold white with a thick dark outline, or no text.",
            ...lines,
          ],
          1,
          { kind: "parts", size: 512, key: "green", round: true },
        ),
      ];
    case "products":
      return [
        sheet(
          request,
          `Deliverable: a sheet of Roblox developer product icons (repeatable purchases: currency packs, boosts, revives), to be cut apart. ${round}`,
          "Each product is a glossy round disc in the same style as the game passes (a golden ring, a saturated radial burst) with its item big in the middle; currency packs are one currency drawn in tiers that grow down the list (a small pile, a bag, a chest, an overflowing vault) from the same angle and light; bigger tiers get warmer light and more sparkles.",
          GREEN,
          ["Text: none, except an amount the product name gives (x500, 1000) as a big outlined number under the item; no currency symbols.", ...lines],
          1,
          { kind: "parts", size: 512, key: "green", round: true },
        ),
      ];
    case "items": {
      const count = parseList(what).length;
      return [
        sheet(
          request,
          "Deliverable: a sheet of in-game item icons (inventory items, resources, currency, tools) for a Roblox game, to be cut into separate transparent icons.",
          "Each item alone in a three-quarter view from slightly above, filling 75–85% of its cell, the whole set with one camera and one light from the top left and a soft rim light; chunky shapes and a clean silhouette that reads at 64 pixels, with the outline the art style uses; no slot frames, no rarity backgrounds, no shadows on the ground.",
          GREEN,
          ["Text: none, except a number that is part of the item.", ...lines],
          1,
          { kind: "parts", size: count <= 6 ? 512 : 256, key: "green" },
        ),
      ];
    }
    case "props":
      return [
        sheet(
          request,
          "Deliverable: a sheet of separate game props and buildings for a Roblox game, each to be made into its own 3D model by an image-to-3D generator.",
          "Each prop alone, complete with its base, in a three-quarter view from the front and slightly above (about 25 degrees to the side, a long lens with almost no perspective), showing its front, one side and its top; clearly separated parts, a simple chunky silhouette without tiny details; no glass, transparent or mirror-like materials; standing on nothing, nothing attached around it.",
          WHITE,
          [NO_TEXT, ...lines],
          1,
          { kind: "white-parts" },
        ),
      ];
    case "texture":
      return single(
        [
          `Deliverable: a square seamless tileable surface texture for a Roblox game (the colour map of a material for walls, floors or terrain): ${what}.`,
          "Seen straight from above, perfectly flat and evenly lit: no shadows, no ambient occlusion, no highlights, no light falloff, no vignette (Roblox lights it); the pattern spread evenly over the whole square, no single focal point and no large unique landmark that would show when it repeats; detail sized for a face about 10 studs wide; no objects, no perspective, no border.",
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
          "A very wide continuous panorama all around the viewer: the horizon a straight level line across the middle of the image, the sky above, the distant landscape or sea below; the left edge continues seamlessly into the right edge. Soft, fairly low-contrast sky so Roblox's fog and atmosphere blend in. No sun disc and no moon (Roblox draws them), unless the request asks for them; no nearby objects, no ground details close to the viewer, no people, no frame.",
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
          "Shown straight-on and flat, filling the whole frame edge to edge, as the printed picture itself (not a photo of it on a wall), no perspective, no frame around it unless asked; nothing important within 4% of the edges.",
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
          "Each effect a single soft glowing shape (a soft dot, a spark, a star, a puff of smoke, a flame, a ring or shockwave, a slash arc) seen straight-on, symmetric where natural, with a soft falloff to nothing at its edges.",
          BLACK,
          [TINTABLE, NO_TEXT, ...lines],
          1,
          { kind: "parts", size: 256, key: "black" },
        ),
      ];
    case "flipbook": {
      const grid = request.frames >= 16 ? 4 : 2;
      return single(
        [
          `Deliverable: a flipbook sprite sheet for a Roblox ParticleEmitter: ${grid * grid} frames of one short looping animation: ${what}.`,
          `Layout: a strict ${grid}×${grid} grid of equal square cells, frames in reading order (left to right, then top to bottom); each frame centred in its own cell at the same scale with black padding around it, never crossing into the next cell; the motion changes smoothly from frame to frame and the last frame leads back into the first.`,
          BLACK,
          TINTABLE,
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

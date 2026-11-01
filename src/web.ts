import {
  sheetAspect,
  sheetLayout,
  styleIsFixed,
  type GuiStyle,
  type SheetLayout,
} from "./gui.ts";
import { parseList, quoted } from "./roblox.ts";

/**
 * Web section: one project per site. The site holds the shared look (theme, style presets, palette, notes, approved
 * art) and its asset kinds: page concepts (four landing directions, a full page, a phone screen, one section), brand
 * (logo, the favicon set, the og share card) and graphics (hero, cover, spot illustrations, an icon series, a
 * background, a seamless pattern). Every picture is drawn by Muse Image and then fitted to what a site takes: exact
 * sizes, transparent cut-outs, the favicon set with its ICO and webmanifest, and a manifest of where each file goes.
 */

export const WEB_MODEL = "muse-image" as const;

export const WEB_MODES = [
  "ideas",
  "page",
  "mobile",
  "block",
  "logo",
  "favicon",
  "og",
  "hero",
  "cover",
  "illustrations",
  "icons",
  "background",
  "pattern",
] as const;
export type WebMode = (typeof WEB_MODES)[number];

/** The site's tabs: asset groups (folders in image-studio/web/<site>/). */
export const WEB_CATEGORIES = ["concepts", "brand", "graphics"] as const;
export type WebCategory = (typeof WEB_CATEGORIES)[number];

export const MODE_CATEGORY: Record<WebMode, WebCategory> = {
  ideas: "concepts",
  page: "concepts",
  mobile: "concepts",
  block: "concepts",
  logo: "brand",
  favicon: "brand",
  og: "brand",
  hero: "graphics",
  cover: "graphics",
  illustrations: "graphics",
  icons: "graphics",
  background: "graphics",
  pattern: "graphics",
};

/** Modes whose prompt is a list of things, one per line or ";": one sheet, cut into parts. */
export const LIST_MODES: readonly WebMode[] = ["illustrations", "icons"];
export const MAX_LIST: Record<string, number> = { illustrations: 6, icons: 16 };
/** Modes that can draw a few takes of one request; ideas always draws four directions of its own. */
export const VARIANT_MODES: readonly WebMode[] = [
  "page",
  "mobile",
  "block",
  "logo",
  "favicon",
  "og",
  "hero",
  "cover",
  "background",
  "pattern",
];
export const MAX_VARIANTS = 4;

/** The site's art style: chips in the panel, a line in every prompt — and the four directions of a style with nothing fixed. */
export const WEB_PRESETS = {
  minimal:
    "clean minimal web design: a lot of white space, a strict grid, one restrained accent colour, crisp sans-serif type, no ornament",
  corporate:
    "corporate web design: a trustworthy blue palette, a structured grid, clear photography, clean sans-serif type, card-based sections",
  playful:
    "playful web design: bright saturated colours, rounded chunky shapes, friendly illustrations, big approachable headlines",
  editorial:
    "editorial web design: a magazine layout, elegant serif headlines, generous margins, refined typography, muted paper tones",
  brutalist:
    "web brutalism: raw black on white, thick solid borders, a stark blocky layout, system type, harsh high contrast, deliberate roughness",
  "dark-tech":
    "dark tech web design: a near-black background, neon cyan and violet accents, soft glows and gradients, monospace details, futuristic cards",
  luxury:
    "luxury web design: a deep dark or cream background, gold accents, thin elegant serif type, wide letter spacing, restrained imagery",
  "flat-illustration":
    "flat illustration web design: flat vector shapes with no gradients or shadows, a limited friendly palette, simple geometric characters",
  "clay-3d":
    "clay 3D web design: soft matte 3D clay objects in pastel colours, rounded forms, gentle studio light, playful little scenes",
} as const;
export type WebPreset = keyof typeof WEB_PRESETS;
export const WEB_PRESET_IDS = Object.keys(WEB_PRESETS) as WebPreset[];

/**
 * What the plugin does with the picture after Muse: written next to the original in the job's folder. `cover`: centre
 * crop to the exact site size; `limit`: longest side capped (a long page at 2048, a transparent logo at 1024);
 * `parts`: a green-key sheet cut into transparent squares; `favicon`: the whole favicon set; `pattern`: a seamless tile.
 */
export type WebOutput =
  | { kind: "cover"; file: string; width: number; height: number }
  | { kind: "limit"; file: string; max: number; transparent: boolean }
  | { kind: "parts"; size: number }
  | { kind: "favicon"; fill: string }
  | { kind: "pattern"; size: number };

export type WebJob = {
  mode: WebMode;
  prompt: string;
  aspectRatio: string;
  /** The site (project) the job belongs to, for manifest.json. */
  site: string;
  /** What the job is, for the record and file names: "idea 2: minimal", "hero 2", "icons". */
  label: string;
  layout?: SheetLayout;
  output: WebOutput;
};

export type WebRequest = {
  mode: WebMode;
  /** What to draw; for list modes the list itself. */
  prompt: string;
  /** Takes of one request (single-picture modes). */
  variants: number;
  /** Style references first as Image 1…N, then the user's pictures. */
  refCount: number;
  designCount: number;
};

// Rules from what a site takes (see the plan's mode table): green key for cutting, text only where a site wants it.
const GREEN =
  "Background: one flat solid pure green colour (#00FF00) everywhere around the mark, with no shadow, glow or gradient on it; nothing inside the mark is green (use another colour instead).";
const GREEN_ITEMS =
  "Background: one flat solid pure green colour (#00FF00) everywhere around the items, with no shadow, glow or gradient on it; nothing inside the items is green (use another colour instead).";
const NO_TEXT = "Text: no letters, words, numbers or logos anywhere in the picture.";
const QUOTED_TEXT =
  "Text: no title, caption, slogan or description written anywhere (the site line below is context, never text in the picture), except text the request gives in quotes, drawn exactly as written in big bold readable letters; no watermark.";
const UI_TEXT =
  "Text: headlines, menu items and buttons are short real English phrases spelled exactly, big and readable (no lorem ipsum); no watermark.";
const SCREEN =
  "Presentation: the page itself, flat and straight-on (orthographic), filling the whole frame edge to edge: no perspective or tilt, no browser window, no device frame, no cursor, no hands, no scene around it.";

const EXAMPLE: Record<WebMode, string> = {
  ideas: "a landing page for a coffee subscription",
  page: "the pricing page with three plans",
  mobile: "the mobile shop screen with big product cards",
  block: "a pricing section with three plans",
  logo: '"Acme", a paper plane',
  favicon: "a paper plane mark in one colour",
  og: "the share card for the launch post",
  hero: "a calm workspace by a window",
  cover: "what the article is about",
  background: "a soft blue gradient with faint geometric shapes",
  pattern: "tiny leaves on a cream background",
  illustrations: "empty state; 404 page; success",
  icons: "fast shipping; secure payments; 24/7 support",
};

function presetText(tag: string): string {
  return (WEB_PRESETS as Record<string, string>)[tag] ?? tag;
}

function imageList(numbers: readonly number[]): string {
  return numbers.length === 1 ? `Image ${numbers[0]}` : `Images ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

const PALETTE_LABELS: Record<string, string> = { background: "background", button: "buttons", outline: "borders", highlight: "accents", text: "text" };

/** The project's first palette colour, for opaque favicon fills; white when the palette is empty. */
export function firstPalette(site: GuiStyle | null): string {
  for (const value of site ? Object.values(site.palette) : []) if (value) return value.toUpperCase();
  return "#FFFFFF";
}

/** "#1A1026" → [26, 16, 38]; anything else falls back to white. */
export function hexRgb(hex: string): [number, number, number] {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "";
  const int = value ? Number.parseInt(value, 16) : 0xffffff;
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** The site's look, for every asset prompt: theme, style presets, palette, notes, approved art as Image 1…N. */
export function siteLines(site: GuiStyle | null, refCount: number, designCount: number): string[] {
  const lines: string[] = [];
  if (site?.theme.trim()) lines.push(`Site (context for the look, not text to write): a website. ${site.theme.trim()}.`);
  else lines.push("Site: a website.");
  if (site && site.tags.length > 0) lines.push(`Style: ${site.tags.map(presetText).join("; ")}.`);
  const palette = Object.entries(site?.palette ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${PALETTE_LABELS[key] ?? key} ${value.toUpperCase()}`);
  if (palette.length > 0) lines.push(`Colour palette: ${palette.join(", ")}.`);
  if (site?.notes.trim()) lines.push(`Also: ${site.notes.trim()}`);
  if (refCount > 0) {
    const numbers = Array.from({ length: refCount }, (_, index) => index + 1);
    lines.push(
      `${imageList(numbers)} ${refCount === 1 ? "shows" : "show"} this site's approved art: match ${refCount === 1 ? "its" : "their"} art style, colour palette and finish exactly, as if made by the same artist.`,
    );
  }
  if (designCount > 0) {
    const numbers = Array.from({ length: designCount }, (_, index) => refCount + index + 1);
    lines.push(`${imageList(numbers)} ${designCount === 1 ? "is an extra reference" : "are extra references"} from the user: use ${designCount === 1 ? "it" : "them"} as the request says.`);
  }
  return lines;
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

const WEB_TAKES = [
  "Take 2: a different composition and layout from the obvious one.",
  "Take 3: a bolder, more dramatic treatment with stronger colours and contrast.",
  "Take 4: an unexpected but fitting idea for the same request.",
];

/** Four landing-page directions: a set of different pages, not retries of one. */
const IDEA_TAKES = [
  "Idea 2 of 4: a different layout: the hero content and sections stacked differently, bolder shapes and stronger colour blocks.",
  "Idea 3 of 4: a minimal editorial direction: a lot of white space, one huge headline, few sections, refined typography.",
  "Idea 4 of 4: an unexpected but fitting direction: an unusual composition, motif or colour treatment, still a working landing page.",
];

function single(base: string[], lines: string[], request: WebRequest, siteName: string, aspect: string, label: string, output: WebOutput): WebJob[] {
  const count = Math.max(1, Math.min(MAX_VARIANTS, request.variants));
  return Array.from({ length: count }, (_, index) => ({
    mode: request.mode,
    prompt: [...base, ...lines, ...(index > 0 ? [WEB_TAKES[index - 1]!] : [])].join("\n"),
    aspectRatio: aspect,
    site: siteName,
    label: count > 1 ? `${label} ${index + 1}` : label,
    output,
  }));
}

/** The jobs of one web request; throws a readable error for a missing prompt or an oversized list. */
export function webJobs(request: WebRequest, site: GuiStyle | null): WebJob[] {
  const what = request.prompt.trim();
  const siteName = site?.name ?? "";
  const lines = siteLines(site, request.refCount, request.designCount);
  if (LIST_MODES.includes(request.mode)) {
    const count = parseList(what).length;
    if (count === 0) throw new Error(`List the ${request.mode}, one per line or separated by ";", e.g. "${EXAMPLE[request.mode]}".`);
    if (count > MAX_LIST[request.mode]!) throw new Error(`At most ${MAX_LIST[request.mode]} ${request.mode} per sheet; got ${count}. Split the list.`);
  } else if (!what && request.mode !== "logo") {
    throw new Error(`Describe the ${request.mode}, e.g. "${EXAMPLE[request.mode]}".`);
  }
  switch (request.mode) {
    case "ideas": {
      const base = [
        `Deliverable: a desktop landing-page mockup for the site: ${what}.`,
        "Composition: a real landing page: a slim header with the site name and a short menu, a hero section with one big headline, a sub-line and a single call-to-action button, then two or three content sections; consistent spacing, a clear type scale, one accent colour.",
        SCREEN,
        UI_TEXT,
      ];
      const directions = styleIsFixed(site)
        ? [
            { lines: [] as string[], label: "idea 1" },
            ...IDEA_TAKES.map((take, index) => ({ lines: [take], label: `idea ${index + 2}` })),
          ]
        : WEB_PRESET_IDS.slice(0, 4).map((preset) => ({
            lines: [`Style direction: ${WEB_PRESETS[preset]}.`],
            label: `idea ${WEB_PRESET_IDS.indexOf(preset) + 1}: ${preset}`,
          }));
      return directions.map((direction) => ({
        mode: request.mode,
        prompt: [...base, ...lines, ...direction.lines].join("\n"),
        aspectRatio: "3:2",
        site: siteName,
        label: direction.label,
        output: { kind: "cover", file: "mockup.png", width: 1536, height: 1024 },
      }));
    }
    case "page":
      return single(
        [
          `Deliverable: a full-length mockup of one website page (every section stacked top to bottom, from the header to the footer): ${what}.`,
          "Composition: the whole page in one tall picture: the header with the site name and menu, the hero, then the content sections in order, then the footer; one column of desktop-width content on a plain page background; generous but consistent spacing; the page runs to the bottom edge of the frame.",
          SCREEN,
          UI_TEXT,
        ],
        lines,
        request,
        siteName,
        "9:16",
        "page",
        { kind: "limit", file: "page.png", max: 2048, transparent: false },
      );
    case "mobile":
      return single(
        [
          `Deliverable: a phone-screen mockup of the site's mobile version: ${what}.`,
          "Composition: the whole frame is the screen: a narrow single-column mobile page with large touch targets and large readable type, content stacked vertically, one primary action visible; full-bleed, no phone body, no bezel, no status bar.",
          SCREEN,
          UI_TEXT,
        ],
        lines,
        request,
        siteName,
        "9:16",
        "mobile",
        { kind: "cover", file: "mobile.png", width: 1080, height: 1920 },
      );
    case "block":
      return single(
        [
          `Deliverable: a desktop-width mockup of one website section (a hero, pricing, features, testimonials, FAQ, contact or footer, as the request names): ${what}.`,
          "Composition: only this one section, edge to edge at desktop width, with its real content (headings, cards, columns, buttons) arranged on a clean grid; nothing above or below it.",
          SCREEN,
          UI_TEXT,
        ],
        lines,
        request,
        siteName,
        "16:9",
        "block",
        { kind: "cover", file: "block.png", width: 1920, height: 1080 },
      );
    case "logo":
      return single(
        [
          `Deliverable: the logo of a website${what ? `: ${what}` : ""}.`,
          "One compact wordmark or mark-plus-wordmark, centred, filling about 80% of the width: a clean bold silhouette, readable at small sizes; no texture inside the shapes, no tagline.",
          `Text: only the site's name "${quoted(what) ?? site?.name ?? "the site's name"}", spelled exactly; nothing else written.`,
          GREEN,
        ],
        lines,
        request,
        siteName,
        "16:9",
        "logo",
        { kind: "limit", file: "logo.png", max: 1024, transparent: true },
      );
    case "favicon":
      return single(
        [
          `Deliverable: a website favicon mark (the small square icon in a browser tab, reading clearly at 16 pixels): ${what}.`,
          "One compact symbol or a 1–2-letter monogram, centred, filling about 80% of the frame, with a clean bold silhouette: flat colours, no thin lines, no gradients, no long text; readable at 16–32 pixels.",
          GREEN,
        ],
        lines,
        request,
        siteName,
        "1:1",
        "favicon",
        { kind: "favicon", fill: firstPalette(site) },
      );
    case "og":
      return single(
        [
          `Deliverable: a social share card for the site (shown when a page is linked in chat apps and social networks, 1200×630): ${what}.`,
          "Composition: one strong visual that reads at a small size, the main subject centred with clear space around it and safe margins, so nothing important is lost when the card is cropped to a square preview.",
          QUOTED_TEXT,
        ],
        lines,
        request,
        siteName,
        "16:9",
        "og",
        { kind: "cover", file: "og.png", width: 1200, height: 630 },
      );
    case "hero":
      return single(
        [
          `Deliverable: the first-screen picture of a website homepage: ${what}.`,
          "Composition: the main scene toward one side and the lower part of the frame, with a calm, uncluttered, lower-contrast area across the rest, where the headline and the call-to-action button go on top; nothing important cropped at the edges.",
          NO_TEXT,
        ],
        lines,
        request,
        siteName,
        "16:9",
        "hero",
        { kind: "cover", file: "hero.png", width: 1920, height: 1080 },
      );
    case "cover":
      return single(
        [
          `Deliverable: a cover picture for an article or blog post on the site: ${what}.`,
          "Composition: one clear concept or scene, the subject centred, working both wide and cropped to a square preview; a simple background so a headline stays readable on top.",
          QUOTED_TEXT,
        ],
        lines,
        request,
        siteName,
        "16:9",
        "cover",
        { kind: "cover", file: "cover.png", width: 1600, height: 900 },
      );
    case "illustrations":
    case "icons": {
      const items = parseList(what);
      const layout = sheetLayout(items, false);
      const icons = request.mode === "icons";
      const prompt = [
        icons
          ? "Deliverable: a sheet of feature icons of one series for a website, to be cut into separate transparent squares."
          : "Deliverable: a sheet of spot illustrations for a website (empty states, a 404 scene, success and error pictures), to be cut into separate transparent pictures.",
        `Items, in this exact order:\n${listRows(layout)}`,
        gridRule(layout, "wide empty gaps"),
        icons
          ? "Each icon alone in its cell: one metaphor, flat, with the stroke weight, corner rounding and palette identical across the set, centred with clear space around it, readable at 24 pixels; no container box around the icon."
          : "Each illustration alone in its cell: one small self-contained scene with a single focal subject, the same style, level of detail and palette across the set.",
        GREEN_ITEMS,
        "Text: none on the items, unless an item names its label in quotes; such a label is English.",
        ...lines,
      ].join("\n");
      return [
        {
          mode: request.mode,
          prompt,
          aspectRatio: sheetAspect(layout),
          site: siteName,
          label: request.mode,
          layout,
          output: { kind: "parts", size: icons && items.length > 6 ? 256 : 512 },
        },
      ];
    }
    case "background":
      return single(
        [
          `Deliverable: a background picture for a website section: ${what}.`,
          "Composition: abstract and low-contrast, spread evenly with no focal point, quiet enough that white text and cards on top stay readable; a little darker or flatter toward the middle, where the content sits.",
          NO_TEXT,
        ],
        lines,
        request,
        siteName,
        "16:9",
        "background",
        { kind: "cover", file: "background.png", width: 1920, height: 1080 },
      );
    case "pattern":
      return single(
        [
          `Deliverable: a seamless tileable background pattern for a website: ${what}.`,
          "Seen straight from above, flat and evenly lit: no shadows, no highlights, no vignette, no light falloff; the motif spread evenly over the whole square with no single landmark that would show where the tile repeats; the left edge continues into the right and the top into the bottom.",
          NO_TEXT,
        ],
        lines,
        request,
        siteName,
        "1:1",
        "pattern",
        { kind: "pattern", size: 1024 },
      );
  }
}

// ---- manifest.json --------------------------------------------------------------------

/** One finished file of a job, as the export reports it. */
export type WebFile = { file: string; width: number; height: number };

export type WebManifest = {
  section: "web";
  mode: WebMode;
  site: string;
  files: Array<{ file: string; width: number; height: number; place: string; html?: string }>;
};

/** Where each file goes on a site, and the tag that shows it. */
const PLACES: Record<string, { place: string; html?: string }> = {
  "mockup.png": { place: "public/mockup.png" },
  "page.png": { place: "public/page.png" },
  "mobile.png": { place: "public/mobile.png" },
  "block.png": { place: "public/block.png" },
  "logo.png": { place: "public/logo.png", html: `<img src="/logo.png">` },
  "favicon.ico": { place: "public/favicon.ico", html: `<link rel="icon" href="/favicon.ico" sizes="32x32">` },
  "favicon-16.png": { place: "public/favicon-16.png", html: `<link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png">` },
  "favicon-32.png": { place: "public/favicon-32.png", html: `<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">` },
  "icon-192.png": { place: "public/icon-192.png" },
  "icon-512.png": { place: "public/icon-512.png" },
  "apple-touch-icon.png": { place: "public/apple-touch-icon.png", html: `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` },
  "icon-maskable-512.png": { place: "public/icon-maskable-512.png" },
  "site.webmanifest": { place: "public/site.webmanifest", html: `<link rel="manifest" href="/site.webmanifest">` },
  "og.png": { place: "public/og.png", html: `<meta property="og:image" content="/og.png">` },
  "hero.png": { place: "public/hero.png", html: `<img src="/hero.png">` },
  "cover.png": { place: "public/cover.png", html: `<img src="/cover.png">` },
  "background.png": { place: "public/background.png" },
  "pattern.png": { place: "public/pattern.png" },
};

/** manifest.json for a job folder: every file with its place on the site and the html tag that shows it. */
export function webManifest(job: Pick<WebJob, "mode" | "site">, files: readonly WebFile[]): WebManifest {
  return {
    section: "web",
    mode: job.mode,
    site: job.site,
    files: files.map((file) => {
      const known = PLACES[file.file];
      const place = known ?? (file.file.startsWith("parts/") ? { place: `public/img/${file.file.slice("parts/".length)}` } : { place: `public/${file.file}` });
      return { file: file.file, width: file.width, height: file.height, ...place };
    }),
  };
}

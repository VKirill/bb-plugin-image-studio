import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sheetAspect, type GuiStyle } from "../src/gui.ts";
import type { Rgba } from "../src/image-io.ts";
import { encodeIco } from "../src/image-io.ts";
import {
  LIST_MODES,
  MAX_LIST,
  MODE_CATEGORY,
  VARIANT_MODES,
  WEB_CATEGORIES,
  WEB_MODES,
  WEB_MODEL,
  WEB_PRESETS,
  faviconSet,
  firstPalette,
  hexRgb,
  webJobs,
  webManifest,
  type WebJob,
  type WebMode,
  type WebRequest,
} from "../src/web.ts";

const site = (patch: Partial<GuiStyle> = {}): GuiStyle => ({
  id: "s1",
  projectId: "p1",
  origin: "",
  section: "web",
  gameId: "",
  name: "Acme",
  theme: "",
  tags: [],
  palette: { background: "", button: "", outline: "", highlight: "", text: "" },
  notes: "",
  refs: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});

const request = (patch: Partial<WebRequest>): WebRequest => ({
  mode: "hero",
  prompt: "a calm workspace by a window",
  variants: 1,
  refCount: 0,
  designCount: 0,
  ...patch,
});

const one = (mode: WebMode, prompt = "a coffee subscription"): WebJob => webJobs(request({ mode, prompt }), site())[0]!;

const solid = (width: number, height: number, rgba: [number, number, number, number]): Rgba => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { data, width, height };
};
const px = (image: Rgba, x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

test("13 modes, three categories, lists and variants partition the modes", () => {
  assert.equal(WEB_MODES.length, 13);
  assert.equal(WEB_MODEL, "muse-image");
  for (const mode of WEB_MODES) assert.ok(WEB_CATEGORIES.includes(MODE_CATEGORY[mode]), mode);
  assert.deepEqual(Object.keys(MAX_LIST).sort(), ["icons", "illustrations"]);
  assert.equal(MAX_LIST.illustrations, 6);
  assert.equal(MAX_LIST.icons, 16);
  const partition = new Set<string>(["ideas", ...LIST_MODES, ...VARIANT_MODES]);
  assert.equal(partition.size, 13);
  for (const mode of WEB_MODES) assert.ok(partition.has(mode), mode);
  assert.equal([...LIST_MODES, ...VARIANT_MODES].includes("ideas"), false);
});

test("every mode sends the plan's aspect and writes the plan's file and size", () => {
  // concepts
  const ideas = webJobs(request({ mode: "ideas" }), null);
  assert.equal(ideas.length, 4);
  for (const job of ideas) {
    assert.equal(job.aspectRatio, "3:2");
    assert.deepEqual(job.output, { kind: "cover", file: "mockup.png", width: 1536, height: 1024 });
  }
  const page = one("page");
  assert.equal(page.aspectRatio, "9:16");
  assert.deepEqual(page.output, { kind: "limit", file: "page.png", max: 2048, transparent: false });
  const mobile = one("mobile");
  assert.equal(mobile.aspectRatio, "9:16");
  assert.deepEqual(mobile.output, { kind: "cover", file: "mobile.png", width: 1080, height: 1920 });
  const block = one("block");
  assert.equal(block.aspectRatio, "16:9");
  assert.deepEqual(block.output, { kind: "cover", file: "block.png", width: 1920, height: 1080 });
  // brand
  const logo = one("logo", '"Acme", a paper plane');
  assert.equal(logo.aspectRatio, "16:9");
  assert.deepEqual(logo.output, { kind: "limit", file: "logo.png", max: 1024, transparent: true });
  const favicon = one("favicon");
  assert.equal(favicon.aspectRatio, "1:1");
  assert.deepEqual(favicon.output, { kind: "favicon", fill: "#FFFFFF" });
  const og = one("og");
  assert.equal(og.aspectRatio, "16:9");
  assert.deepEqual(og.output, { kind: "cover", file: "og.png", width: 1200, height: 630 });
  // graphics
  const hero = one("hero");
  assert.equal(hero.aspectRatio, "16:9");
  assert.deepEqual(hero.output, { kind: "cover", file: "hero.png", width: 1920, height: 1080 });
  assert.match(hero.prompt, /calm, uncluttered/);
  const cover = one("cover");
  assert.equal(cover.aspectRatio, "16:9");
  assert.deepEqual(cover.output, { kind: "cover", file: "cover.png", width: 1600, height: 900 });
  const background = one("background");
  assert.equal(background.aspectRatio, "16:9");
  assert.deepEqual(background.output, { kind: "cover", file: "background.png", width: 1920, height: 1080 });
  assert.match(background.prompt, /no letters, words, numbers/);
  const pattern = one("pattern");
  assert.equal(pattern.aspectRatio, "1:1");
  assert.deepEqual(pattern.output, { kind: "pattern", size: 1024 });
  // sheets: the aspect follows the grid
  const illustrations = webJobs(request({ mode: "illustrations", prompt: "empty state; 404 page; success" }), null)[0]!;
  assert.equal(illustrations.aspectRatio, sheetAspect(illustrations.layout!));
  assert.deepEqual(illustrations.layout!.cells.map((cell) => cell.name), ["empty-state", "404-page", "success"]);
  assert.deepEqual(illustrations.output, { kind: "parts", size: 512 });
  const icons = webJobs(request({ mode: "icons", prompt: "cart; search; user" }), null)[0]!;
  assert.equal(icons.aspectRatio, sheetAspect(icons.layout!));
  assert.deepEqual(icons.output, { kind: "parts", size: 512 });
  const manyIcons = webJobs(request({ mode: "icons", prompt: Array.from({ length: 7 }, (_, i) => `icon ${i + 1}`).join("; ") }), null)[0]!;
  assert.equal((manyIcons.output as { kind: "parts"; size: number }).size, 256);
  // variants draw takes of one request, up to 4
  assert.deepEqual(webJobs(request({ mode: "hero", variants: 3 }), null).map((job) => job.label), ["hero 1", "hero 2", "hero 3"]);
  assert.equal(webJobs(request({ mode: "hero", variants: 9 }), null).length, 4);
  assert.equal(new Set(webJobs(request({ mode: "hero", variants: 4 }), null).map((job) => job.prompt)).size, 4);
});

test("ideas: four presets when nothing is fixed, four takes inside a fixed style", () => {
  const fresh = webJobs(request({ mode: "ideas" }), site({ theme: "coffee subscription" }));
  assert.equal(fresh.length, 4);
  assert.deepEqual(fresh.map((job) => job.label), ["idea 1: minimal", "idea 2: corporate", "idea 3: playful", "idea 4: editorial"]);
  assert.equal(new Set(fresh.map((job) => job.prompt)).size, 4);
  for (const preset of ["minimal", "corporate", "playful", "editorial"] as const) {
    assert.ok(fresh.some((job) => job.prompt.includes(WEB_PRESETS[preset])), preset);
  }
  assert.ok(fresh.every((job) => job.prompt.includes("coffee subscription")));

  const fixed = site({ tags: ["dark-tech"], palette: { background: "#0a0a12", button: "", outline: "", highlight: "", text: "" } });
  const takes = webJobs(request({ mode: "ideas" }), fixed);
  assert.equal(takes.length, 4);
  assert.equal(new Set(takes.map((job) => job.label)).size, 4);
  for (const job of takes) {
    assert.ok(job.prompt.includes(WEB_PRESETS["dark-tech"]));
    assert.ok(job.prompt.includes("background #0A0A12"));
    assert.equal(job.aspectRatio, "3:2");
  }
  assert.doesNotMatch(takes[0]!.prompt, /Idea \d of 4/);
  assert.match(takes[1]!.prompt, /Idea 2 of 4/);
});

test("list limits: at most 6 illustrations and 16 icons, readable errors", () => {
  assert.throws(() => webJobs(request({ mode: "illustrations", prompt: "a;b;c;d;e;f;g" }), null), /At most 6 illustrations/);
  assert.throws(() => webJobs(request({ mode: "icons", prompt: Array.from({ length: 17 }, (_, i) => `icon ${i + 1}`).join("; ") }), null), /At most 16 icons/);
  assert.doesNotThrow(() => webJobs(request({ mode: "illustrations", prompt: "a;b;c;d;e;f" }), null));
  assert.doesNotThrow(() => webJobs(request({ mode: "icons", prompt: Array.from({ length: 16 }, (_, i) => `icon ${i + 1}`).join("; ") }), null));
  assert.throws(() => webJobs(request({ mode: "icons", prompt: "" }), null), /List the icons/);
  assert.throws(() => webJobs(request({ mode: "illustrations", prompt: " " }), null), /List the illustrations/);
  assert.throws(() => webJobs(request({ mode: "hero", prompt: " " }), null), /Describe the hero/);
  // only the logo may stay undescribed: the site's name is the wordmark
  assert.match(webJobs(request({ mode: "logo", prompt: "" }), site())[0]!.prompt, /only the site's name "Acme"/);
  assert.match(webJobs(request({ mode: "logo", prompt: '"Treasure", a kite' }), null)[0]!.prompt, /only the site's name "Treasure"/);
});

test("the site's look goes into every prompt, references numbered first", () => {
  const styled = site({
    theme: "coffee subscription",
    tags: ["flat-illustration"],
    notes: "warm cream tones",
    palette: { background: "#f5efe6", button: "#c0203a", outline: "", highlight: "", text: "" },
  });
  for (const [mode, prompt] of [
    ["hero", "a kitchen"],
    ["logo", ""],
    ["icons", "cart; search"],
    ["pattern", "leaves"],
  ] as const) {
    const [job] = webJobs(request({ mode, prompt, refCount: 2, designCount: 1 }), styled);
    assert.match(job!.prompt, /Site \(context for the look, not text to write\): a website\. coffee subscription\./, mode);
    assert.match(job!.prompt, /Style: flat illustration web design/, mode);
    assert.match(job!.prompt, /Colour palette: background #F5EFE6, buttons #C0203A/, mode);
    assert.match(job!.prompt, /Also: warm cream tones/, mode);
    assert.match(job!.prompt, /Images 1 and 2 show this site's approved art/, mode);
    assert.match(job!.prompt, /Image 3 is an extra reference from the user/, mode);
  }
  assert.equal(firstPalette(styled), "#F5EFE6");
  assert.equal(firstPalette(site()), "#FFFFFF");
  assert.deepEqual(hexRgb("#0a0a12"), [10, 10, 18]);
  assert.deepEqual(hexRgb("nope"), [255, 255, 255]);
});

test("encodeIco: ICONDIR header and three entries pointing at PNG signatures", () => {
  const png = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n)]);
  const ico = encodeIco([16, 32, 48].map((size) => ({ size, png: png(size * 4) })));
  assert.deepEqual([...ico.subarray(0, 6)], [0x00, 0x00, 0x01, 0x00, 0x03, 0x00]);
  let offset = 6 + 3 * 16;
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry]!, size);
    assert.equal(ico[entry + 1]!, size);
    assert.equal(ico[entry + 2]!, 0);
    assert.equal(ico[entry + 3]!, 0);
    assert.equal(ico.readUInt16LE(entry + 4), 1);
    assert.equal(ico.readUInt16LE(entry + 6), 32);
    assert.equal(ico.readUInt32LE(entry + 8), size * 4 + 8);
    assert.equal(ico.readUInt32LE(entry + 12), offset);
    assert.deepEqual([...ico.subarray(offset, offset + 4)], [0x89, 0x50, 0x4e, 0x47]);
    offset += size * 4 + 8;
  }
  assert.equal(ico.length, offset);
});

/** The bounding box of pixels that are not the fill colour (the mark on an opaque favicon square). */
function markBox(image: Rgba, fill: readonly [number, number, number]) {
  let x0 = image.width, y0 = image.height, x1 = -1, y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const p = (y * image.width + x) * 4;
      if (Math.abs(image.data[p]! - fill[0]) <= 8 && Math.abs(image.data[p + 1]! - fill[1]) <= 8 && Math.abs(image.data[p + 2]! - fill[2]) <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  assert.ok(x1 >= 0, "the mark is gone");
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

test("favicon set: transparent squares, the ICO header, opaque apple and maskable icons in the safe zone", async () => {
  const fill = [10, 20, 30] as const;
  const set = await faviconSet(solid(60, 40, [200, 30, 50, 255]), fill, "Acme");
  const byFile = new Map(set.map((file) => [file.file, file]));
  for (const [file, size] of [
    ["favicon-16.png", 16],
    ["favicon-32.png", 32],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ] as const) {
    const file1 = byFile.get(file);
    assert.ok(file1 && "image" in file1, file);
    assert.deepEqual([file1.image.width, file1.image.height], [size, size]);
    assert.equal(px(file1.image, 0, 0)[3], 0);
    assert.equal(px(file1.image, size - 1, size - 1)[3], 0);
    assert.equal(px(file1.image, Math.floor(size / 2), Math.floor(size / 2))[3], 255);
  }
  const ico = byFile.get("favicon.ico");
  assert.ok(ico && "bytes" in ico);
  assert.deepEqual([...ico.bytes.subarray(0, 6)], [0, 0, 1, 0, 3, 0]);

  const apple = byFile.get("apple-touch-icon.png");
  assert.ok(apple && "image" in apple);
  assert.deepEqual([apple.image.width, apple.image.height], [180, 180]);
  for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]] as const) assert.equal(px(apple.image, x, y)[3], 255, `corner ${x},${y}`);
  assert.deepEqual(px(apple.image, 0, 0).slice(0, 3), [10, 20, 30]);
  assert.deepEqual(px(apple.image, 89, 89).slice(0, 3), [200, 30, 50]);

  const maskable = byFile.get("icon-maskable-512.png");
  assert.ok(maskable && "image" in maskable);
  assert.deepEqual([maskable.image.width, maskable.image.height], [512, 512]);
  for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]] as const) assert.equal(px(maskable.image, x, y)[3], 255, `corner ${x},${y}`);
  const box = markBox(maskable.image, fill);
  // every mark pixel's centre sits inside the central 80% (the 409 px box: 0.1·512 … 0.9·512)
  assert.ok(box.x0 + 0.5 >= 512 * 0.1 && box.y0 + 0.5 >= 512 * 0.1, JSON.stringify(box));
  assert.ok(box.x1 - 0.5 <= 512 * 0.9 && box.y1 - 0.5 <= 512 * 0.9, JSON.stringify(box));
  assert.ok(box.x1 - box.x0 <= 409 && box.y1 - box.y0 <= 409, JSON.stringify(box));

  const webmanifest = byFile.get("site.webmanifest");
  assert.ok(webmanifest && "manifest" in webmanifest);
  assert.deepEqual((webmanifest.manifest as { name: string }).name, "Acme");
  assert.deepEqual(
    (webmanifest.manifest as { icons: Array<{ src: string; purpose?: string }> }).icons.map((icon) => [icon.src, icon.purpose ?? "any"]),
    [
      ["/icon-192.png", "any"],
      ["/icon-512.png", "any"],
      ["/icon-maskable-512.png", "maskable"],
    ],
  );
});

test("webManifest pairs every file with its place on the site and the tag that shows it", () => {
  const favicon = one("favicon");
  assert.deepEqual(
    webManifest(favicon, [
      { file: "favicon.ico", width: 48, height: 48 },
      { file: "site.webmanifest", width: 0, height: 0 },
    ]),
    {
      section: "web",
      mode: "favicon",
      site: "Acme",
      files: [
        { file: "favicon.ico", width: 48, height: 48, place: "public/favicon.ico", html: `<link rel="icon" href="/favicon.ico" sizes="32x32">` },
        { file: "site.webmanifest", width: 0, height: 0, place: "public/site.webmanifest", html: `<link rel="manifest" href="/site.webmanifest">` },
      ],
    },
  );
  const og = webManifest(one("og"), [{ file: "og.png", width: 1200, height: 630 }]);
  assert.equal(og.files[0]!.place, "public/og.png");
  assert.equal(og.files[0]!.html, `<meta property="og:image" content="/og.png">`);
  const hero = webManifest(one("hero"), [{ file: "hero.png", width: 1920, height: 1080 }]);
  assert.equal(hero.files[0]!.place, "public/hero.png");
  assert.equal(hero.files[0]!.html, `<img src="/hero.png">`);
  const parts = webManifest(one("icons"), [{ file: "parts/cart.png", width: 512, height: 512 }]);
  assert.equal(parts.files[0]!.place, "public/img/cart.png");
});

test("server.ts registers the web section: the agent tool, the CLI command and the folder layout", () => {
  const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(source, /name: "image_studio_web"/);
  assert.match(source, /runGuiCommand\(argv, ctx, reply, "web"\)/);
  assert.match(source, /section: "web"/);
  assert.match(source, /bb image-studio web projects\|project\|ref\|generate\|delete/);
  assert.match(source, /"web", slugify\(style\.name, "site"\)/);
  assert.match(source, /z\.enum\(WEB_MODES\)/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUI_PRESETS,
  cutSheet,
  elementsJob,
  findGuiStyle,
  ideasJobs,
  keyGreen,
  kitJobs,
  originName,
  originProject,
  parseElementList,
  parseGuiStyles,
  screenJob,
  sheetAspect,
  sheetLayout,
  slugify,
  styleIsFixed,
  type GuiStyle,
} from "../src/gui.ts";
import type { Rgba } from "../src/image-io.ts";

const style = (patch: Partial<GuiStyle> = {}): GuiStyle => ({
  id: "s1",
  projectId: "p1",
  origin: "",
  name: "Vampire night",
  theme: "",
  tags: [],
  palette: { background: "", button: "", outline: "", highlight: "", text: "" },
  notes: "",
  refs: [],
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  ...patch,
});

test("element lists split on lines, semicolons and commas outside brackets", () => {
  assert.deepEqual(parseElementList("1. Play button\n- gold coin icon; wood log (oak, dark)\n\n• heart bar, badge"), [
    "Play button",
    "gold coin icon",
    "wood log (oak, dark)",
    "heart bar",
    "badge",
  ]);
});

test("slugs are ascii and unique per sheet", () => {
  assert.equal(slugify("Play button with the label 'PLAY'"), "play-button");
  assert.equal(slugify("square ability button with a bat icon"), "square-ability-button-with-a-bat-icon");
  assert.equal(slugify("кнопка", "element-1"), "element-1");
  const layout = sheetLayout(["Coin", "coin", "Gem"], false);
  assert.deepEqual(
    layout.cells.map((cell) => cell.name),
    ["coin", "coin-2", "gem"],
  );
});

test("layouts: states make one row per element, otherwise up to 4 columns", () => {
  const states = sheetLayout(["play", "shop"], true);
  assert.equal(states.rows, 2);
  assert.equal(states.cols, 4);
  assert.deepEqual(
    states.cells.slice(0, 4).map((cell) => cell.name),
    ["play_normal", "play_hover", "play_pressed", "play_disabled"],
  );
  assert.deepEqual([sheetLayout(["a", "b", "c"], false).cols, sheetLayout(["a", "b", "c", "d", "e"], false).cols], [2, 3]);
  assert.equal(sheetLayout(Array.from({ length: 12 }, (_, i) => `e${i}`), false).cols, 4);
});

test("sheet frame follows the grid shape", () => {
  assert.equal(sheetAspect({ rows: 1, cols: 4 }), "16:9");
  assert.equal(sheetAspect({ rows: 3, cols: 3 }), "1:1");
  assert.equal(sheetAspect({ rows: 5, cols: 2 }, 1.8), "3:4");
});

test("a fresh style explores four presets; a fixed one gives four takes with its palette and references", () => {
  const fresh = ideasJobs("settings window with sliders", style({ theme: "vampires vs humans" }));
  assert.equal(fresh.length, 4);
  assert.equal(new Set(fresh.map((job) => job.prompt)).size, 4);
  assert.ok(fresh[0]!.prompt.includes(GUI_PRESETS.cartoon));
  assert.ok(fresh.every((job) => job.prompt.includes("Game and mood: vampires vs humans.")));
  assert.ok(fresh.every((job) => job.prompt.includes("every visible label is English")));
  assert.ok(fresh.every((job) => job.aspectRatio === "16:9"));

  const fixed = style({
    tags: ["gothic"],
    palette: { background: "#1a1026", button: "#c0203a", outline: "", highlight: "", text: "" },
    refs: [
      { id: "r1", filename: "a.png", mimeType: "image/png", role: "concept" },
      { id: "r2", filename: "b.png", mimeType: "image/png", role: "art" },
    ],
  });
  assert.equal(styleIsFixed(fixed), true);
  const takes = ideasJobs("settings window", fixed);
  assert.equal(takes.length, 4);
  assert.ok(takes[1]!.prompt.includes("vertical list"));
  assert.ok(takes[2]!.prompt.includes("featured layout"));
  for (const job of takes) {
    assert.ok(job.prompt.includes(GUI_PRESETS.gothic));
    assert.ok(job.prompt.includes("panel background #1A1026, buttons #C0203A"));
    assert.ok(job.prompt.includes("Image 1 shows the approved UI style"));
    assert.ok(job.prompt.includes("Image 2 shows the game's art"));
  }
  assert.ok(screenJob("shop", fixed).prompt.startsWith("Deliverable: a game-ready UI design mockup for a Roblox game: shop."));
});

test("element sheets list the elements in order on a green key", () => {
  const job = elementsJob(["Play button", "gold coin icon", "heart bar"], null, false);
  assert.ok(job.prompt.includes("Row 1, left to right: 1. Play button; 2. gold coin icon\nRow 2, left to right: 3. heart bar"));
  assert.ok(job.prompt.includes("#00FF00"));
  assert.ok(job.prompt.includes("2 rows and 2 columns"));
  assert.equal(job.layout?.cells.length, 3);
  const withStates = elementsJob(["Play button"], null, true);
  assert.ok(withStates.prompt.includes("normal, hover, pressed and disabled"));
  assert.ok(withStates.prompt.includes("1. Play button\n"));
});

test("the kit is two named sheets", () => {
  const jobs = kitJobs(null);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]!.layout?.cols, 2);
  assert.equal(jobs[1]!.layout?.cols, 4);
  assert.ok(jobs[0]!.layout?.cells.some((cell) => cell.name === "window-frame"));
  assert.ok(jobs[1]!.layout?.cells.some((cell) => cell.name === "toggle-on"));
});

test("projects parse (old records get an empty origin), resolve by id or name, the same folder wins a name clash", () => {
  const { origin: _drop, ...legacy } = style({ id: "s0", name: "Old" });
  const list = parseGuiStyles([
    style({ origin: "/a/Game" }),
    { id: "broken" },
    style({ id: "s2", origin: "/b/Site", name: "Vampire night" }),
    legacy,
  ]);
  assert.equal(list.length, 3);
  assert.equal(list[2]!.origin, "");
  assert.equal(findGuiStyle(list, "vampire NIGHT", "/b/Site")?.id, "s2");
  assert.equal(findGuiStyle(list, "vampire NIGHT", "/a/Game")?.id, "s1");
  assert.equal(findGuiStyle(list, "s2")?.id, "s2");
  assert.equal(findGuiStyle(list, "missing"), null);
});

test("a folder writes to its most recently used project; names come from the folder", () => {
  const list = [
    style({ id: "old", origin: "/x/Game", updatedAt: "2026-10-01T00:00:00.000Z" }),
    style({ id: "new", origin: "/x/Game", updatedAt: "2026-10-20T00:00:00.000Z" }),
    style({ id: "site", origin: "/x/Site" }),
  ];
  assert.equal(originProject(list, "/x/Game")?.id, "new");
  assert.equal(originProject(list, "/x/Other"), null);
  assert.equal(originProject(list, ""), null);
  assert.equal(originName("/Users/k/Documents/Мои проекты/Roblox - Vampirism Fire/"), "Roblox - Vampirism Fire");
});

/** A green sheet with filled rectangles (and optional extra dots), 4 bytes per pixel. */
function sheet(width: number, height: number, rects: Array<[number, number, number, number, [number, number, number]]>): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([0, 255, 0, 255], i * 4);
  for (const [x0, y0, x1, y1, color] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...color, 255], (y * width + x) * 4);
  }
  return { data, width, height };
}

test("the key makes green transparent and keeps the elements", () => {
  const keyed = keyGreen(sheet(4, 1, [[2, 0, 4, 1, [200, 30, 50]]]));
  assert.equal(keyed.data[3], 0);
  assert.equal(keyed.data[11], 255);
  assert.deepEqual([...keyed.data.subarray(8, 11)], [200, 30, 50]);
});

test("cut: pieces land in grid cells; a split piece joins its cell; an empty cell is reported", () => {
  // 2×2 grid on 400×400: cell 0 is a ring plus a detached X, cell 1 a block, cell 2 a block, cell 3 empty.
  const image = sheet(400, 400, [
    [40, 40, 160, 160, [200, 30, 50]],
    [170, 90, 180, 100, [250, 250, 250]],
    [240, 40, 360, 160, [80, 40, 120]],
    [40, 240, 160, 360, [30, 30, 200]],
  ]);
  const layout = sheetLayout(["close button", "panel", "slot", "badge"], false);
  const cut = cutSheet(keyGreen(image), layout);
  assert.equal(cut.named, true);
  assert.deepEqual(
    cut.parts.map((part) => part.name),
    ["close-button", "panel", "slot"],
  );
  assert.deepEqual(cut.missing, ["badge"]);
  const close = cut.parts[0]!;
  assert.equal(close.box.x1, 182);
  assert.equal(close.image.width, 182 - 38);
  // the detached X is part of the close button; the green gap between them is transparent
  const alphaAt = (x: number, y: number) => close.image.data[((y - close.box.y0) * close.image.width + (x - close.box.x0)) * 4 + 3];
  assert.equal(alphaAt(175, 95), 255);
  assert.equal(alphaAt(165, 95), 0);
  assert.equal(alphaAt(50, 50), 255);
});

test("cut: a drawing that ignores the grid is named in reading order when the count matches", () => {
  // asked for a 2-column grid of 2, drawn stacked vertically
  const image = sheet(400, 400, [
    [150, 20, 250, 120, [200, 30, 50]],
    [150, 220, 250, 320, [30, 30, 200]],
  ]);
  const cut = cutSheet(keyGreen(image), sheetLayout(["play", "shop"], false));
  assert.equal(cut.named, true);
  assert.deepEqual(
    cut.parts.map((part) => part.name),
    ["play", "shop"],
  );
});

test("cut without a layout numbers the parts", () => {
  const cut = cutSheet(keyGreen(sheet(300, 100, [[10, 10, 90, 90, [1, 1, 1]], [200, 10, 290, 90, [9, 9, 9]]])));
  assert.equal(cut.named, false);
  assert.deepEqual(
    cut.parts.map((part) => part.name),
    ["part-01", "part-02"],
  );
});

test("cut: rows of different heights are matched to grid rows in order", () => {
  // 2×2 grid on 400×400, but the first row is drawn tall (its pieces reach past the middle line)
  const image = sheet(400, 400, [
    [20, 70, 180, 340, [200, 30, 50]],
    [220, 70, 380, 340, [80, 40, 120]],
    [20, 352, 180, 392, [30, 30, 200]],
    [220, 352, 380, 392, [9, 9, 9]],
  ]);
  const cut = cutSheet(keyGreen(image), sheetLayout(["frame", "panel", "button", "bar"], false));
  assert.deepEqual(
    cut.parts.map((part) => [part.name, part.box.y0]),
    [["frame", 68], ["panel", 68], ["button", 350], ["bar", 350]],
  );
});

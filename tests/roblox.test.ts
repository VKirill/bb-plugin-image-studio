import assert from "node:assert/strict";
import { test } from "node:test";
import type { GuiStyle } from "../src/gui.ts";
import type { Rgba } from "../src/image-io.ts";
import { MODE_CATEGORY, ROBLOX_MODES, mergeGameStyle, planGameMigration, robloxJobs, type RobloxRequest } from "../src/roblox.ts";
import { cover, fitSquare, glowToAlpha, normalMap, resize, seamless, skyboxFaces, trimAlpha } from "../src/raster.ts";

const style = (patch: Partial<GuiStyle> = {}): GuiStyle => ({
  id: "s1",
  projectId: "p1",
  origin: "",
  section: "gui",
  gameId: "",
  name: "Vampire night",
  theme: "",
  tags: [],
  palette: { background: "", button: "", outline: "", highlight: "", text: "" },
  notes: "",
  refs: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...patch,
});

const request = (patch: Partial<RobloxRequest>): RobloxRequest => ({
  mode: "icon",
  prompt: "a vampire hunter",
  variants: 1,
  frames: 16,
  aspect: "1:1",
  refCount: 0,
  designCount: 0,
  ...patch,
});

const solid = (width: number, height: number, rgba: [number, number, number, number]): Rgba => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { data, width, height };
};
const px = (image: Rgba, x: number, y: number) => Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

test("every Roblox mode has a tab", () => {
  for (const mode of ROBLOX_MODES) assert.ok(MODE_CATEGORY[mode], mode);
});

test("single pictures: Roblox sizes and frames, takes differ", () => {
  const [icon] = robloxJobs(request({ mode: "icon" }), null);
  assert.equal(icon!.aspectRatio, "1:1");
  assert.deepEqual(icon!.output, { kind: "cover", file: "icon.png", width: 512, height: 512 });
  const thumbs = robloxJobs(request({ mode: "thumbnail", variants: 3 }), null);
  assert.equal(thumbs.length, 3);
  assert.deepEqual(thumbs.map((job) => job.label), ["thumbnail 1", "thumbnail 2", "thumbnail 3"]);
  assert.equal(new Set(thumbs.map((job) => job.prompt)).size, 3);
  assert.deepEqual(thumbs[0]!.output, { kind: "cover", file: "thumbnail.png", width: 1920, height: 1080 });
  assert.equal(robloxJobs(request({ mode: "skybox" }), null)[0]!.aspectRatio, "4:1");
  assert.equal(robloxJobs(request({ mode: "decal", aspect: "16:9" }), null)[0]!.aspectRatio, "16:9");
  assert.deepEqual(robloxJobs(request({ mode: "flipbook", frames: 4 }), null)[0]!.output, { kind: "flipbook", grid: 2, size: 1024 });
  // A logo needs no description: the game's name comes from the game; a quoted name wins.
  assert.match(robloxJobs(request({ mode: "logo", prompt: "" }), style({ name: "Pirate Dig" }))[0]!.prompt, /only the words "Pirate Dig"/);
  assert.match(robloxJobs(request({ mode: "logo", prompt: '"Treasure Dig", a skull' }), style())[0]!.prompt, /only the words "Treasure Dig"/);
  assert.match(thumbs[0]!.prompt, /no title, caption, slogan or description/);
});

test("list modes: one sheet, named cells, round-safe badges, errors read well", () => {
  const [badges] = robloxJobs(request({ mode: "badges", prompt: "First kill; Survived 10 nights\nVIP" }), null);
  assert.deepEqual(badges!.layout!.cells.map((cell) => cell.name), ["first-kill", "survived-10-nights", "vip"]);
  assert.deepEqual(badges!.output, { kind: "parts", size: 512, key: "green" });
  assert.match(badges!.prompt, /inside one circle/);
  assert.match(badges!.prompt, /#00FF00/);
  assert.deepEqual(robloxJobs(request({ mode: "items", prompt: "coin; gem" }), null)[0]!.output, { kind: "parts", size: 256, key: "green" });
  assert.deepEqual(robloxJobs(request({ mode: "vfx", prompt: "spark; smoke" }), null)[0]!.output, { kind: "parts", size: 256, key: "black" });
  assert.deepEqual(robloxJobs(request({ mode: "props", prompt: "crate; lantern" }), null)[0]!.output, { kind: "white-parts" });
  assert.throws(() => robloxJobs(request({ mode: "passes", prompt: "" }), null), /List the passes/);
  assert.throws(() => robloxJobs(request({ mode: "badges", prompt: "a;b;c;d;e;f;g" }), null), /At most 6 badges/);
  assert.throws(() => robloxJobs(request({ mode: "texture", prompt: " " }), null), /Describe the texture/);
});

test("the game's look goes into every prompt, references numbered first", () => {
  const game = style({ section: "roblox", theme: "vampires vs humans", tags: ["simulator"], notes: "purple night" });
  const [job] = robloxJobs(request({ mode: "icon", refCount: 2, designCount: 1 }), game);
  assert.match(job!.prompt, /Game \(context for the look, not text to write\): a Roblox game\. vampires vs humans\./);
  assert.match(job!.prompt, /Art style: bright glossy Roblox simulator style/);
  assert.match(job!.prompt, /Also: purple night/);
  assert.match(job!.prompt, /Images 1 and 2 show this game's approved art/);
  assert.match(job!.prompt, /Image 3 is an extra reference from the user/);
});

test("a game's GUI or Characters project inherits the game's theme, style and art", () => {
  const game = style({
    id: "g1",
    section: "roblox",
    theme: "vampires vs humans",
    tags: ["horror"],
    refs: [{ id: "r9", filename: "key.png", mimeType: "image/png", role: "concept" }],
  });
  const gui = style({ id: "u1", gameId: "g1", refs: [{ id: "r1", filename: "ui.png", mimeType: "image/png", role: "concept" }] });
  const merged = mergeGameStyle(gui, game);
  assert.equal(merged.style.theme, "vampires vs humans");
  assert.match(merged.style.notes, /Game art style: dark horror/);
  assert.deepEqual(merged.style.refs.map((ref) => [ref.id, ref.role]), [["r1", "concept"], ["r9", "art"]]);
  assert.deepEqual(merged.owners, ["u1", "g1"]);
  // Its own theme wins.
  assert.equal(mergeGameStyle(style({ theme: "own" }), game).style.theme, "own");
  assert.deepEqual(mergeGameStyle(gui, null).owners, ["u1"]);
});

test("migration: one game per folder, scratch folders get their own, links set", () => {
  let n = 0;
  const styles = [
    style({ id: "gui1", section: "gui", origin: "/p/Zombie Colony", theme: "RTS colony", updatedAt: "2026-10-05T00:00:00.000Z" }),
    style({ id: "chr1", section: "characters", origin: "/p/Zombie Colony", theme: "steampunk" }),
    style({ id: "chr2", section: "characters", origin: "/p/Zombie Colony/.bb/chats/thr_x/tmp/arthas", name: "Arthas test" }),
    style({ id: "done", section: "gui", gameId: "old" }),
  ];
  const plan = planGameMigration(styles, "2026-10-23T00:00:00.000Z", () => `g${++n}`);
  assert.deepEqual(
    plan.games.map((game) => [game.id, game.name, game.theme, game.origin]),
    [
      ["g1", "Zombie Colony", "RTS colony", "/p/Zombie Colony"],
      ["g2", "Arthas test", "", "/p/Zombie Colony/.bb/chats/thr_x/tmp/arthas"],
    ],
  );
  assert.deepEqual(plan.links, { gui1: "g1", chr1: "g1", chr2: "g2" });
  assert.equal(plan.games[0]!.updatedAt, "2026-10-05T00:00:00.000Z");
  assert.ok(plan.games.every((game) => game.section === "roblox"));
});

test("resize hits exact sizes and keeps flat colour", () => {
  const out = resize(solid(37, 23, [200, 40, 10, 255]), 512, 300);
  assert.equal(out.width, 512);
  assert.equal(out.height, 300);
  assert.deepEqual(px(out, 100, 100), [200, 40, 10, 255]);
  const down = resize(solid(2108, 1186, [5, 6, 7, 255]), 1920, 1080);
  assert.deepEqual([down.width, down.height], [1920, 1080]);
  assert.deepEqual(px(down, 1919, 1079), [5, 6, 7, 255]);
  assert.deepEqual([cover(solid(400, 100, [1, 1, 1, 255]), 512, 512).width, cover(solid(400, 100, [1, 1, 1, 255]), 512, 512).height], [512, 512]);
});

test("transparent parts are trimmed and centred on a square", () => {
  const image = solid(100, 60, [0, 0, 0, 0]);
  for (let y = 10; y < 30; y++) for (let x = 40; x < 80; x++) image.data.set([255, 0, 0, 255], (y * 100 + x) * 4);
  assert.deepEqual([trimAlpha(image).width, trimAlpha(image).height], [40, 20]);
  const square = fitSquare(image, 256);
  assert.deepEqual([square.width, square.height], [256, 256]);
  assert.equal(px(square, 0, 0)[3], 0);
  assert.deepEqual(px(square, 128, 128), [255, 0, 0, 255]);
});

test("seamless textures wrap: the new edges continue each other, nothing repeats", () => {
  const image = solid(100, 100, [0, 0, 0, 255]);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) image.data.set([x * 2, y * 2, 0, 255], (y * 100 + x) * 4);
  const tiled = seamless(image);
  assert.deepEqual([tiled.width, tiled.height], [92, 92]);
  // The last column is the original's column 91, the first one fades in from column 92: neighbours.
  for (const y of [10, 50, 90]) assert.ok(Math.abs(px(tiled, 0, y)[0]! - px(tiled, 91, y)[0]!) <= 4, `row ${y}`);
  for (const x of [10, 50, 90]) assert.ok(Math.abs(px(tiled, x, 0)[1]! - px(tiled, x, 91)[1]!) <= 4, `column ${x}`);
  // Away from the band the picture is untouched.
  assert.deepEqual(px(tiled, 50, 50), px(image, 50, 50));
  assert.equal(seamless(image, "x").height, 100);
});

test("a flat texture has a flat normal map", () => {
  assert.deepEqual(px(normalMap(solid(16, 16, [90, 90, 90, 255])), 5, 5), [128, 128, 255, 255]);
});

test("skybox: six square faces; sides fade into Up and Dn so every edge matches", () => {
  const strip = solid(400, 100, [0, 0, 0, 255]);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 400; x++) strip.data.set(y < 50 ? [40, 80, 200, 255] : [30, 120, 30, 255], (y * 400 + x) * 4);
  const faces = skyboxFaces(strip, 64);
  assert.deepEqual(Object.keys(faces).sort(), ["SkyboxBk", "SkyboxDn", "SkyboxFt", "SkyboxLf", "SkyboxRt", "SkyboxUp"]);
  for (const face of Object.values(faces)) assert.deepEqual([face.width, face.height], [64, 64]);
  assert.deepEqual(px(faces.SkyboxFt, 10, 0), px(faces.SkyboxUp, 0, 0));
  assert.deepEqual(px(faces.SkyboxBk, 10, 63), px(faces.SkyboxDn, 0, 0));
  assert.deepEqual(px(faces.SkyboxUp, 30, 30), [40, 80, 200, 255]);
});

test("glow on black becomes colour with alpha", () => {
  const image = solid(2, 1, [0, 0, 0, 255]);
  image.data.set([255, 128, 0, 255], 4);
  const out = glowToAlpha(image);
  assert.equal(px(out, 0, 0)[3], 0);
  assert.deepEqual(px(out, 1, 0), [255, 128, 0, 255]);
});

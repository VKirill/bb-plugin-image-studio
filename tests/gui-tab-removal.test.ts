import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("src/web.ts is browser-safe: no image-io and no node: imports; faviconSet lives in src/web-favicon.ts", () => {
  const web = read("src/web.ts");
  assert.doesNotMatch(web, /image-io/);
  assert.doesNotMatch(web, /from "node:/);
  const favicon = read("src/web-favicon.ts");
  assert.match(favicon, /export async function faviconSet/);
  assert.match(favicon, /export type FaviconFile/);
  // the browser bundle must not reach the raster/ICO code through web.ts either
  assert.doesNotMatch(web, /from "\.\/raster/);
});

test("the panel top bar has no GUI tab and the web tab comes right after roblox", () => {
  const app = read("app.tsx");
  const nav = /const navItems[^=]*= \[([\s\S]*?)\];/.exec(app);
  assert.ok(nav, "navItems not found");
  const ids = [...nav![1]!.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["gallery", "roblox", "web", "characters", "model", "people", "settings"]);
  assert.equal(ids.includes("gui"), false);
  assert.equal(ids.indexOf("web"), ids.indexOf("roblox") + 1);
  // the Tab union no longer names "gui", so no branch can render the standalone panel
  const union = /type Tab = ([^;]+);/.exec(app);
  assert.ok(union);
  assert.equal(union![1]!.split("|").map((part) => part.trim()).includes('"gui"'), false);
  assert.doesNotMatch(app, /tab === "gui"/);
});

test("the Roblox game's GUI category view is still rendered from the Roblox tab", () => {
  const app = read("app.tsx");
  // the branch that renders GuiPanel still opens for the roblox tab
  assert.match(app, /tab === "roblox"[^?]*\? \(/);
  assert.match(app, /<GuiPanel[\s\S]{0,400}section=\{tab\}/);
  const panel = read("gui-panel.tsx");
  // a game's "gui" category tab still exists and still mounts the linked GUI project's panel
  assert.match(panel, /gui: "robloxCatGui"/);
  assert.match(panel, /category === "gui"/);
  assert.match(panel, /section=\{category as "gui" \| "characters"\}/);
});

test("server.ts keeps image_studio_gui and the gui CLI, and their descriptions route site interfaces to image_studio_web", () => {
  const server = read("server.ts");
  assert.match(server, /name: "image_studio_gui"/);
  const guiTool = server.indexOf('name: "image_studio_gui"');
  assert.match(server.slice(guiTool, guiTool + 8000), /image_studio_web/);
  // the CLI command is still registered under "gui"
  assert.match(server, /name: "gui",\s*\n\s*summary:/);
  assert.match(server, /case "gui":\s*\n\s*return runGuiCommand\(argv, ctx, reply\)/);
  const guiCli = /name: "gui",\s*\n\s*summary: "([^"]+)"/.exec(server);
  assert.ok(guiCli);
  assert.match(guiCli![1]!, /image_studio_web/);
});

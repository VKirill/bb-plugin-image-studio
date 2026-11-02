import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { WEB_CATEGORIES, WEB_MODES } from "../src/web.ts";

const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../web-panel.tsx", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../i18n.ts", import.meta.url), "utf8");
/** The en object is everything before `const ru`; the ru object follows it. */
const splitAt = i18n.indexOf("const ru");
assert.ok(splitAt > 0, "i18n.ts declares the ru locale");
const en = i18n.slice(0, splitAt);
const ru = i18n.slice(splitAt);

/** "og" → "Og": how the panel turns a mode or group id into its i18n key. */
const cap = (id: string): string => id[0]!.toUpperCase() + id.slice(1);

/** The key `name: "…"` is declared with a non-empty value in both locale blocks. */
const declared = (name: string) => {
  for (const [block, locale] of [[en, "en"], [ru, "ru"]] as const) {
    assert.match(
      block,
      new RegExp(`^\\s*${name}: "[^"]+"`, "m"),
      `${name} exists with a non-empty ${locale} string in i18n.ts`,
    );
  }
};

test("every web mode has an en and a ru label and hint in i18n.ts", () => {
  for (const mode of WEB_MODES) {
    declared(`webMode${cap(mode)}`);
    declared(`webHint${cap(mode)}`);
  }
});

test("every web category has an en and a ru label and hint in i18n.ts", () => {
  for (const category of WEB_CATEGORIES) {
    declared(`webCat${cap(category)}`);
    declared(`webCatHint${cap(category)}`);
  }
});

test("web-panel.tsx wires every web mode with its label and hint", () => {
  for (const mode of WEB_MODES) {
    assert.match(panel, new RegExp(`webMode${cap(mode)}`), `panel shows a label for ${mode}`);
    assert.match(panel, new RegExp(`webHint${cap(mode)}`), `panel shows a hint for ${mode}`);
  }
  for (const category of WEB_CATEGORIES) {
    assert.match(panel, new RegExp(`webCat${cap(category)}`), `panel shows a label for ${category}`);
    assert.match(panel, new RegExp(`webCatHint${cap(category)}`), `panel shows a hint for ${category}`);
  }
});

test("app.tsx registers the web tab right after the Roblox tab", () => {
  assert.match(app, /type Tab = [^;]*"web"/);
  const roblox = app.indexOf('{ id: "roblox"');
  const web = app.indexOf('{ id: "web"');
  assert.ok(roblox >= 0, "the Roblox tab stays in the nav");
  assert.ok(web > roblox, `the web tab comes after Roblox (${web} > ${roblox})`);
  assert.match(app, /tab === "web" \?/);
  assert.match(app, /<WebPanel/);
});

test("web-panel.tsx generates through gui_generate with section web", () => {
  assert.match(panel, /gui_generate\(\{[^}]*section: "web"/);
});

test("web-panel.tsx renders the site's project settings: theme, preset chips, palette, references", () => {
  assert.match(panel, /draft\.theme/, "theme is bound to the site's draft");
  assert.match(panel, /WEB_PRESET_IDS/, "style preset chips come from WEB_PRESET_IDS");
  assert.match(panel, /PALETTE_KEYS/, "the palette is editable");
  assert.match(panel, /add_gui_ref\(/, "references can be added");
  assert.match(panel, /remove_gui_ref\(/, "references can be removed");
  assert.match(panel, /gui_ref_preview\(/, "references get previews");
  assert.match(panel, /save_gui_style\(\{[^}]*section: "web"/, "the settings are saved onto the web project");
});

test("web-panel.tsx lists the site's jobs in a gallery", () => {
  assert.match(panel, /api\.gui_generations\(\{ styleId \}\)/);
  assert.match(panel, /onOpen\(ordered, index, thumbs\)/);
});

test("package.json is version 0.10.3", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(pkg.version, "0.10.3");
});

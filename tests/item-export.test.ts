import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addEntry,
  buildItemExportJson,
  createItem,
  itemExportJsonSchema,
  requireSelectedTextureEntry,
} from "../src/item.ts";
import { DEFAULT_MODEL_FBX_SCALE, modelFbxScale, parseGuiStyles, type GuiStyle } from "../src/gui.ts";

const modelStyle = (patch: Partial<GuiStyle> = {}): GuiStyle =>
  parseGuiStyles([
    {
      id: "m1",
      projectId: "p",
      origin: "",
      section: "model",
      gameId: "",
      name: "lava-arena",
      theme: "",
      tags: [],
      palette: { background: "", button: "", outline: "", highlight: "", text: "" },
      notes: "",
      refs: [],
      createdAt: "t",
      updatedAt: "t",
      ...patch,
    },
  ])[0]!;

test("modelFbxScale defaults to 0.01 and respects project override", () => {
  assert.equal(modelFbxScale(modelStyle()), DEFAULT_MODEL_FBX_SCALE);
  assert.equal(modelFbxScale(modelStyle({ fbxScale: 1 })), 1);
  assert.equal(modelFbxScale(modelStyle({ section: "gui", fbxScale: 0.01 })), 1);
});

test("buildItemExportJson shape and Roblox mapping", () => {
  const doc = buildItemExportJson({
    itemId: "plunger-scepter",
    fbxScale: 0.01,
    uvLayer: "ImageStudioUV",
    files: {
      fbx: "items/plunger-scepter/export/plunger-scepter.fbx",
      blend: "items/plunger-scepter/export/plunger-scepter.blend",
      color: "items/plunger-scepter/export/plunger-scepter_color.png",
      normal: "items/plunger-scepter/export/plunger-scepter_normal.png",
      roughness: "items/plunger-scepter/export/plunger-scepter_roughness.png",
    },
  });
  const parsed = itemExportJsonSchema.parse(doc);
  assert.equal(parsed.roblox.meshPart, parsed.files.fbx);
  assert.equal(parsed.roblox.surfaceAppearance.ColorMap, parsed.files.color);
  assert.equal(parsed.roblox.surfaceAppearance.NormalMap, parsed.files.normal);
  assert.equal(parsed.roblox.surfaceAppearance.RoughnessMap, parsed.files.roughness);
  assert.match(parsed.notes.join(" "), /source model UV/i);
});

test("requireSelectedTextureEntry errors when texture step has no selection", () => {
  const item = createItem({ id: "x", project: "p", now: "t" });
  assert.throws(() => requireSelectedTextureEntry(item), /no selected texture entry on step texture/);
  const withEntry = addEntry(
    item,
    "texture",
    { id: "t1", source: "attached", createdAt: "t", files: { color: "a/take/color.png" } },
    { select: false },
  );
  assert.throws(() => requireSelectedTextureEntry(withEntry), /no selected texture entry/);
  const selected = addEntry(withEntry, "texture", {
    id: "t2",
    source: "attached",
    createdAt: "t",
    files: { color: "a/take-2/color.png" },
  });
  const picked = { ...selected, steps: { ...selected.steps, texture: { ...selected.steps.texture, selected: "t2", selectedBy: "cli", status: "done" } } };
  assert.equal(requireSelectedTextureEntry(picked).id, "t2");
});

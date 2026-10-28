import assert from "node:assert/strict";
import { test } from "node:test";
import { addEntry, createItem, parseItemCli, resolveTextureUvInputsFromItem } from "../src/item.ts";
import { parseModelGenerateCli } from "../src/model.ts";

test("parseItemCli parses create|list|show|attach|select", () => {
  assert.deepEqual(parseItemCli(["model", "item", "create", "--item", "plunger"]), {
    action: "create",
    item: "plunger",
    name: undefined,
  });
  assert.deepEqual(parseItemCli(["model", "item", "list"]), { action: "list" });
  assert.deepEqual(parseItemCli(["model", "item", "show", "--item", "a", "--json"]), {
    action: "show",
    item: "a",
    json: true,
  });
  assert.deepEqual(
    parseItemCli(["model", "item", "attach", "--item", "a", "--step", "model", "--file", "m.fbx", "--select"]),
    { action: "attach", item: "a", step: "model", file: "m.fbx", image: undefined, run: undefined, select: true },
  );
  assert.deepEqual(parseItemCli(["model", "item", "select", "--item", "a", "--step", "texture", "--entry", "e1"]), {
    action: "select",
    item: "a",
    step: "texture",
    entry: "e1",
  });
  assert.deepEqual(parseItemCli(["model", "item", "detach", "--item", "a", "--step", "texture", "--entry", "e1"]), {
    action: "detach",
    item: "a",
    step: "texture",
    entry: "e1",
  });
});

test("parseModelGenerateCli accepts texture-uv with --item and no --file", () => {
  const parsed = parseModelGenerateCli([
    "model",
    "generate",
    "--mode",
    "texture-uv",
    "--item",
    "plunger-scepter",
    "--prompt",
    "charred rags",
  ]);
  assert.equal(parsed.mode, "texture-uv");
  if (parsed.mode !== "texture-uv") return;
  assert.equal(parsed.itemId, "plunger-scepter");
  assert.equal(parsed.modelPath, undefined);
});

test("resolveTextureUvInputsFromItem uses selected model and concept", () => {
  let item = createItem({ id: "plunger", project: "lava", now: "2026-01-01T00:00:00.000Z" });
  item = addEntry(
    item,
    "concept",
    { id: "c1", source: "attached", createdAt: "t", files: { concept: "assets/concept.png" } },
    { select: true, selectedBy: "cli" },
  );
  item = addEntry(
    item,
    "model",
    { id: "m1", source: "attached", createdAt: "t", files: { model: "assets/3d/item.fbx" } },
    { select: true, selectedBy: "cli" },
  );
  const resolved = resolveTextureUvInputsFromItem(item, {});
  assert.equal(resolved.modelPath, "assets/3d/item.fbx");
  assert.equal(resolved.conceptImage, "assets/concept.png");
});

test("resolveTextureUvInputsFromItem errors naming missing model step", () => {
  const item = createItem({ id: "plunger", project: "lava", now: "2026-01-01T00:00:00.000Z" });
  assert.throws(
    () => resolveTextureUvInputsFromItem(item, {}),
    /no selected model on step model/,
  );
});

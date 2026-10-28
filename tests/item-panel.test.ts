import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  ITEM_STEPS,
  createItem,
  addEntry,
  selectEntry,
  itemIndexFromItem,
  type Item,
} from "../src/item.ts";
import {
  buildStepStrip,
  stepStatusMark,
  type ItemIndexRowWithThumbs,
} from "../src/item-server.ts";

test("model_items index shape with step statuses", () => {
  let item = createItem({ id: "plunger-scepter", project: "lava-arena", now: "2026-10-28T12:00:00.000Z" });
  item = addEntry(item, "concept", {
    id: "c1",
    source: "attached",
    createdAt: "2026-10-28T12:00:00.000Z",
    files: { concept: "assets/concept.png" },
  }, { select: true, selectedBy: "cli" });

  const row = itemIndexFromItem(item);
  assert.equal(row.id, "plunger-scepter");
  assert.equal(row.steps.concept, "done");
  assert.equal(row.steps.blueprint, "empty");
  assert.equal(row.thumbnails.concept, "assets/concept.png");

  const rowWithThumbs: ItemIndexRowWithThumbs = {
    ...row,
    thumbs: {
      concept: { mimeType: "image/webp", base64: "dGVzdA==" },
    },
  };
  assert.equal(rowWithThumbs.thumbs.concept.mimeType, "image/webp");
  assert.equal(rowWithThumbs.thumbs.concept.base64, "dGVzdA==");
});

test("model_item_select records selectedBy 'user'", () => {
  let item = createItem({ id: "sword", project: "rpg", now: "2026-10-28T12:00:00.000Z" });
  item = addEntry(item, "texture", {
    id: "t1",
    source: "generated",
    createdAt: "2026-10-28T12:01:00.000Z",
    files: { color: "color1.png" },
  });
  item = addEntry(item, "texture", {
    id: "t2",
    source: "generated",
    createdAt: "2026-10-28T12:02:00.000Z",
    files: { color: "color2.png" },
  });

  assert.equal(item.steps.texture.selected, null);
  assert.equal(item.steps.texture.selectedBy, null);

  const selected = selectEntry(item, "texture", "t2", "user");
  assert.equal(selected.steps.texture.selected, "t2");
  assert.equal(selected.steps.texture.selectedBy, "user");
  assert.equal(selected.steps.texture.status, "done");
});

test("the step-strip view model orders the 7 steps and marks statuses", () => {
  assert.deepEqual(ITEM_STEPS, [
    "concept",
    "blueprint",
    "model",
    "uv-guide",
    "texture",
    "preview",
    "export",
  ]);

  const stepsState = {
    concept: "done" as const,
    blueprint: "running" as const,
    model: "empty" as const,
    "uv-guide": "empty" as const,
    texture: "empty" as const,
    preview: "empty" as const,
    export: "empty" as const,
  };

  const strip = buildStepStrip(stepsState, {
    concept: { mimeType: "image/webp", base64: "abc" },
  });

  assert.equal(strip.length, 7);
  assert.deepEqual(
    strip.map((s) => s.step),
    ["concept", "blueprint", "model", "uv-guide", "texture", "preview", "export"],
  );
  assert.deepEqual(
    strip.map((s) => s.mark),
    ["✓", "…", "—", "—", "—", "—", "—"],
  );
  assert.deepEqual(
    strip.map((s) => s.status),
    ["done", "running", "empty", "empty", "empty", "empty", "empty"],
  );
  assert.equal(strip[0]?.thumb?.base64, "abc");
  assert.equal(strip[1]?.thumb, undefined);
  assert.equal(stepStatusMark("done"), "✓");
  assert.equal(stepStatusMark("running"), "…");
  assert.equal(stepStatusMark("empty"), "—");
});

test("server exposes model_items, model_item, and model_item_select RPCs", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /model_items/);
  assert.match(server, /model_item/);
  assert.match(server, /model_item_select/);
});

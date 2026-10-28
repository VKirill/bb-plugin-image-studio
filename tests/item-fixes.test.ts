import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addEntry,
  buildAttachEntriesForTextureUvRun,
  createItem,
  detachEntry,
  itemSummary,
  nextStep,
  recordExportGenerated,
  resolveTakeFolderPaths,
  selectEntry,
} from "../src/item.ts";

const RUN = "image-studio/model/lava-arena/items/plunger-scepter/texture-abc123";

test("attach run root expands to one texture entry per take-N", () => {
  const takes = resolveTakeFolderPaths(RUN, ["take-1", "take-2", "views.json"]);
  assert.deepEqual(takes, [`${RUN}/take-1`, `${RUN}/take-2`]);
  const entries = buildAttachEntriesForTextureUvRun(RUN, "texture", takes);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]!.id, "take-1");
  assert.equal(entries[1]!.id, "take-2");
  assert.equal(entries[0]!.files.color, `${RUN}/take-1/color.png`);
  assert.equal(entries[1]!.files.color, `${RUN}/take-2/color.png`);
  assert.ok(!entries.some((e) => e.id.startsWith("texture-")));
  assert.ok(!entries.some((e) => e.files.color === `${RUN}/color.png`));
});

test("attach run root with no usable takes errors", () => {
  assert.throws(
    () => buildAttachEntriesForTextureUvRun(RUN, "texture", []),
    /No take folders with color\.png/,
  );
});

test("selecting a texture take selects matching preview", () => {
  const takes = resolveTakeFolderPaths(RUN, ["take-1", "take-2"]);
  let item = createItem({ id: "plunger", project: "lava", now: "2026-01-01T00:00:00.000Z" });
  for (const entry of buildAttachEntriesForTextureUvRun(RUN, "texture", takes)) {
    item = addEntry(item, "texture", entry, { select: false });
  }
  item = selectEntry(item, "texture", "take-2", "cli");
  assert.equal(item.steps.texture.selected, "take-2");
  assert.equal(item.steps.preview.selected, "take-2");
  assert.equal(item.steps.preview.status, "done");
});

test("nextStep is complete after texture selection and export, not stuck on preview", () => {
  const takeFolder = `${RUN}/take-1`;
  let item = createItem({ id: "plunger", project: "lava", now: "2026-01-01T00:00:00.000Z" });
  const stub = (step: "concept" | "blueprint" | "model" | "uv-guide", file: string) =>
    addEntry(
      item,
      step,
      { id: step, source: "attached", createdAt: "t", files: { [step]: file } },
      { select: true, selectedBy: "cli" },
    );
  item = stub("concept", "c.png");
  item = stub("blueprint", "b.png");
  item = stub("model", "m.fbx");
  item = stub("uv-guide", "g.png");
  item = addEntry(
    item,
    "texture",
    buildAttachEntriesForTextureUvRun(RUN, "texture", [takeFolder])[0]!,
    { select: false },
  );
  item = selectEntry(item, "texture", "take-1", "cli");
  assert.equal(nextStep(item), "export");
  item = recordExportGenerated(item, "items/plunger/export", {
    fbx: "items/plunger/export/model.fbx",
    color: "items/plunger/export/color.png",
  });
  assert.equal(nextStep(item), null);
  const summary = itemSummary(item);
  assert.doesNotMatch(summary, /Continue with step "preview"/);
  assert.match(summary, /All steps are done/);
});

test("detach removes entry and clears selection", () => {
  let item = createItem({ id: "plunger", project: "lava", now: "2026-01-01T00:00:00.000Z" });
  item = addEntry(
    item,
    "texture",
    { id: "bad-root", source: "attached", createdAt: "t", files: { color: `${RUN}/color.png` } },
    { select: true, selectedBy: "cli" },
  );
  item = detachEntry(item, "texture", "bad-root");
  assert.equal(item.steps.texture.entries.length, 0);
  assert.equal(item.steps.texture.selected, null);
  assert.equal(item.steps.texture.status, "empty");
});

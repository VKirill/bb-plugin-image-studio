import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { GuiStyle } from "../src/gui.ts";
import {
  modelTakeKvKey,
  modelTakeRecordSchema,
  parseModelPartsText,
  parseModelTakeRecords,
  snapshotGuiStyles,
  stylesForAppTab,
} from "../src/model.ts";

const style = (patch: Partial<GuiStyle> = {}): GuiStyle => ({
  id: "s1",
  projectId: "p1",
  origin: "",
  section: "gui",
  gameId: "",
  name: "Test",
  theme: "",
  tags: [],
  palette: { background: "", button: "", outline: "", highlight: "", text: "" },
  notes: "",
  refs: [],
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  ...patch,
});

test("snapshotGuiStyles keeps model projects in the panel list", () => {
  const styles = [style({ section: "model", name: "fire-mop" }), style({ section: "gui", name: "HUD" })];
  const snap = snapshotGuiStyles(styles);
  assert.equal(snap.length, 2);
  assert.ok(snap.some((item) => item.section === "model"));
});

test("stylesForAppTab hides model projects from GUI, Characters and Roblox tabs", () => {
  const styles = [
    style({ id: "m1", section: "model" }),
    style({ id: "g1", section: "gui" }),
    style({ id: "c1", section: "characters" }),
    style({ id: "r1", section: "roblox" }),
  ];
  assert.deepEqual(stylesForAppTab(styles, "gui").map((item) => item.id), ["g1"]);
  assert.deepEqual(stylesForAppTab(styles, "characters").map((item) => item.id), ["c1"]);
  assert.deepEqual(stylesForAppTab(styles, "roblox").map((item) => item.id), ["r1"]);
  assert.deepEqual(stylesForAppTab(styles, "model").map((item) => item.id), ["m1"]);
});

test("model take KV key is stable per project", () => {
  assert.equal(modelTakeKvKey("abc123"), "model-take:abc123");
});

test("parseModelTakeRecords drops invalid rows", () => {
  const valid = {
    id: "t1",
    mode: "texture-uv",
    createdAt: "2026-10-27T12:00:00.000Z",
    prompt: "scorch the rags",
    folder: "image-studio/model/fire/take-1",
    files: { guide: "image-studio/model/fire/guide.png" },
    warnings: [],
  };
  assert.equal(parseModelTakeRecords([valid, { mode: "nope" }]).length, 1);
  assert.equal(modelTakeRecordSchema.safeParse(valid).success, true);
});

test("parseModelPartsText reads material overrides", () => {
  const rows = parseModelPartsText("fire-mop_baked = scorched rag\nwood = handle");
  assert.deepEqual(rows, [
    { material: "fire-mop_baked", part: "scorched rag" },
    { material: "wood", part: "handle" },
  ]);
});

test("server snapshot includes model projects and exposes model_takes RPC", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(server, /guiStyles\.filter\(\(style\) => style\.section !== "model"\)/);
  assert.match(server, /model_takes/);
  assert.match(server, /model_generate/);
});

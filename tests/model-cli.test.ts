import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseModelGenerateCli } from "../src/model.ts";

test("parseModelGenerateCli reads texture-uv flags", () => {
  const argv = [
    "model",
    "generate",
    "--mode",
    "texture-uv",
    "--project",
    "fire-mop",
    "--file",
    "assets/3d/fire-mop.fbx",
    "--object",
    "model",
    "--size",
    "2048",
    "--variants",
    "2",
    "--image",
    "concept.png",
    "--image",
    "style.png",
    "--subject",
    "fire mop",
    "--concept-note",
    "layered rags",
    "--project-concept",
    "true",
    "--concept-view",
    "front",
    "--parts",
    "fire-mop_baked=rag head; wood=handle",
    "--prompt",
    "charred rag ends",
    "--json",
  ];
  const parsed = parseModelGenerateCli(argv);
  assert.equal(parsed.mode, "texture-uv");
  if (parsed.mode !== "texture-uv") return;
  assert.equal(parsed.projectStyleId, "fire-mop");
  assert.equal(parsed.modelPath, "assets/3d/fire-mop.fbx");
  assert.equal(parsed.object, "model");
  assert.equal(parsed.size, 2048);
  assert.equal(parsed.variants, 2);
  assert.deepEqual(parsed.images, ["concept.png", "style.png"]);
  assert.equal(parsed.subject, "fire mop");
  assert.equal(parsed.conceptNote, "layered rags");
  assert.equal(parsed.projectConcept, true);
  assert.equal(parsed.conceptView, "front");
  assert.deepEqual(parsed.parts, [
    { material: "fire-mop_baked", part: "rag head" },
    { material: "wood", part: "handle" },
  ]);
  assert.equal(parsed.prompt, "charred rag ends");
});

test("parseModelGenerateCli uses --sheet-style for blueprint, not --style as clay style", () => {
  const argv = [
    "model",
    "generate",
    "--mode",
    "blueprint",
    "--style",
    "my-model-project",
    "--sheet-style",
    "clean-line",
    "--image",
    "concept.png",
    "--views",
    "front,side,back",
    "--soft",
    "rags; rope",
    "--rigid",
    "handle",
    "--subject",
    "fire mop",
    "--prompt",
    "ignored",
  ];
  const parsed = parseModelGenerateCli(argv);
  assert.equal(parsed.mode, "blueprint");
  if (parsed.mode !== "blueprint") return;
  assert.equal(parsed.projectStyleId, "my-model-project");
  assert.equal(parsed.sheetStyle, "clean-line");
  assert.deepEqual(parsed.views, ["front", "side", "back"]);
  assert.deepEqual(parsed.soft, ["rags", "rope"]);
  assert.deepEqual(parsed.rigid, ["handle"]);
  assert.equal(parsed.subject, "fire mop");
});

test("parseModelGenerateCli keeps --style as project when --project is absent", () => {
  const parsed = parseModelGenerateCli([
    "model",
    "generate",
    "--mode",
    "texture-uv",
    "--style",
    "props",
    "--file",
    "m.fbx",
    "--prompt",
    "paint",
  ]);
  assert.equal(parsed.mode, "texture-uv");
  if (parsed.mode !== "texture-uv") return;
  assert.equal(parsed.projectStyleId, "props");
});

test("readHostBytes resolves paths with hostPath before bb.sdk.files.read", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /const absolute = hostPath\(cwd, path\)/);
  assert.doesNotMatch(server, /readHostBytes[\s\S]*?rootPath:\s*cwd/);
});

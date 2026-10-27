import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTextureUvPrompt } from "../src/model.ts";

test("buildTextureUvPrompt keeps user task separate from game look line", () => {
  const userPrompt = "hand-painted weathered granite with moss in the cracks";
  const prompt = buildTextureUvPrompt({
    subject: "rock stack",
    parts: [{ color: "#b4b4b4", part: "stone", marker: true }],
    projected: false,
    hasConcept: false,
    hasStyle: false,
    task: userPrompt,
    theme: "glossy toy-like plastic and rubber look",
    artStyle: "hand-painted game materials",
  });
  assert.match(prompt, new RegExp(`Task: repaint image 1 as a final hand-painted game texture: ${userPrompt}\\.`));
  assert.doesNotMatch(prompt, /Task:[^\n]*glossy toy-like/);
  assert.match(prompt, /Game look \(lower priority than the Task and the reference images/);
  assert.match(
    prompt,
    /no coloured light, no cast shadows and no outlines\): glossy toy-like plastic and rubber look; hand-painted game materials/,
  );
});

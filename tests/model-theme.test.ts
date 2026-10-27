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
    theme: "warm volcanic sunset light",
    artStyle: "toon: bold outlines",
  });
  assert.match(prompt, new RegExp(`Task: repaint image 1 as a final hand-painted game texture: ${userPrompt}\\.`));
  assert.doesNotMatch(prompt, /Task:[^\n]*warm volcanic/);
  assert.match(prompt, /Game look \(materials and palette only/);
  assert.match(prompt, /no coloured light, no cast shadows and no outlines\): warm volcanic sunset light; toon: bold outlines/);
});

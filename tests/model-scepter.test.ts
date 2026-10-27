import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildTextureUvPrompt,
  sanitizeGameLook,
  textureUvHueDistance,
  textureUvHueFromText,
  textureUvPickMarkerHueDegrees,
} from "../src/model.ts";

test("sanitizeGameLook drops outline and lighting clauses, keeps materials", () => {
  const raw =
    "toon cartoon: bold outlines, flat colours, two-tone shading; glossy toy-like plastic and rubber look; warm volcanic sunset light";
  const cleaned = sanitizeGameLook(raw);
  assert.doesNotMatch(cleaned, /outlines/i);
  assert.doesNotMatch(cleaned, /two-tone shading/i);
  assert.doesNotMatch(cleaned, /sunset light/i);
  assert.match(cleaned, /glossy toy-like plastic and rubber look/);
});

test("buildTextureUvPrompt uses sanitized game look and marker paint phrasing", () => {
  const prompt = buildTextureUvPrompt({
    subject: "plunger scepter",
    parts: [
      { color: "#ffad1f", part: "gold crown", kind: "base", marker: false },
      { color: "#e619e6", part: "accent", kind: "marker", marker: true },
    ],
    projected: false,
    hasConcept: false,
    hasStyle: false,
    task: "hand-painted toy",
    theme: "toon cartoon: bold outlines; glossy toy-like plastic and rubber look",
    artStyle: "warm volcanic sunset light",
  });
  assert.match(prompt, /glossy toy-like plastic and rubber look/);
  assert.doesNotMatch(prompt, /bold outlines/);
  assert.doesNotMatch(prompt, /sunset light/);
  assert.match(prompt, /#e619e6 marks part "accent" \(paint it as accent\)/);
  assert.match(prompt, /#ffad1f = gold crown \(its real colour\)/);
  assert.doesNotMatch(prompt, /the base colors/);
});

test("marker hue picker stays at least 60° from named material hues", () => {
  const reserved = [
    textureUvHueFromText("PL_gold")!,
    textureUvHueFromText("PL_gem")!,
    textureUvHueFromText("PL_rubber")!,
    textureUvHueFromText("PL_wood")!,
  ];
  assert.equal(reserved[0], 45);
  assert.equal(reserved[1], 280);
  const markerHue = textureUvPickMarkerHueDegrees(0, reserved);
  for (const rh of reserved) {
    assert.ok(textureUvHueDistance(markerHue, rh) >= 60, `marker hue ${markerHue} too close to ${rh}`);
  }
});

test("scepter fixture parts.json from prepare keeps base colours (smoke)", async () => {
  const partsPath = process.env.SCEPTER_PARTS_JSON;
  if (!partsPath) return;
  const data = JSON.parse(readFileSync(partsPath, "utf8")) as {
    parts: Array<{ material: string; color: string; kind: string; marker: boolean }>;
  };
  const byMat = new Map(data.parts.map((p) => [p.material, p]));
  for (const name of ["PL_gold", "PL_gem", "PL_rubber", "PL_wood"]) {
    const row = byMat.get(name);
    assert.ok(row, name);
    assert.equal(row.kind, "base");
    assert.equal(row.marker, false);
    assert.notEqual(row.color, "textured");
  }
});

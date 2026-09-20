import assert from "node:assert/strict";
import { test } from "node:test";
import { composePrompt, profileSubjectLine } from "../src/prompt.ts";

test("profile line includes bust only for women", () => {
  const woman = profileSubjectLine({
    name: "Vika",
    gender: "female",
    age: 28,
    heightCm: 168,
    weightKg: 58,
    bodyType: "slim",
    bust: "C",
    photoCount: 2,
  });
  assert.match(woman, /Vika/);
  assert.match(woman, /bust C/);
  const man = profileSubjectLine({
    name: "Kirill",
    gender: "male",
    age: 36,
    heightCm: 182,
    weightKg: 80,
    bodyType: "athletic",
    bust: "should-not-appear",
    photoCount: 1,
  });
  assert.doesNotMatch(man, /bust/);
});

test("banana injects Google clause order", () => {
  const prompt = composePrompt({
    userPrompt: "Subject: a ceramic mug.\nComposition: close-up, 50mm.",
    model: "nano-banana-2",
  });
  assert.match(prompt, /Subject, Composition, Action, Location, Style/);
  assert.match(prompt, /double quotes/);
  assert.match(prompt, /ceramic mug/);
});

test("muse prompt asks to change only what was requested", () => {
  const prompt = composePrompt({
    userPrompt: "office portrait in a navy suit",
    model: "muse-image",
    profile: {
      name: "Kirill",
      gender: "male",
      age: 36,
      heightCm: 182,
      weightKg: 80,
      bodyType: "athletic",
      photoCount: 1,
    },
  });
  assert.match(prompt, /same face/);
  assert.match(prompt, /change only what the user asked/);
  assert.match(prompt, /navy suit/);
});

test("manicure reference is mentioned when the profile has one", () => {
  const prompt = composePrompt({
    userPrompt: "holding a coffee cup",
    model: "nano-banana-2",
    profile: {
      name: "Vika",
      gender: "female",
      age: 28,
      heightCm: 168,
      weightKg: 58,
      bodyType: "slim",
      photoCount: 2,
      hasManicure: true,
    },
  });
  assert.match(prompt, /Images 1–2/);
  assert.match(prompt, /Image 3 is a close-up of this person's manicure/);
  assert.match(prompt, /every visible finger/);
  assert.match(prompt, /coffee cup/);
});

test("manicure image index follows selfie count", () => {
  const oneSelfie = composePrompt({
    userPrompt: "hands on a table",
    model: "nano-banana-2",
    profile: {
      name: "Vika",
      gender: "female",
      age: 28,
      heightCm: 168,
      weightKg: 58,
      bodyType: "slim",
      photoCount: 1,
      hasManicure: true,
    },
  });
  assert.match(oneSelfie, /Image 1 is selfie/);
  assert.match(oneSelfie, /Image 2 is a close-up of this person's manicure/);
});

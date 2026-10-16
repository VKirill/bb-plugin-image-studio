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

test("banana sends the scene, not agent clause instructions", () => {
  const prompt = composePrompt({
    userPrompt: "Subject: a ceramic mug.\nComposition: close-up, 50mm.",
    model: "nano-banana-2",
  });
  assert.equal(prompt, "Subject: a ceramic mug.\nComposition: close-up, 50mm.");
  assert.doesNotMatch(prompt, /Write the user task/);
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
  assert.match(oneSelfie, /Image 1 is a face reference: front\./);
  assert.match(oneSelfie, /Image 2 is a close-up of this person's manicure/);
});

test("source pictures come first and shift profile image numbers", () => {
  const prompt = composePrompt({
    userPrompt: "Change: put a red scarf on the person.",
    model: "nano-banana-2",
    sourceCount: 1,
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
  assert.match(prompt, /^Image 1 is the source picture to edit\./);
  assert.match(prompt, /Images 2–3 are face references: front, 3\/4 left\. Keep the same face and identity\./);
  assert.match(prompt, /Image 4 is a close-up of this person's manicure/);
});

test("several source pictures without a profile", () => {
  const prompt = composePrompt({ userPrompt: "Compose both.", model: "gpt-image-2.5-flare", sourceCount: 2 });
  assert.equal(prompt, "Images 1–2 are the source pictures to edit.\nCompose both.");
});

const vika = {
  name: "Vika",
  gender: "female" as const,
  age: 28,
  heightCm: 168,
  weightKg: 58,
  bodyType: "hourglass",
  bust: "C (size 3)",
};

test("every attached reference gets its own line with the right Image number", () => {
  const prompt = composePrompt({
    userPrompt: "Standing on a beach.",
    model: "nano-banana-2",
    sourceCount: 2,
    profile: {
      ...vika,
      refs: ["hands", "body-back", "face-34-right", "face-front", "face-34-left", "chest"],
    },
  });
  const lines = prompt.split("\n");
  assert.equal(lines[0], "Images 1–2 are the source pictures to edit.");
  assert.match(lines[1]!, /^Subject identity: Vika is a 28-year-old woman, 168 cm tall, 58 kg, hourglass build, bust C \(size 3\)\.$/);
  assert.equal(
    lines[2],
    "Images 3–5 are face references: front, 3/4 left, 3/4 right. Keep the same face and identity. Do not invent a different person.",
  );
  assert.equal(
    lines[3],
    "Image 6 is a reference of this person's body from behind. Keep the same body proportions, figure and skin tone.",
  );
  assert.match(lines[4]!, /^Image 7 is a close-up of this person's manicure\. When any hand is visible/);
  assert.match(lines[5]!, /^Image 8 is a close-up reference of this person's bust and décolleté\. When the bust or neckline is visible, match it exactly\.$/);
  assert.equal(lines[6], "Standing on a beach.");
});

test("a single face reference and no other slots", () => {
  const prompt = composePrompt({
    userPrompt: "Portrait.",
    model: "nano-banana-2",
    profile: { ...vika, refs: ["face-front"] },
  });
  assert.match(prompt, /^Subject identity:.*\nImage 1 is a face reference: front\. Keep the same face and identity\./);
  assert.doesNotMatch(prompt, /Image 2/);
});

test("profile and smile faces are named in the group line", () => {
  const prompt = composePrompt({
    userPrompt: "Laughing.",
    model: "seedream-5",
    profile: { ...vika, refs: ["face-front", "face-profile", "face-smile"] },
  });
  assert.match(prompt, /Images 1–3 are face references: front, profile, smiling\./);
});

test("male profiles get neutral hands and chest wording", () => {
  const prompt = composePrompt({
    userPrompt: "Holding a mug.",
    model: "seedream-5",
    profile: {
      name: "Kirill",
      gender: "male",
      age: 34,
      heightCm: 190,
      weightKg: 90,
      bodyType: "athletic",
      refs: ["face-front", "hands", "chest"],
    },
  });
  assert.match(prompt, /Image 2 is a close-up of this person's hands\./);
  assert.match(prompt, /Image 3 is a close-up reference of this person's chest\. When the chest is visible, match it exactly\./);
  assert.doesNotMatch(prompt, /manicure|bust/);
});

test("every detail slot says when to match it", () => {
  const prompt = composePrompt({
    userPrompt: "x",
    model: "nano-banana-2",
    profile: { ...vika, refs: ["waist", "legs", "buttocks", "marks", "hair-back"] },
  });
  assert.match(prompt, /Image 1 is a close-up reference of this person's waist and belly\. When the waist or belly is visible, match it exactly\./);
  assert.match(prompt, /Image 2 is a reference of this person's legs\./);
  assert.match(prompt, /Image 3 is a reference of this person's buttocks seen from behind\./);
  assert.match(prompt, /Image 4 is a reference of this person's moles, tattoos and birthmarks\./);
  assert.match(prompt, /Image 5 is a reference of the back of this person's hair\./);
});

test("refs wins over the legacy photoCount and hasManicure fields", () => {
  const prompt = composePrompt({
    userPrompt: "x",
    model: "nano-banana-2",
    profile: { ...vika, photoCount: 3, hasManicure: true, refs: ["face-front"] },
  });
  assert.match(prompt, /Image 1 is a face reference: front/);
  assert.doesNotMatch(prompt, /manicure|Image 2/);
});

test("Qwen gets one short reference line, not a catalogue of reference photos", () => {
  const prompt = composePrompt({
    userPrompt: "A full-body photograph of her standing on a beach.",
    model: "qwen-image-2.1",
    profile: { ...vika, refs: ["face-front", "body-front", "hands"] },
  });
  const lines = prompt.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^Subject identity: Vika is a 28-year-old woman, 168 cm tall, 58 kg, hourglass build, bust C \(size 3\)\.$/);
  assert.equal(lines[1], "The woman in the reference photos (face in Image 1, front body in Image 2, hands in Image 3).");
  assert.equal(lines[2], "A full-body photograph of her standing on a beach.");
  assert.doesNotMatch(prompt, /is a reference of|is a face reference|close-up of this person/);
});

test("Qwen reference line numbers follow the source pictures and group the faces", () => {
  const prompt = composePrompt({
    userPrompt: "Change the dress to red.",
    model: "qwen-image-2.1",
    sourceCount: 1,
    profile: { name: "Kirill", gender: "male", age: 34, heightCm: 190, weightKg: 90, bodyType: "athletic", refs: ["face-front", "face-34-left", "body-back"] },
  });
  assert.match(prompt, /^Image 1 is the source picture to edit\./);
  assert.match(prompt, /The man in the reference photos \(face in Images 2–3, back body in Image 4\)\./);
});

test("Qwen without references adds no reference line; the identity line can leave out numbers", () => {
  const none = composePrompt({ userPrompt: "x", model: "qwen-image-2.1", profile: { ...vika, refs: [] } });
  assert.doesNotMatch(none, /reference photos/);
  const noNumbers = composePrompt({ userPrompt: "x", model: "qwen-image-2.1", profile: { ...vika, refs: ["face-front"], withNumbers: false } });
  assert.match(noNumbers, /^Subject identity: Vika is a 28-year-old woman, hourglass build, bust C \(size 3\)\./);
  assert.doesNotMatch(noNumbers, /\bkg\b|\bcm\b/);
  const other = composePrompt({ userPrompt: "x", model: "nano-banana-2.1", profile: { ...vika, refs: ["face-front", "body-back"] } });
  assert.match(other, /Image 2 is a reference of this person's body from behind/);
});

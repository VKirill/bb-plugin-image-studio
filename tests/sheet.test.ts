import assert from "node:assert/strict";
import { test } from "node:test";
import { MODEL_IDS, type EnabledModels } from "../src/models.ts";
import { selectRefs } from "../src/refs.ts";
import {
  DEFAULT_SHEET_SLOTS,
  SHEET_SLOTS,
  SINGLE_FRAME,
  figureLine,
  isSensitiveSlot,
  isSheetSlot,
  missingSheetSlots,
  sheetModelFor,
  sheetPrompt,
  sheetRefCap,
  sheetRefOrder,
  sheetRouteError,
  sheetWaves,
} from "../src/sheet.ts";
import { SLOT_IDS } from "../src/slots.ts";

function enabled(on: string[]): EnabledModels {
  return Object.fromEntries(MODEL_IDS.map((id) => [id, on.includes(id)])) as EnabledModels;
}

test("marks are never generated; every other slot is", () => {
  assert.equal(isSheetSlot("marks"), false);
  assert.deepEqual(SHEET_SLOTS, SLOT_IDS.filter((id) => id !== "marks"));
  for (const slot of SHEET_SLOTS) {
    assert.ok(sheetPrompt(slot, "female").length > 40, slot);
    assert.ok(sheetPrompt(slot, "male").length > 40, slot);
  }
});

test("prompt templates follow the studio recipe", () => {
  for (const slot of ["face-front", "face-34-left", "face-34-right", "face-profile", "face-smile"] as const) {
    const text = sheetPrompt(slot, "female");
    assert.match(text, /plain light-grey studio backdrop/);
    assert.match(text, /soft even light/);
    assert.match(text, /same face/);
  }
  assert.match(sheetPrompt("face-front", "female"), /neutral relaxed expression/);
  assert.match(sheetPrompt("face-smile", "female"), /smile/);
  for (const slot of ["body-front", "body-side", "body-back"] as const) {
    assert.match(sheetPrompt(slot, "female"), /form-fitting black bodysuit/);
    assert.match(sheetPrompt(slot, "female"), /head to toe/);
  }
  assert.match(sheetPrompt("body-front", "male"), /boxer-brief/);
  assert.match(sheetPrompt("hands", "female"), /Close-up/);
  assert.match(sheetPrompt("chest", "female"), /bust/);
  assert.match(sheetPrompt("chest", "male"), /chest/);
});

test("sensitive slots go to Qwen, the rest to Nano Banana (Pro when on)", () => {
  const proOn = enabled(["nano-banana-2", "nano-banana-pro", "qwen-image-2.1"]);
  const proOff = enabled(["nano-banana-2", "qwen-image-2.1"]);
  for (const slot of ["chest", "buttocks", "body-front", "body-side", "body-back"] as const) {
    assert.equal(isSensitiveSlot(slot), true);
    assert.deepEqual(sheetModelFor(slot, proOn), { ok: true, model: "qwen-image-2.1" });
  }
  for (const slot of ["face-front", "face-profile", "hands", "waist", "legs", "hair-back"] as const) {
    assert.equal(isSensitiveSlot(slot), false);
    assert.deepEqual(sheetModelFor(slot, proOn), { ok: true, model: "nano-banana-pro" });
    assert.deepEqual(sheetModelFor(slot, proOff), { ok: true, model: "nano-banana-2" });
  }
});

test("nano banana 2.1 beats 2 for sheet slots, Pro still beats both", () => {
  const withBoth = enabled(["nano-banana-2", "nano-banana-2.1", "qwen-image-2.1"]);
  assert.deepEqual(sheetModelFor("face-front", withBoth), { ok: true, model: "nano-banana-2.1" });
  assert.deepEqual(sheetModelFor("hands", enabled(["nano-banana-2"])), { ok: true, model: "nano-banana-2" });
  assert.deepEqual(
    sheetModelFor("hands", enabled(["nano-banana-2", "nano-banana-2.1", "nano-banana-pro"])),
    { ok: true, model: "nano-banana-pro" },
  );
  assert.deepEqual(sheetModelFor("chest", withBoth), { ok: true, model: "qwen-image-2.1" });
});

test("readable errors when the needed model is off", () => {
  const noQwen = enabled(["nano-banana-2"]);
  const result = sheetModelFor("chest", noQwen);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Qwen Image 2\.1/);
  const noBanana = enabled(["qwen-image-2.1"]);
  const face = sheetModelFor("face-front", noBanana);
  assert.equal(face.ok, false);
  if (!face.ok) assert.match(face.error, /Nano Banana/);
  assert.match(sheetRouteError("chest", "qwen-image-2.1", "kie.ai key is missing."), /Slot chest needs Qwen Image 2\.1 on kie\.ai\. kie\.ai key is missing\./);
});

test("a model override wins for every slot", () => {
  const on = enabled(["nano-banana-2", "qwen-image-2.1", "seedream-5"]);
  assert.deepEqual(sheetModelFor("chest", on, "seedream"), { ok: true, model: "seedream-5" });
  const off = sheetModelFor("chest", on, "grok");
  assert.equal(off.ok, false);
  const unknown = sheetModelFor("chest", on, "nope");
  assert.equal(unknown.ok, false);
});

test("a sheet shot is built from the other faces and, for body and details, the front body shot", () => {
  assert.deepEqual(sheetRefOrder("face-34-left"), ["face-front", "face-34-right", "face-profile", "face-smile"]);
  assert.deepEqual(sheetRefOrder("body-front"), ["face-front", "face-34-left", "face-34-right", "face-profile", "face-smile"]);
  assert.deepEqual(sheetRefOrder("body-back").slice(-1), ["body-front"]);
  assert.ok(!sheetRefOrder("hands").includes("hands"));
  assert.ok(sheetRefOrder("hands").includes("body-front"));
});

test("a bare profile still needs every default sheet slot; the nude slots are never built by default", () => {
  assert.deepEqual(missingSheetSlots([]), DEFAULT_SHEET_SLOTS);
  assert.ok(!DEFAULT_SHEET_SLOTS.includes("chest-nude") && !DEFAULT_SHEET_SLOTS.includes("buttocks-nude"));
  assert.ok(SHEET_SLOTS.includes("chest-nude") && SHEET_SLOTS.includes("buttocks-nude"));
  assert.deepEqual(missingSheetSlots(["face-front", "hands", "marks"]).slice(0, 2), ["face-34-left", "face-34-right"]);
  assert.equal(missingSheetSlots(SLOT_IDS).length, 0);
});

// ---- Qwen sheet composition: few references, one frame, the figure stated ----

const brooke = { bodyType: "curvy", bust: "D (size 4)", heightCm: 170, weightKg: 62, age: 25 };

test("Qwen gets face-front plus at most one or two matching body photos, never every face slot", () => {
  const expected: Record<string, string[]> = {
    "face-front": ["face-34-left"],
    "face-34-left": ["face-front"],
    "face-34-right": ["face-front"],
    "face-profile": ["face-front"],
    "face-smile": ["face-front"],
    "body-front": ["face-front"],
    "body-side": ["face-front", "body-front"],
    "body-back": ["face-front", "body-front"],
    chest: ["face-front", "body-front"],
    waist: ["face-front", "body-front"],
    legs: ["face-front", "body-front"],
    hands: ["face-front", "body-front"],
    "hair-back": ["face-front", "body-front"],
    buttocks: ["face-front", "body-back", "body-front"],
    "chest-nude": ["face-front", "body-front", "chest"],
    "buttocks-nude": ["face-front", "body-back", "buttocks"],
  };
  for (const slot of SHEET_SLOTS) {
    const order = sheetRefOrder(slot, "qwen-image-2.1");
    assert.deepEqual(order, expected[slot], slot);
    assert.ok(order.length <= sheetRefCap("qwen-image-2.1")!, `${slot} stays within the Qwen cap`);
    const faces = order.filter((id) => id.startsWith("face-"));
    assert.ok(faces.length <= 1, `${slot}: one face photo at most`);
  }
  assert.equal(sheetRefCap("qwen-image-2.1"), 3);
  assert.equal(sheetRefCap("nano-banana-2.1"), undefined);
});

test("with the cap, Qwen receives the shot's own body photo before anything else is dropped", () => {
  const filled = ["face-front", "face-34-left", "face-34-right", "face-profile", "face-smile", "body-front", "body-back"] as const;
  const butt = selectRefs({ prompt: "", filled, mode: { kind: "list", slots: sheetRefOrder("buttocks", "qwen-image-2.1") }, budget: sheetRefCap("qwen-image-2.1")! });
  assert.deepEqual(butt.used, ["face-front", "body-front", "body-back"]);
  const side = selectRefs({ prompt: "", filled, mode: { kind: "list", slots: sheetRefOrder("body-side", "qwen-image-2.1") }, budget: 3 });
  assert.deepEqual(side.used, ["face-front", "body-front"]);
  // Only face-front accepted so far: that is all it sends.
  const bare = selectRefs({ prompt: "", filled: ["face-front"], mode: { kind: "list", slots: sheetRefOrder("chest", "qwen-image-2.1") }, budget: 3 });
  assert.deepEqual(bare.used, ["face-front"]);
});

test("other models keep every other face plus the front body shot", () => {
  assert.deepEqual(sheetRefOrder("body-side", "nano-banana-2.1"), sheetRefOrder("body-side"));
  assert.ok(sheetRefOrder("body-side", "nano-banana-2.1").length > 3);
});

test("every sheet prompt asks for one single frame, said positively and briefly", () => {
  for (const slot of SHEET_SLOTS) {
    const female = sheetPrompt(slot, "female", brooke);
    const male = sheetPrompt(slot, "male", brooke);
    assert.ok(female.endsWith("A single full-frame photograph of her alone."), slot);
    assert.ok(male.endsWith("A single full-frame photograph of him alone."), slot);
    // Words that name the failure prime a model with a prompt enhancer: keep them out.
    for (const text of [female, male]) {
      assert.doesNotMatch(text, /collage|grid|contact sheet|reference sheet|inset|duplicate/i, slot);
      assert.doesNotMatch(text, /reference photo\b(?! of)(?!s)/i, slot);
    }
  }
  assert.equal(SINGLE_FRAME, "A single full-frame photograph of her alone.");
});

test("body and detail prompts state the profile's figure in words; face prompts do not", () => {
  assert.equal(
    figureLine("female", brooke),
    "Her figure, shown accurately: curvy hourglass, narrow waist, wide hips build, full D-cup bust, 170 cm tall, 62 kg, 25 years old.",
  );
  for (const slot of ["body-front", "body-side", "body-back", "chest", "waist", "legs", "buttocks"] as const) {
    const text = sheetPrompt(slot, "female", brooke);
    assert.match(text, /curvy hourglass/, slot);
    assert.match(text, /full D-cup bust/, slot);
  }
  for (const slot of ["face-front", "face-smile", "hands", "hair-back"] as const) {
    assert.doesNotMatch(sheetPrompt(slot, "female", brooke), /D-cup/, slot);
  }
  assert.equal(figureLine("female", undefined), "");
  assert.match(figureLine("male", { bodyType: "athletic", bust: "D (size 4)", heightCm: 190 }), /^His figure, shown accurately: athletic and toned build, 190 cm tall\.$/);
  assert.match(sheetPrompt("body-front", "female"), /head to toe/);
});

test("Qwen sheet prompts describe the figure and leave out height, weight and age", () => {
  assert.equal(
    figureLine("female", brooke, { numbers: false }),
    "Her figure, shown accurately: curvy hourglass, narrow waist, wide hips build, full D-cup bust.",
  );
  for (const slot of ["body-front", "body-side", "body-back", "chest", "waist", "legs", "buttocks"] as const) {
    const qwen = sheetPrompt(slot, "female", brooke, "qwen-image-2.1");
    assert.match(qwen, /curvy hourglass, narrow waist, wide hips/, slot);
    assert.match(qwen, /full D-cup bust/, slot);
    assert.doesNotMatch(qwen, /\bkg\b|\bcm\b|years old/, slot);
    assert.ok(qwen.endsWith("A single full-frame photograph of her alone."), slot);
    // Other models keep the numbers.
    assert.match(sheetPrompt(slot, "female", brooke, "nano-banana-2.1"), /170 cm tall, 62 kg/, slot);
  }
});

test("waves: faces, then body, then details, in canonical order inside each", () => {
  assert.deepEqual(
    sheetWaves(["hands", "body-back", "face-smile", "chest", "face-34-left", "body-front"]),
    [
      { name: "face", slots: ["face-34-left", "face-smile"] },
      { name: "body", slots: ["body-front", "body-back"] },
      { name: "details", slots: ["hands", "chest"] },
    ],
  );
  assert.deepEqual(sheetWaves(["legs"]), [{ name: "details", slots: ["legs"] }]);
  assert.deepEqual(sheetWaves([]), []);
});

test("chest is a black lace bra for every model; the nude slots are bare, Qwen by default and Wan as the fallback", () => {
  const chest = sheetPrompt("chest", "female", brooke);
  assert.match(chest, /plain black lace bra/);
  assert.doesNotMatch(chest, /bodysuit/);
  assert.match(sheetPrompt("chest-nude", "female", brooke), /bare bust.*topless/);
  assert.match(sheetPrompt("chest-nude", "male"), /bare chest/);
  assert.match(sheetPrompt("buttocks-nude", "female", brooke), /nude person seen from directly behind.*waist to the upper thighs/);
  for (const slot of ["chest-nude", "buttocks-nude"] as const) {
    assert.equal(isSensitiveSlot(slot), true);
    const on = enabled(["nano-banana-2.1", "nano-banana-pro", "qwen-image-2.1", "muse-image"]);
    assert.deepEqual(sheetModelFor(slot, on), { ok: true, model: "qwen-image-2.1" });
    for (const model of ["nano-banana-2.1", "muse-image", "nb2"]) {
      const forced = sheetModelFor(slot, on, model);
      assert.equal(forced.ok, false, `${slot} on ${model}`);
      if (!forced.ok) assert.match(forced.error, /Qwen Image 2\.1 or Wan 2\.7 only/);
    }
    // Wan is the allowed fallback when named (and enabled).
    assert.deepEqual(sheetModelFor(slot, enabled(["wan-2.7", "qwen-image-2.1"]), "wan"), { ok: true, model: "wan-2.7" });
    assert.equal(sheetModelFor(slot, enabled(["qwen-image-2.1"]), "wan").ok, false, "Wan must be enabled");
    assert.deepEqual(sheetModelFor(slot, on, "qwen"), { ok: true, model: "qwen-image-2.1" });
    assert.equal(sheetModelFor(slot, enabled(["nano-banana-2.1"])).ok, false);
    // Figure stated in words for the nude slots too, no numbers for Qwen.
    const qwen = sheetPrompt(slot, "female", brooke, "qwen-image-2.1");
    assert.match(qwen, /curvy hourglass/);
    assert.doesNotMatch(qwen, /\bkg\b/);
    assert.ok(qwen.endsWith("A single full-frame photograph of her alone."));
    assert.ok(sheetPrompt(slot, "female", brooke).endsWith("A single full-frame photograph of her alone."));
  }
});

test("the nude reference lines are written for Qwen and the Qwen reference line names them", async () => {
  const { composePrompt } = await import("../src/prompt.ts");
  const prompt = composePrompt({
    userPrompt: "x",
    model: "qwen-image-2.1",
    profile: { name: "A", gender: "female", age: 25, heightCm: 170, weightKg: 60, bodyType: "curvy", refs: ["face-front", "chest-nude", "buttocks-nude"] },
  });
  assert.match(prompt, /The woman in the reference photos \(face in Image 1, bare chest in Image 2, bare buttocks in Image 3\)\./);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { MODEL_IDS } from "../src/models.ts";
import { QWEN_GENERATE_CAP, REF_LIMITS, cueSlots, parseRefsOption, refLimit, selectRefs } from "../src/refs.ts";
import { SLOT_IDS, type SlotId } from "../src/slots.ts";

test("every model has a reference cap on both gateways", () => {
  for (const id of MODEL_IDS) {
    assert.ok(REF_LIMITS[id].kie >= 1 && REF_LIMITS[id].fal >= 1, id);
  }
  // docs.kie.ai maxItems / xAI docs
  assert.equal(refLimit("nano-banana-2", "kie"), 10);
  assert.equal(refLimit("nano-banana-2.1", "kie"), 10);
  assert.equal(refLimit("nano-banana-2.1", "fal"), 14);
  assert.equal(refLimit("nano-banana-pro", "kie"), 8);
  assert.equal(refLimit("qwen-image-2.1", "kie"), 10);
  assert.equal(refLimit("grok-imagine", "fal"), 5);
  assert.equal(refLimit("seedream-5", "kie"), 10);
  assert.equal(refLimit("flux-2-pro", "kie"), 8);
  assert.equal(refLimit("gpt-image-2.5-flare", "kie"), 16);
  assert.equal(refLimit("muse-image", "fal"), 10);
});

test("refs option: auto by default, all, lists, aliases, errors", () => {
  assert.deepEqual(parseRefsOption(undefined), { ok: true, mode: { kind: "auto" } });
  assert.deepEqual(parseRefsOption("  "), { ok: true, mode: { kind: "auto" } });
  assert.deepEqual(parseRefsOption("AUTO"), { ok: true, mode: { kind: "auto" } });
  assert.deepEqual(parseRefsOption("all"), { ok: true, mode: { kind: "all" } });
  assert.deepEqual(parseRefsOption("face-front, body-back hands,face-front"), {
    ok: true,
    mode: { kind: "list", slots: ["face-front", "body-back", "hands"] },
  });
  assert.deepEqual(parseRefsOption("selfie-0,manicure"), {
    ok: true,
    mode: { kind: "list", slots: ["face-front", "hands"] },
  });
  const bad = parseRefsOption("face-front,tail");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /Unknown reference slot "tail"/);
});

test("a plain portrait prompt asks for no extra slots", () => {
  assert.deepEqual(cueSlots("Portrait in a cafe, window light, reading a book"), []);
  assert.deepEqual(cueSlots(""), []);
});

test("smile and profile cues add the matching face slots", () => {
  assert.deepEqual(cueSlots("laughing at the camera"), ["face-smile"]);
  assert.deepEqual(cueSlots("a gentle smile, side profile"), ["face-profile", "face-smile"]);
  assert.deepEqual(cueSlots("она улыбается"), ["face-smile"]);
  assert.ok(cueSlots("seen in profile view").includes("face-profile"));
});

test("full-body and swimwear prompts add the body slots", () => {
  for (const prompt of ["full body shot on a street", "standing by the window", "in a red bikini on the beach", "lingerie, mirror"]) {
    const slots = cueSlots(prompt);
    assert.deepEqual(slots.slice(0, 3), ["body-front", "body-side", "body-back"], prompt);
    assert.ok(slots.includes("marks"), prompt);
  }
});

test("from behind puts the back first and brings the back details", () => {
  const slots = cueSlots("woman walking away on a path, seen from behind, ponytail");
  assert.deepEqual(slots.slice(0, 3), ["body-back", "body-front", "body-side"]);
  assert.ok(slots.includes("buttocks"));
  assert.ok(slots.includes("hair-back"));
  assert.deepEqual(cueSlots("side view, standing").slice(0, 3), ["face-profile", "body-side", "body-front"]);
});

test("a headshot suppresses the body unless the prompt says full body", () => {
  assert.deepEqual(cueSlots("headshot, smiling, standing against a wall"), ["face-smile"]);
  assert.ok(cueSlots("close-up portrait but full body visible in the mirror").includes("body-front"));
});

test("detail keywords", () => {
  assert.deepEqual(cueSlots("holding a coffee cup with both hands"), ["hands"]);
  assert.deepEqual(cueSlots("showing her nails"), ["hands"]);
  assert.deepEqual(cueSlots("in a mini skirt and high heels"), ["legs", "marks"]);
  assert.ok(cueSlots("black stockings").includes("legs"));
  assert.ok(cueSlots("deep neckline, cleavage").includes("chest"));
  assert.ok(cueSlots("a crop top showing her abs").includes("waist"));
  assert.ok(cueSlots("a close-up of her booty").includes("buttocks"));
  assert.ok(!cueSlots("wearing a thong").includes("buttocks"));
  assert.ok(cueSlots("hair in a braid").includes("hair-back"));
  assert.ok(cueSlots("a small mole on the cheek").includes("marks"));
  assert.ok(cueSlots("руки с маникюром, держит бокал").includes("hands"));
  assert.ok(cueSlots("в юбке, на каблуках").includes("legs"));
});

test("palm trees are not hands", () => {
  assert.ok(!cueSlots("standing on a beach under palm trees").includes("hands"));
  assert.ok(cueSlots("an open palm held out").includes("hands"));
});

test("keywords match whole words, not parts of other words", () => {
  assert.deepEqual(cueSlots("a legend about a handbag, thousands of watchers"), []);
  assert.ok(!cueSlots("ногти").includes("legs"));
  assert.ok(cueSlots("ногти").includes("hands"));
});

const filledAll: SlotId[] = [...SLOT_IDS];

test("auto always sends the filled front and 3/4 faces and nothing else for a plain prompt", () => {
  const picked = selectRefs({ prompt: "Portrait at a desk", filled: filledAll, mode: { kind: "auto" }, budget: 10 });
  assert.deepEqual(picked.used, ["face-front", "face-34-left", "face-34-right"]);
  assert.deepEqual(picked.dropped, []);
});

test("auto does not invent slots that are empty", () => {
  const picked = selectRefs({
    prompt: "full body, holding a phone, smiling",
    filled: ["face-front", "face-34-left"],
    mode: { kind: "auto" },
    budget: 10,
  });
  assert.deepEqual(picked.used, ["face-front", "face-34-left"]);
});

test("auto adds body, hands and smile when the prompt implies them, in image order", () => {
  const picked = selectRefs({
    prompt: "standing on a beach in a bikini, smiling, holding a phone",
    filled: filledAll,
    mode: { kind: "auto" },
    budget: 14,
  });
  assert.deepEqual(picked.used, [
    "face-front",
    "face-34-left",
    "face-34-right",
    "face-smile",
    "body-front",
    "body-side",
    "body-back",
    "hands",
    "chest",
    "waist",
    "marks",
  ]);
});

test("the cap keeps face first, then the marks, then body, then details, and reports what was left out", () => {
  const prompt = "standing on a beach in a bikini, smiling, holding a phone";
  const five = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: 5 });
  assert.deepEqual(five.used, ["face-front", "face-34-left", "face-34-right", "face-smile", "marks"]);
  assert.deepEqual(five.dropped, ["body-front", "body-side", "body-back", "hands", "chest", "waist"]);

  const four = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: 4 });
  assert.deepEqual(four.used, ["face-front", "face-34-left", "face-34-right", "marks"]);

  const three = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: 3 });
  assert.deepEqual(three.used, ["face-front", "face-34-left", "marks"]);

  const one = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: 1 });
  assert.deepEqual(one.used, ["face-front"]);

  const none = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: 0 });
  assert.deepEqual(none.used, []);
  assert.ok(none.dropped.includes("face-front"));
});

test("budget accounts for source images: grok with 3 source pictures leaves room for two references", () => {
  const budget = refLimit("grok-imagine", "kie") - 3;
  const picked = selectRefs({ prompt: "full body, from behind", filled: filledAll, mode: { kind: "auto" }, budget });
  assert.deepEqual(picked.used, ["face-front", "face-34-left"]);
});

test("a keyword-chosen detail beats the leftover slots when the cap bites in all mode", () => {
  const picked = selectRefs({ prompt: "showing her legs in heels", filled: filledAll, mode: { kind: "all" }, budget: 5 });
  assert.deepEqual(picked.used, ["face-front", "face-34-left", "face-34-right", "legs", "marks"]);
});

test("all mode sends every filled slot the model may get; the nude slots only to Qwen", () => {
  const clothed = SLOT_IDS.filter((slot) => slot !== "chest-nude" && slot !== "buttocks-nude");
  const picked = selectRefs({ prompt: "x", filled: filledAll, mode: { kind: "all" }, budget: 20, model: "nano-banana-2.1" });
  assert.deepEqual(picked.used, [...clothed]);
  assert.deepEqual(picked.dropped, []);
  assert.deepEqual(picked.rejected, []);
  const qwen = selectRefs({ prompt: "x", filled: filledAll, mode: { kind: "all" }, budget: 20, model: "qwen-image-2.1" });
  assert.deepEqual(qwen.used, [...SLOT_IDS]);
});

test("a hand-written list keeps its own priority, skips empty slots, and reports them", () => {
  const picked = selectRefs({
    prompt: "anything",
    filled: ["face-front", "body-back", "hands"],
    mode: { kind: "list", slots: ["hands", "body-back", "chest", "face-front"] },
    budget: 2,
  });
  assert.deepEqual(picked.used, ["body-back", "hands"]);
  assert.deepEqual(picked.dropped, ["face-front", "chest"]);
});

// ---- the nude slots: Qwen and Wan only ----

const NUDE = ["chest-nude", "buttocks-nude"] as const;
const NON_QWEN = MODEL_IDS.filter((id) => id !== "qwen-image-2.1" && id !== "wan-2.7"); // models that may never get the nude slots

test("nude slots are never selected for any model but Qwen and Wan, in auto, all and list mode", () => {
  const prompts = ["topless on a beach", "nude from behind", "naked, explicit, full body from behind", "обнажённая со спины"];
  for (const model of NON_QWEN) {
    for (const prompt of prompts) {
      for (const mode of [{ kind: "auto" }, { kind: "all" }] as const) {
        const picked = selectRefs({ prompt, filled: filledAll, mode, budget: 20, model });
        for (const slot of NUDE) assert.ok(!picked.used.includes(slot), `${model} ${mode.kind} ${prompt}`);
        assert.deepEqual(picked.rejected, [], "silent in automatic modes");
      }
    }
    // Not even without a model argument.
    const bare = selectRefs({ prompt: "topless nude", filled: filledAll, mode: { kind: "all" }, budget: 20 });
    for (const slot of NUDE) assert.ok(!bare.used.includes(slot));
  }
});

test("an explicit list with a nude slot is rejected for other models and honored for Qwen and Wan", () => {
  const list = { kind: "list", slots: ["face-front", "chest-nude", "buttocks-nude"] } as const;
  for (const model of NON_QWEN) {
    const picked = selectRefs({ prompt: "x", filled: filledAll, mode: list, budget: 10, model });
    assert.deepEqual(picked.used, ["face-front"], model);
    assert.deepEqual(picked.rejected, ["chest-nude", "buttocks-nude"], model);
  }
  for (const model of ["qwen-image-2.1", "wan-2.7"] as const) {
    const allowed = selectRefs({ prompt: "x", filled: filledAll, mode: list, budget: 10, model });
    assert.deepEqual(allowed.used, ["face-front", "chest-nude", "buttocks-nude"], model);
    assert.deepEqual(allowed.rejected, [], model);
  }
});

test("nude cues: Qwen prefers the nude slot over the clothed one; other prompts and models do not", () => {
  const qwenSlots = cueSlots("topless, standing on a beach", "qwen-image-2.1");
  assert.ok(qwenSlots.indexOf("chest-nude") !== -1 && qwenSlots.indexOf("chest-nude") < qwenSlots.indexOf("chest"));
  assert.ok(!qwenSlots.includes("buttocks-nude"), "no back view, no buttocks slot");
  const back = cueSlots("nude, seen from behind", "qwen-image-2.1");
  assert.ok(back.indexOf("buttocks-nude") !== -1 && back.indexOf("buttocks-nude") < back.indexOf("buttocks"));
  assert.ok(cueSlots("голая, вид со спины", "qwen-image-2.1").includes("buttocks-nude"));
  // No nude cue: clothed slots only, even on Qwen.
  for (const prompt of ["a red bikini on the beach", "wearing a low-cut dress, from behind"]) {
    const slots = cueSlots(prompt, "qwen-image-2.1");
    for (const slot of NUDE) assert.ok(!slots.includes(slot), prompt);
  }
  // The same prompt on another model: no nude slot at all.
  for (const model of NON_QWEN) for (const slot of NUDE) assert.ok(!cueSlots("topless, nude from behind", model).includes(slot));
  assert.ok(!cueSlots("topless, nude from behind").includes("chest-nude"));
});

test("on Qwen the single most relevant slot is the nude one when it is filled; otherwise the clothed one", () => {
  const withNude = selectRefs({
    prompt: "topless, standing in a doorway",
    filled: ["face-front", "face-34-left", "body-front", "chest", "chest-nude", "marks"],
    mode: { kind: "auto" },
    budget: 4,
    model: "qwen-image-2.1",
  });
  assert.deepEqual(withNude.used, ["face-front", "face-34-left", "chest-nude", "marks"]);
  const behind = selectRefs({
    prompt: "nude, seen from behind",
    filled: ["face-front", "face-34-left", "body-back", "buttocks", "buttocks-nude", "chest-nude", "marks"],
    mode: { kind: "auto" },
    budget: 4,
    model: "qwen-image-2.1",
  });
  assert.deepEqual(behind.used, ["face-front", "face-34-left", "buttocks-nude", "marks"]);
  const noNude = selectRefs({
    prompt: "topless, standing in a doorway",
    filled: ["face-front", "face-34-left", "body-front", "chest", "marks"],
    mode: { kind: "auto" },
    budget: 4,
    model: "qwen-image-2.1",
  });
  assert.deepEqual(noNude.used, ["face-front", "face-34-left", "body-front", "marks"]);
});

// ---- Qwen in generate mode: at most 4 images ----

test("the Qwen generate cap is 4 images including source pictures; Wan keeps its own", () => {
  assert.equal(QWEN_GENERATE_CAP, 4);
  assert.equal(refLimit("wan-2.7", "kie"), 9);
});

test("Qwen generate: front face, one 3/4 face, one body photo, marks - never all ten", () => {
  const prompts = [
    "full body in a motel room, wearing lingerie",
    "standing in a doorway in a tank top",
    "from behind, in a bikini on the beach",
    "topless, nude, naked in a doorway",
  ];
  for (const prompt of prompts) {
    const picked = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP, model: "qwen-image-2.1" });
    assert.ok(picked.used.length <= 4, prompt);
    assert.equal(picked.used.filter((slot) => slot.startsWith("face-")).length, 2, `${prompt}: two faces`);
    assert.ok(picked.used.includes("face-front") && picked.used.includes("face-34-left"), prompt);
    assert.ok(picked.used.includes("marks"), `${prompt}: marks kept`);
    assert.equal(picked.used.filter((slot) => !slot.startsWith("face-") && slot !== "marks").length, 1, `${prompt}: one body photo`);
  }
  // A plain portrait needs no body and no marks.
  const portrait = selectRefs({ prompt: "portrait at a cafe window", filled: filledAll, mode: { kind: "auto" }, budget: 4, model: "qwen-image-2.1" });
  assert.deepEqual(portrait.used, ["face-front", "face-34-left"]);
  // Directional body view.
  const behind = selectRefs({ prompt: "walking away, seen from behind in lingerie", filled: filledAll, mode: { kind: "auto" }, budget: 4, model: "qwen-image-2.1" });
  assert.deepEqual(behind.used, ["face-front", "face-34-left", "body-back", "marks"]);
});

test("Qwen generate: source pictures count against the 4", () => {
  const one = selectRefs({ prompt: "full body in lingerie", filled: filledAll, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP - 1, model: "qwen-image-2.1" });
  assert.deepEqual(one.used, ["face-front", "face-34-left", "body-front"]);
  assert.ok(one.dropped.includes("marks"));
  const three = selectRefs({ prompt: "full body in lingerie", filled: filledAll, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP - 3, model: "qwen-image-2.1" });
  assert.deepEqual(three.used, ["face-front"]);
});

test("marks outrank the secondary face angles and body views when skin is likely in frame", () => {
  for (const prompt of ["in lingerie", "wearing a tank top", "nude", "in a bikini", "full body shot", "in a sleeveless dress, bare shoulders"]) {
    const picked = selectRefs({ prompt, filled: filledAll, mode: { kind: "auto" }, budget: 3, model: "nano-banana-2.1" });
    assert.deepEqual(picked.used, ["face-front", "face-34-left", "marks"], prompt);
  }
  // No skin cue: marks are not sent at all.
  const portrait = selectRefs({ prompt: "portrait at a cafe window", filled: filledAll, mode: { kind: "auto" }, budget: 10 });
  assert.ok(!portrait.used.includes("marks"));
  // A named tattoo always brings them.
  assert.ok(cueSlots("close-up of her snake tattoo").includes("marks"));
  assert.ok(cueSlots("on her left arm", "nano-banana-2.1").includes("marks"));
  assert.ok(cueSlots("в майке, плечи открыты").includes("marks"));
});

// ---- regressions from a live batch: "behind" and "thong" are not back views ----

const TOPLESS_LYING =
  "Topless nude photograph of her from the waist up, lying back on white bed sheets, one arm behind her head, soft morning light from the window.";
const BRA_THONG =
  "Full-length photograph of her standing in a black lace bra and thong, barefoot, leaning against the doorframe of a dim room, confident look at the lens.";

test("regression: 'one arm behind her head' is not a back view (topless, lying back)", () => {
  const cues = cueSlots(TOPLESS_LYING, "qwen-image-2.1");
  assert.ok(cues.includes("chest-nude"), "the bare chest");
  assert.ok(!cues.includes("buttocks-nude"));
  assert.ok(!cues.includes("buttocks"));
  assert.ok(cues.indexOf("body-back") === -1 || cues.indexOf("body-back") > cues.indexOf("body-front"), "front view first");
  const picked = selectRefs({ prompt: TOPLESS_LYING, filled: filledAll, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP, model: "qwen-image-2.1" });
  assert.ok(picked.used.includes("chest-nude"));
  assert.ok(!picked.used.includes("buttocks-nude"));
  assert.ok(!picked.used.includes("body-back"));
  // Other models: no nude slot, and still no rear slots.
  const other = selectRefs({ prompt: TOPLESS_LYING, filled: filledAll, mode: { kind: "auto" }, budget: 10, model: "nano-banana-2.1" });
  assert.ok(!other.used.includes("buttocks") && !other.used.includes("chest-nude") && !other.used.includes("buttocks-nude"));
});

test("regression: a thong and 'look at the lens' mean a front shot", () => {
  const cues = cueSlots(BRA_THONG, "qwen-image-2.1");
  assert.equal(cues.find((slot) => slot.startsWith("body-")), "body-front");
  assert.ok(!cues.includes("buttocks") && !cues.includes("buttocks-nude"));
  const picked = selectRefs({ prompt: BRA_THONG, filled: filledAll, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP, model: "qwen-image-2.1" });
  assert.deepEqual(picked.used, ["face-front", "face-34-left", "body-front", "marks"]);
  const nano = selectRefs({ prompt: BRA_THONG, filled: filledAll, mode: { kind: "auto" }, budget: 6, model: "nano-banana-2.1" });
  assert.ok(nano.used.includes("body-front"));
  assert.ok(!nano.used.includes("buttocks"));
});

test("'behind' only means a rear view as a viewpoint phrase", () => {
  for (const prompt of [
    "she stands behind the bar, smiling",
    "hands clasped behind her back, looking at the camera",
    "an arm behind her head",
    "a sunset behind her",
    "tucked behind her ear",
    "lying back on the bed, topless",
  ]) {
    const cues = cueSlots(prompt, "qwen-image-2.1");
    assert.ok(!cues.includes("buttocks") && !cues.includes("buttocks-nude"), prompt);
    assert.ok(cues.indexOf("body-back") === -1 || cues.indexOf("body-back") > cues.indexOf("body-front"), prompt);
  }
  for (const prompt of ["seen from behind, in a tight dress", "back view of her walking", "rear view, standing", "back to the camera on the beach", "walking away along the shore", "вид со спины", "стоит сзади"]) {
    assert.ok(cueSlots(prompt).includes("buttocks"), prompt);
    const body = cueSlots(prompt).find((slot) => slot.startsWith("body-"));
    assert.equal(body, "body-back", prompt);
  }
  // Ambiguous: the camera behind her, or looking over her shoulder, count unless a front cue says otherwise.
  assert.equal(cueSlots("standing, camera behind her, looking over her shoulder").find((slot) => slot.startsWith("body-")), "body-back");
  assert.equal(cueSlots("standing facing the camera, looking over her shoulder").find((slot) => slot.startsWith("body-")), "body-front");
  // Front cues win over the ambiguous ones.
  assert.ok(!cueSlots("topless, glancing over her shoulder, from the waist up").includes("buttocks"));
});

// ---- Wan 2.7: nude slots allowed (the 18+ fallback), cap 9, same priority logic ----

test("Wan gets the nude slots like Qwen: cues prefer the nude slot, lists are honored, all includes them", () => {
  const wan = cueSlots("topless, nude from behind", "wan-2.7");
  assert.ok(wan.includes("chest-nude") && wan.includes("buttocks-nude"));
  assert.ok(wan.indexOf("chest-nude") < wan.indexOf("chest"));
  const auto = selectRefs({
    prompt: "topless in a doorway, nude",
    filled: ["face-front", "face-34-left", "face-34-right", "body-front", "chest", "chest-nude", "marks"],
    mode: { kind: "auto" },
    budget: refLimit("wan-2.7", "kie"),
    model: "wan-2.7",
  });
  assert.ok(auto.used.includes("chest-nude") && !auto.used.includes("chest"));
  const all = selectRefs({ prompt: "x", filled: filledAll, mode: { kind: "all" }, budget: 20, model: "wan-2.7" });
  assert.deepEqual(all.used, [...SLOT_IDS]);
});

test("Wan keeps its cap of 9 and the marks priority; no Qwen 4-image cap applies", () => {
  assert.equal(refLimit("wan-2.7", "kie"), 9);
  const picked = selectRefs({ prompt: "full body in lingerie", filled: filledAll, mode: { kind: "auto" }, budget: 9, model: "wan-2.7" });
  assert.ok(picked.used.length > QWEN_GENERATE_CAP, "more than four references");
  assert.ok(picked.used.length <= 9);
  assert.ok(picked.used.includes("marks"));
  const tight = selectRefs({ prompt: "full body in lingerie", filled: filledAll, mode: { kind: "auto" }, budget: 3, model: "wan-2.7" });
  assert.deepEqual(tight.used, ["face-front", "face-34-left", "marks"]);
  // fal edit allows 4 images in total.
  const fal = selectRefs({ prompt: "topless, nude", filled: filledAll, mode: { kind: "auto" }, budget: refLimit("wan-2.7", "fal") - 1, model: "wan-2.7" });
  assert.ok(fal.used.length <= 3);
});

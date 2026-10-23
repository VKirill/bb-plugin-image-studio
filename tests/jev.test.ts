import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  JEV_MODEL,
  OPENLUX_BASE_URL,
  TYPESAFE_BASE_URL,
  askJev,
  buildJevRequest,
  jevCues,
  parseJevResponse,
  runJevAttempts,
  slotKey,
  systemOneUrl,
  type JevAnswers,
  type JevAttempt,
  type JevInput,
} from "../src/jev.ts";
import { QWEN_GENERATE_CAP, selectRefs } from "../src/refs.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/settings.ts";
import { SLOT_IDS, type SlotId } from "../src/slots.ts";

const ALL: SlotId[] = [...SLOT_IDS];

function input(overrides: Partial<JevInput> = {}): JevInput {
  return { prompt: "Standing on a beach in a red bikini.", model: "nano-banana-2.1", gender: "female", sourceCount: 0, filled: ALL, ...overrides };
}

/** A canned Jev answer: every slot at `base`, with overrides. */
function answers(over: Partial<Record<SlotId, number>> = {}, extra: Partial<JevAnswers> = {}, base = 0.1): JevAnswers {
  const slots: Partial<Record<SlotId, number>> = {};
  for (const slot of ALL) slots[slot] = over[slot] ?? base;
  return {
    slots,
    nudity: 0.02,
    person: 0.98,
    viewpoint: { choice: "front", probabilities: { front: 0.9, back: 0.02, side: 0.02, closeup: 0.04, none: 0.02 } },
    ...extra,
  };
}

function wireBody(a: JevAnswers, requested: readonly SlotId[] = ALL) {
  const out: Record<string, unknown> = {};
  for (const slot of requested) out[`use_${slotKey(slot)}`] = { type: "noul", noul: a.slots[slot] ?? 0 };
  out.person = { type: "noul", noul: a.person };
  out.nudity = { type: "noul", noul: a.nudity };
  out.viewpoint = { type: "choice", choice: a.viewpoint.choice, probabilities: a.viewpoint.probabilities, confidence: 0.9 };
  return { model: JEV_MODEL, answers: out, usage: { input_tokens: 1, output_tokens: 1 } };
}

test("one request carries the prompt, the model, the source count and every filled slot as a question", () => {
  const request = buildJevRequest(input({ sourceCount: 2, filled: ["face-front", "body-back", "marks"] }));
  assert.equal(request.model, JEV_MODEL);
  assert.equal((request.state as { request: string }).request, "Standing on a beach in a red bikini.");
  assert.equal((request.state as { image_model: string }).image_model, "nano-banana-2.1");
  assert.equal((request.state as { source_pictures: number }).source_pictures, 2);
  assert.equal((request.state as { subject: string }).subject, "an adult woman");
  const photos = (request.state as { reference_photos: Record<string, string> }).reference_photos;
  assert.deepEqual(Object.keys(photos), ["face_front", "body_back", "marks"]);
  assert.match(photos.body_back!, /Her body \(back, hips and legs\) seen from directly behind/);
  assert.deepEqual(Object.keys(request.questions).sort(), ["nudity", "person", "use_body_back", "use_face_front", "use_marks", "viewpoint"].sort());
  for (const key of ["use_face_front", "use_body_back", "use_marks", "nudity", "person"]) assert.equal(request.questions[key]!.type, "noul");
  assert.equal(request.questions.viewpoint!.type, "choice");
  assert.deepEqual(Object.keys(request.questions.viewpoint!.criteria as object), ["front", "back", "side", "closeup", "none"]);
  assert.match(String(request.questions.use_body_back!.instructions), /reference_photos\.body_back/);
  assert.match(String(request.questions.use_marks!.instructions), /bare skin/);
});

test("slot keys are path-safe and male profiles get male wording", () => {
  assert.equal(slotKey("face-34-left"), "face_34_left");
  const male = buildJevRequest(input({ gender: "male", filled: ["chest"] }));
  assert.equal((male.state as { subject: string }).subject, "an adult man");
  assert.match((male.state as { reference_photos: Record<string, string> }).reference_photos.chest!, /^His bust/);
});

test("the nude slots are not even asked about for a model that may not get them", () => {
  const nano = buildJevRequest(input({ filled: ["face-front", "chest", "chest-nude", "buttocks-nude"] }));
  assert.ok(!("use_chest_nude" in nano.questions) && !("use_buttocks_nude" in nano.questions));
  assert.ok("use_chest" in nano.questions);
  for (const model of ["qwen-image-2.1", "wan-2.7"] as const) {
    const ok = buildJevRequest(input({ model, filled: ["face-front", "chest", "chest-nude", "buttocks-nude"] }));
    assert.ok("use_chest_nude" in ok.questions && "use_buttocks_nude" in ok.questions, model);
  }
});

test("responses are parsed strictly", () => {
  const good = parseJevResponse(wireBody(answers({ "body-back": 0.9 })), ALL);
  assert.equal(good.slots["body-back"], 0.9);
  assert.equal(good.viewpoint.choice, "front");
  assert.equal(good.person, 0.98);
  assert.throws(() => parseJevResponse(null, ALL), /without answers/);
  assert.throws(() => parseJevResponse({ answers: {} }, ["face-front"]), /no answer for face-front/);
  const noView = wireBody(answers()) as { answers: Record<string, unknown> };
  delete noView.answers.viewpoint;
  assert.throws(() => parseJevResponse(noView, ALL), /no viewpoint/);
});

test("askJev posts to {base}/systemone with a bearer key and the chosen model", async () => {
  let seen: { url: string; headers: Record<string, string>; body: { model: string } } | null = null;
  const fetchImpl: typeof fetch = async (url, init) => {
    seen = { url: String(url), headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) };
    return new Response(JSON.stringify(wireBody(answers(), ["face-front"])), { status: 200 });
  };
  const result = await askJev(input({ filled: ["face-front"] }), { apiKey: "secret-key", baseUrl: `${OPENLUX_BASE_URL}/`, model: "jev-1.14.0", fetchImpl });
  assert.equal(seen!.url, "https://api.openlux.ai/v1/systemone");
  assert.equal(seen!.headers.Authorization, "Bearer secret-key");
  assert.equal(seen!.body.model, "jev-1.14.0");
  assert.equal(result.slots["face-front"], 0.1);
  assert.equal(systemOneUrl(TYPESAFE_BASE_URL), "https://api.typesafe.ai/v1/systemone");
});

test("askJev fails readably on HTTP errors, bad bodies and timeouts", async () => {
  await assert.rejects(
    () => askJev(input({ filled: ["face-front"] }), { apiKey: "k", fetchImpl: async () => new Response("nope", { status: 429 }) }),
    /HTTP 429/,
  );
  await assert.rejects(
    () => askJev(input({ filled: ["face-front"] }), { apiKey: "k", fetchImpl: async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }) }),
    /no answer/,
  );
  const hang: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
  const started = Date.now();
  await assert.rejects(() => askJev(input({ filled: ["face-front"] }), { apiKey: "k", fetchImpl: hang, timeoutMs: 40 }), /timed out after 40 ms/);
  assert.ok(Date.now() - started < 500);
});

function attempt(provider: string, key: string | Error): JevAttempt {
  return {
    provider,
    baseUrl: provider === "openlux" ? OPENLUX_BASE_URL : TYPESAFE_BASE_URL,
    model: JEV_MODEL,
    keyName: `${provider.toUpperCase()}_API_KEY`,
    apiKey: async () => {
      if (key instanceof Error) throw key;
      return key;
    },
  };
}

test("fallback chain: OpenLux first, TypeSafe direct if it fails, keywords if both fail", async () => {
  const calls: string[] = [];
  const ok = async (_i: JevInput, options: { baseUrl?: string }) => {
    calls.push(String(options.baseUrl));
    return answers();
  };
  const primary = await runJevAttempts(input(), [attempt("openlux", "k1"), attempt("typesafe", "k2")], 1500, ok as never);
  assert.equal(primary.ok && primary.provider, "openlux");
  assert.deepEqual(calls, [OPENLUX_BASE_URL]);

  const failOpenlux = async (_i: JevInput, options: { baseUrl?: string }) => {
    if (options.baseUrl === OPENLUX_BASE_URL) throw new Error("Jev answered HTTP 502 with key-one");
    return answers();
  };
  const second = await runJevAttempts(input(), [attempt("openlux", "key-one"), attempt("typesafe", "k2")], 1500, failOpenlux as never);
  assert.equal(second.ok && second.provider, "typesafe");

  const bothFail = async () => {
    throw new Error("Jev timed out after 1500 ms");
  };
  const none = await runJevAttempts(input(), [attempt("openlux", "key-one"), attempt("typesafe", "key-two")], 1500, bothFail as never);
  assert.equal(none.ok, false);
  if (!none.ok) {
    assert.equal(none.errors.length, 2);
    assert.match(none.errors[0]!, /^openlux: Jev timed out/);
  }
});

test("a missing or unreadable key skips that endpoint, and a key never appears in an error", async () => {
  const echo = async (_i: JevInput, options: { apiKey: string }) => {
    throw new Error(`rejected ${options.apiKey}`);
  };
  const run = await runJevAttempts(input(), [attempt("openlux", new Error("not in catalog")), attempt("typesafe", "sk-very-secret")], 1500, echo as never);
  assert.equal(run.ok, false);
  if (!run.ok) {
    assert.match(run.errors[0]!, /openlux: no key \(OPENLUX_API_KEY\)/);
    assert.match(run.errors[1]!, /typesafe: rejected \*\*\*/);
    assert.ok(!run.errors.join(" ").includes("sk-very-secret"));
  }
  const empty = await runJevAttempts(input(), [attempt("openlux", "  ")], 1500, echo as never);
  assert.equal(empty.ok, false);
  const nothing = await runJevAttempts(input(), [], 1500, echo as never);
  assert.deepEqual(nothing, { ok: false, errors: [] });
});

test("policy: slots at or above the threshold are wanted, best first", () => {
  const cues = jevCues(answers({ "body-front": 0.9, marks: 0.7, hands: 0.55, legs: 0.49, waist: 0.2 }), { model: "nano-banana-2.1", filled: ALL });
  assert.deepEqual(cues.cues, ["body-front", "marks", "hands"]);
  assert.equal(cues.noPerson, false);
  assert.equal(cues.scores["body-front"], 0.9);
  assert.equal(cues.scores.viewpoint, "front");
});

test("policy: no person in the picture means no references", () => {
  const byPerson = jevCues(answers({}, { person: 0.04 }), { model: "nano-banana-2.1", filled: ALL });
  assert.equal(byPerson.noPerson, true);
  const byView = jevCues(answers({}, { viewpoint: { choice: "none", probabilities: { none: 0.8, front: 0.2 } } }), { model: "nano-banana-2.1", filled: ALL });
  assert.equal(byView.noPerson, true);
  const picked = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "auto" }, budget: 20, model: "nano-banana-2.1", cues: byPerson.cues, noPerson: true });
  assert.deepEqual(picked.used, []);
});

test("policy: nude slots need explicit nudity AND a model that may get them; they replace the clothed ones", () => {
  const nude = answers({ "chest-nude": 0.9, chest: 0.8, "buttocks-nude": 0.8, buttocks: 0.7, "body-front": 0.7 }, {
    nudity: 0.97,
    viewpoint: { choice: "closeup", probabilities: { closeup: 0.9, front: 0.05, back: 0.05 } },
  });
  const wan = jevCues(nude, { model: "wan-2.7", filled: ALL });
  assert.ok(wan.cues.includes("chest-nude") && wan.cues.includes("buttocks-nude"));
  assert.ok(!wan.cues.includes("chest") && !wan.cues.includes("buttocks"));
  // Another model: never, whatever Jev says.
  const nano = jevCues(nude, { model: "nano-banana-2.1", filled: ALL });
  assert.ok(!nano.cues.includes("chest-nude") && !nano.cues.includes("buttocks-nude"));
  assert.ok(nano.cues.includes("chest"));
  // Qwen/Wan, but the prompt is not nude: the nude slots stay out and the clothed ones stay in.
  const clothed = jevCues(answers({ "chest-nude": 0.9, chest: 0.8 }, { nudity: 0.1 }), { model: "qwen-image-2.1", filled: ALL });
  assert.ok(!clothed.cues.includes("chest-nude") && clothed.cues.includes("chest"));
  const through = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "auto" }, budget: 20, model: "nano-banana-2.1", cues: nude.slots ? ["chest-nude", "buttocks-nude", "body-front"] : [] });
  assert.ok(!through.used.includes("chest-nude") && !through.used.includes("buttocks-nude"), "selectRefs enforces the hard rule even if cues contain them");
});

test("policy: the viewpoint check keeps front and back photos consistent", () => {
  const back = answers({ "body-back": 0.9, "body-front": 0.8, buttocks: 0.8, chest: 0.7 }, {
    viewpoint: { choice: "back", probabilities: { back: 0.95, front: 0.03, side: 0.01, closeup: 0.01, none: 0 } },
  });
  const cues = jevCues(back, { model: "nano-banana-2.1", filled: ALL });
  assert.ok(cues.cues.includes("body-back") && cues.cues.includes("buttocks"));
  assert.ok(!cues.cues.includes("body-front") && !cues.cues.includes("chest"), "front photos are scaled down for a back view");
  const front = jevCues(answers({ "body-front": 0.9, "body-back": 0.8 }), { model: "nano-banana-2.1", filled: ALL });
  assert.ok(front.cues.includes("body-front") && !front.cues.includes("body-back"));
  // Close-ups: the view check does not apply.
  const close = jevCues(answers({ chest: 0.8 }, { viewpoint: { choice: "closeup", probabilities: { closeup: 0.9, front: 0.05 } } }), { model: "nano-banana-2.1", filled: ALL });
  assert.ok(close.cues.includes("chest"));
});

test("code keeps the cap and the face-first rule over whatever Jev ranks", () => {
  const cues = jevCues(answers({ "body-front": 0.9, "body-side": 0.85, "body-back": 0.2, hands: 0.8, legs: 0.8, waist: 0.7, marks: 0.95 }), { model: "nano-banana-2.1", filled: ALL });
  const wide = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "auto" }, budget: 4, model: "nano-banana-2.1", cues: cues.cues });
  assert.deepEqual(wide.used, ["face-front", "face-34-left", "face-34-right", "marks"], "faces first, then marks");
  // Qwen: 4 images including sources: front, one 3/4, the best body photo, marks.
  const qwen = jevCues(answers({ "body-front": 0.9, "body-side": 0.85, hands: 0.8, marks: 0.95 }), { model: "qwen-image-2.1", filled: ALL });
  const capped = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP, model: "qwen-image-2.1", cues: qwen.cues });
  assert.deepEqual(capped.used, ["face-front", "face-34-left", "body-front", "marks"]);
  const withSource = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "auto" }, budget: QWEN_GENERATE_CAP - 1, model: "qwen-image-2.1", cues: qwen.cues });
  assert.equal(withSource.used.length, 3);
  // Wan keeps its cap of 9 and the same priorities.
  const wan = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "auto" }, budget: 9, model: "wan-2.7", cues: cues.cues });
  assert.ok(wan.used.length > QWEN_GENERATE_CAP && wan.used.length <= 9);
  assert.ok(wan.used.includes("marks") && wan.used.includes("face-front"));
});

test("an explicit refs list bypasses Jev entirely", () => {
  const list = selectRefs({ prompt: "x", filled: ALL, mode: { kind: "list", slots: ["hands", "face-front"] }, budget: 5, model: "nano-banana-2.1", cues: ["legs"], noPerson: true });
  assert.deepEqual(list.used, ["face-front", "hands"]);
});

test("Jev settings: OpenLux is the default endpoint, TypeSafe the fallback key, Jev on", () => {
  assert.equal(DEFAULT_SETTINGS.jevRefs, true);
  assert.equal(DEFAULT_SETTINGS.jevBaseUrl, "https://api.openlux.ai/v1");
  assert.equal(DEFAULT_SETTINGS.jevModel, "jev-1.13.0");
  assert.equal(DEFAULT_SETTINGS.jevKeyCatalog, "OPENLUX_API_KEY");
  assert.equal(DEFAULT_SETTINGS.jevFallbackKeyCatalog, "TYPESAFE_API_KEY");
  const merged = mergeSettings({ jevBaseUrl: "  ", jevModel: "jev-1.14.0", jevRefs: false, jevFallbackKeyCatalog: "" });
  assert.equal(merged.jevBaseUrl, "https://api.openlux.ai/v1");
  assert.equal(merged.jevModel, "jev-1.14.0");
  assert.equal(merged.jevRefs, false);
  assert.equal(merged.jevFallbackKeyCatalog, "", "an empty fallback means no fallback");
});

test("the evaluation fixtures are well formed (the live eval runs with scripts/jev-eval.ts)", () => {
  for (const name of ["refs-eval.json", "refs-eval-holdout.json"]) {
    const cases = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8")) as Array<{ id: string; prompt: string; model: string; must: string[]; mustNot: string[] }>;
    assert.ok(cases.length >= (name === "refs-eval.json" ? 25 : 10), name);
    assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, "unique ids");
    for (const c of cases) {
      assert.ok(c.prompt.length > 10 && c.model, c.id);
      for (const slot of [...c.must, ...c.mustNot]) assert.ok((SLOT_IDS as readonly string[]).includes(slot), `${c.id}: ${slot}`);
    }
  }
  const all = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "refs-eval.json"), "utf8")) as Array<{ id: string; prompt: string }>;
  const text = all.map((c) => c.prompt).join("\n");
  for (const needle of ["behind her head", "thong", "palm trees", "tank top", "ponytail", "profile", "heels", "Девушка", "dog", "apple"]) assert.ok(text.includes(needle), needle);
});

test("a generation keeps what Jev was asked, and the exact request is rebuilt from it", async () => {
  const { generationSchema } = await import("../src/generation.ts");
  const record = generationSchema.parse({
    id: "g1", projectId: "p", createdAt: "2026-10-23T00:00:00.000Z", prompt: "portrait in an office", composedPrompt: "c",
    model: "nano-banana-2", gateway: "fal", profileId: "pr", profileName: "SS · Вика", filename: "g1.webp", mimeType: "image/webp", projectPath: null,
    refsJevInput: { model: "nano-banana-2", gender: "female", sourceCount: 1, filled: ["face-front", "body-back"] },
  });
  const asked = record.refsJevInput!;
  const rebuilt = buildJevRequest({ prompt: record.prompt, model: asked.model as never, gender: asked.gender, sourceCount: asked.sourceCount, filled: asked.filled as never });
  const original = buildJevRequest({ prompt: "portrait in an office", model: "nano-banana-2", gender: "female", sourceCount: 1, filled: ["face-front", "body-back"] });
  assert.deepEqual(rebuilt, original);
  assert.ok(Object.keys(rebuilt.questions).some((key) => key.startsWith("use_")));
  assert.equal((rebuilt.state as { request?: string }).request, "portrait in an office");
});

test("questions about a man's profile say him/his/he, not her/she", () => {
  const request = buildJevRequest({ prompt: "portrait from behind", model: "nano-banana-2", gender: "male", sourceCount: 0, filled: ["face-front", "marks"] });
  const text = JSON.stringify(request.questions);
  assert.doesNotMatch(text, /\b(her|she)\b/);
  assert.match(text, /keep him consistent/);
  assert.match(text, /shows his distinctive moles/);
  const woman = JSON.stringify(buildJevRequest({ prompt: "p", model: "nano-banana-2", gender: "female", sourceCount: 0, filled: ["face-front"] }).questions);
  assert.match(woman, /keep her consistent/);
});

import type { ModelId } from "./models.ts";
import { isFaceSlot, isNudeSlot, modelAllowsNude, type SlotId } from "./slots.ts";

/**
 * Reference selection by TypeSafe Jev (a System One model). One request per generate call: the prompt and the
 * list of filled reference photos go in as state, and every question runs in parallel over it:
 * - one Noul per filled slot: will this photo's part and view really be visible in the picture?
 * - one Choice for the viewpoint (front / back / side / close-up / no person), so front and back are judged together;
 * - one Noul for explicit nudity, to pick the nude variants.
 * Code keeps the policy (caps, hard rules, thresholds, ordering). On a timeout, an error or no key the keyword
 * rules take over (see refs.ts).
 */

/** OpenLux resells Jev with the same HTTP API as TypeSafe (POST {base}/systemone); TypeSafe direct is the fallback. */
export const OPENLUX_BASE_URL = "https://api.openlux.ai/v1";
export const TYPESAFE_BASE_URL = "https://api.typesafe.ai/v1";

export function systemOneUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/systemone`;
}
/** Pinned: thresholds below were tuned on this version ("jev-latest" can move). */
export const JEV_MODEL = "jev-1.13.0";
/** Measured from the hub through OpenLux: about 0.6-1.2 s (0.2-0.3 s to TypeSafe direct). A generate call takes 25+ s anyway. */
export const JEV_TIMEOUT_MS = 2500;

/** What each reference photo shows, in plain English. `he`/`she` is filled in for the profile's gender. */
const SLOT_MEANING: Record<SlotId, string> = {
  "face-front": "{Her} face seen straight from the front.",
  "face-34-left": "{Her} face turned three-quarters to the left.",
  "face-34-right": "{Her} face turned three-quarters to the right.",
  "face-profile": "{Her} face in a pure side profile.",
  "face-smile": "{Her} face smiling or laughing.",
  "body-front": "{Her} body (torso, hips and legs) seen from the front, in fitted clothing.",
  "body-side": "{Her} body (torso, hips and legs) seen from the side.",
  "body-back": "{Her} body (back, hips and legs) seen from directly behind.",
  hands: "{Her} hands and fingernails, close up.",
  chest: "{Her} bust and neckline in a black lace bra, seen from the front.",
  "chest-nude": "{Her} bare bust, topless, seen from the front.",
  waist: "{Her} waist and belly, seen from the front.",
  legs: "{Her} legs from the hips down to the feet.",
  buttocks: "{Her} hips and buttocks seen from behind, in briefs.",
  "buttocks-nude": "{Her} bare buttocks seen from behind, nude from the waist to the upper thighs.",
  marks: "{Her} distinctive moles, tattoos and birthmarks, on bare skin such as the arms, shoulders, chest, back or legs.",
  "hair-back": "The back of {her} hair, seen from behind.",
};

export function slotMeaning(slot: SlotId, gender: "male" | "female"): string {
  const possessive = gender === "female" ? "Her" : "His";
  return SLOT_MEANING[slot].replace("{Her}", possessive).replace("{her}", possessive.toLowerCase());
}

/** State keys cannot be written with hyphens in a path: face-34-left → face_34_left. */
export function slotKey(slot: SlotId): string {
  return slot.replace(/-/g, "_");
}

export type JevView = "front" | "back" | "side" | "closeup" | "none";

/** The viewpoint each slot shows, for judging front and back photos consistently. */
export const SLOT_VIEW: Partial<Record<SlotId, JevView>> = {
  "body-front": "front",
  "body-side": "side",
  "body-back": "back",
  buttocks: "back",
  "buttocks-nude": "back",
  "hair-back": "back",
  chest: "front",
  "chest-nude": "front",
  waist: "front",
  "face-profile": "side",
};

export type JevInput = {
  prompt: string;
  model: ModelId;
  gender: "male" | "female";
  sourceCount: number;
  filled: readonly SlotId[];
};

type Question = Record<string, unknown>;

/** Body of the one request. Exported so tests and the eval script see exactly what is sent. */
export function buildJevRequest(input: JevInput): { model: string; state: Record<string, unknown>; questions: Record<string, Question> } {
  const slots = input.filled.filter((slot) => modelAllowsNude(input.model) || !isNudeSlot(slot));
  const photos: Record<string, string> = {};
  for (const slot of slots) photos[slotKey(slot)] = slotMeaning(slot, input.gender);

  // The questions speak about the profile's person: his or her, not always "her".
  const male = input.gender === "male";
  const poss = male ? "his" : "her";
  const obj = male ? "him" : "her";
  const subj = male ? "he" : "she";
  const questions: Record<string, Question> = {};
  for (const slot of slots) {
    if (slot === "marks") {
      questions.use_marks = {
        type: "noul",
        instructions:
          "Will a good part of the person's bare skin (arms, shoulders, chest, back or legs) be visible in the picture described in `request`? Skin covered by long sleeves, trousers or a high collar does not count. The reference photo `reference_photos.marks` shows " + poss + " distinctive moles and tattoos, which matter whenever such skin is visible.",
        criteria: {
          true: "Bare arms, shoulders, chest, back or legs are visible: a bikini, swimsuit, lingerie, shorts, a short skirt, a tank top, a sleeveless or short-sleeved top, or nudity.",
          false: "The person is covered up, only the face is shown, or there is no person.",
        },
      };
      continue;
    }
    questions[`use_${slotKey(slot)}`] = {
      type: "noul",
      instructions: `The reference photo \`reference_photos.${slotKey(slot)}\` shows: ${photos[slotKey(slot)]} The picture to create is described in \`request\`. Judge only that picture. Will the picture show this part of the person, at least partly, from this side (or with this expression), so that this reference photo helps to keep ${obj} consistent?`,
      criteria: {
        true: "The described picture shows this part of the person, even partly, from this side or with this expression.",
        false: "This part is not visible in the picture, or the picture shows it from another side.",
      },
    };
  }
  questions.viewpoint = {
    type: "choice",
    instructions:
      "From which side is the person seen in the picture described in `request`? Ignore `reference_photos`: they are what we have on file, not what the picture shows. Use the viewpoint the request states. A person lying down or looking back at the camera is still seen from the front unless the request says " + subj + " is seen from behind.",
    criteria: {
      front: "The person faces the camera or is seen from the front, or the request names no viewpoint.",
      back: "The person is seen from behind: back view, rear view, walking away, back to the camera.",
      side: "The person is seen from the side, in profile.",
      closeup: "A close-up of one body part or of the face, not the whole person.",
      none: "No person is in the picture at all (an object, an animal, a landscape, text).",
    },
  };
  questions.person = {
    type: "noul",
    instructions:
      "Does the picture described in `request` show a person (a human body or face)? Judge only the request. Ignore `reference_photos`: they are what we have on file about " + obj + ", not what the picture shows.",
    criteria: {
      true: "A person is in the picture: a face, a body, or a body part such as hands.",
      false: "Only objects, animals, scenery, food, products or text are in the picture. The request says there are no people.",
    },
  };
  questions.nudity = {
    type: "noul",
    instructions:
      "Does the picture described in `request` explicitly show a topless, nude or naked person, with bare breasts or bare buttocks visible? Underwear, lingerie, a bikini or a swimsuit are not nudity.",
    criteria: {
      true: "The request asks for a topless, nude or naked person.",
      false: "The person is clothed, in underwear, in lingerie or in swimwear, or no person is shown.",
    },
  };

  return {
    model: JEV_MODEL,
    state: {
      request: input.prompt,
      image_model: input.model,
      subject: input.gender === "female" ? "an adult woman" : "an adult man",
      source_pictures: input.sourceCount,
      reference_photos: photos,
    },
    questions,
  };
}

export type JevAnswers = {
  /** Probability per filled slot that its part and view will be visible. */
  slots: Partial<Record<SlotId, number>>;
  nudity: number;
  /** Probability that a person is in the picture. */
  person: number;
  viewpoint: { choice: JevView; probabilities: Partial<Record<JevView, number>> };
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads the answers; throws when the response is not the shape we asked for. */
export function parseJevResponse(body: unknown, requested: readonly SlotId[]): JevAnswers {
  const answers = (body as { answers?: Record<string, Record<string, unknown>> } | null)?.answers;
  if (!answers || typeof answers !== "object") throw new Error("Jev answered without answers");
  const slots: Partial<Record<SlotId, number>> = {};
  for (const slot of requested) {
    const value = num(answers[`use_${slotKey(slot)}`]?.noul);
    if (value === null) throw new Error(`Jev gave no answer for ${slot}`);
    slots[slot] = value;
  }
  const nudity = num(answers.nudity?.noul);
  if (nudity === null) throw new Error("Jev gave no answer for nudity");
  const person = num(answers.person?.noul);
  if (person === null) throw new Error("Jev gave no answer for person");
  const view = answers.viewpoint as { choice?: unknown; probabilities?: Record<string, unknown> } | undefined;
  const choice = typeof view?.choice === "string" ? (view.choice as JevView) : null;
  if (!choice || !view?.probabilities) throw new Error("Jev gave no viewpoint");
  const probabilities: Partial<Record<JevView, number>> = {};
  for (const key of ["front", "back", "side", "closeup", "none"] as const) {
    const value = num(view.probabilities[key]);
    if (value !== null) probabilities[key] = value;
  }
  return { slots, nudity, person, viewpoint: { choice, probabilities } };
}

export type JevClientOptions = {
  apiKey: string;
  baseUrl?: string;
  /** Model id sent to the provider. */
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** One request. No retries: the latency budget is short and the keyword rules are the fallback. */
export async function askJev(input: JevInput, options: JevClientOptions): Promise<JevAnswers> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = { ...buildJevRequest(input), model: options.model ?? JEV_MODEL };
  const requested = input.filled.filter((slot) => modelAllowsNude(input.model) || !isNudeSlot(slot));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? JEV_TIMEOUT_MS);
  try {
    const response = await fetchImpl(systemOneUrl(options.baseUrl ?? OPENLUX_BASE_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Jev answered HTTP ${response.status}`);
    return parseJevResponse(await response.json(), requested);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Jev timed out after ${options.timeoutMs ?? JEV_TIMEOUT_MS} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type JevPolicy = {
  /** A slot is wanted when its probability reaches this. */
  slotThreshold: number;
  /** Explicit nudity: at or above this the nude slots stand in for the clothed ones. */
  nudityThreshold: number;
  /** "No person in the picture" when the person Noul is below this, or the viewpoint Choice says `none` at this level. */
  personThreshold: number;
  noViewpointThreshold: number;
};

export const DEFAULT_JEV_POLICY: JevPolicy = { slotThreshold: 0.5, nudityThreshold: 0.5, personThreshold: 0.35, noViewpointThreshold: 0.6 };

export type JevCues = {
  /** Wanted slots, best first. The faces are not listed: the ranking puts them first by itself. */
  cues: SlotId[];
  /** The picture has no person: no reference photos at all. */
  noPerson: boolean;
  /** Final per-slot numbers (after the viewpoint check) plus `nudity`, for debugging. */
  scores: Record<string, number | string>;
};

/**
 * Turns Jev's answers into the list of wanted slots. Policy lives here, not in the model:
 * - the viewpoint Choice scales front / side / back photos, so a back view and a front photo are never both strong;
 * - nude slots only when the model may get them AND nudity is likely; then they replace the clothed ones;
 * - face-front and the 3/4 faces are the ranking's job (always first when a person is in frame).
 */
export function jevCues(
  answers: JevAnswers,
  context: { model: ModelId; filled: readonly SlotId[] },
  policy: JevPolicy = DEFAULT_JEV_POLICY,
): JevCues {
  const view = answers.viewpoint.probabilities;
  const noPerson = answers.person < policy.personThreshold || (view.none ?? 0) >= policy.noViewpointThreshold;
  const nude = modelAllowsNude(context.model) && answers.nudity >= policy.nudityThreshold;
  const scores: Record<string, number | string> = {
    person: round(answers.person),
    nudity: round(answers.nudity),
    viewpoint: answers.viewpoint.choice,
  };
  const weighted: Array<{ slot: SlotId; p: number }> = [];
  for (const slot of context.filled) {
    const raw = answers.slots[slot];
    if (raw === undefined) continue;
    let p = raw;
    const shows = SLOT_VIEW[slot];
    const chosen = answers.viewpoint.choice;
    if (shows && (chosen === "front" || chosen === "back" || chosen === "side") && slot !== "face-profile") {
      // Consistency across front / side / back photos: a photo of the wrong side is scaled down by how unlikely
      // its viewpoint is (full weight from 0.5 up).
      p = raw * Math.min(1, (view[shows] ?? 0) / 0.5);
    }
    if (isNudeSlot(slot) && !nude) p = 0;
    scores[slot] = round(p);
    weighted.push({ slot, p });
  }
  let cues = weighted
    .filter((item) => item.p >= policy.slotThreshold)
    .sort((a, b) => b.p - a.p)
    .map((item) => item.slot);
  if (nude) {
    // The nude slot takes the clothed one's place.
    const replaced = new Set<SlotId>();
    if (cues.includes("chest-nude")) replaced.add("chest");
    if (cues.includes("buttocks-nude")) replaced.add("buttocks");
    cues = cues.filter((slot) => !replaced.has(slot));
  }
  return { cues, noPerson, scores };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}


export type JevAttempt = {
  provider: string;
  baseUrl: string;
  model: string;
  /** Reads the key when the attempt starts (Env Catalog). May throw: that attempt is skipped. */
  apiKey: () => Promise<string>;
  /** Name for error messages when the key is missing. */
  keyName: string;
};

export type JevRun =
  | { ok: true; answers: JevAnswers; provider: string; ms: number }
  | { ok: false; errors: string[] };

/**
 * Tries the endpoints in order (OpenLux, then TypeSafe direct). The first answer wins. Errors never include a key.
 * `ask` is injectable so tests need no network.
 */
export async function runJevAttempts(
  input: JevInput,
  attempts: readonly JevAttempt[],
  timeoutMs: number = JEV_TIMEOUT_MS,
  ask: typeof askJev = askJev,
): Promise<JevRun> {
  const errors: string[] = [];
  for (const attempt of attempts) {
    let apiKey = "";
    try {
      apiKey = (await attempt.apiKey()).trim();
    } catch {
      apiKey = "";
    }
    if (!apiKey) {
      errors.push(`${attempt.provider}: no key (${attempt.keyName})`);
      continue;
    }
    const started = Date.now();
    try {
      const answers = await ask(input, { apiKey, baseUrl: attempt.baseUrl, model: attempt.model, timeoutMs });
      return { ok: true, answers, provider: attempt.provider, ms: Date.now() - started };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.provider}: ${text.split(apiKey).join("***")}`);
    }
  }
  return { ok: false, errors };
}

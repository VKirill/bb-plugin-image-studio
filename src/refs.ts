import type { GatewayId, ModelId } from "./models.js";
import { CLOTHED_COUNTERPART, SLOT_IDS, isFaceSlot, isNudeSlot, modelAllowsNude, parseSlotId, sortSlots, type SlotId } from "./slots.ts";

/**
 * Most images one edit request takes (source pictures + references).
 * Sources:
 * - kie.ai: docs.kie.ai `maxItems` of the model's image field. nano-banana-2 10, nano-banana-2-1 10, nano-banana-pro 8,
 *   seedream/5-pro 10, flux-2/pro 8, grok-imagine 5 (1-5), gpt-image-2-5 16, qwen2-1 10.
 * - fal.ai: fal model pages. muse-image 10 ("between 1 and 10"), seedream v5 pro 10, grok-imagine 5.
 *   The fal pages for Nano Banana (2, 2.1), FLUX.2 and GPT Image state no cap: Nano Banana uses Google's 14,
 *   FLUX.2 uses 8 like kie, GPT Image uses 16 like kie.
 * - Wan 2.7: kie `input_urls` max 9 (docs.kie.ai/market/wan/2-7-image); fal edit `image_urls` 1-4 (fal.ai/models/fal-ai/wan/v2.7/edit).
 * - xAI docs: "Use up to five source images for a single image edit."
 * Qwen docs add: keep references to four or fewer when fidelity matters, so Qwen sends only relevant ones in auto.
 */
export const REF_LIMITS: Record<ModelId, Record<GatewayId, number>> = {
  "nano-banana-2": { kie: 10, fal: 14 },
  "nano-banana-2.1": { kie: 10, fal: 14 },
  "nano-banana-pro": { kie: 8, fal: 14 },
  "muse-image": { kie: 10, fal: 10 },
  "gpt-image-2.5-flare": { kie: 16, fal: 16 },
  "gpt-image-2.5-sunburst": { kie: 16, fal: 16 },
  "flux-2-pro": { kie: 8, fal: 8 },
  "seedream-5": { kie: 10, fal: 10 },
  "grok-imagine": { kie: 5, fal: 5 },
  "qwen-image-2.1": { kie: 10, fal: 10 },
  "wan-2.7": { kie: 9, fal: 4 },
};

export function refLimit(model: ModelId, gateway: GatewayId): number {
  return REF_LIMITS[model][gateway];
}

export type RefsMode = { kind: "auto" } | { kind: "all" } | { kind: "list"; slots: SlotId[] };

export type RefsParse = { ok: true; mode: RefsMode } | { ok: false; error: string };

/** `auto` (default), `all`, or a comma/space separated list of slot ids (old selfie-0..2 / manicure work too). */
export function parseRefsOption(raw: string | undefined | null): RefsParse {
  const text = (raw ?? "").trim().toLowerCase();
  if (text === "" || text === "auto") return { ok: true, mode: { kind: "auto" } };
  if (text === "all") return { ok: true, mode: { kind: "all" } };
  const slots: SlotId[] = [];
  const unknown: string[] = [];
  for (const part of text.split(/[\s,]+/)) {
    if (part === "") continue;
    const id = parseSlotId(part);
    if (!id) unknown.push(part);
    else if (!slots.includes(id)) slots.push(id);
  }
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown reference slot${unknown.length > 1 ? "s" : ""} "${unknown.join(", ")}". Use auto, all, or a list of: ${SLOT_IDS.join(", ")}.`,
    };
  }
  if (slots.length === 0) return { ok: true, mode: { kind: "auto" } };
  return { ok: true, mode: { kind: "list", slots } };
}

// Words that say which reference slots a prompt needs.
// English words end at a word boundary; Russian words are stems (prefix match).
const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{N}])";
const NOT_LETTER_AFTER = "(?![\\p{L}\\p{N}])";

function en(words: string): RegExp {
  return new RegExp(`${NOT_LETTER_BEFORE}(?:${words})${NOT_LETTER_AFTER}`, "iu");
}
function ru(stems: string): RegExp {
  return new RegExp(`${NOT_LETTER_BEFORE}(?:${stems})`, "iu");
}

// A back view needs an explicit rear-view phrase. Words that merely mention behind/back ("behind her head",
// "arm behind her back", "behind the bar", "lying back") and clothing ("thong") never mean one.
const BACK_EXPLICIT = [
  en("from behind|from the back|back view|rear view|view from (?:the )?(?:back|behind)|back to (?:the )?camera|walking away"),
  ru("сзади|со спины|вид сзади"),
];
// Ambiguous: "over her shoulder", "the camera behind her". Counted as a back view only when no front cue says otherwise.
const BACK_AMBIGUOUS = [
  en(
    "over (?:her|his|the) shoulder|(?:camera|shot|view|photographed|taken)[^.;]{0,20}behind (?:her|him|them)(?!\\s+(?:head|back|neck|ears?|shoulders?|hair|body))",
  ),
];
const FRONT_CUES = [
  en(
    "facing (?:the )?(?:camera|lens|viewer)|front[- ]facing|from the front|front view|(?:looking|look|looks|gazing|gaze|staring|stare)(?: straight| directly)? (?:at|into) (?:the |her |his )?(?:lens|camera|viewer)|at the lens|topless|breasts?|from the waist up|waist[- ]up|lying back",
  ),
  ru("в камеру|на камеру|анфас|спереди|топлес"),
];
// Words about the rear itself: they bring the buttocks slot, not a back view of the whole body.
const BUTTOCK_WORDS = [en("backside|booty|buttocks?|butt|glutes?"), ru("ягодиц|попк"), en("попа|попу|попы")];
const SIDE_CUES = [en("side view|from the side|sideways|side[- ]on|side profile|profile view|in profile")];
const FACE_PROFILE_CUES = [
  en("side profile|profile view|profile shot|in profile|from the side|side view|sideways|facing sideways|looking sideways"),
  ru("в профиль|сбоку"),
];
const SMILE_CUES = [
  en("smil(?:e|es|ed|ing)|laugh(?:s|ed|ing|ter)?|grin(?:s|ned|ning)?|giggl(?:e|es|ed|ing)|chuckl(?:e|es|ed|ing)|beaming"),
  ru("улыб|смея|смеёт|смеет|смех|хохо"),
];
const STRONG_BODY_CUES = [
  en("full[- ]?body|full[- ]?length|whole body|head[- ]to[- ]toe|from behind|back view|rear view|side view|from the side"),
  ru("в полный рост|полный рост|во весь рост|со спины|сзади"),
];
const BODY_CUES = [
  ...STRONG_BODY_CUES,
  en(
    "standing|stands?|walking|walks?|full shot|wide shot|long shot|swimsuit|swimwear|bikini|lingerie|underwear|bodysuit|beach|pool|poolside|sauna|yoga|gym|workout|fitness|dancing|running|jogging|shorts|towel|sitting|lying|kneeling|crouching|leaning|bending|jumping|naked|nude|topless|shirtless",
  ),
  ru("стои|идёт|идет|идти|купальник|бикини|бельё|белье|пляж|бассейн|сауна|йога|спортзал|тренировк|танц|лежит|сидит|обнаж"),
  en("бег|бежит"),
  ...BACK_EXPLICIT,
  ...BACK_AMBIGUOUS,
  ...BUTTOCK_WORDS,
];
const CLOSE_UP_ONLY_CUES = [
  en("headshots?|close[- ]?up portrait|close[- ]?up of (?:her|his|the) face|face close[- ]?up|extreme close[- ]?up|beauty shot|passport photo"),
];

const HANDS_CUES = [
  en(
    "hands?|fingers?|fingernails?|nails?|manicures?|holding|holds?|gripping|cups?|mugs?|phone|smartphone|selfie|glass|bottle|wine|coffee|tea|pointing|touching|rings?|bracelets?|watch|typing|writing|waving|open palms?|palms? (?:up|down)|fists?|gestur(?:e|es|ing)",
  ),
  ru("ладон|пальц|палец|ногт|маникюр|держ|кружк|чашк|телефон|бокал"),
  en("рук|руки|руку|рукой|руками|руках"),
];
const LEGS_CUES = [
  en(
    "legs?|thighs?|heels?|stockings?|tights|pantyhose|skirts?|miniskirt|shorts|knees?|ankles?|calves|calf|barefoot|sandals|boots?|shoes?|sneakers|feet|foot|mini dress|leggings|jeans|pants|trousers",
  ),
  ru("ног(?!т)|ножк|каблук|юбк|чулк|колгот|бедр|шорт|джинс|леггинс"),
];
const CHEST_CUES = [
  en(
    "cleavage|neckline|d[ée]collet[ée]|d[ée]colletage|bust|breasts?|boobs?|chest|topless|bra|bralette|bikini|lingerie|swimsuit|swimwear|low[- ]cut|plunging|strapless|corset|nude|naked|shirtless",
  ),
  ru("декольте|груд|бюст|топлес|лифчик|бюстгальтер|бикини|купальник|бельё|белье|обнаж"),
];
const WAIST_CUES = [
  en(
    "belly|abs|stomach|navel|waist|midriff|crop top|tummy|six[- ]?pack|bikini|swimsuit|swimwear|lingerie|bodysuit|topless|nude|naked|shirtless",
  ),
  ru("живот|пресс|талия|талии|талию|пупок|пупк|кроп|бикини|купальник|обнаж"),
];
const HAIR_BACK_CUES = [
  en(
    "ponytail|braids?|pigtails?|bun|updo|hair (?:down|flowing|falling) (?:her|the) back|back of (?:her|his|the) (?:head|hair)|from behind|back view|rear view|back to (?:the )?camera|walking away|over (?:her|his|the) shoulder",
  ),
  ru("хвост|кос[аыу]|пучок|затылок|со спины|сзади"),
];
const NUDE_CUES = [
  en("topless|nude|naked|nsfw|explicit|undressed|unclothed|no clothes|bare[- ](?:breasts?|chest|bust|butt|buttocks|back)|nipples?|bottomless"),
  ru("топлес|голая|голый|голые|обнажённ|обнажен|без одежды|раздет|ню(?![\\p{L}])|эротик"),
];
// Arms, shoulders or other bare skin likely in frame: identity marks (a tattoo, moles) can show.
const SKIN_CUES = [
  en("tank top|tank|sleeveless|strapless|halter|camisole|spaghetti straps?|off[- ]the[- ]shoulder|bare (?:arms?|shoulders?)|shoulders?|arms?|t-?shirt|short sleeves?|singlet|backless|swim ?suit"),
  ru("майк|без рукав|плеч|руки|рука|рукой|руками"),
];
const MARK_CUES = [en("tattoos?|tats?|moles?|birthmarks?|freckles?|scars?|beauty marks?"), ru("татуир|родинк|родимое|веснушк|шрам")];

function any(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Reference slots the prompt asks for, in priority order. The front face and the 3/4 faces are not listed:
 * auto always sends them. Pure and keyword-based on purpose.
 */
export function cueSlots(prompt: string, model?: ModelId): SlotId[] {
  const text = prompt.normalize("NFC");
  const out: SlotId[] = [];
  const add = (slot: SlotId) => {
    if (!out.includes(slot)) out.push(slot);
  };

  if (any(text, FACE_PROFILE_CUES)) add("face-profile");
  if (any(text, SMILE_CUES)) add("face-smile");

  const front = any(text, FRONT_CUES);
  const back = any(text, BACK_EXPLICIT) || (any(text, BACK_AMBIGUOUS) && !front);
  const side = any(text, SIDE_CUES);
  const closeUpOnly = any(text, CLOSE_UP_ONLY_CUES) && !any(text, STRONG_BODY_CUES);
  const body = any(text, BODY_CUES) && !closeUpOnly;
  if (body) {
    if (back) add("body-back");
    if (side) add("body-side");
    add("body-front");
    add("body-side");
    add("body-back");
  }

  const hands = any(text, HANDS_CUES);
  const chest = any(text, CHEST_CUES);
  const waist = any(text, WAIST_CUES);
  const legs = any(text, LEGS_CUES);
  const buttocks = back || any(text, BUTTOCK_WORDS);
  const hairBack = any(text, HAIR_BACK_CUES);
  if (hands) add("hands");
  if (chest) add("chest");
  if (waist) add("waist");
  if (legs) add("legs");
  if (buttocks) add("buttocks");
  if (hairBack) add("hair-back");
  // Marks: whenever bare skin is likely in the frame, or the prompt names them.
  if (any(text, MARK_CUES) || any(text, SKIN_CUES) || body || chest || waist || legs || buttocks) add("marks");

  // Bare-skin slots exist for Qwen and Wan only. When the prompt is topless / nude / explicit and the model is one of
  // them, the nude slot goes first and stands in for the clothed one. Any other model never hears about them.
  if (modelAllowsNude(model) && any(text, NUDE_CUES)) {
    if (out.includes("chest")) out.splice(out.indexOf("chest"), 0, "chest-nude");
    else out.push("chest-nude");
    if (out.includes("buttocks")) out.splice(out.indexOf("buttocks"), 0, "buttocks-nude");
  }
  return out;
}

/**
 * Qwen Image 2.1 pastes several copies of the person into one frame (clones, contact-sheet grids) when it gets
 * many reference photos; kie advises four or fewer. In generate mode it gets at most 4 images, source pictures included.
 * (Sheet builds use their own cap of 3, see sheetRefCap.) Wan 2.7 handled 9 references cleanly in a live batch, so it keeps its cap.
 */
export const QWEN_GENERATE_CAP = 4;

/**
 * Priority order for `auto`. Bare skin is likely in frame when the prompt brought `marks` (lingerie, swimwear,
 * nude, full body, tank top...): then the identity marks (a tattoo, moles) rank right after the two main face photos,
 * above the other face angles and the secondary body views.
 * Qwen: front face, one 3/4 face, the single most relevant body photo (the nude slot when the prompt is nude), marks.
 */
function autoRanking(cues: readonly SlotId[], filled: ReadonlySet<SlotId>, qwen: boolean): SlotId[] {
  const skin = cues.includes("marks");
  const rest = cues.filter((slot) => slot !== "marks");
  if (!qwen) return ["face-front", "face-34-left", ...(skin ? (["marks"] as SlotId[]) : []), "face-34-right", ...rest];
  const others = rest.filter((slot) => !isFaceSlot(slot));
  const nudes = others.filter((slot) => isNudeSlot(slot) && filled.has(slot));
  let primary: SlotId | undefined;
  if (nudes.length > 0) {
    const back = cues.indexOf("body-back");
    const front = cues.indexOf("body-front");
    const fromBehind = back !== -1 && (front === -1 || back < front);
    primary = fromBehind && nudes.includes("buttocks-nude") ? "buttocks-nude" : nudes[0];
  } else {
    primary = others.find((slot) => filled.has(slot));
  }
  const threeQuarter: SlotId = filled.has("face-34-left") ? "face-34-left" : "face-34-right";
  return ["face-front", threeQuarter, ...(primary ? [primary] : []), ...(skin ? (["marks"] as SlotId[]) : [])];
}

export type RefsSelection = {
  /** Slots to send, in canonical order (this is the image order). */
  used: SlotId[];
  /** Wanted but not sent: over the model's cap, or listed by hand and not filled. */
  dropped: SlotId[];
  /** Listed by hand but never sendable to this model (the nude slots on any model but Qwen and Wan). */
  rejected: SlotId[];
};

/**
 * Picks which filled slots go to the model.
 * Priority when the cap bites: face-front, the 3/4 faces, profile/smile, framing-relevant body,
 * keyword details, then the rest (only for `all`). `budget` is the model's image cap minus source pictures.
 */
export function selectRefs(input: {
  prompt: string;
  filled: readonly SlotId[];
  mode: RefsMode;
  budget: number;
  /** The model that will receive the photos. Only Qwen Image 2.1 and Wan 2.7 may get the nude slots. */
  model?: ModelId;
  /** Wanted slots, best first, chosen by Jev. Replaces the keyword rules for `auto` and `all`. */
  cues?: readonly SlotId[];
  /** Jev says the picture has no person: nothing is sent in `auto` and `all`. */
  noPerson?: boolean;
}): RefsSelection {
  const qwen = input.model === "qwen-image-2.1";
  const nudeOk = modelAllowsNude(input.model);
  const filled = new Set(input.filled);
  let ranked: SlotId[];
  if (input.mode.kind === "list") {
    ranked = input.mode.slots;
  } else {
    if (input.noPerson) return { used: [], dropped: [], rejected: [] };
    const cues = input.cues ? [...input.cues] : cueSlots(input.prompt, input.model);
    ranked = autoRanking(cues, filled, qwen);
    if (input.mode.kind === "all") ranked = [...ranked, ...SLOT_IDS];
  }
  const seen = new Set<SlotId>();
  const unique = ranked.filter((slot) => (seen.has(slot) ? false : (seen.add(slot), true)));
  // Hard rule: the nude slots go to Qwen and Wan only, in every mode. Elsewhere they are removed before anything else.
  const rejected = nudeOk || input.mode.kind !== "list" ? [] : unique.filter(isNudeSlot);
  const allowed = nudeOk ? unique : unique.filter((slot) => !isNudeSlot(slot));
  let wanted = allowed.filter((slot) => filled.has(slot));
  // A nude slot that is filled replaces its clothed counterpart (auto only: `all` and a hand-written list send what they name).
  if (input.mode.kind === "auto") {
    const replaced = new Set(wanted.filter((slot) => CLOTHED_COUNTERPART[slot]).map((slot) => CLOTHED_COUNTERPART[slot]!));
    wanted = wanted.filter((slot) => !replaced.has(slot));
  }
  const budget = Math.max(0, input.budget);
  const used = wanted.slice(0, budget);
  const dropped = wanted.slice(budget);
  if (input.mode.kind === "list") {
    dropped.push(...allowed.filter((slot) => !filled.has(slot)));
  }
  return { used: sortSlots(used), dropped: sortSlots(dropped), rejected: sortSlots(rejected) };
}

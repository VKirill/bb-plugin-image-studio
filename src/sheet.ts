import { modelEnabled, parseModel, type EnabledModels, type ModelId } from "./models.ts";
import { BODY_SLOTS, FACE_SLOTS, SLOT_IDS, isFaceSlot, isNudeSlot, modelAllowsNude, slotGroup, sortSlots, type Gender, type SlotId } from "./slots.ts";

/**
 * "Build the sheet": generate the missing reference slots through Image Studio's own pipeline.
 * `marks` is never generated: moles, tattoos and birthmarks must come from a real photo.
 */
export const SHEET_SLOTS: readonly SlotId[] = SLOT_IDS.filter((id) => id !== "marks");

export function isSheetSlot(id: SlotId): boolean {
  return SHEET_SLOTS.includes(id);
}

/**
 * What `sheet` and Build sheet make when no slots are named. The nude slots (Qwen and Wan only) are not in it:
 * they are built only when asked for by name (`--slots chest-nude`) or with their own Generate button.
 */
export const DEFAULT_SHEET_SLOTS: readonly SlotId[] = SHEET_SLOTS.filter((id) => !isNudeSlot(id));

/** Slots shot in underwear or showing the bust/buttocks: they go through Qwen Image 2.1 (kie), which does not filter. */
const SENSITIVE_SLOTS: ReadonlySet<SlotId> = new Set<SlotId>([...BODY_SLOTS, "chest", "chest-nude", "buttocks", "buttocks-nude"]);

export function isSensitiveSlot(id: SlotId): boolean {
  return SENSITIVE_SLOTS.has(id);
}

export const SHEET_ASPECT = "3:4";
export const SHEET_RESOLUTION = "2K";

export type SheetModelChoice = { ok: true; model: ModelId } | { ok: false; error: string };

/**
 * Sensitive slots → qwen-image-2.1. Others → Nano Banana Pro if enabled, else Nano Banana 2.1, else Nano Banana 2.
 * `override` (a model id or alias) wins for every slot.
 */
export function sheetModelFor(slot: SlotId, enabled: EnabledModels, override?: string): SheetModelChoice {
  if (override && override.trim() !== "") {
    const parsed = parseModel(override);
    if (!parsed) return { ok: false, error: `Unknown model "${override}".` };
    if (isNudeSlot(slot) && !modelAllowsNude(parsed)) {
      return { ok: false, error: `Slot ${slot} is bare skin and is built with Qwen Image 2.1 or Wan 2.7 only (not ${parsed}).` };
    }
    if (!modelEnabled(parsed, enabled)) return { ok: false, error: `Model ${parsed} is turned off in Image Studio settings.` };
    return { ok: true, model: parsed };
  }
  if (isSensitiveSlot(slot)) {
    if (!modelEnabled("qwen-image-2.1", enabled)) {
      return {
        ok: false,
        error: `Slot ${slot} is built with Qwen Image 2.1 (kie.ai). Turn Qwen Image 2.1 on in Image Studio settings.`,
      };
    }
    return { ok: true, model: "qwen-image-2.1" };
  }
  if (modelEnabled("nano-banana-pro", enabled)) return { ok: true, model: "nano-banana-pro" };
  if (modelEnabled("nano-banana-2.1", enabled)) return { ok: true, model: "nano-banana-2.1" };
  if (modelEnabled("nano-banana-2", enabled)) return { ok: true, model: "nano-banana-2" };
  return { ok: false, error: `Slot ${slot} is built with Nano Banana. Turn Nano Banana 2.1, 2 or Pro on in Image Studio settings.` };
}

/** Wraps a route error so the owner sees which slot needs which key. */
export function sheetRouteError(slot: SlotId, model: ModelId, error: string): string {
  if (model === "qwen-image-2.1") return `Slot ${slot} needs Qwen Image 2.1 on kie.ai. ${error}`;
  return `Slot ${slot} (${model}): ${error}`;
}

const STUDIO =
  "plain light-grey studio backdrop, soft even light, sharp focus, natural skin texture, realistic photograph, no text";

function outfit(gender: Gender): string {
  return gender === "female"
    ? "a plain form-fitting black bodysuit"
    : "plain fitted black boxer-brief style shorts and a bare torso";
}

export type SheetFigure = {
  bodyType?: string;
  bust?: string;
  heightCm?: number;
  weightKg?: number;
  age?: number;
};

const BUST_WORDS: Record<string, string> = {
  A: "small",
  B: "modest",
  C: "medium",
  D: "full",
  E: "very full",
};

const BUILD_WORDS: Record<string, string> = {
  slim: "slim",
  athletic: "athletic and toned",
  average: "average",
  curvy: "curvy hourglass, narrow waist, wide hips",
  hourglass: "hourglass, narrow waist, wide hips",
  pear: "pear-shaped, narrow shoulders, wide hips",
  apple: "apple-shaped, fuller midsection",
  rectangle: "straight rectangular, little waist definition",
};

/**
 * The profile's figure, stated in plain words inside the slot prompt. Some models (Qwen) ignore the identity line
 * the plugin prepends, so the body and detail prompts repeat it. `numbers: false` leaves out height, weight and age:
 * Qwen weighs "62 kg" against "curvy, full D-cup" and pulls the figure slim.
 */
export function figureLine(gender: Gender, figure?: SheetFigure, options: { numbers?: boolean } = {}): string {
  if (!figure) return "";
  const parts: string[] = [];
  if (figure.bodyType && figure.bodyType.trim() !== "") {
    const type = figure.bodyType.trim();
    parts.push(`${BUILD_WORDS[type] ?? type} build`);
  }
  if (gender === "female" && figure.bust && figure.bust.trim() !== "") {
    const cup = figure.bust.trim().charAt(0).toUpperCase();
    const word = BUST_WORDS[cup];
    parts.push(word ? `${word} ${cup}-cup bust` : `bust ${figure.bust.trim()}`);
  }
  if (options.numbers !== false) {
    if (figure.heightCm) parts.push(`${figure.heightCm} cm tall`);
    if (figure.weightKg) parts.push(`${figure.weightKg} kg`);
    if (figure.age) parts.push(`${figure.age} years old`);
  }
  if (parts.length === 0) return "";
  return `${gender === "female" ? "Her" : "His"} figure, shown accurately: ${parts.join(", ")}.`;
}

/** Said in every sheet prompt. Positive and short on purpose: naming "collage" or "grid" to a model with a prompt enhancer primes it. */
export const SINGLE_FRAME = "A single full-frame photograph of her alone.";

const FIGURE_SLOTS: ReadonlySet<SlotId> = new Set<SlotId>(["body-front", "body-side", "body-back", "chest", "chest-nude", "waist", "legs", "buttocks", "buttocks-nude"]);

/** English prompt for one slot. The plugin adds the identity line and the reference lines on top. */
export function sheetPrompt(slot: SlotId, gender: Gender, figure?: SheetFigure, model?: ModelId): string {
  const core = sheetCore(slot, gender);
  if (core === "") return "";
  const figureText = FIGURE_SLOTS.has(slot) ? figureLine(gender, figure, { numbers: model !== "qwen-image-2.1" }) : "";
  const single = gender === "female" ? SINGLE_FRAME : SINGLE_FRAME.replace("her alone", "him alone");
  return [core, figureText, single].filter((part) => part !== "").join(" ");
}

function sheetCore(slot: SlotId, gender: Gender): string {
  const same = "Same person as in the reference photos: same face, same hair, same skin tone.";
  switch (slot) {
    case "face-front":
      return `Head-and-shoulders photograph, looking straight into the camera, neutral relaxed expression, mouth closed, ${STUDIO}. ${same}`;
    case "face-34-left":
      return `Head-and-shoulders photograph, head turned three-quarters toward the left of the frame, eyes toward the camera, neutral expression, ${STUDIO}. ${same}`;
    case "face-34-right":
      return `Head-and-shoulders photograph, head turned three-quarters toward the right of the frame, eyes toward the camera, neutral expression, ${STUDIO}. ${same}`;
    case "face-profile":
      return `Head-and-shoulders photograph in a pure side profile facing the left of the frame, neutral expression, ${STUDIO}. ${same}`;
    case "face-smile":
      return `Head-and-shoulders photograph, looking at the camera with a natural genuine smile, ${STUDIO}. ${same}`;
    case "body-front":
      return `Full-length standing photograph, head to toe in frame, facing the camera, arms relaxed slightly away from the body, bare feet, neutral expression, wearing ${outfit(gender)}, ${STUDIO}. ${same} The body matches the stated height, weight and build.`;
    case "body-side":
      return `Full-length standing photograph, head to toe in frame, body turned fully sideways to the camera, arms relaxed, bare feet, neutral expression, wearing ${outfit(gender)}, ${STUDIO}. ${same} Same body proportions as the front body photo.`;
    case "body-back":
      return `Full-length standing photograph, head to toe in frame, seen from directly behind, arms relaxed, bare feet, wearing ${outfit(gender)}, hair falling naturally, ${STUDIO}. ${same} Same body proportions as the front body photo.`;
    case "hands":
      return `Close-up photograph of both hands, relaxed, resting palms down on a plain light-grey surface, fingers slightly apart, every fingernail in focus, soft even light, natural skin texture, realistic photograph, no text. Same person, same skin tone.`;
    case "chest":
      return gender === "female"
        ? `Close-up photograph of the bust and décolleté from the front, framed from chin to ribcage, wearing a plain black lace bra, ${STUDIO}. Same person, same skin tone, same body proportions.`
        : `Close-up photograph of the chest from the front, framed from chin to navel, bare torso, ${STUDIO}. Same person, same skin tone, same body proportions.`;
    case "chest-nude":
      return gender === "female"
        ? `Close-up photograph of the bare bust from the front, topless, framed from the collarbones to the ribcage, natural skin, ${STUDIO}. Same person, same skin tone, same body proportions.`
        : `Close-up photograph of the bare chest from the front, framed from the collarbones to the navel, natural skin, ${STUDIO}. Same person, same skin tone, same body proportions.`;
    case "buttocks-nude":
      return `Photograph of a nude person seen from directly behind, bare hips and buttocks, framed from the waist to the upper thighs, natural skin, ${STUDIO}. Same person, same skin tone, same body proportions.`;
    case "waist":
      return `Close-up photograph of the waist and belly from the front, framed from under the bust to the hips, wearing a plain form-fitting black two-piece, ${STUDIO}. Same person, same skin tone, same body proportions.`;
    case "legs":
      return `Photograph of the legs from the hips to the bare feet, standing, seen from the front, wearing plain form-fitting black shorts, ${STUDIO}. Same person, same skin tone, same body proportions.`;
    case "buttocks":
      return `Photograph of the hips and buttocks seen from directly behind, framed from the waist to the upper thighs, wearing plain form-fitting black briefs, ${STUDIO}. Same person, same skin tone, same body proportions.`;
    case "hair-back":
      return `Photograph of the back of the head and shoulders seen from directly behind, hair worn down and falling naturally, ${STUDIO}. Same person, same hair length, color and style.`;
    case "marks":
      return "";
  }
}

/** Reference-count cap for a sheet shot. Qwen copies references into collages when it gets many; kie advises four or fewer. */
export function sheetRefCap(model: ModelId): number | undefined {
  return model === "qwen-image-2.1" ? 3 : undefined;
}

/**
 * Which filled slots go with a sheet shot, most important first.
 * Most models: every other face slot, then the front body shot for body and detail slots, so the figure stays
 * the same across the sheet. Qwen: face-front, plus one or two accepted body photos that match the shot
 * (body-front for the other body views, chest, waist and legs; body-back for the buttocks), never every face slot.
 */
export function sheetRefOrder(slot: SlotId, model?: ModelId): SlotId[] {
  if (model === "qwen-image-2.1") {
    const base: SlotId[] = slot === "face-front" ? ["face-34-left"] : ["face-front"];
    if (isFaceSlot(slot)) return base;
    if (slot === "body-front") return base;
    if (slot === "buttocks") return [...base, "body-back", "body-front"];
    // Bare-skin slots: proportions come from the body photo and the clothed close-up of the same part.
    if (slot === "chest-nude") return [...base, "body-front", "chest"];
    if (slot === "buttocks-nude") return [...base, "body-back", "buttocks"];
    return [...base, "body-front"];
  }
  const faces = FACE_SLOTS.filter((id) => id !== slot);
  if (isFaceSlot(slot)) return faces;
  return [...faces, ...(slot === "body-front" ? [] : (["body-front"] as SlotId[]))];
}

/** Slots a `sheet` run builds when none are named: every buildable slot with no photo. */
export function missingSheetSlots(filled: readonly SlotId[]): SlotId[] {
  const have = new Set(filled);
  return sortSlots(DEFAULT_SHEET_SLOTS.filter((id) => !have.has(id)));
}

export type SheetWave = { name: "face" | "body" | "details"; slots: SlotId[] };

/**
 * Build order for a `sheet` run: faces, then body, then details. Slots inside a wave run in parallel;
 * a wave starts when the previous one is done, so accepted photos of the earlier waves become its references.
 */
export function sheetWaves(slots: readonly SlotId[]): SheetWave[] {
  const ordered = sortSlots(slots);
  const waves: SheetWave[] = [
    { name: "face", slots: ordered.filter((slot) => slotGroup(slot) === "face") },
    { name: "body", slots: ordered.filter((slot) => slotGroup(slot) === "body") },
    { name: "details", slots: ordered.filter((slot) => slotGroup(slot) === "details") },
  ];
  return waves.filter((wave) => wave.slots.length > 0);
}

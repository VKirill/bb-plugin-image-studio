/**
 * Labeled reference slots of a person profile.
 * The reference sheet carries the face from several angles, the figure from several sides,
 * and close-ups of body parts, so every generation keeps the same face and body.
 */

export const FACE_SLOTS = ["face-front", "face-34-left", "face-34-right", "face-profile", "face-smile"] as const;
export const BODY_SLOTS = ["body-front", "body-side", "body-back"] as const;
export const DETAIL_SLOTS = ["hands", "chest", "chest-nude", "waist", "legs", "buttocks", "buttocks-nude", "marks", "hair-back"] as const;

export const SLOT_IDS = [...FACE_SLOTS, ...BODY_SLOTS, ...DETAIL_SLOTS] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export type FaceSlot = (typeof FACE_SLOTS)[number];
export type BodySlot = (typeof BODY_SLOTS)[number];
export type DetailSlot = (typeof DETAIL_SLOTS)[number];
export type SlotGroup = "face" | "body" | "details";

export const SLOT_GROUPS: Record<SlotGroup, readonly SlotId[]> = {
  face: FACE_SLOTS,
  body: BODY_SLOTS,
  details: DETAIL_SLOTS,
};

/** Old RPC slot names and the slot each one became. */
export const LEGACY_SLOT_ALIASES: Record<string, SlotId> = {
  "selfie-0": "face-front",
  "selfie-1": "face-34-left",
  "selfie-2": "face-34-right",
  manicure: "hands",
};

/** Legacy `photos[].slot` 0/1/2 → new slot. */
export const LEGACY_SELFIE_SLOTS: readonly SlotId[] = ["face-front", "face-34-left", "face-34-right"];

/**
 * Slots with bare skin. They are sent ONLY to Qwen Image 2.1 (the default for 18+) and Wan 2.7 (the allowed
 * fallback when Qwen fails or the user names Wan), never to any other model: Nano Banana, Muse, GPT Image,
 * FLUX, Seedream and Grok would refuse or flag the whole request.
 */
export const NUDE_SLOTS: readonly SlotId[] = ["chest-nude", "buttocks-nude"];

export function isNudeSlot(id: SlotId): boolean {
  return NUDE_SLOTS.includes(id);
}

/** The only models that may receive the nude slots. */
export const NUDE_MODELS: readonly string[] = ["qwen-image-2.1", "wan-2.7"];

export function modelAllowsNude(model: string | undefined): boolean {
  return model !== undefined && NUDE_MODELS.includes(model);
}

/** The clothed slot a nude slot stands in for. */
export const CLOTHED_COUNTERPART: Partial<Record<SlotId, SlotId>> = {
  "chest-nude": "chest",
  "buttocks-nude": "buttocks",
};

export function isSlotId(value: string): value is SlotId {
  return (SLOT_IDS as readonly string[]).includes(value);
}

/** Accepts new slot ids and the old selfie-0..2 / manicure names. */
export function parseSlotId(value: string | undefined | null): SlotId | null {
  if (!value) return null;
  const id = value.trim().toLowerCase();
  if (isSlotId(id)) return id;
  return LEGACY_SLOT_ALIASES[id] ?? null;
}

export function slotGroup(id: SlotId): SlotGroup {
  if ((FACE_SLOTS as readonly string[]).includes(id)) return "face";
  if ((BODY_SLOTS as readonly string[]).includes(id)) return "body";
  return "details";
}

export function isFaceSlot(id: SlotId): id is FaceSlot {
  return slotGroup(id) === "face";
}

/** Canonical order: face, body, details. Image numbers in the prompt follow it. */
export function sortSlots(slots: Iterable<SlotId>): SlotId[] {
  const set = new Set(slots);
  return SLOT_IDS.filter((id) => set.has(id));
}

/** i18n key of a slot label, e.g. "face-34-left" → "slotFace34Left". */
export function slotLabelKey(id: SlotId): string {
  return "slot" + id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

/** English prompt text that describes how each face reference looks. */
export const FACE_ANGLE: Record<FaceSlot, string> = {
  "face-front": "front",
  "face-34-left": "3/4 left",
  "face-34-right": "3/4 right",
  "face-profile": "profile",
  "face-smile": "smiling",
};

/** Body reference: the view, in plain words. */
export const BODY_VIEW: Record<BodySlot, string> = {
  "body-front": "full body from the front",
  "body-side": "full body from the side",
  "body-back": "body from behind",
};

export type Gender = "male" | "female";

/**
 * One English prompt line per attached reference slot (not face slots: those are grouped).
 * `n` is the Image number.
 */
export function referenceLine(slot: Exclude<SlotId, FaceSlot>, n: number, gender: Gender): string {
  switch (slot) {
    case "body-front":
    case "body-side":
    case "body-back":
      return `Image ${n} is a reference of this person's ${BODY_VIEW[slot]}. Keep the same body proportions, figure and skin tone.`;
    case "hands":
      return gender === "female"
        ? `Image ${n} is a close-up of this person's manicure. When any hand is visible, put that exact nail shape, length, and polish on every visible finger and thumbnail. Do not leave some nails bare or invent a different manicure.`
        : `Image ${n} is a close-up of this person's hands. When any hand is visible, match the hand shape, skin and nails exactly.`;
    case "chest":
      return gender === "female"
        ? `Image ${n} is a close-up reference of this person's bust and décolleté. When the bust or neckline is visible, match it exactly.`
        : `Image ${n} is a close-up reference of this person's chest. When the chest is visible, match it exactly.`;
    case "chest-nude":
      return `Image ${n} is a close-up reference of this person's bare bust. When the bust is visible without clothing, match it exactly.`;
    case "buttocks-nude":
      return `Image ${n} is a reference of this person's bare buttocks seen from behind. When they are visible without clothing, match them exactly.`;
    case "waist":
      return `Image ${n} is a close-up reference of this person's waist and belly. When the waist or belly is visible, match it exactly.`;
    case "legs":
      return `Image ${n} is a reference of this person's legs. When the legs are visible, match them exactly.`;
    case "buttocks":
      return `Image ${n} is a reference of this person's buttocks seen from behind. When they are visible, match them exactly.`;
    case "marks":
      return `Image ${n} is a reference of this person's moles, tattoos and birthmarks. When that skin is visible, keep every mark exactly where it is. Do not add or remove marks.`;
    case "hair-back":
      return `Image ${n} is a reference of the back of this person's hair. When the head is seen from behind, match the hair length, color and style exactly.`;
  }
}

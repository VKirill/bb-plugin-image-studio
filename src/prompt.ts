import type { ModelId } from "./models.js";
import {
  FACE_ANGLE,
  LEGACY_SELFIE_SLOTS,
  isFaceSlot,
  referenceLine,
  sortSlots,
  type FaceSlot,
  type SlotId,
} from "./slots.ts";

export type ProfilePrompt = {
  name: string;
  gender: "male" | "female";
  age: number;
  heightCm: number;
  weightKg: number;
  bodyType: string;
  bust?: string;
  /** Slots of the attached references, in image order. Wins over photoCount / hasManicure. */
  refs?: readonly SlotId[];
  /** False: leave height and weight out of the identity line (Qwen weighs numbers against the described figure). */
  withNumbers?: boolean;
  /** Legacy: this many selfies → face-front, face-34-left, face-34-right. */
  photoCount?: number;
  /** Legacy: a manicure photo → hands. */
  hasManicure?: boolean;
};

/** The reference slots a profile prompt attaches, in canonical (= image) order. */
export function profileRefSlots(profile: ProfilePrompt): SlotId[] {
  if (profile.refs) return sortSlots(profile.refs);
  const slots: SlotId[] = LEGACY_SELFIE_SLOTS.slice(0, Math.max(0, Math.min(3, profile.photoCount ?? 0)));
  if (profile.hasManicure) slots.push("hands");
  return slots;
}

const QWEN_LABEL: Record<Exclude<SlotId, FaceSlot>, string> = {
  "body-front": "front body",
  "body-side": "side body",
  "body-back": "back body",
  hands: "hands",
  chest: "chest",
  "chest-nude": "bare chest",
  waist: "waist",
  legs: "legs",
  buttocks: "buttocks",
  "buttocks-nude": "bare buttocks",
  marks: "marks",
  "hair-back": "hair from behind",
};

/** "The woman in the reference photos (face in Image 1, front body in Image 2)." */
export function qwenReferenceLine(slots: readonly SlotId[], offset: number, gender: "male" | "female"): string {
  const parts: string[] = [];
  const faces = slots.filter(isFaceSlot);
  if (faces.length > 0) {
    parts.push(`face in ${imageRange(offset + 1, offset + faces.length)}`);
  }
  slots.forEach((slot, index) => {
    if (isFaceSlot(slot)) return;
    parts.push(`${QWEN_LABEL[slot]} in Image ${offset + index + 1}`);
  });
  return `The ${gender === "female" ? "woman" : "man"} in the reference photos (${parts.join(", ")}).`;
}

function imageRange(first: number, last: number): string {
  return first === last ? `Image ${first}` : `Images ${first}–${last}`;
}

export function profileSubjectLine(profile: ProfilePrompt): string {
  const sex = profile.gender === "female" ? "woman" : "man";
  const parts = [`${profile.name} is a ${profile.age}-year-old ${sex}`];
  if (profile.withNumbers !== false) {
    parts.push(`${profile.heightCm} cm tall`, `${profile.weightKg} kg`);
  }
  parts.push(`${profile.bodyType} build`);
  if (profile.gender === "female" && profile.bust && profile.bust.trim().length > 0) {
    parts.push(`bust ${profile.bust.trim()}`);
  }
  return parts.join(", ") + ".";
}

export function composePrompt(input: {
  userPrompt: string;
  profile?: ProfilePrompt;
  model: ModelId;
  sourceCount?: number;
}): string {
  const task = input.userPrompt.trim();
  const blocks: string[] = [];
  const offset = input.sourceCount ?? 0;

  if (offset > 0) {
    blocks.push(
      offset === 1
        ? "Image 1 is the source picture to edit."
        : `Images 1–${offset} are the source pictures to edit.`,
    );
  }

  if (input.profile) {
    blocks.push(`Subject identity: ${profileSubjectLine(input.profile)}`);
    const slots = profileRefSlots(input.profile);
    const faces = slots.filter(isFaceSlot);
    if (input.model === "qwen-image-2.1") {
      // kie: describe the result, not the inputs. One short line instead of a catalogue of reference photos.
      if (slots.length > 0) blocks.push(qwenReferenceLine(slots, offset, input.profile.gender));
    } else if (faces.length > 0) {
      const first = offset + 1;
      const last = offset + faces.length;
      const angles = faces.map((slot) => FACE_ANGLE[slot]).join(", ");
      blocks.push(
        `${imageRange(first, last)} ${faces.length === 1 ? "is a face reference" : "are face references"}: ${angles}. Keep the same face and identity. Do not invent a different person.`,
      );
    }
    if (input.model !== "qwen-image-2.1") {
      slots.forEach((slot, index) => {
        if (isFaceSlot(slot)) return;
        blocks.push(referenceLine(slot, offset + index + 1, input.profile!.gender));
      });
    }
  }

  if (input.model === "muse-image") {
    blocks.push(
      "Follow the instruction literally. For a new scene name objects, materials, lighting, and any on-image text exactly. For an edit, change only what the user asked for and keep unmentioned details stable.",
    );
  } else if (input.model === "nano-banana-pro") {
    blocks.push("Render any requested text in the image as readable typography.");
  }

  blocks.push(task);
  return blocks.join("\n");
}

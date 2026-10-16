import { z } from "zod";
import {
  LEGACY_SELFIE_SLOTS,
  SLOT_IDS,
  isSlotId,
  sortSlots,
  type SlotId,
} from "./slots.ts";

export const genderSchema = z.enum(["male", "female"]);

export const SELFIE_SLOTS = [0, 1, 2] as const;
export type SelfieSlot = (typeof SELFIE_SLOTS)[number];

export const profilePhotoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  /** Legacy selfie index 0..2. Only written as a mirror for rollback; refs is the source of truth. */
  slot: z.number().int().min(0).max(2).optional(),
});
export type ProfilePhoto = z.infer<typeof profilePhotoSchema>;

/** A generated reference waiting for the owner to accept it into its slot. */
export const sheetCandidateSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  model: z.string(),
  gateway: z.string(),
  prompt: z.string(),
  createdAt: z.string(),
  refsUsed: z.array(z.string()).optional(),
});
export type SheetCandidate = z.infer<typeof sheetCandidateSchema>;

const slotKey = z.enum(SLOT_IDS);

export const profileSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  gender: genderSchema,
  age: z.number().int().min(18).max(99),
  heightCm: z.number().int().min(120).max(230),
  weightKg: z.number().int().min(35).max(250),
  bodyType: z.string().trim().min(1).max(80),
  bust: z.string().trim().max(40),
  /** Labeled reference sheet: slot id → photo. */
  refs: z.partialRecord(slotKey, profilePhotoSchema).default({}),
  /** Generated, not yet accepted references: slot id → candidate. */
  candidates: z.partialRecord(slotKey, sheetCandidateSchema).default({}),
  /** Legacy mirror of face-front / face-34-left / face-34-right (slot 0/1/2). */
  photos: z.array(profilePhotoSchema).default([]),
  /** Legacy mirror of refs.hands. */
  manicurePhoto: profilePhotoSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PersonProfile = z.infer<typeof profileSchema>;

export const BUST_OPTIONS = [
  { value: "A (size 1)", key: "bustA" },
  { value: "B (size 2)", key: "bustB" },
  { value: "C (size 3)", key: "bustC" },
  { value: "D (size 4)", key: "bustD" },
  { value: "E (size 5)", key: "bustE" },
] as const;

export const BODY_OPTIONS = [
  { value: "slim", key: "bodySlim" },
  { value: "athletic", key: "bodyAthletic" },
  { value: "average", key: "bodyAverage" },
  { value: "curvy", key: "bodyCurvy" },
  { value: "hourglass", key: "bodyHourglass" },
  { value: "pear", key: "bodyPear" },
  { value: "apple", key: "bodyApple" },
  { value: "rectangle", key: "bodyRectangle" },
] as const;

export function selfieAt(profile: PersonProfile, slot: SelfieSlot): PersonProfile["photos"][number] | undefined {
  return profile.refs[LEGACY_SELFIE_SLOTS[slot]!];
}

/** Filled slots in canonical order (face, body, details). */
export function filledSlots(profile: Pick<PersonProfile, "refs">): SlotId[] {
  return sortSlots(SLOT_IDS.filter((id) => profile.refs[id] !== undefined));
}

/** Slots that hold an unaccepted generated candidate. */
export function candidateSlots(profile: Pick<PersonProfile, "candidates">): SlotId[] {
  return sortSlots(SLOT_IDS.filter((id) => profile.candidates[id] !== undefined));
}

function knownEntries<T>(value: unknown): Partial<Record<SlotId, T>> {
  const out: Partial<Record<SlotId, T>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSlotId(key) && item && typeof item === "object") out[key] = item as T;
  }
  return out;
}

/** Rewrites the legacy mirror (`photos`, `manicurePhoto`) from `refs`, so an older plugin build still sees the files. */
export function withLegacyMirror(profile: PersonProfile): PersonProfile {
  const photos: ProfilePhoto[] = [];
  LEGACY_SELFIE_SLOTS.forEach((slotId, index) => {
    const photo = profile.refs[slotId];
    if (photo) photos.push({ id: photo.id, filename: photo.filename, mimeType: photo.mimeType, slot: index });
  });
  const hands = profile.refs.hands;
  return {
    ...profile,
    photos,
    manicurePhoto: hands ? { id: hands.id, filename: hands.filename, mimeType: hands.mimeType } : null,
  };
}

/**
 * Moves legacy data into `refs` without touching any file:
 * photos slot 0/1/2 → face-front / face-34-left / face-34-right, manicurePhoto → hands.
 * A slot already present in `refs` wins over the legacy field.
 */
export function migrateProfile(profile: PersonProfile): PersonProfile {
  const refs = { ...profile.refs };
  profile.photos.slice(0, 3).forEach((photo, index) => {
    const legacySlot = photo.slot ?? index;
    const target = LEGACY_SELFIE_SLOTS[legacySlot];
    if (target && !refs[target]) {
      refs[target] = { id: photo.id, filename: photo.filename, mimeType: photo.mimeType };
    }
  });
  if (profile.manicurePhoto && !refs.hands) {
    const { id, filename, mimeType } = profile.manicurePhoto;
    refs.hands = { id, filename, mimeType };
  }
  return withLegacyMirror({ ...profile, refs });
}

export function parseProfiles(raw: unknown): PersonProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonProfile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    // Unknown slot ids (from a newer build) are dropped instead of rejecting the whole profile.
    const source = item as Record<string, unknown>;
    const parsed = profileSchema.safeParse({
      ...source,
      refs: knownEntries(source.refs),
      candidates: knownEntries(source.candidates),
    });
    if (!parsed.success) continue;
    out.push(migrateProfile(parsed.data));
  }
  return out;
}

export function findProfile(profiles: PersonProfile[], nameOrId: string): PersonProfile | null {
  const needle = nameOrId.trim().toLowerCase();
  return (
    profiles.find((profile) => profile.id === nameOrId) ??
    profiles.find((profile) => profile.name.toLowerCase() === needle) ??
    null
  );
}

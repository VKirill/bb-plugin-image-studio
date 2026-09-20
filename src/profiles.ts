import { z } from "zod";

export const genderSchema = z.enum(["male", "female"]);

export const SELFIE_SLOTS = [0, 1, 2] as const;
export type SelfieSlot = (typeof SELFIE_SLOTS)[number];

export const profilePhotoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  slot: z.number().int().min(0).max(2).optional(),
});

export const profileSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  gender: genderSchema,
  age: z.number().int().min(18).max(99),
  heightCm: z.number().int().min(120).max(230),
  weightKg: z.number().int().min(35).max(250),
  bodyType: z.string().trim().min(1).max(80),
  bust: z.string().trim().max(40),
  photos: z.array(profilePhotoSchema),
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
  return profile.photos.find((photo) => (photo.slot ?? profile.photos.indexOf(photo)) === slot);
}

export function parseProfiles(raw: unknown): PersonProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonProfile[] = [];
  for (const item of raw) {
    const parsed = profileSchema.safeParse(item);
    if (!parsed.success) continue;
    const photos = parsed.data.photos.slice(0, 3).map((photo, index) => ({
      ...photo,
      slot: photo.slot ?? index,
    }));
    out.push({
      ...parsed.data,
      photos,
      manicurePhoto: parsed.data.gender === "female" ? parsed.data.manicurePhoto ?? null : null,
    });
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

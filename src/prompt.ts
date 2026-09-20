import type { ModelId } from "./models.js";

export type ProfilePrompt = {
  name: string;
  gender: "male" | "female";
  age: number;
  heightCm: number;
  weightKg: number;
  bodyType: string;
  bust?: string;
  photoCount: number;
  hasManicure?: boolean;
};

export function profileSubjectLine(profile: ProfilePrompt): string {
  const sex = profile.gender === "female" ? "woman" : "man";
  const parts = [
    `${profile.name} is a ${profile.age}-year-old ${sex}`,
    `${profile.heightCm} cm tall`,
    `${profile.weightKg} kg`,
    `${profile.bodyType} build`,
  ];
  if (profile.gender === "female" && profile.bust && profile.bust.trim().length > 0) {
    parts.push(`bust ${profile.bust.trim()}`);
  }
  return parts.join(", ") + ".";
}

export function composePrompt(input: {
  userPrompt: string;
  profile?: ProfilePrompt;
  model: ModelId;
}): string {
  const task = input.userPrompt.trim();
  const blocks: string[] = [];

  if (input.profile) {
    blocks.push(`Subject identity: ${profileSubjectLine(input.profile)}`);
    const selfieCount = input.profile.photoCount;
    if (selfieCount > 0) {
      const lastSelfie = selfieCount === 1 ? "Image 1" : `Images 1–${selfieCount}`;
      blocks.push(
        `${lastSelfie} ${selfieCount === 1 ? "is" : "are"} selfie reference ${selfieCount === 1 ? "photo" : "photos"} of this person. Keep the same face and identity. Do not invent a different person.`,
      );
    }
    if (input.profile.hasManicure) {
      const manicureIndex = selfieCount + 1;
      blocks.push(
        `Image ${manicureIndex} is a close-up of this person's manicure. When any hand is visible, put that exact nail shape, length, and polish on every visible finger and thumbnail. Do not leave some nails bare or invent a different manicure.`,
      );
    }
  }

  if (input.model === "muse-image") {
    blocks.push(
      "Follow the instruction literally. For a new scene name objects, materials, lighting, and any on-image text exactly. For an edit, change only what the user asked for and keep unmentioned details stable.",
    );
  } else {
    blocks.push(
      "Write the user task as labeled clauses in this order when they fit: Subject, Composition, Action, Location, Style. Put any on-image words in double quotes. If a part is missing, infer a simple photographic default rather than a collage.",
    );
    if (input.model === "nano-banana-pro") {
      blocks.push("Render any requested text in the image as readable typography.");
    }
  }

  blocks.push(`Task: ${task}`);
  return blocks.join("\n");
}

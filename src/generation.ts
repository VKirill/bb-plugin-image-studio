import { z } from "zod";

export const generationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  createdAt: z.string(),
  prompt: z.string(),
  composedPrompt: z.string(),
  model: z.string(),
  gateway: z.string(),
  profileId: z.string().nullable(),
  profileName: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  projectPath: z.string().nullable(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Provider seed, when one was sent or reported. */
  seed: z.number().int().optional(),
  /** Reference-sheet slots sent with this generation, in image order. */
  refsUsed: z.array(z.string()).optional(),
  /** Who chose the reference slots: Jev, or the keyword rules (no key, an error, a timeout, or Jev switched off). */
  refsSelector: z.enum(["jev", "keywords"]).optional(),
  /** Jev answers for debugging: probability per slot, plus person / nudity / viewpoint. */
  refsScores: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  /** Which Jev endpoint answered ("openlux" or "typesafe") and how long it took. */
  refsJevProvider: z.string().optional(),
  refsJevMs: z.number().optional(),
  /** Why Jev was not used, when it was tried. */
  refsJevError: z.string().optional(),
  /** Slots wanted but not sent (over the model's image cap, or listed by hand and empty). */
  refsDropped: z.array(z.string()).optional(),
  /** GUI section: the style, mode and job label ("idea 2: gothic", "kit wide") of a GUI picture. */
  guiStyleId: z.string().nullable().optional(),
  guiMode: z.enum(["ideas", "screen", "elements", "kit"]).optional(),
  guiLabel: z.string().optional(),
  /** Element sheets: folder with parts/*.png and manifest.json, how many parts were cut, and the cells not found. */
  guiDir: z.string().nullable().optional(),
  guiParts: z.number().int().optional(),
  guiMissing: z.array(z.string()).optional(),
});
export type Generation = z.infer<typeof generationSchema>;

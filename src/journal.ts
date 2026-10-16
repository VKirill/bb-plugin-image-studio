import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generationSchema, type Generation } from "./generation.ts";
import { sheetCandidateSchema, type SheetCandidate } from "./profiles.ts";
import { parseSlotId } from "./slots.ts";
import { attachCandidate, type ProfileStore } from "./store.ts";

/**
 * Journal of jobs between "image written to disk" and "records written to the KV store".
 * A reload in that gap would lose the image's records: the old plugin instance cannot use the KV store any
 * more. The entry lets the next instance adopt the image. Everything here is plain fs, which a reload does not break.
 */

const entrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("generation"), record: generationSchema }),
  z.object({
    kind: z.literal("candidate"),
    profileId: z.string(),
    slot: z.string(),
    candidate: sheetCandidateSchema,
  }),
]);
export type JournalEntry = z.infer<typeof entrySchema>;

/** Write to a temp name and rename: a reader never sees half a file. */
export async function atomicWrite(path: string, data: Buffer | string): Promise<void> {
  const tmp = `${path}.${randomUUID().slice(0, 6)}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function createJournal(deps: {
  dir: string;
  generationFile: (record: Generation) => string;
  candidateFile: (profileId: string, candidate: SheetCandidate) => string;
  gallery: { add(projectId: string, record: Generation): Promise<void> };
  profiles: ProfileStore;
  onAdopted?: (entry: JournalEntry) => void;
  warn?: (message: string) => void;
}) {
  const entryPath = (id: string) => join(deps.dir, `${id}.json`);
  return {
    async write(id: string, entry: JournalEntry): Promise<void> {
      await mkdir(deps.dir, { recursive: true });
      await atomicWrite(entryPath(id), JSON.stringify(entry));
    },
    async clear(id: string): Promise<void> {
      try {
        await unlink(entryPath(id));
      } catch {
        // gone already
      }
    },
    /**
     * Finishes jobs a reload cut off. Idempotent: an entry whose records already exist changes nothing.
     * Entries younger than `minAgeMs` belong to a job still running in this instance and are left alone.
     */
    async recover(minAgeMs: number): Promise<number> {
      let names: string[];
      try {
        names = (await readdir(deps.dir)).filter((name) => name.endsWith(".json"));
      } catch {
        return 0;
      }
      let adopted = 0;
      for (const name of names) {
        const path = join(deps.dir, name);
        try {
          const info = await stat(path);
          if (Date.now() - info.mtimeMs < minAgeMs) continue;
          let raw: unknown = null;
          try {
            raw = JSON.parse(await readFile(path, "utf8"));
          } catch {
            raw = null;
          }
          const parsed = entrySchema.safeParse(raw);
          if (!parsed.success) {
            await unlink(path);
            continue;
          }
          const entry = parsed.data;
          if (entry.kind === "generation") {
            if (await exists(deps.generationFile(entry.record))) {
              await deps.gallery.add(entry.record.projectId, entry.record);
              adopted += 1;
              deps.onAdopted?.(entry);
            }
          } else {
            const slot = parseSlotId(entry.slot);
            if (slot && (await exists(deps.candidateFile(entry.profileId, entry.candidate)))) {
              await deps.profiles.mutate((profiles) => {
                const profile = profiles.find((item) => item.id === entry.profileId);
                if (!profile) return;
                const current = profile.candidates[slot];
                if (current?.id === entry.candidate.id || profile.refs[slot]?.id === entry.candidate.id) return;
                if (current && current.createdAt > entry.candidate.createdAt) return;
                attachCandidate(profile, slot, entry.candidate);
                adopted += 1;
              });
              deps.onAdopted?.(entry);
            }
          }
          await unlink(path);
        } catch (error) {
          deps.warn?.(`recover ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return adopted;
    },
  };
}

export type Journal = ReturnType<typeof createJournal>;

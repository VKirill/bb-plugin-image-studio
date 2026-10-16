import { Mutex } from "./queue.ts";
import { parseProfiles, withLegacyMirror, type PersonProfile, type SheetCandidate } from "./profiles.ts";
import type { SlotId } from "./slots.ts";

/** The part of the plugin key-value store the stores need. */
export type Kv = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

export const PROFILES_KEY = "profiles";
export const STUDIO_GALLERY = "studio";
export const GALLERY_MAX = 80;

export function generationsKey(projectId: string): string {
  return `generations:${projectId}`;
}

/**
 * The profile list is one KV value, so every change is read-modify-write.
 * `mutate` runs them one at a time and re-reads inside the lock: parallel sheet jobs,
 * uploads and accepts cannot overwrite each other.
 */
export function createProfileStore(kv: Kv, onChange?: () => void) {
  const lock = new Mutex();
  const read = async (): Promise<PersonProfile[]> => parseProfiles(await kv.get(PROFILES_KEY));
  return {
    list: read,
    /** Runs `change` on a fresh copy of the list and saves it. A thrown error saves nothing. */
    mutate<T>(change: (profiles: PersonProfile[]) => Promise<T> | T): Promise<T> {
      return lock.run(async () => {
        const profiles = await read();
        const result = await change(profiles);
        for (const profile of profiles) {
          const mirrored = withLegacyMirror(profile);
          profile.photos = mirrored.photos;
          profile.manicurePhoto = mirrored.manicurePhoto;
        }
        await kv.set(PROFILES_KEY, profiles);
        onChange?.();
        return result;
      });
    },
  };
}

export type ProfileStore = ReturnType<typeof createProfileStore>;

/** Puts a generated candidate into its slot. Returns the candidate it replaced, if any (its file can be deleted). */
export function attachCandidate(
  profile: PersonProfile,
  slot: SlotId,
  candidate: SheetCandidate,
): SheetCandidate | undefined {
  const previous = profile.candidates[slot];
  profile.candidates[slot] = candidate;
  profile.updatedAt = new Date().toISOString();
  return previous;
}

/**
 * The gallery lists (per project, plus the shared "studio" list) are read-modify-write too.
 * `add` and `withLock` share one mutex.
 */
export function createGalleryStore<T extends { id: string }>(kv: Kv, max = GALLERY_MAX) {
  const lock = new Mutex();
  const asList = (raw: unknown): T[] => (Array.isArray(raw) ? (raw as T[]) : []);
  return {
    withLock<R>(work: () => Promise<R>): Promise<R> {
      return lock.run(work);
    },
    /** Newest first, in the project list and in the studio list. A record already present is replaced, not doubled. */
    add(projectId: string, record: T): Promise<void> {
      return lock.run(async () => {
        const project = asList(await kv.get(generationsKey(projectId))).filter((item) => item.id !== record.id);
        await kv.set(generationsKey(projectId), [record, ...project].slice(0, max));
        const studio = asList(await kv.get(generationsKey(STUDIO_GALLERY))).filter((item) => item.id !== record.id);
        await kv.set(generationsKey(STUDIO_GALLERY), [record, ...studio].slice(0, max));
      });
    },
  };
}

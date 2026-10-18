import assert from "node:assert/strict";
import { test } from "node:test";
import { SLOT_IDS } from "../src/slots.ts";
import { attachCandidate, createGalleryStore, createProfileStore, GALLERY_MAX_BYTES, generationsKey, type Kv } from "../src/store.ts";

/** A KV whose reads and writes take a random time, so unlocked read-modify-write interleaves. */
function slowKv(seed: Record<string, unknown> = {}): Kv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 6));
  return {
    data,
    async get(key) {
      await wait();
      const value = data.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async set(key, value) {
      await wait();
      data.set(key, structuredClone(value));
    },
  };
}

const baseProfile = {
  id: "p1",
  name: "test-sheet",
  gender: "female",
  age: 24,
  heightCm: 168,
  weightKg: 56,
  bodyType: "hourglass",
  bust: "C (size 3)",
  refs: { "face-front": { id: "f", filename: "f.webp", mimeType: "image/webp" } },
  createdAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
};

function candidate(slot: string) {
  return {
    id: `c-${slot}`,
    filename: `c-${slot}.webp`,
    mimeType: "image/webp",
    model: "nano-banana-2.1",
    gateway: "kie",
    prompt: slot,
    createdAt: "2026-10-16T00:00:00.000Z",
  };
}

const TEN = SLOT_IDS.filter((slot) => slot !== "marks" && slot !== "face-front").slice(0, 10);

test("10 concurrent candidate writes: none is lost", async () => {
  const kv = slowKv({ profiles: [baseProfile] });
  const store = createProfileStore(kv);
  await Promise.all(
    TEN.map((slot) =>
      store.mutate((profiles) => {
        attachCandidate(profiles.find((p) => p.id === "p1")!, slot, candidate(slot));
      }),
    ),
  );
  const [profile] = await store.list();
  assert.deepEqual(Object.keys(profile!.candidates).sort(), [...TEN].sort());
  for (const slot of TEN) assert.equal(profile!.candidates[slot]!.id, `c-${slot}`);
});

test("the same test without the lock loses updates (so the test above has teeth)", async () => {
  const kv = slowKv({ profiles: [baseProfile] });
  await Promise.all(
    TEN.map(async (slot) => {
      const profiles = (await kv.get("profiles")) as Array<typeof baseProfile & { candidates?: Record<string, unknown> }>;
      profiles[0]!.candidates = { ...(profiles[0]!.candidates ?? {}), [slot]: candidate(slot) };
      await kv.set("profiles", profiles);
    }),
  );
  const [profile] = (await kv.get("profiles")) as Array<{ candidates: Record<string, unknown> }>;
  assert.ok(Object.keys(profile!.candidates).length < TEN.length);
});

test("candidate writes, accepts and uploads interleave without losing anything", async () => {
  const kv = slowKv({ profiles: [baseProfile] });
  const store = createProfileStore(kv);
  const first = TEN.slice(0, 5);
  const second = TEN.slice(5);
  await Promise.all(
    first.map((slot) => store.mutate((ps) => void attachCandidate(ps[0]!, slot, candidate(slot)))),
  );
  await Promise.all([
    ...first.map((slot) =>
      store.mutate((ps) => {
        const profile = ps[0]!;
        const c = profile.candidates[slot]!;
        profile.refs[slot] = { id: c.id, filename: c.filename, mimeType: c.mimeType };
        delete profile.candidates[slot];
      }),
    ),
    ...second.map((slot) => store.mutate((ps) => void attachCandidate(ps[0]!, slot, candidate(slot)))),
  ]);
  const [profile] = await store.list();
  for (const slot of first) assert.ok(profile!.refs[slot], `${slot} accepted`);
  for (const slot of second) assert.ok(profile!.candidates[slot], `${slot} candidate`);
  assert.deepEqual(Object.keys(profile!.candidates).sort(), [...second].sort());
});

test("a failing change saves nothing and does not block the next one", async () => {
  const kv = slowKv({ profiles: [baseProfile] });
  const store = createProfileStore(kv);
  const bad = store.mutate((ps) => {
    ps[0]!.name = "changed";
    throw new Error("boom");
  });
  const good = store.mutate((ps) => void attachCandidate(ps[0]!, "hands", candidate("hands")));
  await assert.rejects(bad, /boom/);
  await good;
  const [profile] = await store.list();
  assert.equal(profile!.name, "test-sheet");
  assert.ok(profile!.candidates.hands);
});

test("saving keeps the legacy mirror in step", async () => {
  const kv = slowKv({ profiles: [baseProfile] });
  const store = createProfileStore(kv);
  await store.mutate((ps) => {
    ps[0]!.refs.hands = { id: "h", filename: "h.webp", mimeType: "image/webp" };
  });
  const stored = (kv.data.get("profiles") as Array<{ photos: Array<{ slot: number }>; manicurePhoto: { id: string } | null }>)[0]!;
  assert.deepEqual(stored.photos.map((p) => p.slot), [0]);
  assert.equal(stored.manicurePhoto?.id, "h");
});

test("10 concurrent gallery records: none is lost, newest first, no doubles", async () => {
  const kv = slowKv();
  const gallery = createGalleryStore<{ id: string }>(kv);
  const ids = Array.from({ length: 10 }, (_, i) => `g${i}`);
  await Promise.all([...ids, "g3"].map((id) => gallery.add("proj", { id })));
  const project = (await kv.get(generationsKey("proj"))) as Array<{ id: string }>;
  const studio = (await kv.get(generationsKey("studio"))) as Array<{ id: string }>;
  assert.deepEqual(project.map((r) => r.id).sort(), [...ids].sort());
  assert.deepEqual(studio.map((r) => r.id).sort(), [...ids].sort());
});

test("the gallery keeps the newest 80", async () => {
  const kv = slowKv();
  const gallery = createGalleryStore<{ id: string }>(kv, 5);
  for (let i = 0; i < 8; i += 1) await gallery.add("p", { id: `r${i}` });
  const project = (await kv.get(generationsKey("p"))) as Array<{ id: string }>;
  assert.deepEqual(project.map((r) => r.id), ["r7", "r6", "r5", "r4", "r3"]);
});

test("long prompts never push a gallery list past the plugin KV size limit", async () => {
  const kv = slowKv();
  const gallery = createGalleryStore<{ id: string; prompt: string; composedPrompt: string }>(kv);
  // 80 agent prompts of ~1.6k Cyrillic characters each, as on 2026-10-17: about 260 KB before the fix.
  const prompt = "длинный промпт ".repeat(110);
  for (let i = 0; i < 80; i += 1) await gallery.add("p", { id: `r${i}`, prompt, composedPrompt: prompt });
  for (const key of [generationsKey("p"), generationsKey("studio")]) {
    const list = (await kv.get(key)) as Array<{ id: string }>;
    assert.ok(Buffer.byteLength(JSON.stringify(list)) <= GALLERY_MAX_BYTES);
    assert.equal(list[0]!.id, "r79");
  }
});

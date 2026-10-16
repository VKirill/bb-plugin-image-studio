import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { atomicWrite, createJournal } from "../src/journal.ts";
import { createGalleryStore, createProfileStore, generationsKey, type Kv } from "../src/store.ts";

function kv(seed: Record<string, unknown> = {}): Kv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 4));
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

const profile = {
  id: "p1",
  name: "Brooke",
  gender: "female",
  age: 25,
  heightCm: 170,
  weightKg: 62,
  bodyType: "curvy",
  bust: "D (size 4)",
  refs: { "face-front": { id: "f", filename: "f.webp", mimeType: "image/webp" } },
  createdAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
};

function record(id: string) {
  return {
    id,
    projectId: "proj",
    createdAt: "2026-10-16T00:00:00.000Z",
    prompt: "p",
    composedPrompt: "cp",
    model: "nano-banana-2.1",
    gateway: "kie",
    profileId: null,
    profileName: null,
    filename: `${id}.webp`,
    mimeType: "image/webp",
    projectPath: null,
  };
}

function candidate(id: string, createdAt = "2026-10-16T01:00:00.000Z") {
  return { id, filename: `${id}-sheet-chest.webp`, mimeType: "image/webp", model: "qwen-image-2.1", gateway: "kie", prompt: "p", createdAt };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "is-journal-"));
  await mkdir(join(root, "generations"), { recursive: true });
  await mkdir(join(root, "profiles", "p1"), { recursive: true });
  const store = kv({ profiles: [profile] });
  const profiles = createProfileStore(store);
  const gallery = createGalleryStore<{ id: string }>(store);
  const journal = createJournal({
    dir: join(root, "pending"),
    generationFile: (r) => join(root, "generations", r.filename),
    candidateFile: (profileId, c) => join(root, "profiles", profileId, c.filename),
    gallery: gallery as never,
    profiles,
  });
  return { root, store, profiles, journal };
}

async function aged(path: string, seconds: number) {
  const old = new Date(Date.now() - seconds * 1000);
  await utimes(path, old, old);
}

test("a generation cut off by a reload is adopted: image on disk, journal entry, records missing", async () => {
  const { root, store, journal } = await setup();
  try {
    await writeFile(join(root, "generations", "g1.webp"), "img");
    await journal.write("g1", { kind: "generation", record: record("g1") });
    await aged(join(root, "pending", "g1.json"), 60);
    assert.equal(await journal.recover(8000), 1);
    const list = (await store.get(generationsKey("proj"))) as Array<{ id: string }>;
    assert.deepEqual(list.map((r) => r.id), ["g1"]);
    assert.deepEqual(await readdir(join(root, "pending")), []);
    // Running it again changes nothing.
    assert.equal(await journal.recover(0), 0);
    assert.equal(((await store.get(generationsKey("proj"))) as unknown[]).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an entry whose records already exist is cleared without a duplicate", async () => {
  const { root, store, journal } = await setup();
  try {
    await writeFile(join(root, "generations", "g2.webp"), "img");
    await store.set(generationsKey("proj"), [record("g2")]);
    await journal.write("g2", { kind: "generation", record: record("g2") });
    await aged(join(root, "pending", "g2.json"), 60);
    await journal.recover(8000);
    assert.equal(((await store.get(generationsKey("proj"))) as unknown[]).length, 1);
    assert.deepEqual(await readdir(join(root, "pending")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("young entries (a job still running here) are left alone; entries without an image are dropped", async () => {
  const { root, store, journal } = await setup();
  try {
    await writeFile(join(root, "generations", "young.webp"), "img");
    await journal.write("young", { kind: "generation", record: record("young") });
    await journal.write("noimg", { kind: "generation", record: record("noimg") });
    await aged(join(root, "pending", "noimg.json"), 60);
    assert.equal(await journal.recover(8000), 0);
    assert.deepEqual((await readdir(join(root, "pending"))).sort(), ["young.json"]);
    assert.equal(await store.get(generationsKey("proj")), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a candidate cut off by a reload is attached to its slot; an accepted or newer one is not overwritten", async () => {
  const { root, profiles, journal } = await setup();
  try {
    for (const name of ["c1", "c2", "c3"]) await writeFile(join(root, "profiles", "p1", `${name}-sheet-chest.webp`), "img");
    await journal.write("c1", { kind: "candidate", profileId: "p1", slot: "chest", candidate: candidate("c1") });
    await aged(join(root, "pending", "c1.json"), 60);
    assert.equal(await journal.recover(8000), 1);
    assert.equal((await profiles.list())[0]!.candidates.chest?.id, "c1");

    // An older candidate must not replace a newer one.
    await journal.write("c2", { kind: "candidate", profileId: "p1", slot: "chest", candidate: candidate("c2", "2026-10-16T00:30:00.000Z") });
    await aged(join(root, "pending", "c2.json"), 60);
    await journal.recover(8000);
    assert.equal((await profiles.list())[0]!.candidates.chest?.id, "c1");

    // Already accepted into the slot: nothing is attached again.
    await profiles.mutate((ps) => {
      ps[0]!.refs.chest = { id: "c3", filename: "c3-sheet-chest.webp", mimeType: "image/webp" };
      delete ps[0]!.candidates.chest;
    });
    await journal.write("c3", { kind: "candidate", profileId: "p1", slot: "chest", candidate: candidate("c3", "2026-10-16T02:00:00.000Z") });
    await aged(join(root, "pending", "c3.json"), 60);
    await journal.recover(8000);
    const [after] = await profiles.list();
    assert.equal(after!.candidates.chest, undefined);
    assert.equal(after!.refs.chest?.id, "c3");
    assert.deepEqual(await readdir(join(root, "pending")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a candidate of a deleted profile is dropped quietly; a corrupt entry is removed", async () => {
  const { root, journal } = await setup();
  try {
    await writeFile(join(root, "profiles", "p1", "c9-sheet-chest.webp"), "img");
    await journal.write("c9", { kind: "candidate", profileId: "gone", slot: "chest", candidate: candidate("c9") });
    await mkdir(join(root, "pending"), { recursive: true });
    await writeFile(join(root, "pending", "bad.json"), "{not json");
    await aged(join(root, "pending", "c9.json"), 60);
    await aged(join(root, "pending", "bad.json"), 60);
    await journal.recover(8000);
    assert.deepEqual(await readdir(join(root, "pending")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("10 jobs cut off at once are all adopted", async () => {
  const { root, store, profiles, journal } = await setup();
  try {
    const slots = ["face-34-left", "face-34-right", "face-profile", "face-smile", "body-front"] as const;
    for (let i = 0; i < 5; i += 1) {
      await writeFile(join(root, "generations", `g${i}.webp`), "img");
      await journal.write(`g${i}`, { kind: "generation", record: record(`g${i}`) });
      const id = `k${i}`;
      await writeFile(join(root, "profiles", "p1", `${id}-sheet-chest.webp`), "img");
      await journal.write(id, { kind: "candidate", profileId: "p1", slot: slots[i]!, candidate: candidate(id) });
    }
    for (const name of await readdir(join(root, "pending"))) await aged(join(root, "pending", name), 60);
    assert.equal(await journal.recover(8000), 10);
    const list = (await store.get(generationsKey("proj"))) as Array<{ id: string }>;
    assert.equal(list.length, 5);
    assert.deepEqual(Object.keys((await profiles.list())[0]!.candidates).sort(), [...slots].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomicWrite leaves the final file whole and no temp file behind", async () => {
  const root = await mkdtemp(join(tmpdir(), "is-atomic-"));
  try {
    await atomicWrite(join(root, "a.webp"), Buffer.from("hello"));
    assert.equal(await readFile(join(root, "a.webp"), "utf8"), "hello");
    assert.deepEqual(await readdir(root), ["a.webp"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

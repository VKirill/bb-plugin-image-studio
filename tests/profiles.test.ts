import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateSlots, filledSlots, findProfile, migrateProfile, parseProfiles, selfieAt, withLegacyMirror } from "../src/profiles.ts";
import { LEGACY_SLOT_ALIASES, SLOT_IDS, SLOT_GROUPS, parseSlotId, slotLabelKey, sortSlots } from "../src/slots.ts";
import { t } from "../i18n.ts";

// The stored shape before reference sheets (what profiles look like in the KV store today).
const legacyKirill = {
  id: "51f39ee0",
  name: "Кирилл",
  gender: "male",
  age: 34,
  heightCm: 190,
  weightKg: 90,
  bodyType: "athletic",
  bust: "",
  photos: [
    { id: "82bf5f2a", filename: "82bf5f2a-photo_1.jpg", mimeType: "image/jpeg", slot: 0 },
    { id: "49e43986", filename: "49e43986-photo_2.jpg", mimeType: "image/jpeg", slot: 1 },
  ],
  manicurePhoto: null,
  createdAt: "2026-09-19T19:30:40.549Z",
  updatedAt: "2026-09-19T19:30:41.044Z",
};

const legacyVika = {
  ...legacyKirill,
  id: "aa11bb22",
  name: "Vika",
  gender: "female",
  bust: "C (size 3)",
  photos: [
    { id: "p0", filename: "p0.jpg", mimeType: "image/jpeg", slot: 0 },
    { id: "p2", filename: "p2.jpg", mimeType: "image/jpeg", slot: 2 },
  ],
  manicurePhoto: { id: "m1", filename: "m1.jpg", mimeType: "image/jpeg" },
};

test("legacy selfies move to face slots and the manicure to hands, files untouched", () => {
  const [kirill, vika] = parseProfiles([legacyKirill, legacyVika]);
  assert.deepEqual(filledSlots(kirill!), ["face-front", "face-34-left"]);
  assert.deepEqual(kirill!.refs["face-front"], { id: "82bf5f2a", filename: "82bf5f2a-photo_1.jpg", mimeType: "image/jpeg" });
  assert.deepEqual(kirill!.refs["face-34-left"], { id: "49e43986", filename: "49e43986-photo_2.jpg", mimeType: "image/jpeg" });

  assert.deepEqual(filledSlots(vika!), ["face-front", "face-34-right", "hands"]);
  assert.equal(vika!.refs["face-34-right"]!.filename, "p2.jpg");
  assert.equal(vika!.refs.hands!.filename, "m1.jpg");
  assert.equal(vika!.bust, "C (size 3)");
});

test("selfies without a slot number take their list position", () => {
  const [profile] = parseProfiles([
    {
      ...legacyKirill,
      photos: [
        { id: "a", filename: "a.jpg", mimeType: "image/jpeg" },
        { id: "b", filename: "b.jpg", mimeType: "image/jpeg" },
      ],
    },
  ]);
  assert.equal(profile!.refs["face-front"]!.id, "a");
  assert.equal(profile!.refs["face-34-left"]!.id, "b");
});

test("the legacy mirror keeps photos and manicurePhoto readable by the previous build", () => {
  const [vika] = parseProfiles([legacyVika]);
  assert.deepEqual(
    vika!.photos.map((photo) => [photo.id, photo.slot]),
    [
      ["p0", 0],
      ["p2", 2],
    ],
  );
  assert.equal(vika!.manicurePhoto?.id, "m1");
  assert.equal(selfieAt(vika!, 2)?.id, "p2");
  assert.equal(selfieAt(vika!, 1), undefined);
});

test("migration is stable: parsing the migrated profile changes nothing", () => {
  const once = parseProfiles([legacyKirill, legacyVika]);
  const twice = parseProfiles(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
});

test("a slot in refs wins over the legacy field, and removing a ref is not undone by the mirror", () => {
  const [profile] = parseProfiles([
    { ...legacyKirill, refs: { "face-front": { id: "new", filename: "new.webp", mimeType: "image/webp" } } },
  ]);
  assert.equal(profile!.refs["face-front"]!.id, "new");
  assert.equal(profile!.refs["face-34-left"]!.id, "49e43986");

  const removed = { ...profile!, refs: { ...profile!.refs } };
  delete removed.refs["face-front"];
  const [reloaded] = parseProfiles([withLegacyMirror(removed)]);
  assert.equal(reloaded!.refs["face-front"], undefined);
});

test("unknown slot ids from a newer build are dropped, not the profile", () => {
  const profiles = parseProfiles([
    {
      ...legacyKirill,
      refs: {
        "face-front": { id: "x", filename: "x.jpg", mimeType: "image/jpeg" },
        "tail-wag": { id: "y", filename: "y.jpg", mimeType: "image/jpeg" },
      },
    },
    { nonsense: true },
    null,
  ]);
  assert.equal(profiles.length, 1);
  assert.deepEqual(filledSlots(profiles[0]!), ["face-front", "face-34-left"]);
});

test("a profile with no photos and candidates parses", () => {
  const [profile] = parseProfiles([
    {
      ...legacyKirill,
      photos: [],
      candidates: {
        chest: { id: "c1", filename: "c1.webp", mimeType: "image/webp", model: "qwen-image-2.1", gateway: "kie", prompt: "p", createdAt: "2026-10-16T00:00:00.000Z" },
      },
    },
  ]);
  assert.deepEqual(filledSlots(profile!), []);
  assert.deepEqual(candidateSlots(profile!), ["chest"]);
  assert.equal(migrateProfile(profile!).candidates.chest?.id, "c1");
});

test("male profiles can hold every slot", () => {
  const [profile] = parseProfiles([
    {
      ...legacyKirill,
      manicurePhoto: { id: "h", filename: "h.jpg", mimeType: "image/jpeg" },
    },
  ]);
  assert.equal(profile!.refs.hands?.id, "h");
  assert.equal(profile!.manicurePhoto?.id, "h");
});

test("old RPC slot names still resolve, new ids and aliases are case-insensitive", () => {
  assert.equal(parseSlotId("selfie-0"), "face-front");
  assert.equal(parseSlotId("selfie-1"), "face-34-left");
  assert.equal(parseSlotId("selfie-2"), "face-34-right");
  assert.equal(parseSlotId("manicure"), "hands");
  assert.equal(parseSlotId(" Body-Back "), "body-back");
  assert.equal(parseSlotId("selfie-3"), null);
  assert.equal(parseSlotId(undefined), null);
  assert.deepEqual(Object.keys(LEGACY_SLOT_ALIASES).sort(), ["manicure", "selfie-0", "selfie-1", "selfie-2"]);
});

test("slots are grouped face, body, details in canonical order", () => {
  assert.deepEqual(SLOT_GROUPS.face, ["face-front", "face-34-left", "face-34-right", "face-profile", "face-smile"]);
  assert.deepEqual(SLOT_GROUPS.body, ["body-front", "body-side", "body-back"]);
  assert.deepEqual(SLOT_GROUPS.details, ["hands", "chest", "chest-nude", "waist", "legs", "buttocks", "buttocks-nude", "marks", "hair-back"]);
  assert.equal(SLOT_IDS.length, 17);
  assert.deepEqual(sortSlots(["hands", "face-smile", "body-back", "face-front"]), ["face-front", "face-smile", "body-back", "hands"]);
});

test("every slot has an English and a Russian label", () => {
  for (const id of SLOT_IDS) {
    const key = slotLabelKey(id) as Parameters<typeof t>[0];
    const en = t(key, {}, "en");
    const ru = t(key, {}, "ru");
    assert.ok(en.length > 0 && ru.length > 0, id);
    assert.notEqual(en, ru, `${id} has the same label in both languages`);
  }
});

test("findProfile still finds by id and by name", () => {
  const profiles = parseProfiles([legacyKirill]);
  assert.equal(findProfile(profiles, "кирилл")?.id, "51f39ee0");
  assert.equal(findProfile(profiles, "51f39ee0")?.name, "Кирилл");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHARACTER_PRESETS,
  TURNAROUND_VIEWS,
  characterJobs,
  characterSlug,
  cutOnWhite,
  parseEquipment,
  type CharacterRequest,
} from "../src/characters.ts";
import { parseGuiStyles, type GuiStyle } from "../src/gui.ts";
import type { Rgba } from "../src/image-io.ts";

const style = (patch: Partial<GuiStyle> = {}): GuiStyle => ({
  id: "c1",
  projectId: "p1",
  origin: "",
  section: "characters",
  name: "Zombie Colony",
  theme: "",
  tags: [],
  palette: { background: "", button: "", outline: "", highlight: "", text: "" },
  notes: "",
  refs: [],
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  ...patch,
});

const request = (patch: Partial<CharacterRequest> = {}): CharacterRequest => ({
  description: "colony soldier, olive uniform, steel helmet, gas mask",
  body: "humanoid",
  equipment: [],
  name: "soldier",
  refCount: 0,
  designCount: 0,
  ...patch,
});

test("old projects read as GUI projects; characters keep their section", () => {
  const [old, chars] = parseGuiStyles([
    { id: "a", projectId: "p", name: "Old", createdAt: "x", updatedAt: "x" },
    { id: "b", projectId: "p", name: "Chars", section: "characters", createdAt: "x", updatedAt: "x" },
  ]);
  assert.equal(old!.section, "gui");
  assert.equal(chars!.section, "characters");
});

test("held items: split on lines, ';' and ','", () => {
  assert.deepEqual(parseEquipment("rifle; combat knife\n- torch, round shield"), ["rifle", "combat knife", "torch", "round shield"]);
  assert.deepEqual(parseEquipment(undefined), []);
});

test("file names come from the name or the first words of the description", () => {
  assert.equal(characterSlug("Soldier", "anything"), "soldier");
  assert.equal(characterSlug("", "Colony ranger, green hood, long cape"), "colony-ranger");
  assert.equal(characterSlug("", "солдат"), "character");
});

test("the 3D front: A-pose, empty hands, white, orthographic; held items named only to be left out", () => {
  const [job] = characterJobs("model", request({ equipment: ["assault rifle"] }), null);
  assert.equal(job!.label, "model");
  assert.equal(job!.aspectRatio, "2:3");
  assert.equal(job!.layout, undefined);
  const prompt = job!.prompt;
  assert.match(prompt, /A-pose/);
  assert.match(prompt, /Carries nothing/);
  assert.match(prompt, /Nothing hangs between or in front of the legs/);
  assert.match(prompt, /pure white/);
  assert.match(prompt, /orthographic/);
  assert.match(prompt, /Leave out what the character holds \(assault rifle\)/);
  assert.equal(prompt.match(/assault rifle/g)!.length, 1);
});

test("design pictures are numbered after the style references", () => {
  const withRefs = style({ refs: [{ id: "r1", filename: "a.png", mimeType: "image/png", role: "concept" }] });
  const [job] = characterJobs("model", request({ refCount: 1, designCount: 1 }), withRefs);
  assert.match(job!.prompt, /Image 1 shows an approved character of this game/);
  assert.match(job!.prompt, /Image 2 is the approved design of this character/);
  const [turn] = characterJobs("turnaround", request({ description: "", designCount: 1 }), null);
  assert.match(turn!.prompt, /Image 1 is the approved design/);
  assert.doesNotMatch(turn!.prompt, /Character: \./);
});

test("turnaround: one row of front, right, back, left on a wide frame", () => {
  const [job] = characterJobs("turnaround", request(), null);
  assert.equal(job!.aspectRatio, "16:9");
  assert.deepEqual(job!.layout!.cells.map((cell) => cell.name), [...TURNAROUND_VIEWS]);
  assert.deepEqual([job!.layout!.rows, job!.layout!.cols], [1, 4]);
  assert.match(job!.prompt, /nose pointing to the right edge/);
  assert.match(job!.prompt, /Carries nothing/);
});

test("equipment: the listed items alone in a grid, named after them", () => {
  const [job] = characterJobs("equipment", request({ description: "", equipment: ["assault rifle", "combat knife", "gas grenade"] }), null);
  assert.deepEqual(job!.layout!.cells.map((cell) => cell.name), ["assault-rifle", "combat-knife", "gas-grenade"]);
  assert.match(job!.prompt, /1\. assault rifle; 2\. combat knife/);
  assert.match(job!.prompt, /No hands, no character/);
  assert.doesNotMatch(job!.prompt, /A-pose/);
  assert.throws(() => characterJobs("equipment", request(), null), /List the held items/);
  assert.throws(() => characterJobs("equipment", request({ equipment: Array.from({ length: 9 }, (_, i) => `item ${i}`) }), null), /At most 8/);
});

test("ideas: four presets for a fresh project, four takes inside a fixed one; equipment may be held", () => {
  const fresh = characterJobs("ideas", request({ equipment: ["rifle"] }), style({ theme: "zombie frontier" }));
  assert.equal(fresh.length, 4);
  assert.match(fresh[0]!.label, /idea 1: stylized/);
  assert.ok(fresh.every((job) => job.prompt.includes("Game and mood: zombie frontier.")));
  assert.match(fresh[0]!.prompt, /holding its equipment \(rifle\)/);
  assert.ok(fresh[1]!.prompt.includes(CHARACTER_PRESETS.blocky));
  const fixed = characterJobs("ideas", request(), style({ tags: ["toon"] }));
  assert.deepEqual(fixed.map((job) => job.label), ["idea 1", "idea 2", "idea 3", "idea 4"]);
  assert.ok(fixed.every((job) => job.prompt.includes(CHARACTER_PRESETS.toon)));
});

test("a description or a design picture is required", () => {
  assert.throws(() => characterJobs("model", request({ description: " " }), null), /Describe the character/);
});

function sheet(width: number, height: number, boxes: Array<[number, number, number, number]>): Rgba {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * width + x) * 4;
        data[p] = 90;
        data[p + 1] = 110;
        data[p + 2] = 60;
      }
    }
  }
  return { data, width, height };
}

test("white cut: views found by their white gaps even off-centre, each on a white square", () => {
  // Uneven figures: the gaps are not at the quarters.
  const image = sheet(400, 200, [
    [10, 20, 60, 190],
    [130, 20, 160, 190],
    [200, 25, 270, 190],
    [330, 20, 380, 190],
  ]);
  const layout = { rows: 1, cols: 4, cells: TURNAROUND_VIEWS.map((name) => ({ name, element: name })) };
  const cut = cutOnWhite(image, layout);
  assert.equal(cut.even, false);
  assert.deepEqual(cut.missing, []);
  assert.deepEqual(cut.parts.map((part) => part.name), ["front", "right", "back", "left"]);
  assert.deepEqual(cut.parts[1]!.box, { x0: 130, y0: 20, x1: 160, y1: 190 });
  const front = cut.parts[0]!.image;
  assert.equal(front.width, front.height);
  assert.equal(front.data[0], 255);
  const centre = ((front.height >> 1) * front.width + (front.width >> 1)) * 4;
  assert.equal(front.data[centre], 90);
});

test("white cut: an empty cell is reported missing; a grid is cut row by row", () => {
  const image = sheet(300, 200, [
    [10, 10, 90, 60],
    [160, 10, 290, 60],
    [10, 120, 90, 180],
  ]);
  const layout = {
    rows: 2,
    cols: 2,
    cells: ["rifle", "knife", "torch", "shield"].map((name) => ({ name, element: name })),
  };
  const cut = cutOnWhite(image, layout);
  assert.deepEqual(cut.parts.map((part) => part.name), ["rifle", "knife", "torch"]);
  assert.deepEqual(cut.missing, ["shield"]);
});

test("body types: their own pose, camera and frame; long and wide bodies get a 2x2 turnaround", () => {
  const [horse] = characterJobs("model", request({ body: "quadruped", description: "war horse" }), null);
  assert.equal(horse!.aspectRatio, "3:2");
  assert.match(horse!.prompt, /three-quarter front view/);
  assert.match(horse!.prompt, /all four legs/);
  assert.doesNotMatch(horse!.prompt, /A-pose for 3D rigging/);
  const [harpy] = characterJobs("model", request({ body: "winged", description: "harpy" }), null);
  assert.equal(harpy!.aspectRatio, "4:3");
  assert.match(harpy!.prompt, /wings fully spread out/);
  const [turn] = characterJobs("turnaround", request({ body: "quadruped" }), null);
  assert.deepEqual([turn!.layout!.rows, turn!.layout!.cols], [2, 2]);
  assert.equal(turn!.aspectRatio, "4:3");
  assert.match(turn!.prompt, /2×2 grid/);
});

test("equipment follows the project's style when one is set", () => {
  const [plain] = characterJobs("equipment", request({ equipment: ["sword"] }), null);
  assert.match(plain!.prompt, /clean game prop renders/);
  const [painted] = characterJobs("equipment", request({ equipment: ["sword"] }), style({ tags: ["painted"] }));
  assert.match(painted!.prompt, /exactly the same art style and finish as the character style above/);
  assert.ok(painted!.prompt.includes(CHARACTER_PRESETS.painted));
});

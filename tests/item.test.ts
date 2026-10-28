import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addEntry,
  createItem,
  itemSchema,
  itemSummary,
  nextStep,
  priceFor,
  selectEntry,
  stepStatus,
} from "../src/item.ts";

test("createItem initializes empty steps", () => {
  const item = createItem({ id: "plunger-scepter", project: "lava-arena", now: "2026-01-01T00:00:00.000Z" });
  assert.equal(item.id, "plunger-scepter");
  assert.equal(item.steps.concept.status, "empty");
  assert.equal(stepStatus(item, "concept"), "empty");
});

test("addEntry and selectEntry record selectedBy", () => {
  let item = createItem({ id: "x", project: "p", now: "2026-01-01T00:00:00.000Z" });
  item = addEntry(item, "concept", {
    id: "c1",
    source: "attached",
    createdAt: "2026-01-01T00:00:00.000Z",
    files: { concept: "a.png" },
  });
  assert.equal(item.steps.concept.selected, null);
  item = selectEntry(item, "concept", "c1", "cli");
  assert.equal(item.steps.concept.selected, "c1");
  assert.equal(item.steps.concept.selectedBy, "cli");
  assert.equal(item.steps.concept.status, "done");
});

test("nextStep and itemSummary name the next step", () => {
  let item = createItem({ id: "x", project: "p", now: "2026-01-01T00:00:00.000Z" });
  assert.equal(nextStep(item), "concept");
  const summary = itemSummary(item);
  assert.match(summary, /Continue with step "concept"/);
  item = selectEntry(
    addEntry(item, "concept", {
      id: "c1",
      source: "attached",
      createdAt: "2026-01-01T00:00:00.000Z",
      files: { concept: "a.png" },
    }),
    "concept",
    "c1",
    "agent",
  );
  assert.equal(nextStep(item), "blueprint");
  assert.match(itemSummary(item), /Continue with step "blueprint"/);
});

test("priceFor known and unknown", () => {
  assert.equal(priceFor("muse-image", "fal"), 0.01);
  assert.equal(priceFor("nano-banana-2.1", "kie", "1K"), 0.02);
  assert.equal(priceFor("nano-banana-2.1", "kie", "2K"), null);
  assert.equal(priceFor("unknown", "fal"), null);
});

test("item.json schema round-trip", () => {
  const item = createItem({ id: "round-trip", project: "demo", now: "2026-01-01T00:00:00.000Z" });
  const json = JSON.stringify(item);
  const again = itemSchema.parse(JSON.parse(json));
  assert.deepEqual(again, item);
});

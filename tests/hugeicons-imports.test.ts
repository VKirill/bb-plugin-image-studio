import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", "dist", ".git", ".bb", ".gitnexus", "bb-plugin-image-generator"]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(name.name)) continue;
    const path = join(dir, name.name);
    if (name.isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx|mts|cts)$/.test(name.name)) acc.push(path);
  }
  return acc;
}

test("frontend does not import the hugeicons barrel", () => {
  const files = walk(ROOT);
  assert.ok(files.length > 0);
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/from\s+["']@hugeicons\/core-free-icons["']/.test(text)) hits.push(file);
  }
  assert.deepEqual(hits, []);
});

test("icon modules load from per-file hugeicons paths", () => {
  const text = readFileSync(join(ROOT, "lib/hugeicons.ts"), "utf8");
  assert.match(text, /@hugeicons\/core-free-icons\/ZapIcon/);
  assert.doesNotMatch(text, /from ["']@hugeicons\/core-free-icons["']/);
});

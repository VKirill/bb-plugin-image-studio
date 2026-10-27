import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
/** BB agent skill registration limit (bytes/chars in frontmatter). */
export const SKILL_DESCRIPTION_MAX = 1024;

export function assertSkillDescriptionLength(description: string, max = SKILL_DESCRIPTION_MAX): void {
  if (description.length > max) {
    throw new Error(`description length ${description.length} exceeds ${max}`);
  }
}

function findSkillFiles(): string[] {
  const skillsDir = join(ROOT, "skills");
  const out: string[] = [];
  function walk(dir: string): void {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, ent.name);
      if (ent.isDirectory()) walk(path);
      else if (ent.name === "SKILL.md") out.push(path);
    }
  }
  walk(skillsDir);
  return out;
}

function parseFrontmatter(file: string): { name: string; description: string } {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\nname:\s*(.+)\r?\ndescription:\s*(.+)\r?\n---/);
  assert.ok(match, `frontmatter missing in ${file}`);
  return { name: match[1]!.trim(), description: match[2]!.trim() };
}

test("every skills/**/SKILL.md: name matches folder, description <= 1024", () => {
  const files = findSkillFiles();
  assert.ok(files.length > 0);
  for (const file of files) {
    const { name, description } = parseFrontmatter(file);
    assert.equal(name, basename(dirname(file)), `${file}: name must match parent folder`);
    assertSkillDescriptionLength(description);
  }
});

test("description length guard rejects text over 1024", () => {
  assert.throws(() => assertSkillDescriptionLength("x".repeat(SKILL_DESCRIPTION_MAX + 1)));
  assertSkillDescriptionLength("x".repeat(SKILL_DESCRIPTION_MAX));
});

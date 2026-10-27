import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
/** BB agent skill registration limit (bytes/chars in frontmatter). */
export const SKILL_DESCRIPTION_MAX = 1024;

const UNQUOTED_FORBIDDEN_START = /^[{&*!|>'"%@`]/;
const INVALID_UNQUOTED = /: | #/;

export function assertSkillDescriptionLength(description: string, max = SKILL_DESCRIPTION_MAX): void {
  if (description.length > max) {
    throw new Error(`description length ${description.length} exceeds ${max}`);
  }
}

function parseQuotedScalar(raw: string, file: string, key: string): string {
  if (!raw.startsWith('"')) {
    throw new Error(`${file}: ${key} must be quoted or a plain scalar`);
  }
  let out = "";
  let escaped = false;
  for (let i = 1; i < raw.length; i++) {
    const ch = raw[i]!;
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') return out;
    out += ch;
  }
  throw new Error(`${file}: unclosed quote in ${key}`);
}

function parseScalarValue(raw: string, file: string, key: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"')) return parseQuotedScalar(trimmed, file, key);
  if (UNQUOTED_FORBIDDEN_START.test(trimmed) || INVALID_UNQUOTED.test(trimmed)) {
    throw new Error(`${file}: invalid unquoted ${key} (colon-space, hash, or special start)`);
  }
  return trimmed;
}

export function parseSkillFrontmatter(file: string): { name: string; description: string } {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, `frontmatter missing in ${file}`);
  const body = match[1]!;
  const fields: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    assert.ok(colon > 0, `${file}: frontmatter line must be key: value — got "${line}"`);
    const key = line.slice(0, colon).trim();
    const value = parseScalarValue(line.slice(colon + 1), file, key);
    fields[key] = value;
  }
  assert.ok(fields.name, `${file}: missing name`);
  assert.ok(fields.description, `${file}: missing description`);
  return { name: fields.name, description: fields.description };
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

test("every skills/**/SKILL.md: valid frontmatter, name matches folder, description <= 1024", () => {
  const files = findSkillFiles();
  assert.ok(files.length > 0);
  for (const file of files) {
    const { name, description } = parseSkillFrontmatter(file);
    assert.equal(name, basename(dirname(file)), `${file}: name must match parent folder`);
    assertSkillDescriptionLength(description);
  }
});

test("description length guard rejects text over 1024", () => {
  assert.throws(() => assertSkillDescriptionLength("x".repeat(SKILL_DESCRIPTION_MAX + 1)));
  assertSkillDescriptionLength("x".repeat(SKILL_DESCRIPTION_MAX));
});

test("frontmatter guard rejects 0.8.7-style colon-space in an unquoted description", () => {
  const broken = 'description: Generate through Image Studio (fal.ai/kie.ai: Nano Banana).';
  assert.throws(() => parseScalarValue(broken.slice("description:".length), "fixture", "description"));
});

test("quoted description allows former colon-space wording", () => {
  const quoted = '"Generate through Image Studio (fal.ai/kie.ai: Nano Banana)."';
  assert.match(parseScalarValue(quoted, "fixture", "description"), /kie\.ai: Nano/);
});

test("image-studio description line has no unquoted colon-space (Lane Pilot awk verify)", () => {
  const skillMd = join(ROOT, "skills/image-studio/SKILL.md");
  const line3 = readFileSync(skillMd, "utf8").split(/\r?\n/)[2] ?? "";
  const value = line3.replace(/^description:\s*/, "");
  if (!value.startsWith('"')) {
    assert.ok(!/: /.test(value), "unquoted description must not contain ': '");
  }
  assert.ok(!existsSync(join(ROOT, "skills/image-studio/yaml.py")), "no Python yaml shim in skills/image-studio");
});

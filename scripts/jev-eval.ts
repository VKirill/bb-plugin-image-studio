// Live evaluation of the Jev reference selector against the keyword rules.
// Costs a few cents of Jev tokens, no image generation.
//   node --experimental-strip-types scripts/jev-eval.ts [--model jev-1.13.0] [--base-url https://api.openlux.ai/v1] [--key-file path] [--fixture file.json] [--slot-threshold 0.5] [--out file.json]
// The key is read from TYPESAFE_API_KEY or ~/secrets/typesafe.env (or OPENLUX_API_KEY with --base-url); it is never printed.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_JEV_POLICY, askJev, jevCues, type JevAnswers } from "../src/jev.ts";
import { selectRefs } from "../src/refs.ts";
import { SLOT_IDS, type SlotId } from "../src/slots.ts";

type Case = { id: string; prompt: string; model: never; gender?: "male" | "female"; noPerson?: boolean; must: SlotId[]; mustNot: SlotId[] };

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

function readKey(): string {
  if (arg("--key-file")) return readFileSync(arg("--key-file")!, "utf8").trim();
  if (arg("--base-url")?.includes("openlux") && process.env.OPENLUX_API_KEY) return process.env.OPENLUX_API_KEY;
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  try {
    const text = readFileSync(join(homedir(), "secrets", "typesafe.env"), "utf8");
    const match = /^TYPESAFE_API_KEY=(.+)$/m.exec(text);
    if (match) return match[1]!.trim().replace(/^["']|["']$/g, "");
  } catch {
    // fall through
  }
  throw new Error("No TYPESAFE_API_KEY in the environment or ~/secrets/typesafe.env");
}

const cases = JSON.parse(readFileSync(arg("--fixture") ?? join(import.meta.dirname, "..", "tests", "fixtures", "refs-eval.json"), "utf8")) as Case[];
const policy = { ...DEFAULT_JEV_POLICY, slotThreshold: Number(arg("--slot-threshold") ?? DEFAULT_JEV_POLICY.slotThreshold) };
const apiKey = readKey();
const baseUrl = arg("--base-url");
const jevModel = arg("--model");
// Cases written for Qwen are judged as Wan: the same nude rule, without Qwen's 4-image generate cap.
const forSelection = (model: string) => (model === "qwen-image-2.1" ? "wan-2.7" : model);

function check(used: readonly SlotId[], c: Case): string[] {
  const problems: string[] = [];
  for (const slot of c.must) if (!used.includes(slot)) problems.push(`missing ${slot}`);
  for (const slot of c.mustNot) if (used.includes(slot)) problems.push(`unwanted ${slot}`);
  return problems;
}

const rows: Array<Record<string, unknown>> = [];
let keywordPass = 0;
let jevPass = 0;
const latencies: number[] = [];
let jevErrors = 0;

for (const c of cases) {
  const gender = c.gender ?? "female";
  const filled = [...SLOT_IDS];
  const keywords = selectRefs({ prompt: c.prompt, filled, mode: { kind: "auto" }, budget: 20, model: forSelection(c.model) });
  const kwProblems = check(keywords.used, c);
  if (c.noPerson && keywords.used.length > 0) kwProblems.push("sends references for a picture without a person");
  if (kwProblems.length === 0) keywordPass += 1;

  let jevUsed: SlotId[] = [];
  let jevProblems: string[] = [];
  let scores: Record<string, number | string> = {};
  let ms = 0;
  try {
    const t0 = Date.now();
    const answers: JevAnswers = await askJev(
      { prompt: c.prompt, model: c.model, gender, sourceCount: 0, filled },
      { apiKey, baseUrl, model: jevModel, timeoutMs: 15_000 },
    );
    ms = Date.now() - t0;
    latencies.push(ms);
    const cues = jevCues(answers, { model: c.model, filled }, policy);
    scores = cues.scores;
    jevUsed = selectRefs({ prompt: c.prompt, filled, mode: { kind: "auto" }, budget: 20, model: forSelection(c.model), cues: cues.cues, noPerson: cues.noPerson }).used;
    jevProblems = check(jevUsed, c);
    if (c.noPerson && jevUsed.length > 0) jevProblems.push("sends references for a picture without a person");
    if (!c.noPerson && cues.noPerson) jevProblems.push("thinks there is no person");
  } catch (error) {
    jevErrors += 1;
    jevProblems = [`error: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (jevProblems.length === 0) jevPass += 1;
  rows.push({ id: c.id, ms, keywords: { used: keywords.used, problems: kwProblems }, jev: { used: jevUsed, problems: jevProblems, scores } });
  console.log(`${c.id.padEnd(26)} kw:${kwProblems.length === 0 ? "ok  " : "FAIL"} jev:${jevProblems.length === 0 ? "ok  " : "FAIL"} ${ms}ms ${[...kwProblems.map((p) => `kw ${p}`), ...jevProblems.map((p) => `jev ${p}`)].join("; ")}`);
}

latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
const summary = {
  prompts: cases.length,
  keywordAccuracy: `${keywordPass}/${cases.length}`,
  jevAccuracy: `${jevPass}/${cases.length}`,
  jevErrors,
  latencyMs: { min: latencies[0], p50: pct(0.5), p90: pct(0.9), max: latencies[latencies.length - 1] },
  slotThreshold: policy.slotThreshold,
};
console.log(JSON.stringify(summary, null, 2));
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));

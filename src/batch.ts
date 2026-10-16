/** `generate --count N` and `generate --batch file.jsonl`: one job per variant or per line. */

export const MAX_BATCH = 20;

export type BatchJob = {
  prompt: string;
  model?: string;
  gateway?: string;
  profile?: string;
  images?: string[];
  aspectRatio?: string;
  resolution?: string;
  refs?: string;
  seed?: number;
};

export type BatchDefaults = Omit<BatchJob, "prompt">;

export type BatchParse = { ok: true; jobs: BatchJob[] } | { ok: false; error: string };

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * One JSON object per line. Fields: prompt (or the CLI --prompt as a default), model, gateway, profile, refs,
 * image (string) or images (array), aspect, resolution, count (repeat the line N times).
 * CLI flags are the defaults for every line. Blank lines and lines starting with # are skipped.
 */
export function parseBatchLines(raw: string, defaults: BatchDefaults, defaultPrompt?: string): BatchParse {
  const jobs: BatchJob[] = [];
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index]!.trim();
    if (source === "" || source.startsWith("#")) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(source);
    } catch {
      return { ok: false, error: `Batch line ${index + 1} is not valid JSON.` };
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: `Batch line ${index + 1} must be a JSON object.` };
    }
    const item = entry as Record<string, unknown>;
    const prompt = text(item.prompt) ?? text(defaultPrompt);
    if (!prompt) return { ok: false, error: `Batch line ${index + 1} has no "prompt".` };
    const images = Array.isArray(item.images)
      ? item.images.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : text(item.image)
        ? [text(item.image)!]
        : defaults.images;
    const repeat = item.count === undefined ? 1 : Number(item.count);
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_BATCH) {
      return { ok: false, error: `Batch line ${index + 1}: "count" must be a whole number from 1 to ${MAX_BATCH}.` };
    }
    const job: BatchJob = {
      prompt,
      model: text(item.model) ?? defaults.model,
      gateway: text(item.gateway) ?? defaults.gateway,
      profile: text(item.profile) ?? defaults.profile,
      images,
      aspectRatio: text(item.aspect) ?? text(item.aspectRatio) ?? defaults.aspectRatio,
      resolution: text(item.resolution) ?? defaults.resolution,
      refs: text(item.refs) ?? defaults.refs,
      seed: item.seed === undefined ? defaults.seed : Number(item.seed),
    };
    if (job.seed !== undefined && (!Number.isInteger(job.seed) || job.seed < 0)) {
      return { ok: false, error: `Batch line ${index + 1}: "seed" must be a whole number.` };
    }
    for (let copy = 0; copy < repeat; copy += 1) jobs.push({ ...job });
    if (jobs.length > MAX_BATCH) {
      return { ok: false, error: `A batch runs at most ${MAX_BATCH} jobs; this one has more.` };
    }
  }
  if (jobs.length === 0) return { ok: false, error: "The batch file has no jobs." };
  return { ok: true, jobs };
}

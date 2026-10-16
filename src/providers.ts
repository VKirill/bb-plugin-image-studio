import { parseRetryAfter, retryWhile, type RetryOptions } from "./queue.ts";
import { falHasPromptExpansion, falSafetyFields, kieHasNsfwChecker } from "./safety.ts";

export function formatUnknownError(value: unknown, depth = 0): string {
  if (value instanceof Error) {
    if (depth > 4) return value.message || value.name;
    const cause = (value as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      return `${value.message}: ${formatUnknownError(cause, depth + 1)}`;
    }
    return value.message || value.name;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export type GeneratedImage = {
  url: string;
  mimeType: string;
  /** The seed the provider reports, else the one we sent. */
  seed?: number;
};

export type ProviderJob = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceDataUris: string[];
  /** Optional: repeat or vary a result. Sent to Qwen on kie and to fal models. */
  seed?: number;
  kieRefField?: "image_input" | "input_urls" | "image_urls";
};

type JsonObject = Record<string, unknown>;

function presetImageSize(
  aspect?: string,
): "square_hd" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9" {
  if (!aspect || aspect === "1:1") return "square_hd";
  if (aspect === "9:16") return "portrait_16_9";
  if (aspect === "4:5" || aspect === "3:4" || aspect === "2:3") return "portrait_4_3";
  if (aspect === "16:9" || aspect === "21:9") return "landscape_16_9";
  return "landscape_4_3";
}

/** Wan 2.7 on kie takes 1:1, 16:9, 4:3, 21:9, 3:4, 9:16, 8:1, 1:8. Nearest allowed for the rest. */
export function wanAspect(aspect: string): string {
  const map: Record<string, string> = { "4:5": "3:4", "2:3": "3:4", "3:2": "4:3", "5:4": "4:3" };
  return map[aspect] ?? aspect;
}

function gpt25Quality(resolution?: string): "medium" | "high" | "xhigh" {
  if (resolution === "1K") return "medium";
  if (resolution === "4K") return "xhigh";
  return "high";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Generation cancelled"));
      },
      { once: true },
    );
  });
}

type Probe = { response: Response; text: string; body: JsonObject | null };

/** Fetches and parses the body without throwing, so the caller can decide to retry first. */
async function probe(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Probe> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let body: JsonObject | null = null;
  try {
    body = text.trim() ? (JSON.parse(text) as JsonObject) : null;
  } catch {
    body = null;
  }
  return { response, text, body };
}

function jsonOf(result: Probe): JsonObject {
  if (!result.text.trim()) {
    throw new Error(`Empty response from ${result.response.url} (${result.response.status})`);
  }
  if (!result.body) {
    throw new Error(`Non-JSON response from ${result.response.url} (${result.response.status})`);
  }
  return result.body;
}

function retryAfterOf(result: Probe): number | undefined {
  return parseRetryAfter(result.response.headers.get("retry-after"));
}

/** Rate limit: kie answers HTTP 200 with `code: 429` in the body, fal with HTTP 429. Nothing was created, so retrying is free. */
function rateLimited(result: Probe): boolean {
  return result.response.status === 429 || Number(result.body?.code) === 429;
}

/** Safe to repeat (reads, uploads): rate limit or a server error. */
function transient(result: Probe): { retry: boolean; retryAfterMs?: number } {
  const status = result.response.status;
  const code = Number(result.body?.code);
  const retry = rateLimited(result) || status >= 500 || (code >= 500 && code < 600);
  return { retry, retryAfterMs: retry ? retryAfterOf(result) : undefined };
}

/** Task creation: only a rate limit (or 503, "not processed") is retried, so a paid task is never created twice. */
function notCreated(result: Probe): { retry: boolean; retryAfterMs?: number } {
  const retry = rateLimited(result) || result.response.status === 503;
  return { retry, retryAfterMs: retry ? retryAfterOf(result) : undefined };
}

export function falPollUrls(
  endpoint: string,
  requestId: string,
  submitted: { status_url?: string; response_url?: string },
): { statusUrl: string; resultUrl: string } {
  return {
    statusUrl: submitted.status_url || `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
    resultUrl: submitted.response_url || `https://queue.fal.run/${endpoint}/requests/${requestId}`,
  };
}

async function kieUploadReference(
  apiKey: string,
  value: string,
  index: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
  retry?: RetryOptions,
): Promise<string> {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const uploadPath = "image-studio";
  const fileName = `ref-${index}.png`;
  const isData = value.startsWith("data:");
  const url = isData
    ? "https://kieai.redpandaai.co/api/file-base64-upload"
    : "https://kieai.redpandaai.co/api/file-url-upload";
  const body = isData
    ? { base64Data: value, uploadPath, fileName }
    : { fileUrl: value, uploadPath, fileName };
  const uploaded = await retryWhile(
    () => probe(fetchImpl, url, { method: "POST", headers, body: JSON.stringify(body), signal }),
    transient,
    retry,
  );
  const payload = jsonOf(uploaded);
  const data = (payload.data ?? payload) as JsonObject;
  const hosted = String(data.downloadUrl || data.fileUrl || "");
  if (!uploaded.response.ok || !hosted) {
    throw new Error(
      formatUnknownError(payload.msg || payload.message || `kie.ai file upload failed (${uploaded.response.status})`),
    );
  }
  return hosted;
}

export async function kieGenerate(
  apiKey: string,
  kieModel: string,
  job: ProviderJob,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  retry?: RetryOptions,
): Promise<GeneratedImage> {
  const qwen = kieModel.startsWith("qwen2-1");
  const wan = kieModel.startsWith("wan/");
  const input: Record<string, unknown> = { prompt: job.prompt };
  // Wan's kie schema has no output_format; everything else here takes png.
  if (!wan) input.output_format = "png";
  // Only models whose kie schema lists the flag get it.
  if (kieHasNsfwChecker(kieModel)) input.nsfw_checker = false;
  // Wan creates 4 images by default (n = 4 unless sequential): one is what we save and pay for.
  if (wan) input.n = 1;
  // Qwen's prompt enhancer is on by default and rewrites the prompt into a fuller scene; with several
  // reference photos it turns "Image 1 is a face reference" into reference-sheet collages. Send the prompt as written.
  if (qwen) input.enhance_prompt = false;
  if (qwen && job.seed !== undefined) input.seed = job.seed;
  if (job.aspectRatio) {
    input.aspect_ratio = qwen ? (job.aspectRatio === "4:5" ? "3:4" : job.aspectRatio) : wan ? wanAspect(job.aspectRatio) : job.aspectRatio;
  }
  if (job.resolution) {
    input.resolution = (qwen || wan) && job.resolution === "4K" ? "2K" : job.resolution;
  }
  // kie rejects Wan's aspect_ratio without a resolution ("aspect_ratio requires resolution"). 2K is its documented default.
  if (wan && input.aspect_ratio && !input.resolution) input.resolution = "2K";
  if (job.referenceDataUris.length > 0) {
    const urls = await Promise.all(
      job.referenceDataUris.map((value, index) => kieUploadReference(apiKey, value, index, fetchImpl, signal, retry)),
    );
    input[job.kieRefField ?? "image_input"] = urls;
  }
  const created = await retryWhile(
    () =>
      probe(fetchImpl, "https://api.kie.ai/api/v1/jobs/createTask", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: kieModel, input }),
        signal,
      }),
    notCreated,
    retry,
  );
  const createdBody = jsonOf(created);
  const createdData = (createdBody.data ?? {}) as JsonObject;
  if (!created.response.ok || (createdBody.code !== undefined && createdBody.code !== 200)) {
    throw new Error(
      formatUnknownError(
        createdBody.msg || createdBody.message || `kie.ai createTask failed (${created.response.status})`,
      ),
    );
  }
  const taskId = String(createdData.taskId || "");
  if (!taskId) throw new Error("kie.ai did not return a task id");

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    await sleep(2500, signal);
    const status = await retryWhile(
      () =>
        probe(fetchImpl, `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal,
        }),
      transient,
      retry,
    );
    const payload = jsonOf(status);
    const data = (payload.data ?? {}) as JsonObject;
    const state = String(data.state || "");
    if (state === "fail") {
      throw new Error(formatUnknownError(data.failMsg || payload.msg || "kie.ai generation failed"));
    }
    if (state === "success") {
      let urls: string[] = [];
      try {
        const parsed = JSON.parse(String(data.resultJson || "{}")) as { resultUrls?: string[] };
        urls = parsed.resultUrls ?? [];
      } catch {
        urls = [];
      }
      const url = urls[0];
      if (!url) throw new Error("kie.ai finished without an image URL");
      const reported = (() => {
        try {
          return Number((JSON.parse(String(data.resultJson || "{}")) as { seed?: unknown }).seed);
        } catch {
          return Number.NaN;
        }
      })();
      return { url, mimeType: "image/png", seed: Number.isFinite(reported) ? reported : job.seed };
    }
  }
  throw new Error("kie.ai timed out while generating the image");
}

function falHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function falImages(body: JsonObject): Array<JsonObject> {
  const nested = body.data && typeof body.data === "object" ? (body.data as JsonObject) : body;
  return Array.isArray(nested.images) ? (nested.images as Array<JsonObject>) : [];
}

export async function falGenerate(
  apiKey: string,
  endpoint: string,
  job: ProviderJob,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  pollMs = 180_000,
  retry?: RetryOptions,
): Promise<GeneratedImage> {
  const input: Record<string, unknown> = {
    prompt: job.prompt,
    output_format: "png",
    ...falSafetyFields(endpoint),
  };
  if (falHasPromptExpansion(endpoint)) input.enable_prompt_expansion = false;
  const gpt25 = endpoint.includes("gpt-image-2.5") || endpoint.includes("openai/gpt-image");
  const presetSize =
    gpt25 ||
    endpoint.includes("flux-2") ||
    endpoint.includes("seedream") ||
    endpoint.includes("grok-imagine") ||
    endpoint.includes("/wan/");
  if (gpt25) {
    input.image_size = presetImageSize(job.aspectRatio);
    input.quality = gpt25Quality(job.resolution);
    input.num_images = 1;
  } else if (presetSize) {
    input.image_size = presetImageSize(job.aspectRatio);
  } else {
    input.num_images = 1;
    if (job.aspectRatio) input.aspect_ratio = job.aspectRatio;
    if (job.resolution && !endpoint.startsWith("meta/")) input.resolution = job.resolution;
  }
  if (job.referenceDataUris.length > 0) {
    input.image_urls = job.referenceDataUris;
  }
  if (job.seed !== undefined) input.seed = job.seed;

  // fal bills a finished request, and a request refused at submit was never queued: 429 and gateway errors are safe to repeat.
  const submitted = await retryWhile(
    () =>
      probe(fetchImpl, `https://queue.fal.run/${endpoint}`, {
        method: "POST",
        headers: falHeaders(apiKey),
        body: JSON.stringify(input),
        signal,
      }),
    (result) => {
      const status = result.response.status;
      const retry = status === 429 || status === 502 || status === 503 || status === 504;
      return { retry, retryAfterMs: retry ? retryAfterOf(result) : undefined };
    },
    retry,
  );
  const submittedBody = jsonOf(submitted);
  const requestId = String(submittedBody.request_id || "");
  if (!submitted.response.ok || !requestId) {
    throw new Error(
      `fal.ai submit failed (${submitted.response.status}): ${formatUnknownError(submittedBody.detail || submittedBody.error || submittedBody)}`,
    );
  }
  const { statusUrl, resultUrl } = falPollUrls(endpoint, requestId, {
    status_url: typeof submittedBody.status_url === "string" ? submittedBody.status_url : undefined,
    response_url: typeof submittedBody.response_url === "string" ? submittedBody.response_url : undefined,
  });
  const started = Date.now();
  let completed = false;
  while (Date.now() - started < pollMs) {
    const remain = pollMs - (Date.now() - started);
    if (remain <= 0) break;
    await sleep(Math.min(2000, remain), signal);
    const status = await retryWhile(
      () => probe(fetchImpl, statusUrl, { headers: falHeaders(apiKey), signal }),
      transient,
      retry,
    );
    const statusBody = jsonOf(status);
    if (!status.response.ok) {
      throw new Error(
        `fal.ai status failed (${status.response.status}): ${formatUnknownError(statusBody.detail || statusBody.error || statusBody)}`,
      );
    }
    if (statusBody.status === "FAILED" || (statusBody.status === "COMPLETED" && statusBody.error)) {
      throw new Error(
        `fal.ai generation failed: ${formatUnknownError(statusBody.error || statusBody.detail || "fal.ai generation failed")}`,
      );
    }
    if (statusBody.status === "COMPLETED") {
      completed = true;
      break;
    }
  }
  if (!completed) {
    throw new Error("fal.ai timed out while generating the image");
  }
  const result = await retryWhile(
    () => probe(fetchImpl, resultUrl, { headers: falHeaders(apiKey), signal }),
    transient,
    retry,
  );
  const resultBody = jsonOf(result);
  const images = falImages(resultBody);
  const image = images[0];
  const url = image && typeof image.url === "string" ? image.url : "";
  if (!url) {
    throw new Error(
      `fal.ai finished without an image URL: ${formatUnknownError(resultBody.detail || resultBody.error || resultBody)}`,
    );
  }
  const falSeed = Number(resultBody.seed);
  return {
    url,
    mimeType: typeof image.content_type === "string" ? image.content_type : "image/png",
    seed: Number.isFinite(falSeed) ? falSeed : job.seed,
  };
}

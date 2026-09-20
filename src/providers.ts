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
};

export type ProviderJob = {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceDataUris: string[];
  kieRefField?: "image_input" | "input_urls";
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

async function readJson(response: Response): Promise<JsonObject> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Empty response from ${response.url} (${response.status})`);
  }
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    throw new Error(`Non-JSON response from ${response.url} (${response.status})`);
  }
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
  const uploaded = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const payload = await readJson(uploaded);
  const data = (payload.data ?? payload) as JsonObject;
  const hosted = String(data.downloadUrl || data.fileUrl || "");
  if (!uploaded.ok || !hosted) {
    throw new Error(
      formatUnknownError(payload.msg || payload.message || `kie.ai file upload failed (${uploaded.status})`),
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
): Promise<GeneratedImage> {
  const input: Record<string, unknown> = {
    prompt: job.prompt,
    output_format: "png",
  };
  if (job.aspectRatio) input.aspect_ratio = job.aspectRatio;
  if (job.resolution) input.resolution = job.resolution;
  if (job.referenceDataUris.length > 0) {
    const urls = await Promise.all(
      job.referenceDataUris.map((value, index) => kieUploadReference(apiKey, value, index, fetchImpl, signal)),
    );
    input[job.kieRefField ?? "image_input"] = urls;
  }
  const created = await fetchImpl("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: kieModel, input }),
    signal,
  });
  const createdBody = await readJson(created);
  const createdData = (createdBody.data ?? {}) as JsonObject;
  if (!created.ok || (createdBody.code !== undefined && createdBody.code !== 200)) {
    throw new Error(
      formatUnknownError(createdBody.msg || createdBody.message || `kie.ai createTask failed (${created.status})`),
    );
  }
  const taskId = String(createdData.taskId || "");
  if (!taskId) throw new Error("kie.ai did not return a task id");

  const started = Date.now();
  while (Date.now() - started < 180_000) {
    await sleep(2500, signal);
    const status = await fetchImpl(
      `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal },
    );
    const payload = await readJson(status);
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
      return { url, mimeType: "image/png" };
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
): Promise<GeneratedImage> {
  const input: Record<string, unknown> = {
    prompt: job.prompt,
    output_format: "png",
  };
  const gpt25 = endpoint.includes("gpt-image-2.5") || endpoint.includes("openai/gpt-image");
  const presetSize =
    gpt25 ||
    endpoint.includes("flux-2") ||
    endpoint.includes("seedream") ||
    endpoint.includes("grok-imagine");
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

  const submitted = await fetchImpl(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: falHeaders(apiKey),
    body: JSON.stringify(input),
    signal,
  });
  const submittedBody = await readJson(submitted);
  const requestId = String(submittedBody.request_id || "");
  if (!submitted.ok || !requestId) {
    throw new Error(
      `fal.ai submit failed (${submitted.status}): ${formatUnknownError(submittedBody.detail || submittedBody.error || submittedBody)}`,
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
    const status = await fetchImpl(statusUrl, {
      headers: falHeaders(apiKey),
      signal,
    });
    const statusBody = await readJson(status);
    if (!status.ok) {
      throw new Error(
        `fal.ai status failed (${status.status}): ${formatUnknownError(statusBody.detail || statusBody.error || statusBody)}`,
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
  const result = await fetchImpl(resultUrl, {
    headers: falHeaders(apiKey),
    signal,
  });
  const resultBody = await readJson(result);
  const images = falImages(resultBody);
  const image = images[0];
  const url = image && typeof image.url === "string" ? image.url : "";
  if (!url) {
    throw new Error(
      `fal.ai finished without an image URL: ${formatUnknownError(resultBody.detail || resultBody.error || resultBody)}`,
    );
  }
  return { url, mimeType: typeof image.content_type === "string" ? image.content_type : "image/png" };
}

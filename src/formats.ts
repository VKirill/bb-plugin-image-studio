import { z } from "zod";
import type { EnabledModels, GatewayId, ModelId } from "./models.js";

export type { ModelId };

export const GENERATE_PICKER_ID = "generate-picker";

export const ASPECT_RATIOS = ["1:1", "4:5", "3:4", "2:3", "9:16", "3:2", "4:3", "16:9", "21:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

const MODEL_VALUES = [
  "nano-banana-2",
  "nano-banana-pro",
  "muse-image",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "flux-2-pro",
  "seedream-5",
  "grok-imagine",
] as const;

export const lastChoiceSchema = z.object({
  model: z.enum(MODEL_VALUES),
  gateway: z.enum(["fal", "kie"]),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  resolution: z.enum(RESOLUTIONS),
});
export type LastChoice = z.infer<typeof lastChoiceSchema>;

export const DEFAULT_LAST_CHOICE: LastChoice = {
  model: "nano-banana-2",
  gateway: "kie",
  aspectRatio: "4:5",
  resolution: "2K",
};

export function aspectLabel(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "";
  const ratio = width / height;
  let best: AspectRatio = "1:1";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const label of ASPECT_RATIOS) {
    const [w, h] = label.split(":").map(Number);
    if (!w || !h) continue;
    const diff = Math.abs(ratio - w / h);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

export function parseLastChoice(raw: unknown): LastChoice | null {
  let value = raw;
  if (value && typeof value === "object" && "model" in value) {
    const model = (value as { model?: unknown }).model;
    if (model === "gpt-image" || model === "gpt-image-1.5") {
      value = { ...(value as object), model: "gpt-image-2.5-flare" };
    }
  }
  const parsed = lastChoiceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function modelUsesResolution(model: ModelId): boolean {
  return model.startsWith("nano-banana") || model.startsWith("gpt-image");
}

export function gptImageSize(aspect?: string): "square_hd" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9" {
  if (!aspect || aspect === "1:1") return "square_hd";
  if (aspect === "9:16") return "portrait_16_9";
  if (aspect === "4:5" || aspect === "3:4" || aspect === "2:3") return "portrait_4_3";
  if (aspect === "16:9" || aspect === "21:9") return "landscape_16_9";
  return "landscape_4_3";
}

export function gptImageQuality(resolution?: string): "medium" | "high" | "xhigh" {
  if (resolution === "1K") return "medium";
  if (resolution === "4K") return "xhigh";
  return "high";
}

function parseAspect(value: string | undefined): AspectRatio | null {
  if (!value) return null;
  return (ASPECT_RATIOS as readonly string[]).includes(value) ? (value as AspectRatio) : null;
}

function parseResolution(value: string | undefined): Resolution | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return (RESOLUTIONS as readonly string[]).includes(normalized) ? (normalized as Resolution) : null;
}

function parseSuggestedModel(value: string | undefined): ModelId | null {
  if (!value) return null;
  const id = value.trim().toLowerCase();
  if (id === "nano-banana-2" || id === "nanobanana2" || id === "nb2") return "nano-banana-2";
  if (id === "nano-banana-pro" || id === "nanobananapro" || id === "nbpro") return "nano-banana-pro";
  if (id === "muse-image" || id === "muse") return "muse-image";
  if (
    id === "gpt-image-2.5-flare" ||
    id === "gpt-image-2.5" ||
    id === "gpt-image" ||
    id === "gpt" ||
    id === "gptimage" ||
    id === "gpt-image-1.5"
  ) {
    return "gpt-image-2.5-flare";
  }
  if (id === "gpt-image-2.5-sunburst" || id === "sunburst") return "gpt-image-2.5-sunburst";
  if (id === "flux-2-pro" || id === "flux" || id === "flux-2") return "flux-2-pro";
  if (id === "seedream-5" || id === "seedream") return "seedream-5";
  if (id === "grok-imagine" || id === "grok") return "grok-imagine";
  return null;
}

export type PickerEnabled = EnabledModels;

function availableModels(enabled: PickerEnabled): ModelId[] {
  return MODEL_VALUES.filter((id) => enabled[id]);
}

export function resolvePickerSelection(input: {
  enabled: PickerEnabled;
  defaultGateway: GatewayId;
  last: LastChoice | null;
  suggestedModel?: string;
  suggestedGateway?: string;
  suggestedAspect?: string;
  suggestedResolution?: string;
}): LastChoice {
  const available = availableModels(input.enabled);
  const suggestedModel = parseSuggestedModel(input.suggestedModel);
  const lastModel = input.last && available.includes(input.last.model) ? input.last.model : null;
  const model =
    (suggestedModel && available.includes(suggestedModel) ? suggestedModel : null) ??
    lastModel ??
    available[0] ??
    DEFAULT_LAST_CHOICE.model;

  let gateway: GatewayId;
  if (model === "muse-image") {
    gateway = "fal";
  } else if (input.suggestedGateway === "fal" || input.suggestedGateway === "kie") {
    gateway = input.suggestedGateway;
  } else {
    gateway = input.defaultGateway;
  }

  const aspectRatio =
    parseAspect(input.suggestedAspect) ??
    parseAspect(input.last?.aspectRatio) ??
    DEFAULT_LAST_CHOICE.aspectRatio;

  const resolution =
    parseResolution(input.suggestedResolution) ??
    (input.last && parseResolution(input.last.resolution)) ??
    DEFAULT_LAST_CHOICE.resolution;

  return { model, gateway, aspectRatio, resolution };
}

export const pickerPayloadSchema = z.object({
  prompt: z.string(),
  profileName: z.string().nullable(),
  models: z.array(
    z.object({
      id: z.enum(MODEL_VALUES),
      enabled: z.boolean(),
    }),
  ),
  selected: lastChoiceSchema,
  locale: z.enum(["en", "ru"]).optional(),
});
export type PickerPayload = z.infer<typeof pickerPayloadSchema>;

export const pickerResponseSchema = lastChoiceSchema;
export type PickerResponse = LastChoice;

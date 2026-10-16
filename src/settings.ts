import { z } from "zod";
import type { EnabledModels, GatewayId } from "./models.js";
import { MODEL_IDS, MODEL_SETTING } from "./models.ts";
import { JEV_MODEL, OPENLUX_BASE_URL } from "./jev.ts";
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY, MIN_CONCURRENCY, clampConcurrency } from "./queue.ts";

export const settingsSchema = z.object({
  nanoBanana2: z.boolean(),
  nanoBanana21: z.boolean(),
  nanoBananaPro: z.boolean(),
  museImage: z.boolean(),
  gptImage25Flare: z.boolean(),
  gptImage25Sunburst: z.boolean(),
  flux2Pro: z.boolean(),
  seedream5: z.boolean(),
  grokImagine: z.boolean(),
  qwenImage21: z.boolean(),
  wan27: z.boolean(),
  defaultGateway: z.enum(["fal", "kie"]),
  falKeyCatalog: z.string(),
  kieKeyCatalog: z.string(),
  uiLocale: z.enum(["auto", "en", "ru"]),
  /** Provider calls running at once, across the panel, chat, CLI and sheet builds. */
  concurrency: z.number().int().min(MIN_CONCURRENCY).max(MAX_CONCURRENCY),
  /** Choose reference photos with Jev (falls back to keyword rules). */
  jevRefs: z.boolean(),
  /** Jev endpoint: OpenLux by default (same HTTP API as TypeSafe). */
  jevBaseUrl: z.string(),
  jevModel: z.string(),
  /** Env Catalog variable that holds the key for jevBaseUrl. */
  jevKeyCatalog: z.string(),
  /** Env Catalog variable for TypeSafe direct (api.typesafe.ai), used only if the primary fails. Empty: no fallback. */
  jevFallbackKeyCatalog: z.string(),
});

export type StudioSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: StudioSettings = {
  nanoBanana2: true,
  nanoBanana21: true,
  nanoBananaPro: true,
  museImage: true,
  gptImage25Flare: false,
  gptImage25Sunburst: false,
  flux2Pro: false,
  seedream5: false,
  grokImagine: false,
  qwenImage21: true,
  wan27: true,
  defaultGateway: "kie",
  falKeyCatalog: "",
  kieKeyCatalog: "",
  uiLocale: "auto",
  concurrency: DEFAULT_CONCURRENCY,
  jevRefs: true,
  jevBaseUrl: OPENLUX_BASE_URL,
  jevModel: JEV_MODEL,
  jevKeyCatalog: "OPENLUX_API_KEY",
  jevFallbackKeyCatalog: "TYPESAFE_API_KEY",
};

function readBool(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof source[key] === "boolean" ? (source[key] as boolean) : fallback;
}

function readText(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

export function mergeSettings(raw: unknown): StudioSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    nanoBanana2: readBool(source, "nanoBanana2", DEFAULT_SETTINGS.nanoBanana2),
    nanoBanana21: readBool(source, "nanoBanana21", DEFAULT_SETTINGS.nanoBanana21),
    nanoBananaPro: readBool(source, "nanoBananaPro", DEFAULT_SETTINGS.nanoBananaPro),
    museImage: readBool(source, "museImage", DEFAULT_SETTINGS.museImage),
    gptImage25Flare: readBool(
      source,
      "gptImage25Flare",
      readBool(source, "gptImage", DEFAULT_SETTINGS.gptImage25Flare),
    ),
    gptImage25Sunburst: readBool(source, "gptImage25Sunburst", DEFAULT_SETTINGS.gptImage25Sunburst),
    flux2Pro: readBool(source, "flux2Pro", DEFAULT_SETTINGS.flux2Pro),
    seedream5: readBool(source, "seedream5", DEFAULT_SETTINGS.seedream5),
    grokImagine: readBool(source, "grokImagine", DEFAULT_SETTINGS.grokImagine),
    qwenImage21: readBool(source, "qwenImage21", DEFAULT_SETTINGS.qwenImage21),
    wan27: readBool(source, "wan27", DEFAULT_SETTINGS.wan27),
    defaultGateway: source.defaultGateway === "kie" || source.defaultGateway === "fal"
      ? source.defaultGateway
      : DEFAULT_SETTINGS.defaultGateway,
    falKeyCatalog: typeof source.falKeyCatalog === "string" ? source.falKeyCatalog : "",
    kieKeyCatalog: typeof source.kieKeyCatalog === "string" ? source.kieKeyCatalog : "",
    uiLocale: source.uiLocale === "en" || source.uiLocale === "ru" || source.uiLocale === "auto"
      ? source.uiLocale
      : DEFAULT_SETTINGS.uiLocale,
    concurrency: clampConcurrency(source.concurrency ?? DEFAULT_SETTINGS.concurrency),
    jevRefs: readBool(source, "jevRefs", DEFAULT_SETTINGS.jevRefs),
    jevBaseUrl: readText(source, "jevBaseUrl", DEFAULT_SETTINGS.jevBaseUrl),
    jevModel: readText(source, "jevModel", DEFAULT_SETTINGS.jevModel),
    jevKeyCatalog: typeof source.jevKeyCatalog === "string" ? source.jevKeyCatalog : DEFAULT_SETTINGS.jevKeyCatalog,
    jevFallbackKeyCatalog:
      typeof source.jevFallbackKeyCatalog === "string" ? source.jevFallbackKeyCatalog : DEFAULT_SETTINGS.jevFallbackKeyCatalog,
  };
}

export function enabledFromSettings(settings: StudioSettings): EnabledModels {
  return Object.fromEntries(
    MODEL_IDS.map((id) => [id, settings[MODEL_SETTING[id]]]),
  ) as EnabledModels;
}

export function asGateway(value: string): GatewayId {
  return value === "fal" ? "fal" : "kie";
}

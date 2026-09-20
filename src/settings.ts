import { z } from "zod";
import type { EnabledModels, GatewayId } from "./models.js";
import { MODEL_IDS, MODEL_SETTING } from "./models.js";

export const settingsSchema = z.object({
  nanoBanana2: z.boolean(),
  nanoBananaPro: z.boolean(),
  museImage: z.boolean(),
  gptImage25Flare: z.boolean(),
  gptImage25Sunburst: z.boolean(),
  flux2Pro: z.boolean(),
  seedream5: z.boolean(),
  grokImagine: z.boolean(),
  defaultGateway: z.enum(["fal", "kie"]),
  falKeyCatalog: z.string(),
  kieKeyCatalog: z.string(),
  uiLocale: z.enum(["auto", "en", "ru"]),
});

export type StudioSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: StudioSettings = {
  nanoBanana2: true,
  nanoBananaPro: true,
  museImage: true,
  gptImage25Flare: false,
  gptImage25Sunburst: false,
  flux2Pro: false,
  seedream5: false,
  grokImagine: false,
  defaultGateway: "kie",
  falKeyCatalog: "",
  kieKeyCatalog: "",
  uiLocale: "auto",
};

function readBool(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof source[key] === "boolean" ? (source[key] as boolean) : fallback;
}

export function mergeSettings(raw: unknown): StudioSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    nanoBanana2: readBool(source, "nanoBanana2", DEFAULT_SETTINGS.nanoBanana2),
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
    defaultGateway: source.defaultGateway === "kie" || source.defaultGateway === "fal"
      ? source.defaultGateway
      : DEFAULT_SETTINGS.defaultGateway,
    falKeyCatalog: typeof source.falKeyCatalog === "string" ? source.falKeyCatalog : "",
    kieKeyCatalog: typeof source.kieKeyCatalog === "string" ? source.kieKeyCatalog : "",
    uiLocale: source.uiLocale === "en" || source.uiLocale === "ru" || source.uiLocale === "auto"
      ? source.uiLocale
      : DEFAULT_SETTINGS.uiLocale,
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

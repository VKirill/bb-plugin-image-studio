import { z } from "zod";
import type { EnabledModels, GatewayId } from "./models.js";

export const settingsSchema = z.object({
  nanoBanana2: z.boolean(),
  nanoBananaPro: z.boolean(),
  museImage: z.boolean(),
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
  defaultGateway: "fal",
  falKeyCatalog: "",
  kieKeyCatalog: "",
  uiLocale: "auto",
};

export function mergeSettings(raw: unknown): StudioSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    nanoBanana2: typeof source.nanoBanana2 === "boolean" ? source.nanoBanana2 : DEFAULT_SETTINGS.nanoBanana2,
    nanoBananaPro: typeof source.nanoBananaPro === "boolean" ? source.nanoBananaPro : DEFAULT_SETTINGS.nanoBananaPro,
    museImage: typeof source.museImage === "boolean" ? source.museImage : DEFAULT_SETTINGS.museImage,
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
  return {
    nanoBanana2: settings.nanoBanana2,
    nanoBananaPro: settings.nanoBananaPro,
    museImage: settings.museImage,
  };
}

export function asGateway(value: string): GatewayId {
  return value === "kie" ? "kie" : "fal";
}

export const MODEL_IDS = [
  "nano-banana-2",
  "nano-banana-pro",
  "muse-image",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "flux-2-pro",
  "seedream-5",
  "grok-imagine",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const GATEWAY_IDS = ["fal", "kie"] as const;
export type GatewayId = (typeof GATEWAY_IDS)[number];

export type EnabledModels = Record<ModelId, boolean>;

export type ModelSettingKey =
  | "nanoBanana2"
  | "nanoBananaPro"
  | "museImage"
  | "gptImage25Flare"
  | "gptImage25Sunburst"
  | "flux2Pro"
  | "seedream5"
  | "grokImagine";

export const MODEL_SETTING: Record<ModelId, ModelSettingKey> = {
  "nano-banana-2": "nanoBanana2",
  "nano-banana-pro": "nanoBananaPro",
  "muse-image": "museImage",
  "gpt-image-2.5-flare": "gptImage25Flare",
  "gpt-image-2.5-sunburst": "gptImage25Sunburst",
  "flux-2-pro": "flux2Pro",
  "seedream-5": "seedream5",
  "grok-imagine": "grokImagine",
};

export const FAL_ENDPOINTS: Record<ModelId, { generate: string; edit: string }> = {
  "nano-banana-2": { generate: "fal-ai/nano-banana-2", edit: "fal-ai/nano-banana-2/edit" },
  "nano-banana-pro": { generate: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit" },
  "muse-image": { generate: "meta/muse-image/text-to-image", edit: "meta/muse-image/edit" },
  "gpt-image-2.5-flare": {
    generate: "openai/gpt-image-2.5/flare/text-to-image",
    edit: "openai/gpt-image-2.5/flare/edit",
  },
  "gpt-image-2.5-sunburst": {
    generate: "openai/gpt-image-2.5/sunburst/text-to-image",
    edit: "openai/gpt-image-2.5/sunburst/edit",
  },
  "flux-2-pro": { generate: "fal-ai/flux-2-pro", edit: "fal-ai/flux-2-pro/edit" },
  "seedream-5": {
    generate: "bytedance/seedream/v5/pro/text-to-image",
    edit: "bytedance/seedream/v5/pro/edit",
  },
  "grok-imagine": {
    generate: "xai/grok-imagine-image/v2.0/text-to-image",
    edit: "xai/grok-imagine-image/v2.0/edit",
  },
};

export type KieRoute = {
  generate: string;
  edit: string;
  refField: "image_input" | "input_urls";
};

export const KIE_MODELS: Partial<Record<ModelId, KieRoute>> = {
  "nano-banana-2": { generate: "nano-banana-2", edit: "nano-banana-2", refField: "image_input" },
  "nano-banana-pro": { generate: "nano-banana-pro", edit: "nano-banana-pro", refField: "image_input" },
  "gpt-image-2.5-flare": {
    generate: "gpt-image-2-5-flare-text-to-image",
    edit: "gpt-image-2-5-flare-image-to-image",
    refField: "input_urls",
  },
  "gpt-image-2.5-sunburst": {
    generate: "gpt-image-2-5-sunburst-text-to-image",
    edit: "gpt-image-2-5-sunburst-image-to-image",
    refField: "input_urls",
  },
  "flux-2-pro": {
    generate: "flux-2/pro-text-to-image",
    edit: "flux-2/pro-image-to-image",
    refField: "input_urls",
  },
  "seedream-5": {
    generate: "seedream/5-pro-text-to-image",
    edit: "seedream/5-pro-image-to-image",
    refField: "input_urls",
  },
  "grok-imagine": {
    generate: "grok-imagine/text-to-image",
    edit: "grok-imagine/image-to-image",
    refField: "input_urls",
  },
};

const MODEL_ALIASES: Record<ModelId, string[]> = {
  "nano-banana-2": ["nb2", "banana 2", "nano banana", "gemini"],
  "nano-banana-pro": ["nbpro", "banana pro", "nano banana pro"],
  "muse-image": ["muse", "meta muse"],
  "gpt-image-2.5-flare": [
    "gpt",
    "gpt image",
    "gpt-image",
    "gpt image 2.5",
    "flare",
    "openai",
    "dall-e",
    "dalle",
  ],
  "gpt-image-2.5-sunburst": ["sunburst", "gpt image 2.5 sunburst", "openai"],
  "flux-2-pro": ["flux", "flux 2", "flux.2", "black forest"],
  "seedream-5": ["seedream", "seedream 5", "bytedance"],
  "grok-imagine": ["grok", "xai", "grok imagine"],
};

export function modelFalOnly(id: ModelId): boolean {
  return id === "muse-image";
}

export function modelEnabled(id: ModelId, enabled: EnabledModels): boolean {
  return enabled[id];
}

export function enabledModelList(enabled: EnabledModels): ModelId[] {
  return MODEL_IDS.filter((id) => modelEnabled(id, enabled));
}

export function modelSearchText(id: ModelId, label: string): string {
  return [id, label, ...MODEL_ALIASES[id]].join(" ").toLowerCase();
}

export function filterModelCatalog(query: string, labelFor: (id: ModelId) => string): ModelId[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...MODEL_IDS];
  return MODEL_IDS.filter((id) => modelSearchText(id, labelFor(id)).includes(needle));
}

export type RouteInput = {
  requestedModel?: string;
  requestedGateway?: string;
  enabled: EnabledModels;
  defaultGateway: GatewayId;
  hasFalKey: boolean;
  hasKieKey: boolean;
};

export type RouteResult =
  | { ok: true; model: ModelId; gateway: GatewayId }
  | { ok: false; error: string };

export function parseModel(value: string | undefined): ModelId | null {
  if (value === undefined || value.trim() === "") return null;
  const id = value.trim().toLowerCase();
  if (id === "nano-banana-2" || id === "nanobanana2" || id === "nb2") return "nano-banana-2";
  if (id === "nano-banana-pro" || id === "nanobananapro" || id === "nbpro") return "nano-banana-pro";
  if (id === "muse-image" || id === "muse" || id === "muse-mage") return "muse-image";
  if (
    id === "gpt-image-2.5-flare" ||
    id === "gpt-image-2.5" ||
    id === "gpt-image-flare" ||
    id === "gptimage25" ||
    id === "gpt-image" ||
    id === "gptimage" ||
    id === "gpt" ||
    id === "gpt-image-1.5" ||
    id === "openai"
  ) {
    return "gpt-image-2.5-flare";
  }
  if (id === "gpt-image-2.5-sunburst" || id === "sunburst" || id === "gpt-image-sunburst") {
    return "gpt-image-2.5-sunburst";
  }
  if (id === "flux-2-pro" || id === "flux2" || id === "flux-2" || id === "flux") return "flux-2-pro";
  if (id === "seedream-5" || id === "seedream" || id === "seedream5") return "seedream-5";
  if (id === "grok-imagine" || id === "grok" || id === "grok-imagine-image") return "grok-imagine";
  return null;
}

function parseGateway(value: string | undefined): GatewayId | null {
  if (value === undefined || value.trim() === "") return null;
  const id = value.trim().toLowerCase();
  if (id === "fal" || id === "fal.ai") return "fal";
  if (id === "kie" || id === "kie.ai") return "kie";
  return null;
}

export function resolveRoute(input: RouteInput): RouteResult {
  const parsedModel = parseModel(input.requestedModel);
  if (input.requestedModel && !parsedModel) {
    return {
      ok: false,
      error: `Unknown model "${input.requestedModel}". Use ${MODEL_IDS.join(", ")}.`,
    };
  }
  const available = enabledModelList(input.enabled);
  if (available.length === 0) {
    return { ok: false, error: "No image models are enabled in Image Studio settings." };
  }
  const model = parsedModel ?? available[0]!;
  if (!modelEnabled(model, input.enabled)) {
    return { ok: false, error: `Model ${model} is turned off in Image Studio settings.` };
  }

  const parsedGateway = parseGateway(input.requestedGateway);
  if (input.requestedGateway && !parsedGateway) {
    return { ok: false, error: `Unknown gateway "${input.requestedGateway}". Use fal or kie.` };
  }

  const kieSupported = KIE_MODELS[model] !== undefined;
  const falOk = input.hasFalKey;
  const kieOk = input.hasKieKey && kieSupported;

  let gateway: GatewayId;
  if (parsedGateway) {
    gateway = parsedGateway;
  } else if (modelFalOnly(model)) {
    gateway = "fal";
  } else if (input.defaultGateway === "kie" && kieOk) {
    gateway = "kie";
  } else if (input.defaultGateway === "fal" && falOk) {
    gateway = "fal";
  } else if (kieOk) {
    gateway = "kie";
  } else if (falOk) {
    gateway = "fal";
  } else {
    return { ok: false, error: `No API key for ${model}. Add a fal.ai or kie.ai key in Image Studio.` };
  }

  if (gateway === "fal" && !falOk) {
    return { ok: false, error: "fal.ai key is missing. Enter it in Image Studio or pick it from Env Catalog." };
  }
  if (gateway === "kie" && !kieOk) {
    if (!kieSupported) {
      return { ok: false, error: `${model} is available through fal.ai only.` };
    }
    return { ok: false, error: "kie.ai key is missing. Enter it in Image Studio or pick it from Env Catalog." };
  }
  return { ok: true, model, gateway };
}

/** Manual override wins over a catalog-linked value. */
export function pickSecret(manual: string, catalogValue: string | null): string | null {
  const override = manual.trim();
  if (override.length > 0) return override;
  const catalog = catalogValue?.trim() ?? "";
  if (catalog.length > 0) return catalog;
  return null;
}

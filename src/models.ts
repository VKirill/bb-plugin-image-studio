export const MODEL_IDS = [
  "nano-banana-2",
  "nano-banana-2.1",
  "nano-banana-pro",
  "muse-image",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "flux-2-pro",
  "seedream-5",
  "grok-imagine",
  "qwen-image-2.1",
  "wan-2.7",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const GATEWAY_IDS = ["fal", "kie"] as const;
export type GatewayId = (typeof GATEWAY_IDS)[number];

export type EnabledModels = Record<ModelId, boolean>;

export type ModelSettingKey =
  | "nanoBanana2"
  | "nanoBanana21"
  | "nanoBananaPro"
  | "museImage"
  | "gptImage25Flare"
  | "gptImage25Sunburst"
  | "flux2Pro"
  | "seedream5"
  | "grokImagine"
  | "qwenImage21"
  | "wan27";

export const MODEL_SETTING: Record<ModelId, ModelSettingKey> = {
  "nano-banana-2": "nanoBanana2",
  "nano-banana-2.1": "nanoBanana21",
  "nano-banana-pro": "nanoBananaPro",
  "muse-image": "museImage",
  "gpt-image-2.5-flare": "gptImage25Flare",
  "gpt-image-2.5-sunburst": "gptImage25Sunburst",
  "flux-2-pro": "flux2Pro",
  "seedream-5": "seedream5",
  "grok-imagine": "grokImagine",
  "qwen-image-2.1": "qwenImage21",
  "wan-2.7": "wan27",
};

export const FAL_ENDPOINTS: Partial<Record<ModelId, { generate: string; edit: string }>> = {
  "nano-banana-2": { generate: "fal-ai/nano-banana-2", edit: "fal-ai/nano-banana-2/edit" },
  "nano-banana-2.1": { generate: "google/nano-banana-2.1", edit: "google/nano-banana-2.1/edit" },
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
  "wan-2.7": { generate: "fal-ai/wan/v2.7/text-to-image", edit: "fal-ai/wan/v2.7/edit" },
};

export type KieRoute = {
  generate: string;
  edit: string;
  refField: "image_input" | "input_urls" | "image_urls";
};

export const KIE_MODELS: Partial<Record<ModelId, KieRoute>> = {
  "nano-banana-2": { generate: "nano-banana-2", edit: "nano-banana-2", refField: "image_input" },
  "nano-banana-2.1": { generate: "nano-banana-2-1", edit: "nano-banana-2-1", refField: "image_input" },
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
  "qwen-image-2.1": {
    generate: "qwen2-1/text-to-image",
    edit: "qwen2-1/image-to-image",
    refField: "image_urls",
  },
  // kie lists Wan 2.7 Image (docs.kie.ai/market/wan/2-7-image): one model for create and edit, up to 9 input_urls.
  "wan-2.7": { generate: "wan/2-7-image", edit: "wan/2-7-image", refField: "input_urls" },
};

const MODEL_ALIASES: Record<ModelId, string[]> = {
  "nano-banana-2": ["nb2", "banana 2", "nano banana", "gemini"],
  "nano-banana-2.1": ["nb 2.1", "nb2.1", "nb21", "banana 2.1", "nano banana 2.1", "nano-banana-2-1", "gemini"],
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
  "qwen-image-2.1": ["qwen", "qwen 2.1", "qwen2-1", "alibaba"],
  "wan-2.7": ["wan", "wan 2.7", "wan2.7", "wan27", "alibaba", "wanx"],
};

export function modelFalOnly(id: ModelId): boolean {
  return id === "muse-image";
}

export function modelKieOnly(id: ModelId): boolean {
  return id === "qwen-image-2.1";
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
  if (
    id === "nano-banana-2.1" ||
    id === "nano-banana-2-1" ||
    id === "nanobanana2.1" ||
    id === "nanobanana21" ||
    id === "nb2.1" ||
    id === "nb21" ||
    id === "nb 2.1" ||
    id === "banana 2.1" ||
    id === "nano banana 2.1"
  ) {
    return "nano-banana-2.1";
  }
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
  if (
    id === "qwen-image-2.1" ||
    id === "qwen" ||
    id === "qwen2-1" ||
    id === "qwen-2.1" ||
    id === "qwen21"
  ) {
    return "qwen-image-2.1";
  }
  if (id === "wan-2.7" || id === "wan" || id === "wan 2.7" || id === "wan2.7" || id === "wan27" || id === "wan-2-7") {
    return "wan-2.7";
  }
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
  } else if (modelKieOnly(model)) {
    gateway = "kie";
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

  if (gateway === "fal" && modelKieOnly(model)) {
    return { ok: false, error: `${model} is available through kie.ai only.` };
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

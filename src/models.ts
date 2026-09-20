export const MODEL_IDS = ["nano-banana-2", "nano-banana-pro", "muse-image"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const GATEWAY_IDS = ["fal", "kie"] as const;
export type GatewayId = (typeof GATEWAY_IDS)[number];

export const FAL_ENDPOINTS: Record<
  ModelId,
  { generate: string; edit: string }
> = {
  "nano-banana-2": {
    generate: "fal-ai/nano-banana-2",
    edit: "fal-ai/nano-banana-2/edit",
  },
  "nano-banana-pro": {
    generate: "fal-ai/nano-banana-pro",
    edit: "fal-ai/nano-banana-pro/edit",
  },
  "muse-image": {
    generate: "meta/muse-image/text-to-image",
    edit: "meta/muse-image/edit",
  },
};

export const KIE_MODELS: Partial<Record<ModelId, string>> = {
  "nano-banana-2": "nano-banana-2",
  "nano-banana-pro": "nano-banana-pro",
};

export type EnabledModels = {
  nanoBanana2: boolean;
  nanoBananaPro: boolean;
  museImage: boolean;
};

export function modelEnabled(id: ModelId, enabled: EnabledModels): boolean {
  if (id === "nano-banana-2") return enabled.nanoBanana2;
  if (id === "nano-banana-pro") return enabled.nanoBananaPro;
  return enabled.museImage;
}

export function enabledModelList(enabled: EnabledModels): ModelId[] {
  return MODEL_IDS.filter((id) => modelEnabled(id, enabled));
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

function parseModel(value: string | undefined): ModelId | null {
  if (value === undefined || value.trim() === "") return null;
  const id = value.trim().toLowerCase();
  if (id === "nano-banana-2" || id === "nanobanana2" || id === "nb2") return "nano-banana-2";
  if (id === "nano-banana-pro" || id === "nanobananapro" || id === "nbpro") return "nano-banana-pro";
  if (id === "muse-image" || id === "muse" || id === "muse-mage") return "muse-image";
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
    return { ok: false, error: `Unknown model "${input.requestedModel}". Use nano-banana-2, nano-banana-pro, or muse-image.` };
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
  } else if (model === "muse-image") {
    gateway = "fal";
  } else if (input.defaultGateway === "kie" && kieOk) {
    gateway = "kie";
  } else if (input.defaultGateway === "fal" && falOk) {
    gateway = "fal";
  } else if (falOk) {
    gateway = "fal";
  } else if (kieOk) {
    gateway = "kie";
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

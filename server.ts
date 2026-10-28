import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { defineRpcContract, type BbPluginApi, type PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  FAL_ENDPOINTS,
  KIE_MODELS,
  MODEL_IDS,
  MODEL_SETTING,
  modelEnabled,
  modelFalOnly,
  pickSecret,
  resolveRoute,
  type ModelId,
} from "./src/models.js";
import {
  candidateSlots,
  filledSlots,
  findProfile,
  profileSchema,
  type PersonProfile,
} from "./src/profiles.js";
import { composePrompt } from "./src/prompt.js";
import { QWEN_GENERATE_CAP, parseRefsOption, refLimit, selectRefs } from "./src/refs.js";
import {
  EXIT_RELOADED,
  Limiter,
  Mutex,
  clampConcurrency,
  isStaleHandleError,
  mapParallel,
  MAX_CONCURRENCY,
} from "./src/queue.js";
import { GALLERY_MAX, attachCandidate, createGalleryStore, createProfileStore, fitGallery, generationsKey, STUDIO_GALLERY } from "./src/store.js";
import {
  SHEET_ASPECT,
  SHEET_RESOLUTION,
  SHEET_SLOTS,
  isSheetSlot,
  missingSheetSlots,
  sheetModelFor,
  sheetWaves,
  sheetPrompt,
  sheetRefCap,
  sheetRefOrder,
  sheetRouteError,
} from "./src/sheet.js";
import { SLOT_IDS, isNudeSlot, modelAllowsNude, parseSlotId, sortSlots, type SlotId } from "./src/slots.js";
import { MAX_BATCH, parseBatchLines, type BatchJob } from "./src/batch.js";
import { generationSchema, type Generation } from "./src/generation.js";
import { TYPESAFE_BASE_URL, buildJevRequest, jevCues, runJevAttempts, type JevAttempt, type JevCues } from "./src/jev.js";
import { atomicWrite, createJournal } from "./src/journal.js";
import { formatUnknownError, falGenerate, kieGenerate } from "./src/providers.js";
import { encodeWebp, imageSize, sniffImageMime, WEBP_FULL, WEBP_THUMB } from "./src/encode-webp.js";
import {
  GUI_MAX_REFS,
  GUI_MODEL,
  GUI_MODES,
  GUI_PRESET_IDS,
  MAX_ELEMENTS,
  cutSheet,
  elementsJob,
  findGuiStyle,
  guiStyleSchema,
  parseGuiStyles,
  ideasJobs,
  keyGreen,
  kitJobs,
  originName,
  originProject,
  modelFbxScale,
  parseElementList,
  screenJob,
  sheetLayout,
  slugify,
  type GuiJob,
  type GuiMode,
  type GuiStyle,
  type SheetLayout,
} from "./src/gui.js";
import {
  BODY_TYPES,
  CHARACTER_MODEL,
  CHARACTER_MODES,
  CHARACTER_PRESET_IDS,
  MAX_EQUIPMENT,
  TURNAROUND_VIEWS,
  characterJobs,
  characterSlug,
  cutOnWhite,
  mountFor,
  parseEquipment,
  type BodyType,
  type CharacterJob,
  type CharacterMode,
} from "./src/characters.js";
import { decodeRgba, encodePng, type Rgba } from "./src/image-io.js";
import {
  DECAL_ASPECTS,
  MAX_VARIANTS,
  MODE_CATEGORY,
  ROBLOX_MODEL,
  ROBLOX_MODES,
  ROBLOX_PRESET_IDS,
  mergeGameStyle,
  planGameMigration,
  robloxJobs,
  type RobloxJob,
  type RobloxMode,
  type RobloxOutput,
} from "./src/roblox.js";
import { SKYBOX_FACES, cover, fadeEdges, fitSquare, flattenRound, glowToAlpha, limit, normalMap, opaque, resize, seamless, skyboxFaces, trimAlpha } from "./src/raster.js";
import { enabledFromSettings, mergeSettings, settingsSchema, type StudioSettings } from "./src/settings.js";
import {
  GENERATE_PICKER_ID,
  lastChoiceSchema,
  defaultResolution,
  modelUsesResolution,
  parseLastChoice,
  pickerResponseSchema,
  resolvePickerSelection,
  type LastChoice,
} from "./src/formats.js";
import { hostContract } from "./host.ts";
import {
  MODEL_MODES,
  MODEL_MUSE,
  MODEL_TEXTURE_SIZES,
  buildTextureUvPrompt,
  cutAndDilate,
  cutConcept,
  DEFAULT_DILATE_PX,
  extractGuidePalette,
  mergeModelParts,
  modelCliProjectOrigin,
  resolveTextureUvParts,
  textureUvPaletteHint,
  MODEL_CONCEPT_VIEWS,
  MODEL_CLI_REST_SKIP_FLAGS,
  hostPath,
  parseModelGenerateCli,
  subjectFromFile,
  MODEL_TAKE_MAX,
  modelTakeKvKey,
  modelTakeRecordSchema,
  modelTakeWithThumbsSchema,
  parseModelTakeRecords,
  snapshotGuiStyles,
  guideFix,
  type GuideFixStats,
  type ModelConceptView,
  type ModelMode,
  type ModelPartsParam,
  type ModelTakeRecord,
  type ModelTextureSize,
  type TextureUvPartKind,
} from "./src/model.ts";
import {
  createItem,
  itemSchema,
  itemSummary,
  parseItemCli,
  resolveBlueprintConceptFromItem,
  resolveTextureUvInputsFromItem,
  selectEntry,
  itemIndexFromItem,
  itemRunRelPath,
  itemExportRelDir,
  buildItemExportJson,
  requireSelectedTextureEntry,
  textureTakeDirFromEntry,
  type Item,
  type ItemSelectedBy,
  addEntry,
  recordExportGenerated,
  ITEM_STEPS,
} from "./src/item.ts";
import {
  attachConceptEntry,
  attachModelFileEntry,
  attachRunFolderEntry,
  filesFromBlueprintRunFolder,
  filesFromTextureRunFolder,
  filesFromTextureTakeFolder,
  itemIndexKvKey,
  parseItemIndex,
  recordBlueprintGenerated,
  recordTextureUvGenerated,
  upsertItemIndex,
} from "./src/model-server.ts";
import {
  itemIndexRowWithThumbsSchema,
  itemWithThumbsSchema,
} from "./src/item-server.ts";
import {
  assembleBlueprint,
  blueprintAspect,
  buildBackOnlyPrompt,
  buildBlueprintPrompt,
  buildSideOnlyPrompt,
  classifyViews,
  cutBlueprint,
  defaultBlueprintViews,
  findSoftAnchors,
  frontReferencePlate,
  normalizeBlueprintStyle,
  replaceBackView,
  silhouetteSimilarity,
  swapBlueprintBackSide,
  viewsJsonFromCut,
  type BlueprintStyle,
  type BlueprintViewName,
} from "./src/blueprint.ts";

const ENV_CATALOG_PLUGIN_ID = "env-catalog";
const DEFAULT_BLENDER_PATH = "/Applications/Blender.app/Contents/MacOS/Blender";
const SETTINGS_KEY = "settings";
/** A 480px WebP thumbnail stays far below this; a bigger cached file is a stale original. */
const THUMB_MAX_BYTES = 400 * 1024;
const PROFILES_KEY = "profiles";
const LAST_GENERATE_KEY = "last-generate";
const LAST_GENERATE_RES_2K = "last-generate-res-default-2k";
const DEFAULT_GATEWAY_KIE = "default-gateway-kie";
const ENABLE_QWEN_21 = "enable-qwen-21";
const CHANGED = "image-studio-changed";
const GUI_STYLES_KEY = "gui-styles";
/** Per GUI project: its generations, newest first (slim records, so a few hundred fit in one KV value). */
const GUI_GEN_PREFIX = "gui-gen:";
const GUI_GEN_MAX = 400;

export type { Generation } from "./src/generation.js";

const paletteInputSchema = guiStyleSchema.shape.palette;
const guiModeSchema = z.enum(GUI_MODES);
const characterModeSchema = z.enum(CHARACTER_MODES);
const bodySchema = z.enum(BODY_TYPES);
const robloxModeSchema = z.enum(ROBLOX_MODES);
const sectionSchema = z.enum(["gui", "characters", "roblox", "model"]);
type Section = z.infer<typeof sectionSchema>;
/** "GUI project" / "Characters project": the word the CLI and the tools use for a section. */
const SECTION_WORD: Record<Section, string> = { gui: "GUI", characters: "Characters", roblox: "Roblox", model: "Model" };
const modelModeSchema = z.enum(MODEL_MODES);
const modelTextureSizeSchema = z.union([z.literal(1024), z.literal(2048)]);
const modelPartsSchema = z.union([
  z.record(z.string(), z.string()),
  z.array(z.object({ material: z.string().min(1), part: z.string().min(1) }).strict()),
]);
const modelConceptViewSchema = z.enum(MODEL_CONCEPT_VIEWS);
const blueprintViewSchema = z.enum(["front", "side", "back", "top"]);
const blueprintStyleSchema = z.enum(["clay+wire", "clean line", "clean-line"]);
const imageStudioModelParamsSchema = z
  .object({
    mode: modelModeSchema,
    model: z.string().optional(),
    object: z.string().optional(),
    prompt: z.string().default(""),
    parts: modelPartsSchema.optional(),
    images: z.array(z.string().min(1)).max(2).optional(),
    size: modelTextureSizeSchema.optional(),
    variants: z.number().int().min(1).max(MAX_VARIANTS).optional(),
    subject: z.string().max(120).optional(),
    conceptNote: z.string().max(500).optional(),
    projectConcept: z.boolean().optional(),
    conceptView: modelConceptViewSchema.optional(),
    views: z.array(blueprintViewSchema).optional(),
    style: blueprintStyleSchema.optional(),
    soft: z.array(z.string().min(1)).optional(),
    rigid: z.array(z.string().min(1)).optional(),
    sideSeparate: z.boolean().optional(),
    blueprintModel: z.enum(["nano-banana-2.1", "nano-banana-2-lite", "muse-image"]).optional(),
    resolution: z.enum(["1K", "2K"]).optional(),
    gateway: z.enum(["kie", "fal"]).optional(),
    guideFix: z.enum(["on", "off"]).optional(),
    project: z.string().optional(),
    item: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "texture-uv" && !input.model?.trim() && !input.item?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "model or item is required for texture-uv", path: ["model"] });
    }
    if (input.mode === "blueprint" && !input.images?.[0] && !input.item?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "images[0] concept or item is required for blueprint", path: ["images"] });
    }
  });
/** One-time move of the GUI and Characters projects into Roblox games. */
const GAMES_MIGRATED_KEY = "roblox-games-migrated";
const guiResultSchema = z.object({
  generations: z.array(generationSchema),
  errors: z.array(z.string()),
});

/** Slot names the RPC takes: the new ids plus the old selfie-0..2 / manicure names. */
const slotInputSchema = z.enum([...SLOT_IDS, "selfie-0", "selfie-1", "selfie-2", "manicure"]);

const secretFileSchema = z.object({
  falApiKey: z.string().default(""),
  kieApiKey: z.string().default(""),
});

export const rpcContract = defineRpcContract({
  snapshot: {
    input: z.object({ projectId: z.string().nullable() }),
    output: z.object({
      settings: settingsSchema,
      secrets: z.object({
        falConfigured: z.boolean(),
        kieConfigured: z.boolean(),
      }),
      catalog: z.object({ available: z.boolean(), names: z.array(z.string()) }),
      profiles: z.array(profileSchema),
      generations: z.array(generationSchema),
      lastGenerate: lastChoiceSchema.nullable(),
      guiStyles: z.array(guiStyleSchema),
    }),
  },
  save_gui_style: {
    input: z.object({
      id: z.preprocess(
        (value) => (typeof value === "string" && value.trim() !== "" ? value : undefined),
        z.string().min(1).optional(),
      ),
      projectId: z.string().nullable(),
      /** Bind a new project to a folder (CLI); panel-made projects stay unbound. */
      origin: z.string().optional(),
      /** A new project's section; an existing project keeps its own. */
      section: sectionSchema.default("gui"),
      name: z.string().trim().min(1).max(80),
      theme: z.string().max(2000).default(""),
      tags: z.array(z.string().max(300)).max(12).default([]),
      palette: paletteInputSchema,
      notes: z.string().max(2000).default(""),
      fbxScale: z.number().positive().optional(),
    }),
    output: guiStyleSchema,
  },
  gui_generations: {
    input: z.object({ styleId: z.string() }),
    output: z.array(generationSchema),
  },
  /** A Roblox game's own generations and those of its GUI and Characters projects, newest first. */
  game_generations: {
    input: z.object({ gameId: z.string() }),
    output: z.array(generationSchema),
  },
  delete_gui_style: {
    input: z.object({ id: z.string() }),
    output: z.object({ removed: z.boolean() }),
  },
  add_gui_ref: {
    input: z.object({
      styleId: z.string(),
      role: z.enum(["concept", "art"]).default("concept"),
      /** A gallery picture… */
      generationId: z.string().optional(),
      /** …or an uploaded file. */
      filename: z.string().max(120).optional(),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
      base64: z.string().min(1).max(12_000_000).optional(),
    }),
    output: guiStyleSchema,
  },
  remove_gui_ref: {
    input: z.object({ styleId: z.string(), refId: z.string() }),
    output: guiStyleSchema,
  },
  gui_ref_preview: {
    input: z.object({ styleId: z.string(), refId: z.string() }),
    output: z.object({ mimeType: z.string(), base64: z.string() }),
  },
  model_takes: {
    input: z.object({ styleId: z.string() }),
    output: z.array(modelTakeWithThumbsSchema),
  },
  model_items: {
    input: z.object({ styleId: z.string() }),
    output: z.array(itemIndexRowWithThumbsSchema),
  },
  model_item: {
    input: z.object({ styleId: z.string(), item: z.string() }),
    output: itemWithThumbsSchema,
  },
  model_item_select: {
    input: z.object({
      styleId: z.string(),
      item: z.string(),
      step: z.enum(ITEM_STEPS),
      entry: z.string(),
    }),
    output: itemWithThumbsSchema,
  },
  model_generate: {
    input: z
      .object({
        projectId: z.string().nullable(),
        styleId: z.string().optional(),
        mode: modelModeSchema,
        model: z.string().optional(),
        object: z.string().optional(),
        prompt: z.string().trim().max(8000).default(""),
        parts: modelPartsSchema.optional(),
        images: z.array(z.string().min(1)).max(2).optional(),
        size: modelTextureSizeSchema.optional(),
        variants: z.number().int().min(1).max(MAX_VARIANTS).optional(),
        subject: z.string().max(120).optional(),
        conceptNote: z.string().max(500).optional(),
        projectConcept: z.boolean().optional(),
        conceptView: modelConceptViewSchema.optional(),
        views: z.array(blueprintViewSchema).optional(),
        style: blueprintStyleSchema.optional(),
        soft: z.array(z.string().min(1)).optional(),
        rigid: z.array(z.string().min(1)).optional(),
        sideSeparate: z.boolean().optional(),
        blueprintModel: z.enum(["nano-banana-2.1", "nano-banana-2-lite", "muse-image"]).optional(),
        resolution: z.enum(["1K", "2K"]).optional(),
        gateway: z.enum(["kie", "fal"]).optional(),
        guideFix: z.enum(["on", "off"]).optional(),
      })
      .superRefine((input, ctx) => {
        if (input.mode === "texture-uv" && !input.model?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "model is required for texture-uv", path: ["model"] });
        }
        if (input.mode === "blueprint" && !input.images?.[0]) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "images[0] concept is required for blueprint", path: ["images"] });
        }
      }),
    output: z.object({
      takes: z.array(modelTakeRecordSchema),
      errors: z.array(z.string()),
    }),
  },
  gui_generate: {
    input: z.object({
      projectId: z.string().nullable(),
      styleId: z.string().optional(),
      section: sectionSchema.default("gui"),
      /** GUI: ideas | screen | elements | kit. Characters: ideas | model | turnaround | equipment. Roblox: icon | thumbnail | … */
      mode: z.enum([...new Set([...GUI_MODES, ...CHARACTER_MODES, ...ROBLOX_MODES])] as [string, ...string[]]),
      /** GUI / Characters of a Roblox game: the game's id (its linked project is used, or created). */
      gameId: z.string().optional(),
      /** Roblox: takes of one picture, flipbook frames (4 or 16), decal frame. */
      variants: z.number().int().min(1).max(MAX_VARIANTS).default(1),
      frames: z.number().int().default(16),
      aspect: z.enum(DECAL_ASPECTS).default("1:1"),
      prompt: z.string().trim().max(8000).default(""),
      /** Elements: every element in its four states (normal, hover, pressed, disabled). */
      states: z.boolean().default(false),
      /** Characters: held items (left out of model/turnaround, drawn by equipment), the file name, design pictures. */
      equipment: z.string().max(2000).default(""),
      character: z.string().max(80).default(""),
      body: bodySchema.default("humanoid"),
      accessories: z.string().max(2000).default(""),
      images: z.array(z.string().min(1)).max(4).default([]),
    }),
    output: guiResultSchema,
  },
  update_settings: {
    input: settingsSchema.partial(),
    output: z.object({ saved: z.boolean() }),
  },
  set_secret: {
    input: z.object({ slot: z.enum(["falApiKey", "kieApiKey"]), value: z.string().min(1) }),
    output: z.object({ saved: z.boolean() }),
  },
  save_profile: {
    input: z.object({
      id: z.preprocess(
        (value) => (typeof value === "string" && value.trim() !== "" ? value : undefined),
        z.string().min(1).optional(),
      ),
      name: z.string().trim().min(1).max(80),
      gender: z.enum(["male", "female"]),
      age: z.number().int().min(18).max(99),
      heightCm: z.number().int().min(120).max(230),
      weightKg: z.number().int().min(35).max(250),
      bodyType: z.string().trim().min(1).max(80),
      bust: z.string().trim().max(40).optional(),
    }),
    output: profileSchema,
  },
  delete_profile: {
    input: z.object({ id: z.string() }),
    output: z.object({ removed: z.boolean() }),
  },
  add_photo: {
    input: z.object({
      profileId: z.string(),
      slot: slotInputSchema,
      filename: z.string().max(120),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      base64: z.string().min(1).max(12_000_000),
    }),
    output: profileSchema,
  },
  remove_photo: {
    input: z.object({
      profileId: z.string(),
      photoId: z.string(),
      /** Ignored: the photo is found by id in any slot. Kept so older callers still validate. */
      kind: z.enum(["selfie", "manicure"]).default("selfie"),
    }),
    output: profileSchema,
  },
  sheet_slot: {
    input: z.object({
      profileId: z.string(),
      slot: slotInputSchema,
      /** Replaces the built-in English prompt for this slot. */
      prompt: z.string().trim().max(2000).optional(),
      model: z.string().optional(),
    }),
    output: profileSchema,
  },
  sheet_accept: {
    input: z.object({ profileId: z.string(), slot: slotInputSchema }),
    output: profileSchema,
  },
  sheet_discard: {
    input: z.object({ profileId: z.string(), slot: slotInputSchema }),
    output: profileSchema,
  },
  profile_photo_preview: {
    input: z.object({ profileId: z.string(), photoId: z.string() }),
    output: z.object({ mimeType: z.string(), base64: z.string() }),
  },
  generate: {
    input: z.object({
      projectId: z.string().nullable(),
      prompt: z.string().trim().min(1).max(8000),
      model: z.string().optional(),
      gateway: z.string().optional(),
      profile: z.string().optional(),
      images: z.array(z.string().min(1)).max(8).optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
      /** auto (default) | all | comma list of slot ids, e.g. "face-front,body-back". */
      refs: z.string().optional(),
    }),
    output: generationSchema,
  },
  generation_preview: {
    input: z.object({
      id: z.string(),
      projectId: z.string(),
      variant: z.enum(["thumb", "full"]).default("thumb"),
    }),
    output: z.object({ mimeType: z.string(), base64: z.string() }),
  },
  /** What one picture was made from: the record, the profile's photo per slot, and the exact Jev state and questions. */
  generation_detail: {
    input: z.object({ id: z.string(), projectId: z.string() }),
    output: z.object({
      generation: generationSchema,
      profile: z.object({ id: z.string(), name: z.string(), slots: z.record(z.string(), z.string()) }).nullable(),
      jev: z.object({ state: z.record(z.string(), z.unknown()), questions: z.record(z.string(), z.unknown()) }).nullable(),
    }),
  },
});
type RpcHandlers = PluginRpcHandlers<typeof rpcContract>;

function describe(error: unknown): string {
  return formatUnknownError(error);
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function flags(argv: string[], name: string): string[] {
  const out: string[] = [];
  argv.forEach((token, index) => {
    const value = argv[index + 1];
    if (token === name && value) out.push(value);
  });
  return out;
}

function restAfter(argv: string[], command: string): string {
  const skip = new Set([
    "--model",
    "--gateway",
    "--profile",
    "--image",
    "--aspect",
    "--resolution",
    "--refs",
    "--seed",
    "--count",
    "--batch",
    "--parallel",
    "--slots",
    "--json",
    "--mode",
    "--style",
    "--project",
    "--rename",
    "--name",
    "--theme",
    "--tags",
    "--palette",
    "--notes",
    "--role",
    "--sheet",
    "--elements",
    "--items",
    "--variants",
    "--frames",
    "--object",
    "--size",
    "--file",
    ...MODEL_CLI_REST_SKIP_FLAGS,
  ]);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === command) continue;
    if (skip.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith("--")) continue;
    out.push(token);
  }
  return out.join(" ").trim();
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  const blenderHost = bb.hosts.experimental_client({ contract: hostContract });
  const rootDir = join(bb.server.experimental_dataDir, "plugins", bb.pluginId);
  const secretsFile = join(rootDir, "secrets.json");

  async function ensureRoot(): Promise<void> {
    await mkdir(rootDir, { recursive: true });
  }

  async function migrateNanoBananaGatewayKie(): Promise<void> {
    const moved = await bb.storage.kv.get<boolean>(DEFAULT_GATEWAY_KIE);
    if (moved === true) return;
    await bb.storage.kv.set(DEFAULT_GATEWAY_KIE, true);
    const settings = mergeSettings(await bb.storage.kv.get<unknown>(SETTINGS_KEY));
    if (settings.defaultGateway !== "kie") {
      await writeSettings({ ...settings, defaultGateway: "kie" });
    }
    const last = parseLastChoice(await bb.storage.kv.get<unknown>(LAST_GENERATE_KEY));
    if (last && !modelFalOnly(last.model) && last.gateway === "fal") {
      await bb.storage.kv.set(LAST_GENERATE_KEY, { ...last, gateway: "kie" });
    }
  }

  async function migrateEnableQwen21(): Promise<void> {
    const moved = await bb.storage.kv.get<boolean>(ENABLE_QWEN_21);
    if (moved === true) return;
    await bb.storage.kv.set(ENABLE_QWEN_21, true);
    const settings = mergeSettings(await bb.storage.kv.get<unknown>(SETTINGS_KEY));
    if (settings.qwenImage21 !== true) {
      await writeSettings({ ...settings, qwenImage21: true });
    }
  }

  // One-time migrations run once per load, not once per parallel job.
  let migrations: Promise<void> | null = null;
  function migrationsReady(): Promise<void> {
    migrations ??= (async () => {
      await migrateNanoBananaGatewayKie();
      await migrateEnableQwen21();
    })().catch((error) => {
      migrations = null;
      throw error;
    });
    return migrations;
  }

  async function readSettings(): Promise<StudioSettings> {
    await migrationsReady();
    const settings = mergeSettings(await bb.storage.kv.get<unknown>(SETTINGS_KEY));
    providerLimiter.setLimit(settings.concurrency);
    return settings;
  }

  async function writeSettings(next: StudioSettings): Promise<void> {
    await bb.storage.kv.set(SETTINGS_KEY, next);
    bb.realtime.publish(CHANGED, { kind: "settings" });
  }

  async function readSecrets(): Promise<{ falApiKey: string; kieApiKey: string }> {
    try {
      const parsed = secretFileSchema.parse(JSON.parse(await readFile(secretsFile, "utf8")));
      return { falApiKey: parsed.falApiKey, kieApiKey: parsed.kieApiKey };
    } catch {
      return { falApiKey: "", kieApiKey: "" };
    }
  }

  async function writeSecrets(next: { falApiKey: string; kieApiKey: string }): Promise<void> {
    await ensureRoot();
    await writeFile(secretsFile, JSON.stringify(next), { encoding: "utf8", mode: 0o600 });
    await chmod(secretsFile, 0o600);
  }

  async function catalogValue(name: string): Promise<string> {
    const record = await bb.sdk.plugins.callRpc({
      pluginId: ENV_CATALOG_PLUGIN_ID,
      method: "env_get_value",
      input: { name },
      outputSchema: z.object({ value: z.string() }),
    });
    return record.value;
  }

  async function catalogKeys(): Promise<{ available: boolean; names: string[] }> {
    try {
      const record = await bb.sdk.plugins.callRpc({
        pluginId: ENV_CATALOG_PLUGIN_ID,
        method: "env_list",
        input: { kind: "secret" },
        outputSchema: z.object({
          variables: z.array(z.object({ name: z.string() })),
        }),
      });
      return { available: true, names: record.variables.map((item) => item.name) };
    } catch {
      return { available: false, names: [] };
    }
  }

  async function resolvedKeys(): Promise<{ fal: string | null; kie: string | null }> {
    const settings = await readSettings();
    const stored = await readSecrets();
    let falCatalog: string | null = null;
    let kieCatalog: string | null = null;
    if (settings.falKeyCatalog) {
      try {
        falCatalog = await catalogValue(settings.falKeyCatalog);
      } catch (error) {
        warn(`fal catalog key: ${describe(error)}`);
      }
    }
    if (settings.kieKeyCatalog) {
      try {
        kieCatalog = await catalogValue(settings.kieKeyCatalog);
      } catch (error) {
        warn(`kie catalog key: ${describe(error)}`);
      }
    }
    return {
      fal: pickSecret(stored.falApiKey, falCatalog),
      kie: pickSecret(stored.kieApiKey, kieCatalog),
    };
  }

  // Profiles, gallery lists and the last choice are single KV values: every change is read-modify-write
  // inside a lock, so parallel jobs cannot overwrite each other.
  const profileStore = createProfileStore(bb.storage.kv, () => bb.realtime.publish(CHANGED, { kind: "profiles" }));
  const readProfileList = (): Promise<PersonProfile[]> => profileStore.list();
  const withProfiles = <T>(work: (profiles: PersonProfile[]) => Promise<T> | T): Promise<T> => profileStore.mutate(work);
  const galleryStore = createGalleryStore<Generation>(bb.storage.kv, GALLERY_MAX);
  const lastChoiceLock = new Mutex();
  const settingsLock = new Mutex();
  /** Provider calls running at once, across the panel, chat, CLI and sheet builds. */
  const providerLimiter = new Limiter(clampConcurrency(undefined));

  async function removeProfileFile(profileId: string, filename: string): Promise<void> {
    try {
      await unlink(join(profileDir(profileId), filename));
    } catch {
      // already gone
    }
    try {
      await unlink(join(profileDir(profileId), `${filename}.thumb.webp`));
    } catch {
      // no cached preview
    }
  }

  async function readLastUnlocked(): Promise<LastChoice | null> {
    await migrationsReady();
    const last = parseLastChoice(await bb.storage.kv.get<unknown>(LAST_GENERATE_KEY));
    const moved = await bb.storage.kv.get<boolean>(LAST_GENERATE_RES_2K);
    if (moved === true) return last;
    await bb.storage.kv.set(LAST_GENERATE_RES_2K, true);
    if (last?.resolution === "1K") {
      const next = { ...last, resolution: "2K" as const };
      await bb.storage.kv.set(LAST_GENERATE_KEY, next);
      return next;
    }
    return last;
  }

  function readLastGenerate(): Promise<LastChoice | null> {
    return lastChoiceLock.run(readLastUnlocked);
  }

  /** The "last choice" the picker preselects. Parallel jobs: the last finished one wins, none corrupts it. */
  function rememberChoice(work: (last: LastChoice | null) => LastChoice | null): Promise<void> {
    return lastChoiceLock.run(async () => {
      const next = work(await readLastUnlocked());
      if (next) await bb.storage.kv.set(LAST_GENERATE_KEY, next);
    });
  }

  async function readGenerations(projectId: string): Promise<Generation[]> {
    const raw = await bb.storage.kv.get<unknown>(generationsKey(projectId));
    if (!Array.isArray(raw)) return [];
    let dirty = false;
    const items: Generation[] = [];
    for (const item of raw) {
      const parsed = generationSchema.safeParse(item);
      if (!parsed.success) continue;
      const next = await withDimensions(parsed.data);
      if (next.width !== parsed.data.width || next.height !== parsed.data.height) dirty = true;
      items.push(next);
    }
    if (dirty) void persistDimensions(projectId).catch(() => undefined);
    return items;
  }

  /** Writes sizes of old records back. Re-reads inside the gallery lock, so a record added meanwhile is kept. */
  function persistDimensions(projectId: string): Promise<void> {
    return galleryStore.withLock(async () => {
      const raw = await bb.storage.kv.get<unknown>(generationsKey(projectId));
      if (!Array.isArray(raw)) return;
      let changed = false;
      const next: unknown[] = [];
      for (const item of raw) {
        const parsed = generationSchema.safeParse(item);
        if (!parsed.success || (parsed.data.width && parsed.data.height)) {
          next.push(item);
          continue;
        }
        const sized = await withDimensions(parsed.data);
        if (sized.width && sized.height) changed = true;
        next.push(sized);
      }
      if (changed) await bb.storage.kv.set(generationsKey(projectId), next);
    });
  }

  async function withDimensions(item: Generation): Promise<Generation> {
    if (item.width && item.height) return item;
    const webpName = item.filename.endsWith(".webp") ? item.filename : `${item.id}.webp`;
    const candidates = [
      generationPath(item.projectId, `${item.id}.thumb.webp`),
      generationPath(item.projectId, webpName),
      generationPath(item.projectId, item.filename),
    ];
    for (const path of candidates) {
      try {
        const size = await imageSize(await readFile(path));
        if (size) return { ...item, ...size };
      } catch {
        continue;
      }
    }
    return item;
  }

  async function readStudioGallery(seedProjectId?: string | null): Promise<Generation[]> {
    const studio = await readGenerations(STUDIO_GALLERY);
    if (studio.length > 0) return studio;
    const seeds = seedProjectId ? [seedProjectId, "unscoped"] : ["unscoped"];
    const collected: Generation[] = [];
    const seen = new Set<string>();
    for (const id of seeds) {
      for (const item of await readGenerations(id)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        collected.push(item);
      }
    }
    if (collected.length === 0) return [];
    // Seed only if still empty once we hold the lock: a job may have added a record meanwhile.
    await galleryStore.withLock(async () => {
      const again = await bb.storage.kv.get<unknown>(generationsKey(STUDIO_GALLERY));
      if (!Array.isArray(again) || again.length === 0) {
        await bb.storage.kv.set(generationsKey(STUDIO_GALLERY), fitGallery(collected));
      }
    });
    return collected;
  }

  function profileDir(id: string): string {
    return join(rootDir, "profiles", id);
  }

  function generationPath(projectId: string, filename: string): string {
    return join(rootDir, "generations", projectId, filename);
  }

  /** A file cached before an encoder loaded on the host can be the full original; such a file is rebuilt. */
  async function cachedWebp(
    cachePath: string,
    sourcePath: string,
    options: { maxEdge: number; quality: number },
    maxBytes = Number.POSITIVE_INFINITY,
  ): Promise<Buffer> {
    try {
      const bytes = await readFile(cachePath);
      if (sniffImageMime(bytes) === "image/webp" && bytes.length <= maxBytes) return bytes;
    } catch {
      // not cached yet
    }
    const source = await readFile(sourcePath);
    const webp = await encodeWebp(source, options);
    // encodeWebp hands the source back when no encoder loads; do not cache that.
    if (webp !== source) await writeFile(cachePath, webp);
    return webp;
  }

  function cachedThumb(cachePath: string, sourcePath: string): Promise<Buffer> {
    return cachedWebp(cachePath, sourcePath, WEBP_THUMB, THUMB_MAX_BYTES);
  }

  async function previewGeneration(
    item: Generation,
    variant: "thumb" | "full",
  ): Promise<{ mimeType: string; base64: string }> {
    const thumbPath = generationPath(item.projectId, `${item.id}.thumb.webp`);
    const webpName = item.filename.endsWith(".webp") ? item.filename : `${item.id}.webp`;
    const webpPath = generationPath(item.projectId, webpName);
    const sourcePath = generationPath(item.projectId, item.filename);

    if (variant === "thumb") {
      const thumb = await cachedThumb(thumbPath, sourcePath);
      return { mimeType: sniffImageMime(thumb), base64: thumb.toString("base64") };
    }

    // When the display file itself is a PNG saved under .webp, keep it and cache the encoded copy beside it.
    const fullPath = webpPath === sourcePath ? generationPath(item.projectId, `${item.id}.full.webp`) : webpPath;
    const webp = await cachedWebp(fullPath, sourcePath, WEBP_FULL);
    return { mimeType: sniffImageMime(webp), base64: webp.toString("base64") };
  }

  /** Reads the files of the chosen slots. A slot whose file is gone is dropped, so Image numbers stay right. */
  async function refDataUris(
    profile: PersonProfile,
    slots: SlotId[],
  ): Promise<{ slots: SlotId[]; uris: string[]; missing: SlotId[] }> {
    const used: SlotId[] = [];
    const missing: SlotId[] = [];
    const uris: string[] = [];
    for (const slot of slots) {
      const photo = profile.refs[slot];
      if (!photo) continue;
      try {
        const bytes = await readFile(join(profileDir(profile.id), photo.filename));
        uris.push(`data:${photo.mimeType};base64,${bytes.toString("base64")}`);
        used.push(slot);
      } catch (error) {
        missing.push(slot);
        warn(`profile photo ${slot} missing: ${describe(error)}`);
      }
    }
    return { slots: used, uris, missing };
  }

  async function sourceDataUris(
    images: string[],
    projectId: string | null,
    cwd?: string,
    hostId?: string,
  ): Promise<string[]> {
    const gallery = [
      ...(await readStudioGallery(projectId)),
      ...(projectId ? await readGenerations(projectId) : []),
    ];
    const uris: string[] = [];
    for (const image of images) {
      const ref = image.trim();
      let bytes: Buffer;
      const item = gallery.find((entry) => entry.id === ref);
      if (item) {
        bytes = await readFile(generationPath(item.projectId, item.filename));
      } else if (/^https?:\/\//i.test(ref)) {
        const response = await fetch(ref);
        if (!response.ok) throw new Error(`Could not download the source image ${ref} (${response.status})`);
        bytes = Buffer.from(await response.arrayBuffer());
      } else {
        const path = isAbsolute(ref) || !cwd ? ref : join(cwd, ref);
        try {
          const file = await bb.sdk.files.read({ path, hostId });
          bytes = Buffer.from(file.content, file.contentEncoding === "base64" ? "base64" : "utf8");
        } catch (error) {
          throw new Error(`Could not read the source image ${path}: ${describe(error)}`);
        }
      }
      uris.push(`data:${sniffImageMime(bytes)};base64,${bytes.toString("base64")}`);
    }
    return uris;
  }

  /** How the reference slots were chosen, for the generation record. */
  type SelectionNote = {
    selector: "jev" | "keywords";
    scores?: Record<string, number | string>;
    input?: Generation["refsJevInput"];
    provider?: string;
    ms?: number;
    error?: string;
  };

  function selectionFields(note: SelectionNote): Partial<Generation> {
    return {
      refsSelector: note.selector,
      ...(note.scores ? { refsScores: note.scores } : {}),
      ...(note.provider ? { refsJevProvider: note.provider } : {}),
      ...(note.ms !== undefined ? { refsJevMs: note.ms } : {}),
      ...(note.error ? { refsJevError: note.error } : {}),
      ...(note.input ? { refsJevInput: note.input } : {}),
    };
  }

  /**
   * One Jev request for the whole generate call. Primary: the configured endpoint (OpenLux). If it fails and a TypeSafe
   * key exists, TypeSafe direct. Timeout, error or no key: null, and the keyword rules choose. Keys come from Env Catalog
   * and are never logged.
   */
  async function chooseWithJev(
    settings: StudioSettings,
    input: { prompt: string; model: ModelId; gender: "male" | "female"; sourceCount: number; filled: SlotId[] },
  ): Promise<{ cues: JevCues | null; used: SelectionNote } | null> {
    if (!settings.jevRefs) return null;
    const attempts: JevAttempt[] = [];
    if (settings.jevKeyCatalog) {
      attempts.push({
        provider: settings.jevBaseUrl.includes("typesafe.ai") ? "typesafe" : "openlux",
        baseUrl: settings.jevBaseUrl,
        model: settings.jevModel,
        keyName: settings.jevKeyCatalog,
        apiKey: () => catalogValue(settings.jevKeyCatalog),
      });
    }
    if (settings.jevFallbackKeyCatalog) {
      attempts.push({
        provider: "typesafe",
        baseUrl: TYPESAFE_BASE_URL,
        model: settings.jevModel,
        keyName: settings.jevFallbackKeyCatalog,
        apiKey: () => catalogValue(settings.jevFallbackKeyCatalog),
      });
    }
    const run = await runJevAttempts(input, attempts);
    const asked = { model: input.model, gender: input.gender, sourceCount: input.sourceCount, filled: [...input.filled] };
    if (run.ok) {
      const cues = jevCues(run.answers, { model: input.model, filled: input.filled });
      return { cues, used: { selector: "jev", scores: cues.scores, provider: run.provider, ms: run.ms, input: asked } };
    }
    warn(`Jev not used, keyword rules instead: ${run.errors.join("; ") || "no endpoint configured"}`);
    return run.errors.length > 0 ? { cues: null, used: { selector: "keywords", error: run.errors.join("; "), input: asked } } : null;
  }

  type RenderInput = {
    prompt: string;
    model?: string;
    gateway?: string;
    profile?: string;
    images?: string[];
    aspectRatio?: string;
    resolution?: string;
    /** auto | all | comma list of slot ids. */
    refs?: string;
    /** Explicit slots in priority order. Replaces `refs` (used by the sheet builder). */
    refSlots?: SlotId[];
    /** Most reference photos to send, below the model's own cap (sheet builds on Qwen). */
    refCap?: number;
    /** A sheet build: Qwen gets a description of the figure without height and weight. */
    sheet?: boolean;
    seed?: number;
    projectId: string | null;
    cwd?: string;
    hostId?: string;
    /** GUI jobs: `prompt` is already composed; style references go first as Image 1…N. */
    rawPrompt?: boolean;
    leadUris?: string[];
    /** Optional per-call poll timeout in milliseconds (kie/fal). */
    pollMs?: number;
    /** What the gallery shows as the prompt, when `prompt` is a composed one. */
    recordPrompt?: string;
    /** Model item id when this generation belongs to an item run. */
    itemId?: string;
    gui?: {
      styleId: string | null;
      styleName: string | null;
      section?: Section;
      mode: GuiMode | CharacterMode | RobloxMode;
      label: string;
      run: string;
      layout?: SheetLayout;
      /** Characters: the character's file name. */
      character?: string;
      /** Folders under image-studio/ in the project: ["roblox", "<game>", "store"]; else [section, project]. */
      folder?: string[];
      /** Roblox: what to make from the picture. */
      output?: RobloxOutput;
    };
  };

  type Rendered = {
    original: Buffer;
    display: Buffer;
    thumb: Buffer;
    size: { width: number; height: number } | null;
    composedPrompt: string;
    model: ModelId;
    gateway: "fal" | "kie";
    profile: PersonProfile | null;
    refsUsed: SlotId[];
    refsDropped: SlotId[];
    selection: SelectionNote;
    seed?: number;
    settings: StudioSettings;
  };

  /** Route, compose the prompt, attach the references, call the provider, encode the result. Nothing is stored. */
  async function renderImage(input: RenderInput): Promise<Rendered> {
    const settings = await readSettings();
    const keys = await resolvedKeys();
    const route = resolveRoute({
      requestedModel: input.model,
      requestedGateway: input.gateway,
      enabled: enabledFromSettings(settings),
      defaultGateway: settings.defaultGateway,
      hasFalKey: Boolean(keys.fal),
      hasKieKey: Boolean(keys.kie),
    });
    if (!route.ok) throw new Error(route.error);

    const profiles = await readProfileList();
    const profile = input.profile ? findProfile(profiles, input.profile) : null;
    if (input.profile && !profile) {
      throw new Error(`No person profile named "${input.profile}".`);
    }

    const sources = await sourceDataUris(input.images ?? [], input.projectId, input.cwd, input.hostId);

    let refsUsed: SlotId[] = [];
    let refsDropped: SlotId[] = [];
    let refUris: string[] = [];
    let selection: SelectionNote = { selector: "keywords" };
    let noPerson = false;
    if (profile) {
      const parsed = input.refSlots
        ? ({ ok: true, mode: { kind: "list", slots: input.refSlots } } as const)
        : parseRefsOption(input.refs);
      if (!parsed.ok) throw new Error(parsed.error);
      const limit = refLimit(route.model, route.gateway);
      const budget = Math.min(limit, input.refCap ?? (route.model === "qwen-image-2.1" ? QWEN_GENERATE_CAP : limit)) - sources.length;
      // `auto` and `all` ask Jev which photos the picture needs; a hand-written list bypasses it.
      const jev =
        parsed.mode.kind === "list" || filledSlots(profile).length === 0
          ? null
          : await chooseWithJev(settings, {
              prompt: input.prompt,
              model: route.model,
              gender: profile.gender,
              sourceCount: sources.length,
              filled: filledSlots(profile),
            });
      selection = jev?.used ?? { selector: "keywords" };
      const picked = selectRefs({
        prompt: input.prompt,
        filled: filledSlots(profile),
        mode: parsed.mode,
        budget,
        model: route.model,
        ...(jev?.cues ? { cues: jev.cues.cues, noPerson: jev.cues.noPerson } : {}),
      });
      noPerson = Boolean(jev?.cues?.noPerson);
      if (picked.rejected.length > 0) {
        throw new Error(
          `${picked.rejected.join(", ")} can only be sent to qwen-image-2.1 or wan-2.7 (bare-skin references). Pick one of them or remove ${picked.rejected.length > 1 ? "them" : "it"} from refs.`,
        );
      }
      if (picked.used.length === 0 && picked.dropped.length > 0 && budget < 1) {
        throw new Error(
          `${route.model} takes at most ${limit} images and ${sources.length} source image${sources.length === 1 ? "" : "s"} leave no room for ${profile.name}'s reference photos. Pass fewer images or pick another model.`,
        );
      }
      // Last line of defence for the hard rule: no nude slot reaches any model but Qwen.
      if (!modelAllowsNude(route.model) && picked.used.some(isNudeSlot)) {
        throw new Error("Bare-skin references are for Qwen and Wan only; refusing to attach them to " + route.model + ".");
      }
      const loaded = await refDataUris(profile, picked.used);
      refsUsed = loaded.slots;
      refsDropped = sortSlots([...picked.dropped, ...loaded.missing]);
      refUris = loaded.uris;
    }

    const composedPrompt = input.rawPrompt ? input.prompt : composePrompt({
      userPrompt: input.prompt,
      model: route.model,
      sourceCount: sources.length,
      profile: profile && !noPerson
        ? {
            name: profile.name,
            gender: profile.gender,
            age: profile.age,
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            bodyType: profile.bodyType,
            bust: profile.bust,
            refs: refsUsed,
            withNumbers: !(input.sheet && route.model === "qwen-image-2.1"),
          }
        : undefined,
    });

    const references = [...(input.leadUris ?? []), ...sources, ...refUris];
    const job = {
      prompt: composedPrompt,
      aspectRatio: input.aspectRatio,
      // No size named (CLI, batch, agents) → 2K. Providers would otherwise fall back to their own 1K default.
      resolution: input.resolution ?? defaultResolution(route.model),
      referenceDataUris: references,
      seed: input.seed,
    };

    const fal = FAL_ENDPOINTS[route.model];
    const kie = KIE_MODELS[route.model];
    // Every provider call waits for a free slot: the limit is shared by the panel, chat, CLI and sheet builds.
    const result = await providerLimiter.run(() =>
      route.gateway === "kie"
        ? kieGenerate(keys.kie!, references.length > 0 ? kie!.edit : kie!.generate, {
            ...job,
            kieRefField: kie!.refField,
          })
        : falGenerate(keys.fal!, references.length > 0 ? fal!.edit : fal!.generate, job),
    );

    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) throw new Error(`Could not download the generated image (${imageResponse.status})`);
    const original = Buffer.from(await imageResponse.arrayBuffer());
    const display = await encodeWebp(original, WEBP_FULL);
    const thumb = await encodeWebp(display, WEBP_THUMB);
    const size = (await imageSize(display)) ?? (await imageSize(original));
    return {
      original,
      display,
      thumb,
      size,
      composedPrompt,
      model: route.model,
      gateway: route.gateway,
      profile,
      refsUsed,
      refsDropped,
      selection,
      seed: result.seed,
      settings,
    };
  }

  // ---- jobs, journal, reload safety -----------------------------------------------

  const pendingDir = join(rootDir, "pending");
  const inFlight = new Set<Promise<unknown>>();
  let draining = false;
  const DRAIN_MS = 45_000;
  const RECOVER_EVERY_MS = 15_000;
  const RECOVER_MIN_AGE_MS = 8_000;

  /** Raised for jobs that arrive while the plugin is being reloaded. Nothing was spent. */
  class ReloadingError extends Error {
    constructor() {
      super("Image Studio is reloading. Nothing was generated or charged. Run the command again.");
    }
  }

  function trackJob<T>(job: () => Promise<T>): Promise<T> {
    if (draining) return Promise.reject(new ReloadingError());
    const running = job();
    inFlight.add(running);
    const done = () => void inFlight.delete(running);
    running.then(done, done);
    return running;
  }

  /** Logging must never fail a job: after a reload the old `bb` handle throws on every call. */
  function warn(message: string): void {
    try {
      bb.log.warn(message);
    } catch {
      // stale handle
    }
  }

  const journal = createJournal({
    dir: pendingDir,
    generationFile: (record) => generationPath(record.projectId, record.filename),
    candidateFile: (profileId, candidate) => join(profileDir(profileId), candidate.filename),
    gallery: galleryStore,
    profiles: profileStore,
    onAdopted: (entry) => {
      bb.realtime.publish(CHANGED, entry.kind === "generation" ? { kind: "generations", projectId: entry.record.projectId } : { kind: "profiles" });
    },
    warn,
  });
  const writePending = journal.write;
  const clearPending = journal.clear;
  const recoverPending = (minAgeMs = RECOVER_MIN_AGE_MS): Promise<number> => journal.recover(minAgeMs);

  /** Thrown when a reload cut the job off after the image was saved to disk: the image is safe and will be adopted. */
  class SavedAfterReload extends Error {
    constructor(
      readonly record: Generation,
      cause: unknown,
    ) {
      super(
        `The plugin was reloaded while saving ${record.filename}. The image is on disk and will appear in the gallery within about ${RECOVER_EVERY_MS / 1000} seconds.`,
        { cause },
      );
    }
  }

  function runGenerate(input: RenderInput): Promise<Generation> {
    return trackJob(() => generateAndStore(input));
  }

  async function generateAndStore(input: RenderInput): Promise<Generation> {
    const rendered = await renderImage(input);
    const { display, thumb, size, settings } = rendered;
    const id = randomUUID().slice(0, 8);
    const filename = `${id}.webp`;
    const projectId = input.projectId ?? "unscoped";
    // Files first, plain fs: they survive a reload. Records come after.
    await mkdir(join(rootDir, "generations", projectId), { recursive: true });
    await atomicWrite(generationPath(projectId, filename), display);
    await atomicWrite(generationPath(projectId, `${id}.thumb.webp`), thumb);

    let projectPath: string | null = null;
    let guiOut: GuiExport | null = null;
    if (input.gui) {
      guiOut = await exportGui(input, input.gui, rendered.original, id, projectId);
      projectPath = guiOut.mainPath;
    } else if (input.cwd) {
      const dest = join(input.cwd, "image-studio", filename);
      try {
        await bb.sdk.files.write({
          path: dest,
          rootPath: input.cwd,
          content: display.toString("base64"),
          contentEncoding: "base64",
          createParents: true,
          hostId: input.hostId,
        });
        projectPath = dest;
      } catch (error) {
        warn(`project copy skipped: ${describe(error)}`);
      }
    }

    const record: Generation = {
      id,
      projectId,
      createdAt: new Date().toISOString(),
      prompt: input.recordPrompt ?? input.prompt,
      composedPrompt: rendered.composedPrompt,
      model: rendered.model,
      gateway: rendered.gateway,
      profileId: rendered.profile?.id ?? null,
      profileName: rendered.profile?.name ?? null,
      filename,
      mimeType: sniffImageMime(display),
      projectPath,
      width: size?.width,
      height: size?.height,
      ...(rendered.seed !== undefined ? { seed: rendered.seed } : {}),
      ...(rendered.profile ? { refsUsed: rendered.refsUsed } : {}),
      ...(rendered.refsDropped.length > 0 ? { refsDropped: rendered.refsDropped } : {}),
      ...(rendered.profile ? selectionFields(rendered.selection) : {}),
      ...(input.gui
        ? {
            guiStyleId: input.gui.styleId,
            guiMode: input.gui.mode,
            guiLabel: input.gui.label,
            guiRun: input.gui.run,
            guiDir: guiOut?.dir ?? null,
            ...(guiOut?.parts !== undefined ? { guiParts: guiOut.parts } : {}),
            ...(guiOut && guiOut.missing.length > 0 ? { guiMissing: guiOut.missing } : {}),
            ...(input.gui.character ? { guiCharacter: input.gui.character } : {}),
            ...(guiOut?.files?.length ? { guiFiles: guiOut.files } : {}),
          }
        : {}),
      ...(input.itemId ? { itemId: input.itemId } : {}),
    };
    try {
      await writePending(id, { kind: "generation", record });
      await galleryStore.add(projectId, record);
      if (input.gui?.styleId) await addGuiGeneration(input.gui.styleId, record);
      bb.realtime.publish(CHANGED, { kind: "generations", projectId });
      await clearPending(id);
    } catch (error) {
      if (isStaleHandleError(error)) throw new SavedAfterReload(record, error);
      throw error;
    }
    try {
      await rememberChoice((last) => {
        const remembered = parseLastChoice({
          model: record.model,
          gateway: record.gateway,
          aspectRatio: input.aspectRatio,
          resolution: input.resolution,
        });
        if (remembered) return remembered;
        return resolvePickerSelection({
          enabled: enabledFromSettings(settings),
          defaultGateway: settings.defaultGateway,
          last,
          suggestedModel: record.model,
          suggestedGateway: record.gateway,
          suggestedAspect: input.aspectRatio,
          suggestedResolution: input.resolution,
        });
      });
    } catch (error) {
      // The image and its record are saved; only the picker's memory failed.
      warn(`last choice not saved: ${describe(error)}`);
    }
    return record;
  }

  // ---- GUI section -----------------------------------------------------------------

  /** Styles are one KV list (small: text and file names), changed under a lock like the profiles. */
  const guiLock = new Mutex();
  const readStoredStyles = async (): Promise<GuiStyle[]> => parseGuiStyles(await bb.storage.kv.get<unknown>(GUI_STYLES_KEY));
  // Projects are read only after the one-time move of GUI and Characters projects into Roblox games.
  let gamesMigration: Promise<void> | null = null;
  function gamesReady(): Promise<void> {
    gamesMigration ??= migrateGames().catch((error) => {
      gamesMigration = null;
      throw error;
    });
    return gamesMigration;
  }
  const readGuiStyles = async (): Promise<GuiStyle[]> => {
    await gamesReady();
    return readStoredStyles();
  };
  function withGuiStyles<T>(change: (styles: GuiStyle[]) => Promise<T> | T): Promise<T> {
    return gamesReady().then(() => lockedStyles(change));
  }
  function lockedStyles<T>(change: (styles: GuiStyle[]) => Promise<T> | T): Promise<T> {
    return guiLock.run(async () => {
      const styles = await readStoredStyles();
      const result = await change(styles);
      await bb.storage.kv.set(GUI_STYLES_KEY, styles);
      bb.realtime.publish(CHANGED, { kind: "gui" });
      return result;
    });
  }
  function withGuiStyle(id: string, change: (style: GuiStyle) => Promise<void> | void): Promise<GuiStyle> {
    return withGuiStyles(async (styles) => {
      const style = styles.find((item) => item.id === id);
      if (!style) throw new Error("GUI style not found");
      await change(style);
      style.updatedAt = new Date().toISOString();
      return style;
    });
  }
  function guiDir(styleId: string): string {
    return join(rootDir, "gui", styleId);
  }

  const guiGenLock = new Mutex();
  /** A project's generations; the first read after the update adopts its records still in the shared gallery. */
  async function readGuiGenerations(styleId: string): Promise<Generation[]> {
    const raw = await bb.storage.kv.get<unknown>(GUI_GEN_PREFIX + styleId);
    if (Array.isArray(raw)) {
      return raw.flatMap((item) => {
        const parsed = generationSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
    }
    return (await readStudioGallery(null)).filter((item) => item.guiStyleId === styleId);
  }
  function addGuiGeneration(styleId: string, record: Generation): Promise<void> {
    return guiGenLock.run(async () => {
      const list = (await readGuiGenerations(styleId)).filter((item) => item.id !== record.id);
      // The composed prompt is kilobytes of wrapper; the shared gallery keeps it, the project list does not.
      await bb.storage.kv.set(GUI_GEN_PREFIX + styleId, fitGallery([{ ...record, composedPrompt: "" }, ...list], GUI_GEN_MAX));
    });
  }

  const modelTakeLock = new Mutex();
  async function readModelTakes(styleId: string): Promise<ModelTakeRecord[]> {
    const raw = await bb.storage.kv.get<unknown>(modelTakeKvKey(styleId));
    return parseModelTakeRecords(raw);
  }
  function addModelTake(styleId: string, record: ModelTakeRecord): Promise<void> {
    return modelTakeLock.run(async () => {
      const list = (await readModelTakes(styleId)).filter((item) => item.id !== record.id);
      await bb.storage.kv.set(modelTakeKvKey(styleId), [record, ...list].slice(0, MODEL_TAKE_MAX));
    });
  }

  const itemLock = new Mutex();
  async function readItemIndex(styleId: string) {
    const raw = await bb.storage.kv.get<unknown>(itemIndexKvKey(styleId));
    return parseItemIndex(raw);
  }
  async function writeItemIndex(styleId: string, rows: ReturnType<typeof parseItemIndex>): Promise<void> {
    await bb.storage.kv.set(itemIndexKvKey(styleId), rows);
  }
  async function readItemJson(cwd: string, hostId: string, style: GuiStyle, itemId: string): Promise<Item | null> {
    const rel = join("image-studio", "model", slugify(style.name, "model"), "items", slugify(itemId, "item"), "item.json");
    try {
      const bytes = await readHostBytes(rel, cwd, hostId);
      const parsed = itemSchema.safeParse(JSON.parse(bytes.toString("utf8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  async function writeItemJson(cwd: string, hostId: string, style: GuiStyle, item: Item): Promise<void> {
    const slug = slugify(item.id, "item");
    const rel = join("image-studio", "model", slugify(style.name, "model"), "items", slug, "item.json");
    await writeHostBytes(rel, cwd, hostId, Buffer.from(JSON.stringify(item, null, 2)));
    const rows = await readItemIndex(style.id);
    await writeItemIndex(style.id, upsertItemIndex(rows, itemIndexFromItem(item)));
  }
  async function ensureItem(
    cwd: string,
    hostId: string,
    style: GuiStyle,
    itemId: string,
    gameId: string | null,
  ): Promise<Item> {
    const existing = await readItemJson(cwd, hostId, style, itemId);
    if (existing) return existing;
    const item = createItem({
      id: itemId,
      project: style.id,
      gameId,
    });
    await writeItemJson(cwd, hostId, style, item);
    return item;
  }
  async function saveItem(cwd: string, hostId: string, style: GuiStyle, item: Item): Promise<Item> {
    return itemLock.run(async () => {
      await writeItemJson(cwd, hostId, style, item);
      return item;
    });
  }
  async function loadItemForShow(cwd: string, hostId: string, style: GuiStyle, itemId: string): Promise<Item> {
    const item = await readItemJson(cwd, hostId, style, itemId);
    if (!item) throw new Error(`No item "${itemId}" in project ${style.name}.`);
    return item;
  }

  function hostRelPath(cwd: string, path: string): string {
    const normalized = path.trim().replace(/\\/g, "/");
    if (isAbsolute(normalized)) {
      const base = cwd.replace(/\\/g, "/").replace(/\/$/, "");
      if (normalized.startsWith(base + "/")) return normalized.slice(base.length + 1);
      return normalized;
    }
    return normalized.replace(/^\.\//, "");
  }

  async function runItemExport(input: {
    cwd: string;
    hostId: string;
    style: GuiStyle;
    itemId: string;
    scaleOverride?: number;
    selectedBy: ItemSelectedBy;
  }): Promise<{ exportRel: string; doc: ReturnType<typeof buildItemExportJson>; summary: string }> {
    const itemSlug = slugify(input.itemId, "item");
    let item = await loadItemForShow(input.cwd, input.hostId, input.style, input.itemId);
    const textureEntry = requireSelectedTextureEntry(item);
    const takeRel = hostRelPath(input.cwd, textureTakeDirFromEntry(textureEntry));
    const takeAbs = join(input.cwd, takeRel);
    const scale = input.scaleOverride ?? modelFbxScale(input.style);
    const projectSlug = slugify(input.style.name, "model");
    const exportRel = itemExportRelDir(projectSlug, itemSlug);
    const exportAbs = join(input.cwd, exportRel);
    await runBlenderOnHost(
      input.hostId,
      ["export", takeAbs, exportAbs, "--scale", String(scale), "--uv", "ImageStudioUV", "--name", itemSlug],
      input.cwd,
    );
    const colorSrcRel = hostRelPath(input.cwd, textureEntry.files.color ?? "");
    const colorBytes = await readHostBytes(colorSrcRel, input.cwd, input.hostId);
    const normalBytes = await encodePng(normalMap(await decodeRgba(colorBytes)));
    const colorOut = join(exportRel, `${itemSlug}_color.png`);
    const normalOut = join(exportRel, `${itemSlug}_normal.png`);
    await writeHostBytes(colorOut, input.cwd, input.hostId, colorBytes);
    await writeHostBytes(normalOut, input.cwd, input.hostId, normalBytes);
    const modelFiles = item.steps.model.selected
      ? item.steps.model.entries.find((e) => e.id === item.steps.model.selected)?.files
      : undefined;
    let roughnessOut: string | undefined;
    let metalOut: string | undefined;
    for (const [key, outName] of [
      ["roughness", `${itemSlug}_roughness.png`],
      ["metal", `${itemSlug}_metal.png`],
    ] as const) {
      const src = modelFiles?.[key] ?? textureEntry.files[key];
      if (!src) continue;
      const srcRel = hostRelPath(input.cwd, src);
      try {
        const bytes = await readHostBytes(srcRel, input.cwd, input.hostId);
        const dest = join(exportRel, outName);
        await writeHostBytes(dest, input.cwd, input.hostId, bytes);
        if (key === "roughness") roughnessOut = dest;
        else metalOut = dest;
      } catch {
        // optional map missing on disk
      }
    }
    const files = {
      fbx: join(exportRel, `${itemSlug}.fbx`),
      blend: join(exportRel, `${itemSlug}.blend`),
      color: colorOut,
      normal: normalOut,
      ...(roughnessOut ? { roughness: roughnessOut } : {}),
      ...(metalOut ? { metal: metalOut } : {}),
    };
    const doc = buildItemExportJson({
      itemId: itemSlug,
      files,
      fbxScale: scale,
      uvLayer: "ImageStudioUV",
    });
    const exportJsonRel = join(exportRel, "export.json");
    await writeHostBytes(exportJsonRel, input.cwd, input.hostId, Buffer.from(JSON.stringify(doc, null, 2)));
    item = recordExportGenerated(item, exportRel, { ...files, export: exportJsonRel }, input.selectedBy);
    await saveItem(input.cwd, input.hostId, input.style, item);
    const summary = [
      `Exported ${item.name} (${itemSlug}) at FBX scale ${scale}`,
      `  ${files.fbx}`,
      `  ${files.color}`,
      `  ${files.normal}`,
      `  ${exportJsonRel}`,
    ].join("\n");
    return { exportRel, doc, summary };
  }

  async function addGuiRefFile(styleId: string, role: "concept" | "art", bytes: Buffer, name: string): Promise<GuiStyle> {
    return withGuiStyle(styleId, async (style) => {
      if (style.refs.length >= GUI_MAX_REFS) {
        throw new Error(`A style keeps at most ${GUI_MAX_REFS} reference pictures. Remove one first.`);
      }
      const id = randomUUID().slice(0, 8);
      const mimeType = sniffImageMime(bytes);
      const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "webp";
      const filename = `${id}-${slugify(name, "ref")}.${ext}`;
      await mkdir(guiDir(styleId), { recursive: true });
      await writeFile(join(guiDir(styleId), filename), bytes);
      style.refs.push({ id, filename, mimeType, role });
    });
  }

  /** `owners[i]`: the project whose folder holds ref i (a game's GUI project also sends the game's art). */
  async function guiRefUris(style: GuiStyle | null, owners?: readonly string[]): Promise<string[]> {
    if (!style) return [];
    const uris: string[] = [];
    for (const [index, ref] of style.refs.entries()) {
      const bytes = await readFile(join(guiDir(owners?.[index] ?? style.id), ref.filename));
      uris.push(`data:${ref.mimeType};base64,${bytes.toString("base64")}`);
    }
    return uris;
  }

  type GuiExport = { dir: string; mainPath: string; parts?: number; missing: string[]; files?: string[] };

  /**
   * GUI pictures are saved at full size (not the 1600px gallery WebP): image-studio/gui/<style>/<id>-<label>/ in the
   * project. Element sheets are keyed and cut into parts/<name>.png with manifest.json beside them.
   */
  async function exportGui(
    input: RenderInput,
    gui: NonNullable<RenderInput["gui"]>,
    original: Buffer,
    id: string,
    projectId: string,
  ): Promise<GuiExport> {
    const characters = gui.section === "characters";
    const roblox = gui.section === "roblox";
    const folder = `${id}-${slugify(characters ? `${gui.character ?? ""} ${gui.label}` : gui.label, gui.mode)}`;
    const styleFolder = slugify(gui.styleName ?? "", "no-style");
    const sectionFolder = characters ? "characters" : "gui";
    const base = gui.folder ?? [sectionFolder, styleFolder];
    const dir = input.cwd
      ? join(input.cwd, "image-studio", ...base, folder)
      : join(rootDir, "generations", projectId, ...base, folder);
    const write = async (path: string, bytes: Buffer): Promise<void> => {
      if (input.cwd) {
        await bb.sdk.files.write({
          path,
          rootPath: input.cwd,
          content: bytes.toString("base64"),
          contentEncoding: "base64",
          createParents: true,
          hostId: input.hostId,
        });
      } else {
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, bytes);
      }
    };
    const mime = sniffImageMime(original);
    const ext = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
    const mainName = gui.layout ? "sheet" : roblox ? "source" : !characters ? "mockup" : gui.mode === "model" ? "front" : "idea";
    const mainPath = join(dir, `${mainName}.${ext}`);
    await write(mainPath, original);
    if (roblox && gui.output) {
      try {
        return await exportRoblox(input, gui, gui.output, original, dir, ext, write);
      } catch (error) {
        warn(`Roblox export failed: ${describe(error)}`);
        return { dir, mainPath, missing: [] };
      }
    }
    if (!gui.layout) return { dir, mainPath, missing: [] };
    if (characters) {
      // White-background sheets: turnaround views go to views/, props to parts/, each on a white square.
      try {
        const sub = gui.mode === "turnaround" ? "views" : "parts";
        const cut = cutOnWhite(await decodeRgba(original), gui.layout);
        for (const part of cut.parts) await write(join(dir, sub, `${part.name}.png`), await encodePng(part.image));
        const manifest = {
          project: gui.styleName,
          character: gui.character ?? null,
          mode: gui.mode,
          request: input.recordPrompt ?? null,
          sheet: `sheet.${ext}`,
          grid: { rows: gui.layout.rows, cols: gui.layout.cols },
          cleanGaps: cut.clean,
          missing: cut.missing,
          [sub]: cut.parts.map((part) => ({
            name: part.name,
            file: `${sub}/${part.name}.png`,
            element: gui.layout!.cells.find((cell) => cell.name === part.name)?.element ?? part.name,
            ...(gui.mode === "accessories" || gui.mode === "equipment"
              ? { mount: mountFor(gui.layout!.cells.find((cell) => cell.name === part.name)?.element ?? part.name, gui.mode === "equipment") }
              : {}),
            x: part.box.x0,
            y: part.box.y0,
            width: part.box.x1 - part.box.x0,
            height: part.box.y1 - part.box.y0,
          })),
        };
        await write(join(dir, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2)));
        return { dir, mainPath, parts: cut.parts.length, missing: cut.missing };
      } catch (error) {
        warn(`character sheet cut failed: ${describe(error)}`);
        return { dir, mainPath, missing: [] };
      }
    }
    try {
      const cut = cutSheet(keyGreen(await decodeRgba(original)), gui.layout);
      for (const part of cut.parts) await write(join(dir, "parts", `${part.name}.png`), await encodePng(part.image));
      const manifest = {
        style: gui.styleName,
        mode: gui.mode,
        label: gui.label,
        request: input.recordPrompt ?? null,
        sheet: `sheet.${ext}`,
        grid: { rows: gui.layout.rows, cols: gui.layout.cols },
        named: cut.named,
        missing: cut.missing,
        parts: cut.parts.map((part) => ({
          name: part.name,
          file: `parts/${part.name}.png`,
          ...(part.cell ? { element: part.cell.element, ...(part.cell.state ? { state: part.cell.state } : {}) } : {}),
          x: part.box.x0,
          y: part.box.y0,
          width: part.image.width,
          height: part.image.height,
        })),
      };
      await write(join(dir, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2)));
      return { dir, mainPath, parts: cut.parts.length, missing: cut.missing };
    } catch (error) {
      warn(`GUI cut failed: ${describe(error)}`);
      return { dir, mainPath, missing: [] };
    }
  }

  /**
   * The finished Roblox files next to the picture: exact sizes (icon 512², thumbnail 1920×1080), transparent parts cut
   * from a green or black sheet and centred on squares, props cut on white for 3D, a tiling texture with its normal
   * map, the six Sky faces, a flipbook; manifest.json says what each file is for in Studio.
   */
  async function exportRoblox(
    input: RenderInput,
    gui: NonNullable<RenderInput["gui"]>,
    output: RobloxOutput,
    original: Buffer,
    dir: string,
    ext: string,
    write: (path: string, bytes: Buffer) => Promise<void>,
  ): Promise<GuiExport> {
    const mainPath = join(dir, gui.layout ? `sheet.${ext}` : `source.${ext}`);
    const image = await decodeRgba(original);
    const files: Array<{ name: string; file: string; width: number; height: number; [key: string]: unknown }> = [];
    const put = async (name: string, file: string, picture: Rgba, extra: Record<string, unknown> = {}) => {
      await write(join(dir, file), await encodePng(picture));
      files.push({ name, file, width: picture.width, height: picture.height, ...extra });
    };
    let missing: string[] = [];
    let use = "";
    switch (output.kind) {
      case "cover":
        await put(gui.mode, output.file, opaque(cover(image, output.width, output.height)));
        use =
          gui.mode === "icon"
            ? "Game icon: Creator Dashboard → the experience → Places/Icon (512×512)."
            : gui.mode === "loading"
              ? "Loading screen background: an ImageLabel in a ScreenGui under ReplicatedFirst, with the logo and the bar on top."
              : "Thumbnail: Creator Dashboard → the experience → Thumbnails (1920×1080, up to 10; upload 2–5 so Roblox can test them).";
        break;
      case "limit": {
        const picture = output.transparent ? trimAlpha(keyGreen(image)) : opaque(image);
        await put(gui.mode, output.file, limit(picture, output.max));
        use = gui.mode === "logo" ? "Transparent logo for thumbnails, the loading screen and ImageLabels." : "Decal: upload as an Image/Decal and put it on a part (Decal or SurfaceGui ImageLabel).";
        break;
      }
      case "parts": {
        const keyed = output.key === "green" ? keyGreen(image) : glowToAlpha(image);
        const cut = cutSheet(keyed, gui.layout);
        missing = cut.missing;
        for (const part of cut.parts) {
          // Round icons go on an opaque square; glows fade out before the edge of theirs.
          const square = output.round
            ? flattenRound(fitSquare(part.image, output.size, 0.01))
            : output.key === "black"
              ? fadeEdges(fitSquare(part.image, output.size))
              : fitSquare(part.image, output.size);
          await put(part.name, `parts/${part.name}.png`, square, part.cell ? { element: part.cell.element } : {});
        }
        use =
          gui.mode === "badges"
            ? "Badges: Creator Dashboard → Badges → Create (512×512, shown in a circle)."
            : gui.mode === "passes"
              ? "Game passes: Creator Dashboard → Passes → Create (512×512, shown in a circle)."
              : gui.mode === "products"
                ? "Developer products: Creator Dashboard → Developer Products → Create."
                : gui.mode === "vfx"
                  ? "Particle textures: ParticleEmitter/Beam/Trail .Texture, drawn white so the Color property tints them; LightEmission 1 for glow."
                  : "Item icons for ImageLabels/ImageButtons (transparent, 256×256).";
        break;
      }
      case "white-parts": {
        const cut = cutOnWhite(image, gui.layout!);
        missing = cut.missing;
        for (const part of cut.parts) {
          await put(part.name, `parts/${part.name}.png`, part.image, { element: gui.layout!.cells.find((cell) => cell.name === part.name)?.element ?? part.name });
        }
        use = "Props for image-to-3D (Hunyuan3D / TRELLIS on gpu3d): each parts/*.png is one model's input picture.";
        break;
      }
      case "texture": {
        const color = resize(seamless(opaque(image)), output.size, output.size);
        await put("color", "color.png", color, { property: "SurfaceAppearance.ColorMap / MaterialVariant.ColorMap" });
        await put("normal", "normal.png", normalMap(color), { property: "SurfaceAppearance.NormalMap / MaterialVariant.NormalMap" });
        use = "A tiling material: MaterialVariant (StudsPerTile) or SurfaceAppearance; or the color alone as a Texture.";
        break;
      }
      case "skybox": {
        const faces = skyboxFaces(opaque(image), output.size);
        for (const face of SKYBOX_FACES) await put(face, `${face}.png`, faces[face], { property: `Sky.${face}` });
        use = "Sky object in Lighting: each file goes to the Sky property of its name. Turning right: Ft → Rt → Bk → Lf. Sun and moon come from Roblox (Sky.SunTextureId, MoonTextureId).";
        break;
      }
      case "flipbook": {
        const side = Math.min(image.width, image.height);
        const square = cover(image, side, side);
        await put("flipbook", "flipbook.png", resize(glowToAlpha(square), output.size, output.size), {
          property: `ParticleEmitter.Texture with FlipbookLayout Grid${output.grid}x${output.grid}`,
        });
        use = `ParticleEmitter: Texture = flipbook.png, FlipbookLayout = Grid${output.grid}x${output.grid}, FlipbookMode = Loop, Color tints it.`;
        break;
      }
    }
    const manifest = {
      game: gui.styleName,
      mode: gui.mode,
      label: gui.label,
      request: input.recordPrompt ?? null,
      source: mainPath.split(/[\\/]/).pop(),
      use,
      missing,
      files,
    };
    await write(join(dir, "manifest.json"), Buffer.from(JSON.stringify(manifest, null, 2)));
    const parts = output.kind === "parts" || output.kind === "white-parts" ? files.length : undefined;
    return { dir, mainPath, missing, files: files.map((file) => join(dir, file.file)), ...(parts !== undefined ? { parts } : {}) };
  }

  /** The jobs of one GUI request. Throws a readable error for an empty or oversized element list. */
  function guiJobs(mode: GuiMode, prompt: string, style: GuiStyle | null, states: boolean): GuiJob[] {
    switch (mode) {
      case "ideas":
      case "screen":
        if (!prompt) throw new Error("Describe the screen or window, e.g. \"settings window with tabs, sliders and toggles\".");
        return mode === "ideas" ? ideasJobs(prompt, style) : [screenJob(prompt, style)];
      case "elements": {
        const elements = parseElementList(prompt);
        if (elements.length === 0) throw new Error("List the elements, one per line or separated by \";\", e.g. \"Play button; gold coin icon\".");
        const max = states ? 6 : MAX_ELEMENTS;
        if (elements.length > max) throw new Error(`At most ${max} elements per sheet${states ? " with states" : ""}; got ${elements.length}. Split the list.`);
        return [elementsJob(elements, style, states)];
      }
      case "kit":
        return kitJobs(style).map((job) => (prompt ? { ...job, prompt: `${job.prompt}\nAlso: ${prompt}` } : job));
    }
  }

  /**
   * The project a run writes to: the named one; else the latest project bound to this folder (or BB project);
   * else a new project named after the folder. "Make GUI from this place" therefore always lands in one project.
   */
  async function resolveGuiProject(input: {
    styleId?: string;
    origin: string;
    projectId: string | null;
    name?: string;
    section?: Section;
    /** A game's GUI or Characters: its linked project, made on first use. */
    gameId?: string;
  }): Promise<GuiStyle> {
    const section = input.section ?? "gui";
    const inSection = (styles: readonly GuiStyle[]) => styles.filter((style) => style.section === section);
    if (input.gameId && section !== "roblox") {
      const gameId = input.gameId;
      return withGuiStyles((styles) => {
        const game = styles.find((style) => style.id === gameId && style.section === "roblox");
        if (!game) throw new Error(`No Roblox game "${gameId}".`);
        const linked = inSection(styles).filter((style) => style.gameId === game.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (linked) return linked;
        const created = blankProject(section, game.origin, game.projectId, game.name);
        created.gameId = game.id;
        styles.push(created);
        return created;
      });
    }
    if (input.styleId) {
      const found = findGuiStyle(inSection(await readGuiStyles()), input.styleId, input.origin);
      const sectionCli = section === "gui" ? "gui" : section === "roblox" ? "roblox" : section === "model" ? "model" : "character";
      if (!found) throw new Error(`No ${SECTION_WORD[section]} project "${input.styleId}". Run bb image-studio ${sectionCli} projects.`);
      return found;
    }
    return withGuiStyles((styles) => {
      const bound = originProject(inSection(styles), input.origin);
      if (bound) return bound;
      const created = blankProject(
        section,
        input.origin,
        input.projectId ?? "unscoped",
        input.name || (input.origin === "unscoped" ? "" : originName(input.origin)) || `${SECTION_WORD[section]} ${inSection(styles).length + 1}`,
      );
      // A folder that has a Roblox game: its GUI and Characters belong to that game.
      if (section !== "roblox") created.gameId = originProject(styles.filter((style) => style.section === "roblox"), input.origin)?.id ?? "";
      styles.push(created);
      return created;
    });
  }

  function blankProject(section: Section, origin: string, projectId: string, name: string): GuiStyle {
    const now = new Date().toISOString();
    return {
      id: randomUUID().slice(0, 8),
      projectId,
      origin,
      section,
      gameId: "",
      name: name.slice(0, 80),
      theme: "",
      tags: [],
      palette: { background: "", button: "", outline: "", highlight: "", text: "" },
      notes: "",
      refs: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /** The game a project belongs to (a game is its own). */
  async function gameOf(style: GuiStyle): Promise<GuiStyle | null> {
    if (style.section === "roblox") return style;
    if (!style.gameId) return null;
    return (await readGuiStyles()).find((item) => item.id === style.gameId && item.section === "roblox") ?? null;
  }

  /** Moves the GUI and Characters projects made before games existed into games, once. */
  async function migrateGames(): Promise<void> {
    if (await bb.storage.kv.get<boolean>(GAMES_MIGRATED_KEY)) return;
    await lockedStyles((styles) => {
      const plan = planGameMigration(styles, new Date().toISOString(), () => randomUUID().slice(0, 8));
      styles.push(...plan.games);
      for (const style of styles) if (plan.links[style.id]) style.gameId = plan.links[style.id]!;
    });
    await bb.storage.kv.set(GAMES_MIGRATED_KEY, true);
  }

  async function runGui(input: {
    projectId: string | null;
    styleId?: string;
    section?: Section;
    mode: GuiMode | CharacterMode | RobloxMode;
    prompt: string;
    states: boolean;
    images?: string[];
    /** Characters: held items and the file name. */
    equipment?: string;
    character?: string;
    body?: BodyType;
    accessories?: string;
    cwd?: string;
    hostId?: string;
    /** Name for a project created for this place (BB project name); the folder name otherwise. */
    originLabel?: string;
    /** GUI / Characters of this Roblox game. */
    gameId?: string;
    /** Roblox: takes, flipbook frames, decal frame. */
    variants?: number;
    frames?: number;
    aspect?: string;
  }): Promise<{ generations: Generation[]; errors: string[]; style: GuiStyle | null; jobs: Array<GuiJob | CharacterJob | RobloxJob> }> {
    const section = input.section ?? "gui";
    const modes: readonly string[] = section === "gui" ? GUI_MODES : section === "roblox" ? ROBLOX_MODES : CHARACTER_MODES;
    if (!modes.includes(input.mode)) throw new Error(`${SECTION_WORD[section]} modes: ${modes.join(", ")}.`);
    const origin = input.cwd ?? input.projectId ?? "unscoped";
    const style = await resolveGuiProject({ styleId: input.styleId, origin, projectId: input.projectId, name: input.originLabel, section, gameId: input.gameId });
    const game = await gameOf(style);
    // A game's GUI and Characters see the game's theme, art style and approved art.
    const merged =
      section !== "roblox" && game
        ? mergeGameStyle(style, game)
        : { style: style, owners: style.refs.map(() => style.id) };
    const run = randomUUID().slice(0, 8);
    const lead = await guiRefUris(merged.style, merged.owners);
    const extra = input.images ?? [];
    const character = section === "characters" ? characterSlug(input.character ?? "", input.prompt) : undefined;
    // Everything of a game goes to its folder: image-studio/roblox/<game>/<store|gui|characters|…>/.
    const folder = (mode: string) =>
      game ? ["roblox", slugify(game.name, "game"), section === "roblox" ? MODE_CATEGORY[mode as RobloxMode] : section] : undefined;
    const cwd = game && isAbsolute(game.origin) ? game.origin : input.cwd;
    // Character prompts number the user's design pictures themselves; GUI prompts get the general line.
    const jobs: Array<GuiJob | CharacterJob | RobloxJob> =
      section === "roblox"
        ? robloxJobs(
            {
              mode: input.mode as RobloxMode,
              prompt: input.prompt,
              variants: input.variants ?? 1,
              frames: input.frames ?? 16,
              aspect: input.aspect ?? "1:1",
              refCount: lead.length,
              designCount: extra.length,
            },
            style,
          )
        : section === "characters"
        ? characterJobs(
            input.mode as CharacterMode,
            {
              description: input.prompt.trim(),
              body: input.body ?? "humanoid",
              equipment: parseEquipment(input.equipment),
              accessories: parseEquipment(input.accessories),
              name: character!,
              refCount: lead.length,
              designCount: extra.length,
            },
            merged.style,
          )
        : guiJobs(input.mode as GuiMode, input.prompt.trim(), merged.style, input.states).map((job) =>
            extra.length > 0
              ? { ...job, prompt: `${job.prompt}\nImages ${lead.length + 1}–${lead.length + extra.length} are extra references from the user: use them as the request says.` }
              : job,
          );
    const results = await Promise.allSettled(
      jobs.map((job) =>
        runGenerate({
          projectId: input.projectId,
          prompt: job.prompt,
          rawPrompt: true,
          recordPrompt: input.prompt.trim() || (input.equipment ?? "").trim() || (input.accessories ?? "").trim() || job.label,
          leadUris: lead,
          images: extra,
          model: section === "characters" ? CHARACTER_MODEL : section === "roblox" ? ROBLOX_MODEL : GUI_MODEL,
          gateway: "fal",
          aspectRatio: job.aspectRatio,
          cwd,
          hostId: input.hostId,
          gui: {
            styleId: style.id,
            styleName: style.name,
            section,
            mode: input.mode,
            label: job.label,
            run,
            layout: job.layout,
            ...(character ? { character } : {}),
            ...(folder(input.mode) ? { folder: folder(input.mode) } : {}),
            ...("output" in job ? { output: job.output } : {}),
          },
        }),
      ),
    );
    const generations: Generation[] = [];
    const errors: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") generations.push(result.value);
      else if (result.reason instanceof SavedAfterReload) generations.push(result.reason.record);
      else errors.push(`${jobs[index]!.label}: ${describe(result.reason)}`);
    });
    // The project used last comes first in the panel.
    await withGuiStyle(style.id, () => undefined).catch(() => undefined);
    return { generations, errors, style, jobs };
  }

  /** The folder the thread works in (a section of a big BB project), so its GUI lands in that folder's project. */
  async function threadFolder(threadId: string, projectId: string | null): Promise<{ cwd?: string; hostId?: string }> {
    try {
      const thread = (await bb.sdk.threads.get({ threadId })) as { environmentId?: string | null };
      if (thread.environmentId) {
        const env = (await bb.sdk.environments.get({ environmentId: thread.environmentId })) as { path?: string; hostId?: string };
        if (env.path) return { cwd: env.path, hostId: env.hostId };
      }
    } catch (error) {
      warn(`thread folder: ${describe(error)}`);
    }
    return projectSource(projectId);
  }

  async function projectSource(projectId: string | null | undefined): Promise<{ cwd?: string; hostId?: string; name?: string }> {
    if (!projectId) return {};
    try {
      const project = await bb.sdk.projects.get({ projectId });
      const source = project.sources[0];
      return { cwd: source?.path, hostId: source?.hostId, name: project.name };
    } catch (error) {
      warn(`project path: ${describe(error)}`);
      return {};
    }
  }

  function guiSummary(run: { generations: Generation[]; errors: string[]; style?: GuiStyle | null }): string {
    const sub = (record: Generation) => (record.guiMode === "turnaround" ? "views" : "parts");
    return [
      ...(run.style ? [`${SECTION_WORD[run.style.section]} project: ${run.style.name} (${run.style.id})`] : []),
      ...run.generations.map((record) =>
        [
          `${record.guiLabel}${record.guiCharacter ? ` (${record.guiCharacter})` : ""}: ${record.projectPath ?? record.filename}`,
          record.guiParts !== undefined ? `  ${record.guiParts} ${sub(record)} in ${record.guiDir}/${sub(record)} (manifest.json beside them)` : null,
          record.guiFiles?.length && record.guiParts === undefined ? `  ${record.guiFiles.join("\n  ")}\n  (manifest.json beside them says where each goes in Roblox)` : null,
          record.guiMissing?.length ? `  not found on the sheet: ${record.guiMissing.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      ...run.errors.map((error) => `failed: ${error}`),
    ].join("\n");
  }

  async function readHostBytes(path: string, cwd: string, hostId?: string): Promise<Buffer> {
    const absolute = hostPath(cwd, path);
    const file = await bb.sdk.files.read({ path: absolute, hostId });
    return Buffer.from(file.content, file.contentEncoding === "base64" ? "base64" : "utf8");
  }

  async function writeHostBytes(path: string, cwd: string, hostId: string | undefined, bytes: Buffer): Promise<void> {
    const absolute = hostPath(cwd, path);
    await bb.sdk.files.write({
      path: absolute,
      content: bytes.toString("base64"),
      contentEncoding: "base64",
      createParents: true,
      hostId,
    });
  }

  async function runBlenderOnHost(hostId: string, args: string[], cwd?: string): Promise<void> {
    const settings = await readSettings();
    const blenderPath = settings.blenderPath.trim() || DEFAULT_BLENDER_PATH;
    try {
      await blenderHost.call(
        "blender",
        { blenderPath, script: "texture_uv", args, cwd },
        { hostId, timeoutMs: 12 * 60 * 1000 },
      );
    } catch (error) {
      throw new Error(
        `Could not run Blender (${describe(error)}). Set blenderPath in Image Studio settings (default ${DEFAULT_BLENDER_PATH}).`,
      );
    }
  }

  type ModelTakeManifest = {
    mode: ModelMode;
    model: string;
    object: string;
    uvLayer: string;
    size: ModelTextureSize;
    prompt: string;
    guideFix?: GuideFixStats;
    files: {
      color: string;
      mask: string;
      guide: string;
      preview: string;
      blend: string;
      parts: string;
      normal?: string;
    };
  };

  async function runModelTextureUv(input: {
    projectId: string | null;
    styleId?: string;
    mode: ModelMode;
    model: string;
    object?: string;
    prompt: string;
    parts?: ModelPartsParam;
    images?: string[];
    size?: ModelTextureSize;
    variants?: number;
    subject?: string;
    conceptNote?: string;
    projectConcept?: boolean;
    conceptView?: ModelConceptView;
    guideFix?: "on" | "off";
    cwd?: string;
    hostId?: string;
    originLabel?: string;
    gameId?: string;
    itemId?: string;
  }): Promise<{ takes: ModelTakeManifest[]; records: ModelTakeRecord[]; errors: string[]; style: GuiStyle; paletteHint: string }> {
    if (!input.cwd || !input.hostId) {
      throw new Error("Texture-by-model needs a project folder on a host with Blender installed.");
    }
    const modelPath = isAbsolute(input.model) ? input.model : join(input.cwd, input.model);
    const origin = input.cwd ?? input.projectId ?? "unscoped";
    const style = await resolveGuiProject({
      styleId: input.styleId,
      origin,
      projectId: input.projectId,
      name: input.originLabel ?? (origin !== "unscoped" ? originName(origin) : undefined),
      section: "model",
      gameId: input.gameId,
    });
    const game = await gameOf(style);
    const merged = game ? mergeGameStyle(style, game) : { style, owners: style.refs.map(() => style.id) };
    const gameTheme = merged.style.theme.trim();
    const gameArtStyle = [merged.style.notes.trim(), merged.style.tags.join(", ")].filter(Boolean).join("; ");
    const size = input.size ?? 1024;
    if (!MODEL_TEXTURE_SIZES.includes(size)) throw new Error(`size must be ${MODEL_TEXTURE_SIZES.join(" or ")}.`);
    const variants = Math.max(1, Math.min(4, input.variants ?? 1));
    const extra = (input.images ?? []).slice(0, 2);
    const hasConcept = extra.length >= 1;
    const hasStyle = extra.length >= 2;
    const projectConcept = hasConcept ? (input.projectConcept ?? false) : false;
    const errors: string[] = [];
    const takes: ModelTakeManifest[] = [];
    const records: ModelTakeRecord[] = [];
    let paletteHint = "";
    const run = randomUUID().slice(0, 8);
    const projectSlug = slugify(style.name, "model");
    const runRel = input.itemId
      ? itemRunRelPath(projectSlug, slugify(input.itemId, "item"), "texture-uv", run)
      : join("image-studio", "model", projectSlug, run);
    const runAbs = join(input.cwd, runRel);
    let conceptProjUri: string | undefined;

    try {
      const prepArgs = ["prepare", modelPath, runAbs, "--size", String(size)];
      if (input.object) prepArgs.push("--object", input.object);
      if (hasConcept && projectConcept && extra[0]) {
        const [conceptUri] = await sourceDataUris([extra[0]], input.projectId, input.cwd, input.hostId);
        if (conceptUri) {
          const conceptBytes = Buffer.from(conceptUri.slice(conceptUri.indexOf(",") + 1), "base64");
          const cut = cutConcept(await decodeRgba(conceptBytes));
          const conceptProjBytes = await encodePng(cut);
          await writeHostBytes(join(runRel, "concept_proj.png"), input.cwd, input.hostId, conceptProjBytes);
          prepArgs.push("--concept", join(runAbs, "concept_proj.png"), "--concept-view", input.conceptView ?? "front");
          conceptProjUri = `data:image/png;base64,${conceptProjBytes.toString("base64")}`;
        }
      }
      await runBlenderOnHost(input.hostId, prepArgs, input.cwd);
      const partsJson = JSON.parse((await readHostBytes(join(runRel, "parts.json"), input.cwd, input.hostId)).toString("utf8")) as {
        parts: Array<{ material: string; part: string; color: string; marker?: boolean; kind?: TextureUvPartKind }>;
      };
      const guideBytes = await readHostBytes(join(runRel, "guide.png"), input.cwd, input.hostId);
      const maskBytes = await readHostBytes(join(runRel, "mask.png"), input.cwd, input.hostId);
      const guideRgbaForPalette = await decodeRgba(guideBytes);
      const maskRgbaForPalette = await decodeRgba(maskBytes);
      const palette = extractGuidePalette(guideRgbaForPalette, maskRgbaForPalette);
      paletteHint = textureUvPaletteHint(palette);
      const materialParts = mergeModelParts(partsJson.parts, input.parts);
      const partList = resolveTextureUvParts(partsJson.parts, palette, input.parts);
      const mergedPartsFile = partsJson.parts.map((row, index) => ({
        material: row.material,
        part: materialParts[index]?.part ?? row.part,
        color: row.color,
        marker: row.marker,
        kind: row.kind,
      }));
      await writeHostBytes(
        join(runRel, "parts.json"),
        input.cwd,
        input.hostId,
        Buffer.from(JSON.stringify({ parts: mergedPartsFile, palette }, null, 2)),
      );
      const prepareMeta = JSON.parse((await readHostBytes(join(runRel, "prepare.json"), input.cwd, input.hostId)).toString("utf8")) as {
        object: string;
        uvLayer: string;
      };
      const guideUri = `data:image/png;base64,${guideBytes.toString("base64")}`;
      const composed = buildTextureUvPrompt({
        subject: input.subject?.trim() || subjectFromFile(modelPath),
        parts: partList,
        projected: projectConcept,
        hasConcept,
        conceptNote: input.conceptNote,
        hasStyle,
        task: input.prompt.trim(),
        theme: gameTheme || undefined,
        artStyle: gameArtStyle || undefined,
      });
      const userUris = await sourceDataUris(extra, input.projectId, input.cwd, input.hostId);
      const museLead = [guideUri];
      if (hasConcept) museLead.push(conceptProjUri ?? userUris[0]!);
      if (hasStyle) museLead.push(userUris[hasConcept ? 1 : 0]!);
      const blendBytes = await readHostBytes(join(runRel, "model.blend"), input.cwd, input.hostId);
      const prepareBytes = await readHostBytes(join(runRel, "prepare.json"), input.cwd, input.hostId);

      for (let v = 0; v < variants; v++) {
        const takeRel = join(runRel, `take-${v + 1}`);
        const takeAbs = join(input.cwd, takeRel);
        try {
          await writeHostBytes(join(takeRel, "model.blend"), input.cwd, input.hostId, blendBytes);
          await writeHostBytes(join(takeRel, "prepare.json"), input.cwd, input.hostId, prepareBytes);
          const rendered = await renderImage({
            projectId: input.projectId,
            prompt: composed,
            rawPrompt: true,
            recordPrompt: input.prompt.trim(),
            model: MODEL_MUSE,
            gateway: "fal",
            aspectRatio: "1:1",
            leadUris: museLead,
            cwd: input.cwd,
            hostId: input.hostId,
          });
          const painted = await decodeRgba(rendered.original);
          const guideRgba = await decodeRgba(guideBytes);
          const maskRgba = await decodeRgba(maskBytes);
          let fitted = resize(painted, guideRgba.width, guideRgba.height);
          let guideFixStats: GuideFixStats | undefined;
          if (input.guideFix !== "off") {
            const hasMarkerPart = partList.some((p) => p.marker);
            const fixed = guideFix(fitted, guideRgba, { hue: !hasMarkerPart });
            fitted = fixed.image;
            guideFixStats = {
              darkFilled: fixed.darkFilled,
              hueFixed: fixed.hueFixed,
              maskPixels: fixed.maskPixels,
            };
          }
          const color = cutAndDilate(fitted, maskRgba, DEFAULT_DILATE_PX);
          const colorBytes = await encodePng(color);
          await writeHostBytes(join(takeRel, "color.png"), input.cwd, input.hostId, colorBytes);
          await runBlenderOnHost(input.hostId, ["apply", takeAbs, join(takeAbs, "color.png")], input.cwd);
          const manifest: ModelTakeManifest = {
            mode: "texture-uv",
            model: modelPath,
            object: prepareMeta.object,
            uvLayer: prepareMeta.uvLayer,
            size,
            prompt: composed,
            ...(guideFixStats ? { guideFix: guideFixStats } : {}),
            files: {
              color: join(takeRel, "color.png"),
              mask: join(runRel, "mask.png"),
              guide: join(runRel, "guide.png"),
              preview: join(takeRel, "preview.png"),
              blend: join(takeRel, "model.blend"),
              parts: join(runRel, "parts.json"),
            },
          };
          await writeHostBytes(join(takeRel, "manifest.json"), input.cwd, input.hostId, Buffer.from(JSON.stringify(manifest, null, 2)));
          takes.push(manifest);
          const record: ModelTakeRecord = {
            id: `${run}-take-${v + 1}`,
            mode: "texture-uv",
            createdAt: new Date().toISOString(),
            prompt: input.prompt.trim(),
            folder: takeRel,
            ...(guideFixStats ? { guideFix: guideFixStats } : {}),
            files: {
              manifest: join(takeRel, "manifest.json"),
              guide: manifest.files.guide,
              color: manifest.files.color,
              preview: manifest.files.preview,
              mask: manifest.files.mask,
            },
            warnings: [],
          };
          await addModelTake(style.id, record);
          records.push(record);
        } catch (error) {
          errors.push(`take-${v + 1}: ${describe(error)}`);
        }
      }
    } catch (error) {
      errors.push(`prepare: ${describe(error)}`);
    }
    if (input.itemId && takes.length > 0) {
      try {
        const game = await gameOf(style);
        let item = await ensureItem(input.cwd, input.hostId, style, input.itemId, game?.id ?? null);
        const takeRows = takes.map((take) => ({
          takeFolder: dirname(take.files.color),
          color: take.files.color,
          preview: take.files.preview,
          manifest: join(dirname(take.files.color), "manifest.json"),
        }));
        item = recordTextureUvGenerated(
          item,
          runRel,
          takeRows,
          { guide: join(runRel, "guide.png"), mask: join(runRel, "mask.png"), parts: join(runRel, "parts.json") },
          { prompt: input.prompt.trim(), model: MODEL_MUSE, gateway: "fal", priceUsd: 0.01 },
        );
        await saveItem(input.cwd, input.hostId, style, item);
      } catch (error) {
        errors.push(`item: ${describe(error)}`);
      }
    }
    return { takes, records, errors, style, paletteHint };
  }

  type ModelBlueprintManifest = {
    mode: "blueprint";
    subject: string;
    style: BlueprintStyle;
    views: BlueprintViewName[];
    dir: string;
    files: {
      sheet: string;
      views: string;
      "side-sheet"?: string;
      front?: string;
      side?: string;
      back?: string;
      top?: string;
    };
  };

  async function runModelBlueprint(input: {
    projectId: string | null;
    styleId?: string;
    images: string[];
    views?: BlueprintViewName[];
    style?: string;
    subject?: string;
    soft?: string[];
    rigid?: string[];
    sideSeparate?: boolean;
    blueprintModel?: string;
    resolution?: string;
    gateway?: string;
    cwd?: string;
    hostId?: string;
    originLabel?: string;
    gameId?: string;
    itemId?: string;
  }): Promise<{ blueprint: ModelBlueprintManifest | null; record: ModelTakeRecord | null; errors: string[]; style: GuiStyle }> {
    if (!input.cwd || !input.hostId) {
      throw new Error("Model blueprint needs a project folder on a host.");
    }
    if (!input.images[0]) throw new Error("Blueprint mode requires images[0] as the concept reference.");
    const origin = input.cwd ?? input.projectId ?? "unscoped";
    const style = await resolveGuiProject({
      styleId: input.styleId,
      origin,
      projectId: input.projectId,
      name: input.originLabel ?? (origin !== "unscoped" ? originName(origin) : undefined),
      section: "model",
      gameId: input.gameId,
    });
    const viewNames = defaultBlueprintViews(input.views);
    const clayStyle = normalizeBlueprintStyle(input.style ?? "clay+wire");
    const softParts = (input.soft ?? []).map((s) => s.trim()).filter(Boolean);
    const rigidParts = (input.rigid ?? []).map((s) => s.trim()).filter(Boolean);
    const [conceptUri] = await sourceDataUris([input.images[0]], input.projectId, input.cwd, input.hostId);
    if (!conceptUri) throw new Error("Could not read the concept image.");
    const subject = input.subject?.trim() || "this object";
    const run = randomUUID().slice(0, 8);
    const projectSlug = slugify(style.name, "model");
    const blueprintRel = input.itemId
      ? join(itemRunRelPath(projectSlug, slugify(input.itemId, "item"), "blueprint", run), "blueprint")
      : join("image-studio", "model", projectSlug, run, "blueprint");
    const errors: string[] = [];

    const rawModelChoice = input.blueprintModel?.trim() || "nano-banana-2.1";
    const selectedModel = rawModelChoice === "nano-banana-2-lite" ? "nano-banana-2" : rawModelChoice;
    const isMuse = selectedModel === "muse-image" || selectedModel === MODEL_MUSE;
    const resolution = input.resolution ?? (isMuse ? undefined : "1K");
    const sideSeparate = input.sideSeparate ?? (isMuse ? true : false);

    try {
      const prompt = buildBlueprintPrompt({ subject, viewNames, style: clayStyle, softParts });
      let rendered: Rendered;
      if (input.gateway) {
        rendered = await renderImage({
          projectId: input.projectId,
          prompt,
          rawPrompt: true,
          recordPrompt: prompt,
          model: selectedModel,
          gateway: input.gateway,
          resolution,
          pollMs: 1_200_000,
          aspectRatio: blueprintAspect(viewNames.length),
          leadUris: [conceptUri],
          cwd: input.cwd,
          hostId: input.hostId,
        });
      } else if (isMuse) {
        rendered = await renderImage({
          projectId: input.projectId,
          prompt,
          rawPrompt: true,
          recordPrompt: prompt,
          model: selectedModel,
          gateway: "fal",
          aspectRatio: blueprintAspect(viewNames.length),
          leadUris: [conceptUri],
          cwd: input.cwd,
          hostId: input.hostId,
        });
      } else {
        try {
          rendered = await renderImage({
            projectId: input.projectId,
            prompt,
            rawPrompt: true,
            recordPrompt: prompt,
            model: selectedModel,
            gateway: "kie",
            resolution,
            pollMs: 1_200_000,
            aspectRatio: blueprintAspect(viewNames.length),
            leadUris: [conceptUri],
            cwd: input.cwd,
            hostId: input.hostId,
          });
        } catch (kieError) {
          rendered = await renderImage({
            projectId: input.projectId,
            prompt,
            rawPrompt: true,
            recordPrompt: prompt,
            model: selectedModel,
            gateway: "fal",
            resolution,
            aspectRatio: blueprintAspect(viewNames.length),
            leadUris: [conceptUri],
            cwd: input.cwd,
            hostId: input.hostId,
          });
        }
      }
      const sheetRgba = await decodeRgba(rendered.original);
      await writeHostBytes(join(blueprintRel, "sheet.png"), input.cwd, input.hostId, rendered.original);
      let sheetCut = cutBlueprint(sheetRgba, viewNames);
      const classification = classifyViews(sheetCut.views);
      if (classification.relabeled) sheetCut = swapBlueprintBackSide(sheetCut);
      const wantsSide = viewNames.includes("side");
      const frontRaw = sheetCut.rawViews.find((v) => v.name === "front")?.image;
      let sideCut: ReturnType<typeof cutBlueprint> | null = null;
      let extraSheetBytes: Buffer | null = null;
      let extraSheetFile: "side-sheet" | "back-sheet" | null = null;
      let cut = sheetCut;
      let sideRegenerated = false;
      const assembledWarnings: string[] = [];
      let sheetSideSimilarity: number | undefined;
      const frontView = sheetCut.views.find((v) => v.name === "front");
      const sideView = sheetCut.views.find((v) => v.name === "side");
      if (frontView && sideView) sheetSideSimilarity = silhouetteSimilarity(frontView.image, sideView.image);

      const drawExtra = wantsSide && sideSeparate ? classification.drawn : null;
      if (drawExtra && frontRaw) {
        const frontPlate = frontReferencePlate(sheetRgba, frontRaw);
        const frontPlateUri = `data:image/png;base64,${(await encodePng(frontPlate)).toString("base64")}`;
        if (drawExtra === "back") {
          const backPrompt = buildBackOnlyPrompt({ subject, style: clayStyle, softParts });
          const backRendered = await renderImage({
            projectId: input.projectId,
            prompt: backPrompt,
            rawPrompt: true,
            recordPrompt: backPrompt,
            model: MODEL_MUSE,
            gateway: "fal",
            aspectRatio: "16:9",
            leadUris: [conceptUri, frontPlateUri],
            cwd: input.cwd,
            hostId: input.hostId,
          });
          extraSheetBytes = backRendered.original;
          extraSheetFile = "back-sheet";
          const backSheet = await decodeRgba(backRendered.original);
          const backCut = cutBlueprint(backSheet, ["back"]);
          const backRaw = backCut.rawViews.find((v) => v.name === "back")?.image ?? backCut.rawViews[0]?.image;
          if (backRaw) {
            cut = replaceBackView(sheetCut, backRaw);
            sideRegenerated = true;
          } else errors.push("back regeneration: could not cut the new back sheet");
        } else if (drawExtra === "side") {
          const sidePrompt = buildSideOnlyPrompt({ subject, style: clayStyle, softParts });
          const sideRendered = await renderImage({
            projectId: input.projectId,
            prompt: sidePrompt,
            rawPrompt: true,
            recordPrompt: sidePrompt,
            model: MODEL_MUSE,
            gateway: "fal",
            aspectRatio: "16:9",
            leadUris: [conceptUri, frontPlateUri],
            cwd: input.cwd,
            hostId: input.hostId,
          });
          extraSheetBytes = sideRendered.original;
          extraSheetFile = "side-sheet";
          const sideSheet = await decodeRgba(sideRendered.original);
          sideCut = cutBlueprint(sideSheet, ["side"]);
          const assembled = assembleBlueprint(sheetCut, sideCut, { sideSeparate: true });
          cut = assembled.cut;
          sideRegenerated = assembled.sideRegenerated;
          assembledWarnings.push(...assembled.warnings);
          sheetSideSimilarity = assembled.sheetSideSimilarity ?? sheetSideSimilarity;
        }
      }
      const { parts, warnings: softWarnings } = findSoftAnchors(cut.views, softParts, rigidParts);
      const viewsJson = viewsJsonFromCut(
        cut,
        parts,
        sideRegenerated,
        [...assembledWarnings, ...softWarnings],
        sheetSideSimilarity,
        classification,
      );
      if (extraSheetBytes && extraSheetFile) {
        await writeHostBytes(join(blueprintRel, `${extraSheetFile}.png`), input.cwd, input.hostId, extraSheetBytes);
      }
      for (const v of cut.views) {
        const bytes = await encodePng(v.image);
        await writeHostBytes(join(blueprintRel, `${v.name}.png`), input.cwd, input.hostId, bytes);
      }
      await writeHostBytes(
        join(blueprintRel, "views.json"),
        input.cwd,
        input.hostId,
        Buffer.from(JSON.stringify(viewsJson, null, 2)),
      );
      const files: ModelBlueprintManifest["files"] = {
        sheet: join(blueprintRel, "sheet.png"),
        views: join(blueprintRel, "views.json"),
        ...(extraSheetFile ? { [extraSheetFile]: join(blueprintRel, `${extraSheetFile}.png`) } : {}),
      };
      for (const name of viewNames) files[name] = join(blueprintRel, `${name}.png`);
      const blueprint = { mode: "blueprint" as const, subject, style: clayStyle, views: viewNames, dir: blueprintRel, files };
      const record: ModelTakeRecord = {
        id: run,
        mode: "blueprint",
        createdAt: new Date().toISOString(),
        prompt: subject,
        folder: blueprintRel,
        files: Object.fromEntries(
          Object.entries(files).map(([key, value]) => [key, value]),
        ),
        warnings: viewsJson.warnings,
        sideRegenerated: viewsJson.sideRegenerated,
      };
      await addModelTake(style.id, record);
      if (input.itemId) {
        try {
          const game = await gameOf(style);
          let item = await ensureItem(input.cwd, input.hostId, style, input.itemId, game?.id ?? null);
          item = recordBlueprintGenerated(item, dirname(blueprintRel), blueprint.files, {
            prompt: subject,
            model: selectedModel,
            gateway: input.gateway ?? (isMuse ? "fal" : "kie"),
            priceUsd: null,
          });
          await saveItem(input.cwd, input.hostId, style, item);
        } catch (error) {
          errors.push(`item: ${describe(error)}`);
        }
      }
      return { blueprint, record, errors, style };
    } catch (error) {
      errors.push(describe(error));
      return { blueprint: null, record: null, errors, style };
    }
  }

  function modelSummary(run: { takes: ModelTakeManifest[]; errors: string[]; style: GuiStyle; paletteHint?: string }): string {
    return [
      `Model project: ${run.style.name} (${run.style.id})`,
      ...run.takes.map(
        (take) => {
          const stats = take.guideFix
            ? `\n  guideFix: dark ${take.guideFix.darkFilled}, hue ${take.guideFix.hueFixed}, mask ${take.guideFix.maskPixels}`
            : "";
          return `texture-uv: ${take.files.color}\n  guide: ${take.files.guide}\n  mask: ${take.files.mask}\n  preview: ${take.files.preview}\n  manifest: ${join(dirname(take.files.color), "manifest.json")}${stats}`;
        },
      ),
      run.paletteHint ?? "",
      ...run.errors.map((error) => `failed: ${error}`),
    ]
      .filter(Boolean)
      .join("\n");
  }

  function blueprintSummary(run: { blueprint: ModelBlueprintManifest | null; errors: string[]; style: GuiStyle }): string {
    const lines = [`Model project: ${run.style.name} (${run.style.id})`];
    if (run.blueprint) {
      const b = run.blueprint;
      lines.push(
        `blueprint (${b.views.join(", ")}): ${b.dir}/`,
        `  sheet: ${b.files.sheet}`,
        `  views: ${b.files.views}`,
        ...b.views.map((v) => `  ${v}: ${b.files[v]}`),
      );
    }
    lines.push(...run.errors.map((error) => `failed: ${error}`));
    return lines.join("\n");
  }

  // ---- reference sheet -------------------------------------------------------------

  /** Plan for one slot: model, or a readable reason it cannot run. No network. */
  async function planSheetSlot(
    profile: PersonProfile,
    slot: SlotId,
    modelOverride?: string,
  ): Promise<{ ok: true; model: ModelId; gateway: "fal" | "kie" } | { ok: false; error: string }> {
    if (!isSheetSlot(slot)) {
      return { ok: false, error: `Slot ${slot} is not generated: moles, tattoos and birthmarks must come from a real photo.` };
    }
    if (isNudeSlot(slot) && profile.age < 18) {
      return { ok: false, error: `Slot ${slot} is only built for adult profiles (18+).` };
    }
    if (!profile.refs["face-front"] && slot !== "face-front") {
      return { ok: false, error: `Add the front face photo of ${profile.name} first (slot face-front).` };
    }
    if (slot === "face-front" && Object.keys(profile.refs).length === 0) {
      return { ok: false, error: `Upload at least one real photo of ${profile.name} (face-front) before building the sheet.` };
    }
    const settings = await readSettings();
    const chosen = sheetModelFor(slot, enabledFromSettings(settings), modelOverride);
    if (!chosen.ok) return chosen;
    const keys = await resolvedKeys();
    const route = resolveRoute({
      requestedModel: chosen.model,
      enabled: enabledFromSettings(settings),
      defaultGateway: settings.defaultGateway,
      hasFalKey: Boolean(keys.fal),
      hasKieKey: Boolean(keys.kie),
    });
    if (!route.ok) return { ok: false, error: sheetRouteError(slot, chosen.model, route.error) };
    return { ok: true, model: route.model, gateway: route.gateway };
  }

  /** Builds one slot as a candidate (not yet the slot photo). Costs one generation. */
  function buildSheetSlot(
    profileId: string,
    slot: SlotId,
    options: { prompt?: string; model?: string } = {},
  ): Promise<{ profile: PersonProfile; model: ModelId; gateway: "fal" | "kie" }> {
    return trackJob(() => buildSheetSlotNow(profileId, slot, options));
  }

  async function buildSheetSlotNow(
    profileId: string,
    slot: SlotId,
    options: { prompt?: string; model?: string },
  ): Promise<{ profile: PersonProfile; model: ModelId; gateway: "fal" | "kie" }> {
    const before = (await readProfileList()).find((item) => item.id === profileId);
    if (!before) throw new Error("Profile not found");
    const plan = await planSheetSlot(before, slot, options.model);
    if (!plan.ok) throw new Error(plan.error);

    const prompt =
      options.prompt && options.prompt.trim() !== ""
        ? options.prompt.trim()
        : sheetPrompt(
            slot,
            before.gender,
            {
              bodyType: before.bodyType,
              bust: before.bust,
              heightCm: before.heightCm,
              weightKg: before.weightKg,
              age: before.age,
            },
            plan.model,
          );
    const rendered = await renderImage({
      projectId: null,
      prompt,
      model: plan.model,
      profile: before.id,
      refSlots: sheetRefOrder(slot, plan.model),
      refCap: sheetRefCap(plan.model),
      sheet: true,
      aspectRatio: SHEET_ASPECT,
      resolution: modelUsesResolution(plan.model) ? SHEET_RESOLUTION : undefined,
    });

    const id = randomUUID().slice(0, 8);
    const filename = `${id}-sheet-${slot}.webp`;
    const candidate = {
      id,
      filename,
      mimeType: sniffImageMime(rendered.display),
      model: rendered.model,
      gateway: rendered.gateway,
      prompt,
      createdAt: new Date().toISOString(),
      refsUsed: rendered.refsUsed,
    };
    // File and journal first (plain fs), then the profile record under the profile lock.
    await mkdir(profileDir(before.id), { recursive: true });
    await atomicWrite(join(profileDir(before.id), filename), rendered.display);
    try {
      await writePending(id, { kind: "candidate", profileId, slot, candidate });
      const updated = await withProfiles((profiles) => {
        const profile = profiles.find((item) => item.id === profileId);
        if (!profile) throw new Error("Profile not found");
        const previous = attachCandidate(profile, slot, candidate);
        return { profile, previous };
      });
      if (updated.previous) await removeProfileFile(profileId, updated.previous.filename);
      await clearPending(id);
      return { profile: updated.profile, model: rendered.model, gateway: rendered.gateway };
    } catch (error) {
      if (isStaleHandleError(error)) {
        throw new Error(
          `The plugin was reloaded while saving the ${slot} candidate. The image is on disk and will appear in Profiles within about ${RECOVER_EVERY_MS / 1000} seconds.`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  function acceptSheetSlot(profileId: string, slot: SlotId): Promise<PersonProfile> {
    return withProfiles(async (profiles) => {
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      const candidate = profile.candidates[slot];
      if (!candidate) throw new Error(`Nothing to accept in slot ${slot}.`);
      const previous = profile.refs[slot];
      profile.refs[slot] = { id: candidate.id, filename: candidate.filename, mimeType: candidate.mimeType };
      delete profile.candidates[slot];
      if (previous) await removeProfileFile(profile.id, previous.filename);
      profile.updatedAt = new Date().toISOString();
      return profile;
    });
  }

  function discardSheetSlot(profileId: string, slot: SlotId): Promise<PersonProfile> {
    return withProfiles(async (profiles) => {
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      const candidate = profile.candidates[slot];
      if (candidate) {
        delete profile.candidates[slot];
        await removeProfileFile(profile.id, candidate.filename);
        profile.updatedAt = new Date().toISOString();
      }
      return profile;
    });
  }

  const snapshot: RpcHandlers["snapshot"] = async ({ projectId }) => {
    const [settings, secrets, catalog, profiles, generations, lastGenerate, guiStyles] = await Promise.all([
      readSettings(),
      readSecrets(),
      catalogKeys(),
      readProfileList(),
      readStudioGallery(projectId),
      readLastGenerate(),
      readGuiStyles(),
    ]);
    return {
      settings,
      secrets: {
        falConfigured: secrets.falApiKey.length > 0 || settings.falKeyCatalog.length > 0,
        kieConfigured: secrets.kieApiKey.length > 0 || settings.kieKeyCatalog.length > 0,
      },
      catalog,
      profiles,
      generations,
      lastGenerate,
      guiStyles: snapshotGuiStyles(guiStyles),
    };
  };
  const update_settings: RpcHandlers["update_settings"] = (patch) =>
    settingsLock.run(async () => {
    const current = await readSettings();
    const next = { ...current };
    for (const id of MODEL_IDS) {
      const key = MODEL_SETTING[id];
      const value = patch[key];
      if (typeof value === "boolean") next[key] = value;
    }
    if (patch.defaultGateway !== undefined) next.defaultGateway = patch.defaultGateway;
    if (patch.falKeyCatalog !== undefined) next.falKeyCatalog = patch.falKeyCatalog;
    if (patch.kieKeyCatalog !== undefined) next.kieKeyCatalog = patch.kieKeyCatalog;
    if (patch.uiLocale !== undefined) next.uiLocale = patch.uiLocale;
    if (patch.concurrency !== undefined) next.concurrency = clampConcurrency(patch.concurrency);
    if (typeof patch.jevRefs === "boolean") next.jevRefs = patch.jevRefs;
    if (patch.jevBaseUrl !== undefined && patch.jevBaseUrl.trim() !== "") next.jevBaseUrl = patch.jevBaseUrl.trim();
    if (patch.jevModel !== undefined && patch.jevModel.trim() !== "") next.jevModel = patch.jevModel.trim();
    if (patch.jevKeyCatalog !== undefined) next.jevKeyCatalog = patch.jevKeyCatalog;
    if (patch.jevFallbackKeyCatalog !== undefined) next.jevFallbackKeyCatalog = patch.jevFallbackKeyCatalog;
    if (patch.blenderPath !== undefined && patch.blenderPath.trim() !== "") next.blenderPath = patch.blenderPath.trim();
    await writeSettings(next);
    providerLimiter.setLimit(next.concurrency);
    return { saved: true };
    });
  const set_secret: RpcHandlers["set_secret"] = async ({ slot, value }) => {
    const current = await readSecrets();
    current[slot] = value.trim();
    await writeSecrets(current);
    bb.realtime.publish(CHANGED, { kind: "secrets" });
    return { saved: true };
  };
  const save_profile: RpcHandlers["save_profile"] = async (input) =>
    withProfiles(async (profiles) => {
      const now = new Date().toISOString();
      if (input.id) {
        const existing = profiles.find((item) => item.id === input.id);
        if (!existing) throw new Error("Profile not found");
        existing.name = input.name;
        existing.gender = input.gender;
        existing.age = input.age;
        existing.heightCm = input.heightCm;
        existing.weightKg = input.weightKg;
        existing.bodyType = input.bodyType;
        existing.bust = input.bust ?? "";
        existing.updatedAt = now;
        return existing;
      }
      const created: PersonProfile = {
        id: randomUUID().slice(0, 8),
        name: input.name,
        gender: input.gender,
        age: input.age,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        bodyType: input.bodyType,
        bust: input.bust ?? "",
        refs: {},
        candidates: {},
        photos: [],
        manicurePhoto: null,
        createdAt: now,
        updatedAt: now,
      };
      profiles.push(created);
      return created;
    });
  const delete_profile: RpcHandlers["delete_profile"] = async ({ id }) =>
    withProfiles(async (profiles) => {
      const index = profiles.findIndex((item) => item.id === id);
      if (index === -1) return { removed: false };
      profiles.splice(index, 1);
      await rm(profileDir(id), { recursive: true, force: true });
      return { removed: true };
    });
  const add_photo: RpcHandlers["add_photo"] = async ({ profileId, slot: slotName, filename, mimeType, base64 }) => {
    const slot = parseSlotId(slotName);
    if (!slot) throw new Error(`Unknown reference slot "${slotName}".`);
    return withProfiles(async (profiles) => {
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      const id = randomUUID().slice(0, 8);
      const safeName = `${id}-${filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}`;
      await mkdir(profileDir(profile.id), { recursive: true });
      await writeFile(join(profileDir(profile.id), safeName), Buffer.from(base64, "base64"));
      const previous = profile.refs[slot];
      profile.refs[slot] = { id, filename: safeName, mimeType };
      if (previous) await removeProfileFile(profile.id, previous.filename);
      profile.updatedAt = new Date().toISOString();
      return profile;
    });
  };
  const remove_photo: RpcHandlers["remove_photo"] = async ({ profileId, photoId }) =>
    withProfiles(async (profiles) => {
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      for (const slot of SLOT_IDS) {
        const photo = profile.refs[slot];
        if (photo?.id !== photoId) continue;
        delete profile.refs[slot];
        await removeProfileFile(profile.id, photo.filename);
      }
      profile.updatedAt = new Date().toISOString();
      return profile;
    });
  const sheet_slot: RpcHandlers["sheet_slot"] = async ({ profileId, slot: slotName, prompt, model }) => {
    const slot = parseSlotId(slotName);
    if (!slot) throw new Error(`Unknown reference slot "${slotName}".`);
    return (await buildSheetSlot(profileId, slot, { prompt, model })).profile;
  };
  const sheet_accept: RpcHandlers["sheet_accept"] = async ({ profileId, slot: slotName }) => {
    const slot = parseSlotId(slotName);
    if (!slot) throw new Error(`Unknown reference slot "${slotName}".`);
    return acceptSheetSlot(profileId, slot);
  };
  const sheet_discard: RpcHandlers["sheet_discard"] = async ({ profileId, slot: slotName }) => {
    const slot = parseSlotId(slotName);
    if (!slot) throw new Error(`Unknown reference slot "${slotName}".`);
    return discardSheetSlot(profileId, slot);
  };
  const profile_photo_preview: RpcHandlers["profile_photo_preview"] = async ({ profileId, photoId }) => {
    const profiles = await readProfileList();
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("Profile not found");
    const photo =
      SLOT_IDS.map((slot) => profile.refs[slot]).find((item) => item?.id === photoId) ??
      SLOT_IDS.map((slot) => profile.candidates[slot]).find((item) => item?.id === photoId);
    if (!photo) throw new Error("Photo not found");
    // Panel tiles are small: serve a cached WebP thumbnail, not the multi-megabyte original.
    const thumb = await cachedThumb(
      join(profileDir(profile.id), `${photo.filename}.thumb.webp`),
      join(profileDir(profile.id), photo.filename),
    );
    return { mimeType: sniffImageMime(thumb), base64: thumb.toString("base64") };
  };
  const generate: RpcHandlers["generate"] = async (input) => {
    let cwd: string | undefined;
    let hostId: string | undefined;
    if (input.projectId) {
      try {
        const project = await bb.sdk.projects.get({ projectId: input.projectId });
        const source = project.sources[0];
        cwd = source?.path;
        hostId = source?.hostId;
      } catch (error) {
        warn(`project path: ${describe(error)}`);
      }
    }
    return runGenerate({ ...input, cwd, hostId });
  };
  const generation_preview: RpcHandlers["generation_preview"] = async ({ id, projectId, variant }) => {
    const items = await readStudioGallery(projectId);
    let item = items.find((entry) => entry.id === id) ?? (await readGenerations(projectId)).find((entry) => entry.id === id);
    // GUI projects keep more history than the shared gallery.
    for (const style of item ? [] : await readGuiStyles()) {
      item = (await readGuiGenerations(style.id)).find((entry) => entry.id === id);
      if (item) break;
    }
    if (!item) throw new Error("Generation not found");
    return previewGeneration(item, variant ?? "thumb");
  };

  const generation_detail: RpcHandlers["generation_detail"] = async ({ id, projectId }) => {
    const item =
      (await readStudioGallery(projectId)).find((entry) => entry.id === id) ??
      (await readGenerations(projectId)).find((entry) => entry.id === id);
    if (!item) throw new Error("Generation not found");
    const person = item.profileId ? (await readProfileList()).find((entry) => entry.id === item.profileId) : undefined;
    const profile = person
      ? {
          id: person.id,
          name: person.name,
          slots: Object.fromEntries(Object.entries(person.refs).flatMap(([slot, photo]) => (photo ? [[slot, photo.id]] : []))),
        }
      : null;
    const asked = item.refsJevInput;
    const jev = asked
      ? (({ state, questions }) => ({ state, questions }))(
          buildJevRequest({
            prompt: item.prompt,
            model: asked.model as ModelId,
            gender: asked.gender,
            sourceCount: asked.sourceCount,
            filled: asked.filled as SlotId[],
          }),
        )
      : null;
    return { generation: item, profile, jev };
  };

  const save_gui_style: RpcHandlers["save_gui_style"] = async (input) =>
    withGuiStyles((styles) => {
      const now = new Date().toISOString();
      const fields = {
        name: input.name,
        theme: input.theme.trim(),
        tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
        palette: input.palette,
        notes: input.notes.trim(),
      };
      if (input.id) {
        const existing = styles.find((item) => item.id === input.id);
        if (!existing) throw new Error("GUI style not found");
        Object.assign(existing, fields, { updatedAt: now });
        if (input.fbxScale !== undefined) existing.fbxScale = input.fbxScale;
        return existing;
      }
      const created: GuiStyle = {
        id: randomUUID().slice(0, 8),
        projectId: input.projectId ?? "unscoped",
        origin: input.origin ?? "",
        section: input.section,
        gameId: "",
        ...fields,
        fbxScale: input.fbxScale ?? 0.01,
        refs: [],
        createdAt: now,
        updatedAt: now,
      };
      styles.push(created);
      return created;
    });
  const delete_gui_style: RpcHandlers["delete_gui_style"] = async ({ id }) =>
    withGuiStyles(async (styles) => {
      const index = styles.findIndex((item) => item.id === id);
      if (index === -1) return { removed: false };
      styles.splice(index, 1);
      // A deleted game's GUI and Characters projects stay, back in their own tabs.
      for (const style of styles) if (style.gameId === id) style.gameId = "";
      await rm(guiDir(id), { recursive: true, force: true });
      await bb.storage.kv.set(GUI_GEN_PREFIX + id, []);
      return { removed: true };
    });
  const add_gui_ref: RpcHandlers["add_gui_ref"] = async ({ styleId, role, generationId, filename, base64 }) => {
    if (generationId) {
      const item = (await readStudioGallery(null)).find((entry) => entry.id === generationId);
      if (!item) throw new Error("Generation not found");
      // The full-size file when the GUI export kept one, else the gallery picture.
      let bytes: Buffer;
      try {
        if (!item.guiMode || !item.projectPath) throw new Error("no full-size copy");
        const file = await bb.sdk.files.read({ path: item.projectPath });
        bytes = Buffer.from(file.content, file.contentEncoding === "base64" ? "base64" : "utf8");
      } catch {
        bytes = await readFile(generationPath(item.projectId, item.filename));
      }
      return addGuiRefFile(styleId, role, bytes, item.guiLabel ?? item.id);
    }
    if (!base64) throw new Error("Pass a gallery picture or a file.");
    return addGuiRefFile(styleId, role, Buffer.from(base64, "base64"), (filename ?? "upload").replace(/\.[a-z0-9]+$/i, ""));
  };
  const remove_gui_ref: RpcHandlers["remove_gui_ref"] = async ({ styleId, refId }) =>
    withGuiStyle(styleId, async (style) => {
      const ref = style.refs.find((item) => item.id === refId);
      if (!ref) return;
      style.refs = style.refs.filter((item) => item.id !== refId);
      await unlink(join(guiDir(styleId), ref.filename)).catch(() => undefined);
      await unlink(join(guiDir(styleId), `${ref.filename}.thumb.webp`)).catch(() => undefined);
    });
  const gui_ref_preview: RpcHandlers["gui_ref_preview"] = async ({ styleId, refId }) => {
    const style = (await readGuiStyles()).find((item) => item.id === styleId);
    const ref = style?.refs.find((item) => item.id === refId);
    if (!style || !ref) throw new Error("Reference not found");
    const thumb = await cachedThumb(join(guiDir(styleId), `${ref.filename}.thumb.webp`), join(guiDir(styleId), ref.filename));
    return { mimeType: sniffImageMime(thumb), base64: thumb.toString("base64") };
  };
  const gui_generate: RpcHandlers["gui_generate"] = async (input) => {
    const source = await projectSource(input.projectId);
    const run = await runGui({
      ...input,
      mode: input.mode as GuiMode | CharacterMode | RobloxMode,
      cwd: source.cwd,
      hostId: source.hostId,
      originLabel: source.name,
    });
    return { generations: run.generations, errors: run.errors };
  };
  const gui_generations: RpcHandlers["gui_generations"] = async ({ styleId }) => readGuiGenerations(styleId);
  const game_generations: RpcHandlers["game_generations"] = async ({ gameId }) => {
    const linked = (await readGuiStyles()).filter((style) => style.id === gameId || style.gameId === gameId);
    const lists = await Promise.all(linked.map((style) => readGuiGenerations(style.id)));
    return lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  async function hostImageThumb(path: string, cwd: string, hostId?: string): Promise<{ mimeType: string; base64: string } | null> {
    try {
      const bytes = await readHostBytes(path, cwd, hostId);
      const webp = await encodeWebp(bytes, WEBP_THUMB);
      return { mimeType: sniffImageMime(webp), base64: webp.toString("base64") };
    } catch {
      return null;
    }
  }

  const model_takes: RpcHandlers["model_takes"] = async ({ styleId }) => {
    const style = (await readGuiStyles()).find((item) => item.id === styleId);
    const cwd = style?.origin?.trim() || (style?.projectId ? (await projectSource(style.projectId)).cwd : undefined);
    const hostId = style?.projectId ? (await projectSource(style.projectId)).hostId : undefined;
    const records = await readModelTakes(styleId);
    const thumbKeysFor = (record: ModelTakeRecord): string[] =>
      record.mode === "texture-uv" ? ["guide", "color", "preview"] : ["sheet", "front", "side", "back", "top"];
    const out: z.infer<typeof modelTakeWithThumbsSchema>[] = [];
    for (const record of records) {
      const thumbs: Record<string, { mimeType: string; base64: string }> = {};
      if (cwd) {
        for (const key of thumbKeysFor(record)) {
          const rel = record.files[key];
          if (!rel) continue;
          const thumb = await hostImageThumb(rel, cwd, hostId);
          if (thumb) thumbs[key] = thumb;
        }
      }
      out.push({ ...record, thumbs });
    }
    return out;
  };

  const model_items: RpcHandlers["model_items"] = async ({ styleId }) => {
    const style = (await readGuiStyles()).find((item) => item.id === styleId);
    if (!style) return [];
    const cwd = style.origin?.trim() || (style.projectId ? (await projectSource(style.projectId)).cwd : undefined);
    const hostId = style.projectId ? (await projectSource(style.projectId)).hostId : undefined;
    const rows = await readItemIndex(style.id);
    const out: z.infer<typeof itemIndexRowWithThumbsSchema>[] = [];
    for (const row of rows) {
      const thumbs: Record<string, { mimeType: string; base64: string }> = {};
      if (cwd) {
        for (const [stepKey, path] of Object.entries(row.thumbnails)) {
          if (!path) continue;
          const thumb = await hostImageThumb(path, cwd, hostId);
          if (thumb) thumbs[stepKey] = thumb;
        }
      }
      out.push({ ...row, thumbs });
    }
    return out;
  };

  const model_item: RpcHandlers["model_item"] = async ({ styleId, item: itemId }) => {
    const style = (await readGuiStyles()).find((entry) => entry.id === styleId);
    if (!style) throw new Error(`Project ${styleId} not found`);
    const cwd = style.origin?.trim() || (style.projectId ? (await projectSource(style.projectId)).cwd : undefined);
    const hostId = style.projectId ? (await projectSource(style.projectId)).hostId : undefined;
    if (!cwd) throw new Error(`No folder attached to project ${style.name}`);
    const item = await loadItemForShow(cwd, hostId ?? "", style, itemId);
    const thumbnails: Record<string, Record<string, { mimeType: string; base64: string }>> = {};
    for (const [stepKey, stepState] of Object.entries(item.steps)) {
      thumbnails[stepKey] = {};
      for (const entry of stepState.entries) {
        const thumbPath =
          entry.files.preview ??
          entry.files.concept ??
          entry.files.sheet ??
          entry.files.guide ??
          entry.files.color ??
          Object.values(entry.files)[0];
        if (thumbPath) {
          const thumb = await hostImageThumb(thumbPath, cwd, hostId);
          if (thumb) {
            thumbnails[stepKey][entry.id] = thumb;
          }
        }
      }
    }
    return { ...item, thumbnails };
  };

  const model_item_select: RpcHandlers["model_item_select"] = async ({ styleId, item: itemId, step, entry }) => {
    const style = (await readGuiStyles()).find((s) => s.id === styleId);
    if (!style) throw new Error(`Project ${styleId} not found`);
    const cwd = style.origin?.trim() || (style.projectId ? (await projectSource(style.projectId)).cwd : undefined);
    const hostId = style.projectId ? (await projectSource(style.projectId)).hostId : undefined;
    if (!cwd) throw new Error(`No folder attached to project ${style.name}`);
    let item = await loadItemForShow(cwd, hostId ?? "", style, itemId);
    item = selectEntry(item, step, entry, "user");
    await saveItem(cwd, hostId ?? "", style, item);
    return model_item({ styleId, item: itemId });
  };

  const model_generate: RpcHandlers["model_generate"] = async (input) => {
    const source = await projectSource(input.projectId);
    const cwd = source.cwd;
    const hostId = source.hostId;
    const folderProject = modelCliProjectOrigin(cwd, input.projectId);
    if (input.mode === "blueprint") {
      const images = input.images ?? [];
      const run = await runModelBlueprint({
        projectId: input.projectId,
        styleId: input.styleId,
        images,
        views: input.views,
        style: input.style,
        subject: input.subject,
        soft: input.soft,
        rigid: input.rigid,
        sideSeparate: input.sideSeparate,
        blueprintModel: input.blueprintModel,
        resolution: input.resolution,
        gateway: input.gateway,
        cwd,
        hostId,
        originLabel: folderProject.projectName,
      });
      return { takes: run.record ? [run.record] : [], errors: run.errors };
    }
    const run = await runModelTextureUv({
      projectId: input.projectId,
      styleId: input.styleId,
      mode: input.mode,
      model: input.model!,
      object: input.object,
      prompt: input.prompt,
      parts: input.parts,
      images: input.images,
      size: input.size,
      variants: input.variants,
      subject: input.subject,
      conceptNote: input.conceptNote,
      projectConcept: input.projectConcept,
      conceptView: input.conceptView,
      guideFix: input.guideFix,
      cwd,
      hostId,
      originLabel: folderProject.projectName,
    });
    return { takes: run.records, errors: run.errors };
  };

  // Shorthand on purpose: GitNexus links the panel's api.<method>() calls to these named handlers.
  bb.rpc.register(rpcContract, {
    snapshot,
    update_settings,
    set_secret,
    save_profile,
    delete_profile,
    add_photo,
    remove_photo,
    sheet_slot,
    sheet_accept,
    sheet_discard,
    profile_photo_preview,
    generate,
    generation_preview,
    generation_detail,
    save_gui_style,
    delete_gui_style,
    add_gui_ref,
    remove_gui_ref,
    gui_ref_preview,
    gui_generate,
    gui_generations,
    game_generations,
    model_takes,
    model_items,
    model_item,
    model_item_select,
    model_generate,
  });

  const usage = [
    "Usage:",
    "  bb image-studio generate --prompt <text> [--model nano-banana-2|nano-banana-2.1|nano-banana-pro|muse-image|gpt-image-2.5-flare|…]",
    "                           [--gateway fal|kie] [--profile <name>] [--refs auto|all|<slot,slot>]",
    "                           [--image <path|gallery id|url>]… [--aspect 1:1] [--count N] [--batch jobs.jsonl] [--seed N] [--json]",
    "  bb image-studio profiles [--json]",
    "  bb image-studio refs --profile <name> --prompt <text> [--model <id>] [--image <n>]… [--json]   (preview of the reference choice; free)",
    "  bb image-studio sheet --profile <name> [--slots a,b] [--model <id>] [--accept] [--parallel N] [--dry-run] [--json]   (paid: one generation per slot)",
    "  bb image-studio models [--json]",
    "  bb image-studio gui projects [--json]   (* marks the project of this folder)",
    "  bb image-studio gui project [--name <name>] [--rename <new>] [--theme <text>] [--tags cartoon,gothic,…] [--palette background=#1A1026,button=#C0203A,…] [--notes <text>]",
    "  bb image-studio gui ref [--project <name>] --image <path|gallery id> [--role concept|art]",
    "  bb image-studio gui generate --mode ideas|screen|elements|kit [--project <name>] [--states] [--image <path>]… --prompt <text> [--json]",
    "  bb image-studio gui delete --project <name>   (the list and references; saved files stay)",
    "  bb image-studio gui cut --sheet <path> [--elements \"a; b; c\"] [--states] [--json]   (re-cut a green-key sheet; free)",
    "  bb image-studio character projects|project|ref|delete …   (the same options as gui; --tags stylized,blocky,chibi,…)",
    "  bb image-studio character generate --mode ideas|model|turnaround|equipment|accessories [--project <name>] [--name soldier] [--body humanoid|blocky|quadruped|winged|legless]",
    "                                     [--equipment \"rifle; knife\"] [--accessories \"helmet; left pauldron\"] [--image <design picture>]… --prompt <who the character is> [--json]",
    "  bb image-studio character cut --sheet <path> [--grid 1x2 | --items \"rifle; knife\"] [--json]   (re-cut a white sheet; free)",
    "  bb image-studio roblox projects|project|ref|delete …   (games; the same options as gui; --tags simulator,stylized,lowpoly,…)",
    "  bb image-studio model projects|project|ref|delete …   (texture-by-UV projects; same theme options as gui)",
    "  bb image-studio model generate --mode texture-uv --file <model.fbx|glb|blend> [--object NAME] [--size 1024|2048] [--variants 1-4] [--image <concept|style>]… [--subject …] [--concept-note …] [--project-concept true|false] [--concept-view front|back|left|right] [--parts \"mat=part; …\"] --prompt <style> [--project <name>] [--json]",
    "  bb image-studio model generate --mode blueprint --image <concept> [--views front,side,back] [--sheet-style clay+wire|clean-line] [--soft \"rags; rope\"] [--rigid \"…\"] [--subject \"fire mop\"] [--project <name>] [--json]",
    "  bb image-studio roblox generate --mode icon|thumbnail|logo|loading|badges|passes|products|items|props|texture|skybox|decal|vfx|flipbook",
    "                                  [--project <game>] [--variants 1-4] [--frames 4|16] [--aspect 1:1|16:9|…] [--image <path>]… --prompt <what> [--json]",
    "                                  (list modes take the list in --prompt or --items: \"VIP; 2x Coins\")",
  ].join("\n");

  bb.cli.register({
    name: "image-studio",
    summary: "Generate images for the current BB project through fal.ai or kie.ai",
    commands: [
      {
        name: "generate",
        summary: "Generate or edit an image and save it under the project",
        usage: "bb image-studio generate --prompt <text> [--model nano-banana-2] [--profile Name] [--refs auto|all|face-front,body-back] [--count N] [--batch jobs.jsonl] [--image path]",
      },
      {
        name: "profiles",
        summary: "List people profiles and their filled reference slots",
        usage: "bb image-studio profiles [--json]",
      },
      {
        name: "refs",
        summary: "Preview which reference photos a prompt would send (Jev or keyword rules); generates nothing",
        usage: "bb image-studio refs --profile <name> --prompt <text> [--model nano-banana-2.1] [--json]",
      },
      {
        name: "sheet",
        summary: "Build the missing reference-sheet slots of a profile (costs one generation per slot)",
        usage: "bb image-studio sheet --profile <name> [--slots body-back,chest] [--model <id>] [--accept] [--parallel N] [--dry-run] [--json]",
      },
      {
        name: "models",
        summary: "Show enabled models and whether keys are present",
        usage: "bb image-studio models [--json]",
      },
      {
        name: "gui",
        summary: "GUI section: styles, 4 mockup ideas, screens, element sheets cut into PNGs, UI kits (Muse Image, English labels)",
        usage: "bb image-studio gui projects|project|ref|generate|cut|delete …",
      },
      {
        name: "character",
        summary: "Characters section: game characters for 3D — ideas, an A-pose front view with empty hands, a front-and-back turnaround, held items and worn accessories on their own sheets",
        usage: "bb image-studio character projects|project|ref|generate|cut|delete …",
      },
      {
        name: "roblox",
        summary: "Roblox games: icon, thumbnails, logo, badges, passes, products, item icons, props for 3D, textures, skyboxes, decals, VFX — fitted to Roblox sizes",
        usage: "bb image-studio roblox projects|project|ref|generate|delete …",
      },
      {
        name: "model",
        summary: "Texture by model UV: bake a UV guide in Blender, repaint with Muse, apply back and save color/guide/mask/preview",
        usage: "bb image-studio model projects|project|ref|generate|delete …",
      },
    ],
    async run(argv, ctx) {
      try {
        return await runCommand(argv, ctx);
      } catch (error) {
        // A reload cut this run short before anything was saved. The old plugin cannot call the new one,
        // so the caller runs the command again; the exit code says so.
        if (isStaleHandleError(error) || error instanceof ReloadingError) {
          return {
            exitCode: EXIT_RELOADED,
            stderr: `Image Studio was reloaded while this command ran. No image from this run was saved. Run the same command again (exit code ${EXIT_RELOADED}).`,
          };
        }
        return { exitCode: 1, stderr: describe(error) };
      }
    },
  });

  type CliCtx = { projectId?: string | null; cwd?: string };

  async function runCommand(argv: string[], ctx: CliCtx) {
    {
      const json = argv.includes("--json");
      const [command] = argv.filter((token) => token !== "--json" && !token.startsWith("--"));
      const reply = (value: unknown, text: string) => ({
        exitCode: 0,
        stdout: json ? JSON.stringify(value, null, 2) : text,
      });
      switch (command) {
        case undefined:
        case "help":
          return { exitCode: 0, stdout: usage };
        case "profiles": {
          const profiles = await readProfileList();
          return reply(
            profiles.map((profile) => {
              const slots = filledSlots(profile);
              return {
                id: profile.id,
                name: profile.name,
                gender: profile.gender,
                selfies: slots.filter((slot) => slot.startsWith("face-")).length,
                manicure: slots.includes("hands"),
                slots,
                candidates: candidateSlots(profile),
              };
            }),
            profiles.length === 0
              ? "No people profiles."
              : profiles
                  .map((profile) => {
                    const slots = filledSlots(profile);
                    const waiting = candidateSlots(profile);
                    return `${profile.name} (${profile.id}): ${slots.length > 0 ? slots.join(", ") : "no reference photos"}${waiting.length > 0 ? `; candidates: ${waiting.join(", ")}` : ""}`;
                  })
                  .join("\n"),
          );
        }
        case "refs": {
          // Preview of the reference choice for a prompt: nothing is generated and nothing is charged
          // (only the few Jev tokens). Shows what `generate --refs auto` would send, and what the keyword rules would send.
          const profileName = flag(argv, "--profile");
          const previewPrompt = flag(argv, "--prompt") || restAfter(argv, "refs");
          if (!profileName || !previewPrompt) return { exitCode: 1, stderr: usage };
          const profile = findProfile(await readProfileList(), profileName);
          if (!profile) return { exitCode: 1, stderr: `No person profile named "${profileName}".` };
          const settings = await readSettings();
          const keys = await resolvedKeys();
          const route = resolveRoute({
            requestedModel: flag(argv, "--model"),
            requestedGateway: flag(argv, "--gateway"),
            enabled: enabledFromSettings(settings),
            defaultGateway: settings.defaultGateway,
            hasFalKey: Boolean(keys.fal),
            hasKieKey: Boolean(keys.kie),
          });
          if (!route.ok) return { exitCode: 1, stderr: route.error };
          const sourceCount = flags(argv, "--image").length;
          const filled = filledSlots(profile);
          const limit = Math.min(refLimit(route.model, route.gateway), route.model === "qwen-image-2.1" ? QWEN_GENERATE_CAP : 99) - sourceCount;
          const keywords = selectRefs({ prompt: previewPrompt, filled, mode: { kind: "auto" }, budget: limit, model: route.model });
          const jev = await chooseWithJev(settings, { prompt: previewPrompt, model: route.model, gender: profile.gender, sourceCount, filled });
          const viaJev = jev?.cues
            ? selectRefs({ prompt: previewPrompt, filled, mode: { kind: "auto" }, budget: limit, model: route.model, cues: jev.cues.cues, noPerson: jev.cues.noPerson })
            : null;
          const chosen = viaJev ?? keywords;
          return reply(
            {
              profile: profile.name,
              model: route.model,
              gateway: route.gateway,
              budget: limit,
              selector: jev?.used.selector ?? "keywords",
              provider: jev?.used.provider ?? null,
              jevMs: jev?.used.ms ?? null,
              jevError: jev?.used.error ?? null,
              noPerson: Boolean(jev?.cues?.noPerson),
              used: chosen.used,
              dropped: chosen.dropped,
              scores: jev?.used.scores ?? null,
              keywordsWouldSend: keywords.used,
            },
            [
              `selector: ${jev?.used.selector ?? "keywords"}${jev?.used.provider ? ` via ${jev.used.provider} in ${jev.used.ms}ms` : ""}${jev?.used.error ? ` (Jev not used: ${jev.used.error})` : ""}`,
              `would send: ${chosen.used.length > 0 ? chosen.used.join(", ") : "none"}${chosen.dropped.length > 0 ? ` (left out: ${chosen.dropped.join(", ")})` : ""}`,
              `keyword rules would send: ${keywords.used.length > 0 ? keywords.used.join(", ") : "none"}`,
            ].join("\n"),
          );
        }
        case "sheet": {
          const profileName = flag(argv, "--profile");
          if (!profileName) return { exitCode: 1, stderr: usage };
          const profile = findProfile(await readProfileList(), profileName);
          if (!profile) return { exitCode: 1, stderr: `No person profile named "${profileName}".` };
          const requested = flag(argv, "--slots");
          let slots: SlotId[];
          if (requested) {
            slots = [];
            for (const part of requested.split(/[\s,]+/).filter(Boolean)) {
              const slot = parseSlotId(part);
              if (!slot) return { exitCode: 1, stderr: `Unknown reference slot "${part}". Use: ${SHEET_SLOTS.join(", ")}.` };
              if (!slots.includes(slot)) slots.push(slot);
            }
            slots = sortSlots(slots);
          } else {
            slots = missingSheetSlots(filledSlots(profile));
          }
          if (slots.length === 0) return reply({ profile: profile.name, slots: [] }, "Nothing to build: every sheet slot already has a photo.");
          const modelOverride = flag(argv, "--model");
          const accept = argv.includes("--accept");
          const settings = await readSettings();
          const parallelFlag = flag(argv, "--parallel");
          if (parallelFlag !== undefined && !/^\d+$/.test(parallelFlag)) {
            return { exitCode: 1, stderr: `--parallel takes a number from 1 to ${MAX_CONCURRENCY}.` };
          }
          const parallel = clampConcurrency(parallelFlag === undefined ? settings.concurrency : Number(parallelFlag));
          const waves = sheetWaves(slots);

          const plans = await Promise.all(slots.map((slot) => planSheetSlot(profile, slot, modelOverride)));
          if (argv.includes("--dry-run")) {
            const rows = slots.map((slot, index) => {
              const plan = plans[index]!;
              return plan.ok
                ? { slot, ok: true, model: plan.model, gateway: plan.gateway }
                : { slot, ok: false, error: plan.error };
            });
            return reply(
              { profile: profile.name, dryRun: true, parallel, waves: waves.map((wave) => ({ wave: wave.name, slots: wave.slots })), slots: rows },
              [
                `waves: ${waves.map((wave) => `${wave.name} [${wave.slots.join(", ")}]`).join(" -> ")}, up to ${parallel} at once`,
                ...rows.map((row) => (row.ok ? `${row.slot}: ${row.model} on ${row.gateway}` : `${row.slot}: ${row.error}`)),
              ].join("\n"),
            );
          }
          const blocked = plans.flatMap((plan, index) => (plan.ok ? [] : [`${slots[index]}: ${plan.error}`]));
          if (blocked.length > 0) {
            return { exitCode: 1, stderr: `Nothing was generated.\n${blocked.join("\n")}` };
          }

          // Waves: faces, then body, then details. Slots of a wave run in parallel; the next wave starts when
          // the previous one is done and, with --accept, sees its accepted photos as references.
          type SheetResult = { slot: SlotId; ok: boolean; model?: string; gateway?: string; accepted?: boolean; refsUsed?: string[]; seconds?: number; error?: string };
          const results: SheetResult[] = [];
          const started = Date.now();
          for (const wave of waves) {
            const done = await mapParallel(wave.slots, parallel, async (slot): Promise<SheetResult> => {
              const t0 = Date.now();
              try {
                const built = await buildSheetSlot(profile.id, slot, { model: modelOverride });
                if (accept) await acceptSheetSlot(profile.id, slot);
                return {
                  slot,
                  ok: true,
                  model: built.model,
                  gateway: built.gateway,
                  accepted: accept,
                  refsUsed: built.profile.candidates[slot]?.refsUsed,
                  seconds: Math.round((Date.now() - t0) / 100) / 10,
                };
              } catch (error) {
                if (isStaleHandleError(error) || error instanceof ReloadingError) throw error;
                return { slot, ok: false, error: describe(error), seconds: Math.round((Date.now() - t0) / 100) / 10 };
              }
            });
            results.push(...done);
          }
          const failed = results.filter((item) => !item.ok);
          const wall = Math.round((Date.now() - started) / 100) / 10;
          const out = reply(
            { profile: profile.name, accepted: accept, parallel, wallSeconds: wall, slots: results },
            results
              .map((item) =>
                item.ok
                  ? `${item.slot}: ${accept ? "saved" : "candidate"} via ${item.model} on ${item.gateway} (${item.seconds}s, refs: ${item.refsUsed?.join(", ") || "none"})`
                  : `${item.slot}: failed: ${item.error}`,
              )
              .join("\n") +
              `\n${results.length} slots in ${wall}s, up to ${parallel} at once.` +
              (accept ? "" : "\nCandidates wait in Image Studio > Profiles: Accept or Regenerate each slot. Use --accept to let each wave build on the previous one."),
          );
          return failed.length > 0 ? { ...out, exitCode: 1 } : out;
        }
        case "models": {
          const settings = await readSettings();
          const keys = await resolvedKeys();
          const payload = {
            enabled: enabledFromSettings(settings),
            defaultGateway: settings.defaultGateway,
            falKey: Boolean(keys.fal),
            kieKey: Boolean(keys.kie),
            concurrency: settings.concurrency,
          };
          return reply(
            payload,
            [
              ...MODEL_IDS.map((id) => `${id}: ${settings[MODEL_SETTING[id]] ? "on" : "off"}`),
              `Preferred gateway: ${settings.defaultGateway}`,
              `fal.ai key: ${keys.fal ? "yes" : "no"}`,
              `kie.ai key: ${keys.kie ? "yes" : "no"}`,
              `Parallel generations: ${settings.concurrency}`,
            ].join("\n"),
          );
        }
        case "gui":
          return runGuiCommand(argv, ctx, reply);
        case "character":
        case "characters":
          return runGuiCommand(argv, ctx, reply, "characters");
        case "roblox":
          return runGuiCommand(argv, ctx, reply, "roblox");
        case "model":
          return runModelCommand(argv, ctx, reply);
        case "generate": {
          const defaults = {
            model: flag(argv, "--model"),
            gateway: flag(argv, "--gateway"),
            profile: flag(argv, "--profile"),
            images: flags(argv, "--image"),
            aspectRatio: flag(argv, "--aspect"),
            resolution: flag(argv, "--resolution"),
            refs: flag(argv, "--refs"),
            seed: undefined as number | undefined,
          };
          const seedFlag = flag(argv, "--seed");
          if (seedFlag !== undefined) {
            if (!/^\d{1,10}$/.test(seedFlag)) return { exitCode: 1, stderr: "--seed takes a whole number (Qwen Image 2.1 on kie and fal models)." };
            defaults.seed = Number(seedFlag);
          }
          const countFlag = flag(argv, "--count");
          if (countFlag !== undefined && !/^\d+$/.test(countFlag)) {
            return { exitCode: 1, stderr: "--count takes a number from 1 to 20." };
          }
          const count = countFlag === undefined ? 1 : Number(countFlag);
          if (count < 1 || count > MAX_BATCH) return { exitCode: 1, stderr: `--count takes a number from 1 to ${MAX_BATCH}.` };
          const batchPath = flag(argv, "--batch");
          if (defaults.seed !== undefined && (count > 1 || batchPath)) {
            return { exitCode: 1, stderr: "--seed with --count or --batch would make identical images; put a seed on single batch lines instead." };
          }

          let jobs: BatchJob[];
          if (batchPath) {
            let text: string;
            try {
              const absolute = isAbsolute(batchPath) || !ctx.cwd ? batchPath : join(ctx.cwd, batchPath);
              const file = await bb.sdk.files.read({ path: absolute });
              text = file.contentEncoding === "base64" ? Buffer.from(file.content, "base64").toString("utf8") : file.content;
            } catch (error) {
              return { exitCode: 1, stderr: `Could not read the batch file ${batchPath}: ${describe(error)}` };
            }
            const parsed = parseBatchLines(text, defaults, flag(argv, "--prompt"));
            if (!parsed.ok) return { exitCode: 1, stderr: parsed.error };
            jobs = parsed.jobs;
          } else {
            const prompt = flag(argv, "--prompt") || restAfter(argv, "generate");
            if (!prompt) return { exitCode: 1, stderr: usage };
            jobs = Array.from({ length: count }, () => ({ ...defaults, prompt }));
          }

          const line = (record: Generation) =>
            `Saved ${record.filename} via ${record.model} on ${record.gateway}${record.projectPath ? `\n${record.projectPath}` : ""}${record.refsUsed ? `\nReferences sent: ${record.refsUsed.length > 0 ? record.refsUsed.join(", ") : "none"}${record.refsDropped ? ` (left out: ${record.refsDropped.join(", ")})` : ""}` : ""}${record.refsSelector ? `\nReferences chosen by: ${record.refsSelector}${record.refsJevProvider ? ` via ${record.refsJevProvider} in ${record.refsJevMs}ms` : ""}${record.refsJevError ? ` (Jev not used: ${record.refsJevError})` : ""}` : ""}`;
          const runOne = (job: BatchJob) => runGenerate({ ...job, projectId: ctx.projectId ?? null, cwd: ctx.cwd });

          type Row = { index: number; ok: boolean; record?: Generation; note?: string; error?: string; reloaded?: boolean; seconds: number };
          const started = Date.now();
          const rows = await mapParallel(jobs, jobs.length, async (job, index): Promise<Row> => {
            const t0 = Date.now();
            const seconds = () => Math.round((Date.now() - t0) / 100) / 10;
            try {
              return { index: index + 1, ok: true, record: await runOne(job), seconds: seconds() };
            } catch (error) {
              if (error instanceof SavedAfterReload) {
                return { index: index + 1, ok: true, record: error.record, note: error.message, seconds: seconds() };
              }
              return {
                index: index + 1,
                ok: false,
                error: describe(error),
                reloaded: isStaleHandleError(error) || error instanceof ReloadingError,
                seconds: seconds(),
              };
            }
          });
          const wall = Math.round((Date.now() - started) / 100) / 10;
          const failed = rows.filter((row) => !row.ok);
          if (jobs.length === 1 && !batchPath) {
            const only = rows[0]!;
            if (!only.ok) {
              return { exitCode: only.reloaded ? EXIT_RELOADED : 1, stderr: only.reloaded ? `Image Studio was reloaded while this command ran. No image from this run was saved. Run the same command again (exit code ${EXIT_RELOADED}).` : only.error };
            }
            return reply(only.record, `${line(only.record!)}${only.note ? `\n${only.note}` : ""}`);
          }
          const out = reply(
            {
              total: rows.length,
              saved: rows.length - failed.length,
              failed: failed.length,
              wallSeconds: wall,
              limit: providerLimiter.max,
              results: rows.map((row) => (row.ok ? { index: row.index, ok: true, seconds: row.seconds, note: row.note, ...row.record } : { index: row.index, ok: false, seconds: row.seconds, error: row.error })),
            },
            [
              ...rows.map((row) =>
                row.ok
                  ? `${row.index}/${rows.length} ${line(row.record!).split("\n")[0]} (${row.seconds}s)${row.note ? ` - ${row.note}` : ""}`
                  : `${row.index}/${rows.length} failed: ${row.error}`,
              ),
              `${rows.length - failed.length} of ${rows.length} saved in ${wall}s, up to ${providerLimiter.max} at once.`,
            ].join("\n"),
          );
          const allReloaded = failed.length > 0 && failed.every((row) => row.reloaded);
          return failed.length > 0 ? { ...out, exitCode: allReloaded ? EXIT_RELOADED : 1 } : out;
        }
      }
      return { exitCode: 1, stderr: usage };
    }
  }

  async function runGuiCommand(
    argv: string[],
    ctx: CliCtx,
    reply: (value: unknown, text: string) => { exitCode: number; stdout: string },
    section: Section = "gui",
  ) {
    const command = section === "gui" ? "gui" : section === "roblox" ? "roblox" : argv.includes("character") ? "character" : "characters";
    const sub = argv[argv.indexOf(command) + 1];
    const projectId = ctx.projectId ?? null;
    const origin = ctx.cwd ?? projectId ?? "unscoped";
    const projectFlag = flag(argv, "--project") ?? flag(argv, "--style");
    const word = SECTION_WORD[section];
    const presetIds: readonly string[] = section === "gui" ? GUI_PRESET_IDS : section === "roblox" ? ROBLOX_PRESET_IDS : CHARACTER_PRESET_IDS;
    // Only this section's projects: a folder has one GUI project and one Characters project.
    const readStyles = async () => (await readGuiStyles()).filter((style) => style.section === section);
    switch (sub) {
      case "styles":
      case "projects": {
        const styles = [...(await readStyles())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const here = originProject(styles, origin);
        return reply(
          styles.map((style) => ({ ...style, current: style.id === here?.id })),
          styles.length === 0
            ? `No ${word} projects yet. The first ${word} generation from this folder creates one named after it.`
            : styles
                .map((style) => `${style.id === here?.id ? "* " : "  "}${style.name} (${style.id}): ${style.theme || "no theme"}; presets: ${style.tags.join(", ") || "none"}; references: ${style.refs.length}${style.origin ? `; folder: ${style.origin}` : ""}`)
                .join("\n") + (here ? `\n* = where ${word} generations from this folder go` : ""),
        );
      }
      case "style":
      case "project": {
        // A fresh folder: the project is named after it, as the first generation would name it.
        const name = flag(argv, "--name") ?? projectFlag ?? originProject(await readStyles(), origin)?.name ?? (origin === "unscoped" ? undefined : originName(origin));
        if (!name) return { exitCode: 1, stderr: usage };
        const existing = findGuiStyle(await readStyles(), name, origin);
        const palette = { ...(existing?.palette ?? { background: "", button: "", outline: "", highlight: "", text: "" }) };
        for (const pair of (flag(argv, "--palette") ?? "").split(",").filter(Boolean)) {
          const [key, value] = pair.split("=").map((part) => part.trim());
          if (!key || !(key in palette)) return { exitCode: 1, stderr: `Unknown palette key "${key}". Use background, button, outline, highlight, text.` };
          (palette as Record<string, string>)[key] = value ?? "";
        }
        const tags = flag(argv, "--tags");
        const saved = await save_gui_style({
          id: existing?.id,
          projectId,
          origin,
          section,
          name: existing && flag(argv, "--rename") ? flag(argv, "--rename")! : (existing?.name ?? name),
          theme: flag(argv, "--theme") ?? existing?.theme ?? "",
          tags: tags !== undefined ? tags.split(",").map((tag) => tag.trim()).filter(Boolean) : (existing?.tags ?? []),
          palette: paletteInputSchema.parse(palette),
          notes: flag(argv, "--notes") ?? existing?.notes ?? "",
        });
        if (existing && !existing.origin) await withGuiStyle(existing.id, (style) => void (style.origin = origin));
        return reply(saved, `${existing ? "Updated" : "Created"} ${word} project ${saved.name} (${saved.id}). Presets for --tags: ${presetIds.join(", ")}.`);
      }
      case "delete": {
        if (!projectFlag) return { exitCode: 1, stderr: `Name the project: bb image-studio ${command} delete --project <name>` };
        const style = findGuiStyle(await readStyles(), projectFlag, origin);
        if (!style) return { exitCode: 1, stderr: `No ${word} project "${projectFlag}".` };
        await delete_gui_style({ id: style.id });
        return reply({ removed: style.id }, `Deleted ${word} project ${style.name} (${style.id}): its list and references. Files saved in folders stay.`);
      }
      case "ref": {
        const image = flag(argv, "--image");
        if (!image) return { exitCode: 1, stderr: usage };
        const styles = await readStyles();
        const style = projectFlag
          ? findGuiStyle(styles, projectFlag, origin)
          : originProject(styles, origin);
        if (!style) return { exitCode: 1, stderr: projectFlag ? `No ${word} project "${projectFlag}".` : `No ${word} project for this folder yet: generate first or pass --project.` };
        const role = flag(argv, "--role") === "art" ? "art" : "concept";
        const { cwd } = ctx;
        const [uri] = await sourceDataUris([image], projectId, cwd);
        const bytes = Buffer.from(uri!.slice(uri!.indexOf(",") + 1), "base64");
        const saved = await addGuiRefFile(style.id, role, bytes, image.split("/").pop() ?? "ref");
        return reply(saved, `Added ${role === "art" ? "an art" : "a concept"} reference to ${saved.name}: ${saved.refs.length} of ${GUI_MAX_REFS}.`);
      }
      case "generate": {
        const mode = (section === "gui" ? guiModeSchema : section === "roblox" ? robloxModeSchema : characterModeSchema).safeParse(
          flag(argv, "--mode") ?? (section === "roblox" ? "icon" : "ideas"),
        );
        const body = bodySchema.safeParse(flag(argv, "--body") ?? "humanoid");
        if (!body.success) return { exitCode: 1, stderr: `--body takes ${BODY_TYPES.join(", ")}.` };
        if (!mode.success) return { exitCode: 1, stderr: `--mode takes ${(section === "gui" ? GUI_MODES : section === "roblox" ? ROBLOX_MODES : CHARACTER_MODES).join(", ")}.` };
        const aspect = flag(argv, "--aspect") ?? "1:1";
        if (section === "roblox" && !(DECAL_ASPECTS as readonly string[]).includes(aspect)) return { exitCode: 1, stderr: `--aspect takes ${DECAL_ASPECTS.join(", ")}.` };
        const prompt = flag(argv, "--items") || flag(argv, "--prompt") || restAfter(argv, "generate").replace(/^(?:gui|roblox|characters?)\s*/, "");
        const run = await runGui({
          projectId,
          styleId: projectFlag,
          section,
          mode: mode.data,
          prompt,
          states: argv.includes("--states"),
          images: flags(argv, "--image"),
          equipment: flag(argv, "--equipment"),
          character: flag(argv, "--name"),
          body: body.data,
          accessories: flag(argv, "--accessories"),
          variants: Math.max(1, Math.min(MAX_VARIANTS, Number(flag(argv, "--variants") ?? 1) || 1)),
          frames: Number(flag(argv, "--frames") ?? 16) || 16,
          aspect,
          cwd: ctx.cwd,
        });
        const out = reply({ generations: run.generations, errors: run.errors }, guiSummary(run));
        return run.generations.length === 0 ? { exitCode: 1, stderr: guiSummary(run) || "Nothing was generated." } : out;
      }
      case "cut": {
        if (section === "roblox") break;
        const sheet = flag(argv, "--sheet");
        if (!sheet) return { exitCode: 1, stderr: usage };
        const path = isAbsolute(sheet) || !ctx.cwd ? sheet : join(ctx.cwd, sheet);
        const file = await bb.sdk.files.read({ path });
        const bytes = Buffer.from(file.content, file.contentEncoding === "base64" ? "base64" : "utf8");
        if (section === "characters") {
          // A turnaround (--grid 1x2, the default; 2x1 for winged) or an equipment sheet (--items, in the sheet's order).
          const items = parseEquipment(flag(argv, "--items"));
          const grid = flag(argv, "--grid") ?? "1x2";
          const [rows, cols] = grid.split("x").map(Number);
          if (items.length === 0 && !(rows! >= 1 && cols! >= 1)) return { exitCode: 1, stderr: "--grid takes ROWSxCOLS, e.g. 1x2." };
          const turnaround = items.length === 0 && (grid === "1x2" || grid === "2x1");
          const names = items.length > 0 ? [] : turnaround ? [...TURNAROUND_VIEWS] : Array.from({ length: rows! * cols! }, (_, index) => `part-${String(index + 1).padStart(2, "0")}`);
          const layout: SheetLayout = items.length > 0
            ? sheetLayout(items, false)
            : { rows: rows!, cols: cols!, cells: names.map((name) => ({ name, element: name })) };
          const cut = cutOnWhite(await decodeRgba(bytes), layout);
          const dir = join(path, "..", turnaround ? "views" : "parts");
          for (const part of cut.parts) {
            await bb.sdk.files.write({
              path: join(dir, `${part.name}.png`),
              content: (await encodePng(part.image)).toString("base64"),
              contentEncoding: "base64",
              createParents: true,
            });
          }
          return reply(
            { dir, cleanGaps: cut.clean, missing: cut.missing, parts: cut.parts.map((part) => ({ name: part.name, ...part.box })) },
            `${cut.parts.length} pictures in ${dir}${cut.clean ? "" : " (figures touched: cut at their narrowest point, check the edges)"}${cut.missing.length > 0 ? `\nempty: ${cut.missing.join(", ")}` : ""}`,
          );
        }
        const elements = parseElementList(flag(argv, "--elements") ?? "");
        const layout = elements.length > 0 ? sheetLayout(elements, argv.includes("--states")) : undefined;
        const cut = cutSheet(keyGreen(await decodeRgba(bytes)), layout);
        const dir = join(path, "..", "parts");
        for (const part of cut.parts) {
          await bb.sdk.files.write({
            path: join(dir, `${part.name}.png`),
            content: (await encodePng(part.image)).toString("base64"),
            contentEncoding: "base64",
            createParents: true,
          });
        }
        return reply(
          { dir, named: cut.named, missing: cut.missing, parts: cut.parts.map((part) => ({ name: part.name, ...part.box })) },
          `${cut.parts.length} parts in ${dir}${cut.named ? "" : " (numbered: the pieces did not match the list)"}${cut.missing.length > 0 ? `\nnot found: ${cut.missing.join(", ")}` : ""}`,
        );
      }
    }
    return { exitCode: 1, stderr: usage };
  }

  async function runModelCommand(
    argv: string[],
    ctx: CliCtx,
    reply: (value: unknown, text: string) => { exitCode: number; stdout: string },
  ) {
    const sub = argv[argv.indexOf("model") + 1];
    const projectId = ctx.projectId ?? null;
    const origin = ctx.cwd ?? projectId ?? "unscoped";
    const projectFlag = flag(argv, "--project") ?? flag(argv, "--style");
    const word = SECTION_WORD.model;
    const readStyles = async () => (await readGuiStyles()).filter((style) => style.section === "model");
    switch (sub) {
      case "projects": {
        const styles = [...(await readStyles())].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const here = originProject(styles, origin);
        return reply(
          styles.map((style) => ({ ...style, current: style.id === here?.id })),
          styles.length === 0
            ? `No ${word} projects yet. The first texture run from this folder creates one named after it.`
            : styles
                .map((style) => `${style.id === here?.id ? "* " : "  "}${style.name} (${style.id}): ${style.theme || "no theme"}; references: ${style.refs.length}${style.origin ? `; folder: ${style.origin}` : ""}`)
                .join("\n") + (here ? `\n* = where ${word} generations from this folder go` : ""),
        );
      }
      case "project": {
        const name = flag(argv, "--name") ?? projectFlag ?? originProject(await readStyles(), origin)?.name ?? (origin === "unscoped" ? undefined : originName(origin));
        if (!name) return { exitCode: 1, stderr: usage };
        const existing = findGuiStyle(await readStyles(), name, origin);
        const palette = { ...(existing?.palette ?? { background: "", button: "", outline: "", highlight: "", text: "" }) };
        const tags = flag(argv, "--tags");
        const fbxScaleFlag = flag(argv, "--fbx-scale");
        const saved = await save_gui_style({
          id: existing?.id,
          projectId,
          origin,
          section: "model",
          name: existing && flag(argv, "--rename") ? flag(argv, "--rename")! : (existing?.name ?? name),
          theme: flag(argv, "--theme") ?? existing?.theme ?? "",
          tags: tags !== undefined ? tags.split(",").map((tag) => tag.trim()).filter(Boolean) : (existing?.tags ?? []),
          palette: paletteInputSchema.parse(palette),
          notes: flag(argv, "--notes") ?? existing?.notes ?? "",
          ...(fbxScaleFlag !== undefined ? { fbxScale: Number(fbxScaleFlag) } : {}),
        });
        if (existing && !existing.origin) await withGuiStyle(existing.id, (style) => void (style.origin = origin));
        return reply(saved, `${existing ? "Updated" : "Created"} ${word} project ${saved.name} (${saved.id}).`);
      }
      case "ref": {
        const image = flag(argv, "--image");
        if (!image) return { exitCode: 1, stderr: usage };
        const styles = await readStyles();
        const style = projectFlag
          ? findGuiStyle(styles, projectFlag, origin)
          : originProject(styles, origin);
        if (!style) return { exitCode: 1, stderr: projectFlag ? `No ${word} project "${projectFlag}".` : `No ${word} project for this folder yet: generate first or pass --project.` };
        const role = flag(argv, "--role") === "art" ? "art" : "concept";
        const { cwd } = ctx;
        const [uri] = await sourceDataUris([image], projectId, cwd);
        const bytes = Buffer.from(uri!.slice(uri!.indexOf(",") + 1), "base64");
        const saved = await addGuiRefFile(style.id, role, bytes, image.split("/").pop() ?? "ref");
        return reply(saved, `Added ${role === "art" ? "an art" : "a concept"} reference to ${saved.name}: ${saved.refs.length} of ${GUI_MAX_REFS}.`);
      }
      case "delete": {
        if (!projectFlag) return { exitCode: 1, stderr: `Name the project: bb image-studio model delete --project <name>` };
        const style = findGuiStyle(await readStyles(), projectFlag, origin);
        if (!style) return { exitCode: 1, stderr: `No ${word} project "${projectFlag}".` };
        await delete_gui_style({ id: style.id });
        return reply({ removed: style.id }, `Deleted ${word} project ${style.name} (${style.id}): its list and references. Saved files stay.`);
      }
      case "item": {
        const source = await projectSource(projectId);
        const cwd = ctx.cwd ?? source.cwd;
        const hostId = source.hostId;
        if (!cwd || !hostId) return { exitCode: 1, stderr: "Model item needs a project folder on a host." };
        let cmd: ReturnType<typeof parseItemCli>;
        try {
          cmd = parseItemCli(argv);
        } catch (error) {
          return { exitCode: 1, stderr: describe(error) };
        }
        const folderProject = modelCliProjectOrigin(cwd, projectId);
        const style = await resolveGuiProject({
          styleId: projectFlag,
          origin: cwd,
          projectId,
          name: folderProject.projectName,
          section: "model",
        });
        const game = await gameOf(style);
        switch (cmd.action) {
          case "list": {
            const rows = await readItemIndex(style.id);
            return reply(
              rows,
              rows.length === 0
                ? "No items in this model project yet."
                : rows.map((row) => `${row.name} (${row.id})`).join("\n"),
            );
          }
          case "create": {
            let item = await ensureItem(cwd, hostId, style, cmd.item, game?.id ?? null);
            if (cmd.name) {
              item = itemSchema.parse({ ...item, name: cmd.name, updatedAt: new Date().toISOString() });
              await saveItem(cwd, hostId, style, item);
            }
            return reply(item, `Created item ${item.name} (${item.id}).`);
          }
          case "show": {
            const item = await loadItemForShow(cwd, hostId, style, cmd.item);
            const text = itemSummary(item);
            return cmd.json ? reply(item, text) : { exitCode: 0, stdout: text };
          }
          case "select": {
            let item = await loadItemForShow(cwd, hostId, style, cmd.item);
            item = selectEntry(item, cmd.step, cmd.entry, "cli");
            await saveItem(cwd, hostId, style, item);
            return reply(item, itemSummary(item));
          }
          case "export": {
            const scaleOverride = cmd.scale !== undefined ? Number(cmd.scale) : undefined;
            const run = await runItemExport({
              cwd,
              hostId,
              style,
              itemId: cmd.item,
              scaleOverride,
              selectedBy: "cli",
            });
            return reply(run.doc, run.summary);
          }
          case "attach": {
          let item = await ensureItem(cwd, hostId, style, cmd.item, game?.id ?? null);
          let entry;
          if (cmd.step === "concept") {
            const ref = cmd.image ?? cmd.file;
            if (!ref) return { exitCode: 1, stderr: "concept attach needs --image or --file." };
            entry = attachConceptEntry(ref, "attached");
          } else if (cmd.step === "model") {
            if (!cmd.file) return { exitCode: 1, stderr: "model attach needs --file." };
            entry = attachModelFileEntry(cmd.file);
          } else if (cmd.run) {
            const files =
              cmd.step === "blueprint"
                ? filesFromBlueprintRunFolder(cmd.run)
                : cmd.step === "uv-guide"
                  ? filesFromTextureRunFolder(cmd.run)
                  : cmd.step === "texture" || cmd.step === "preview"
                    ? filesFromTextureTakeFolder(cmd.run)
                    : filesFromTextureRunFolder(cmd.run);
            entry = attachRunFolderEntry(cmd.step, cmd.run, files);
          } else {
            return { exitCode: 1, stderr: "attach needs --file, --image, or --run for this step." };
          }
          item = addEntry(item, cmd.step, entry, { select: cmd.select, selectedBy: "cli" });
          await saveItem(cwd, hostId, style, item);
          return reply(item, itemSummary(item));
          }
        }
        return { exitCode: 1, stderr: usage };
      }
      case "generate": {
        const source = await projectSource(projectId);
        const cwd = ctx.cwd ?? source.cwd;
        const hostId = source.hostId;
        if (!cwd || !hostId) return { exitCode: 1, stderr: "Model generate needs a project folder on a host." };
        let parsed: ReturnType<typeof parseModelGenerateCli>;
        try {
          parsed = parseModelGenerateCli(argv);
        } catch (error) {
          return { exitCode: 1, stderr: describe(error) };
        }
        const styleId = parsed.projectStyleId ?? projectFlag;
        const folderProject = modelCliProjectOrigin(cwd, projectId);
        const origin = cwd ?? projectId ?? "unscoped";
        if (parsed.mode === "blueprint") {
          let conceptImage = parsed.conceptImage;
          if (parsed.itemId && !conceptImage) {
            try {
              const style = await resolveGuiProject({
                styleId,
                origin,
                projectId,
                name: folderProject.projectName,
                section: "model",
              });
              const game = await gameOf(style);
              const item = await ensureItem(cwd, hostId, style, parsed.itemId, game?.id ?? null);
              conceptImage = resolveBlueprintConceptFromItem(item);
            } catch (error) {
              return { exitCode: 1, stderr: describe(error) };
            }
          }
          if (!conceptImage) return { exitCode: 1, stderr: "Blueprint mode requires --image <concept> or --item with a concept step." };
          const views = parsed.views ? defaultBlueprintViews(parsed.views) : undefined;
          const run = await runModelBlueprint({
            projectId,
            styleId,
            images: [conceptImage],
            views,
            style: parsed.sheetStyle,
            subject: parsed.subject,
            soft: parsed.soft,
            rigid: parsed.rigid,
            sideSeparate: parsed.sideSeparate,
            blueprintModel: parsed.blueprintModel,
            resolution: parsed.resolution,
            gateway: parsed.gateway,
            cwd,
            hostId,
            originLabel: folderProject.projectName,
            itemId: parsed.itemId,
          });
          const text = blueprintSummary(run);
          return !run.blueprint ? { exitCode: 1, stderr: text || "Nothing was generated." } : reply(run, text);
        }
        let modelPath = parsed.modelPath;
        let images = [...(parsed.images ?? [])];
        if (parsed.itemId) {
          try {
            const style = await resolveGuiProject({
              styleId,
              origin,
              projectId,
              name: folderProject.projectName,
              section: "model",
            });
            const game = await gameOf(style);
            const item = await ensureItem(cwd, hostId, style, parsed.itemId, game?.id ?? null);
            const resolved = resolveTextureUvInputsFromItem(item, {
              modelPath,
              conceptImage: images[0],
            });
            modelPath = resolved.modelPath;
            if (resolved.conceptImage) images = [resolved.conceptImage, ...images.slice(1)];
          } catch (error) {
            return { exitCode: 1, stderr: describe(error) };
          }
        }
        if (!modelPath) return { exitCode: 1, stderr: "texture-uv requires --file/--model or --item with a model step." };
        const modelFile = isAbsolute(modelPath) ? modelPath : join(cwd, modelPath);
        const run = await runModelTextureUv({
          projectId,
          styleId,
          mode: parsed.mode,
          model: modelFile,
          object: parsed.object,
          prompt: parsed.prompt,
          parts: parsed.parts,
          images,
          size: parsed.size,
          variants: parsed.variants,
          subject: parsed.subject,
          conceptNote: parsed.conceptNote,
          projectConcept: parsed.projectConcept,
          conceptView: parsed.conceptView,
          guideFix: parsed.guideFix,
          cwd,
          hostId,
          originLabel: folderProject.projectName,
          itemId: parsed.itemId,
        });
        const text = modelSummary(run);
        return run.takes.length === 0 ? { exitCode: 1, stderr: text || "Nothing was generated." } : reply(run, text);
      }
    }
    return { exitCode: 1, stderr: usage };
  }

  bb.agents.registerTool({
    name: "image_studio_gui",
    description:
      "Game and site GUI through Image Studio's GUI section, one GUI project per folder (Muse Image, English labels, picked frame size). Modes: ideas (4 mockups of a screen: 4 style directions for a fresh style, 4 takes inside a fixed one), screen (one mockup), elements (a list of separate elements on one sheet, cut into named transparent PNGs; states: normal/hover/pressed/disabled), kit (the standard UI kit of the style in two sheets, cut). Runs at once, no Send form.",
    instructions:
      "For game or site interface work (GUI, HUD, menus, buttons, frames, UI icons) call image_studio_gui instead of image_studio_generate. Generations go to the GUI project of this thread's folder (created on first use, named after the folder); pass project only to write into another one (`bb image-studio gui projects`). A project with nothing fixed yet makes ideas explore 4 preset directions; once it has presets, palette or references, ideas are 4 takes inside its style. prompt: ideas/screen — what the screen holds (\"settings window: tabs Graphics, Audio; sliders; Save button\"); elements — the list, one per line or separated by \";\" (\"Play button with the label 'PLAY'; gold coin icon\"); kit — optional extra wishes. Do not describe the style in prompt: the plugin adds the style's theme, palette, presets and reference pictures. Report the saved paths and parts folders to the user. To make an approved picture the project's style reference: bb image-studio gui ref --image <path or gallery id>. Set theme/presets/palette: bb image-studio gui project --theme … --tags … --palette ….",
    presentation: {
      label: { pending: "Generating GUI", completed: "Generated GUI" },
      icon: { glyph: "Palette" },
    },
    parameters: z.object({
      mode: guiModeSchema,
      prompt: z.string().default(""),
      project: z.string().optional(),
      states: z.boolean().optional(),
      images: z.array(z.string().min(1)).max(4).optional(),
    }),
    async execute(input, ctx) {
      try {
        const run = await runGui({
          projectId: ctx.projectId || null,
          styleId: input.project,
          mode: input.mode,
          prompt: input.prompt,
          states: input.states ?? false,
          images: input.images,
          ...(await threadFolder(ctx.threadId, ctx.projectId || null)),
        });
        const text = guiSummary(run);
        return run.generations.length === 0 ? { content: [{ type: "text", text: text || "Nothing was generated." }], isError: true } : text;
      } catch (error) {
        if (isStaleHandleError(error) || error instanceof ReloadingError) {
          return { content: [{ type: "text", text: "Image Studio was reloaded while this ran and nothing was saved. Call image_studio_gui again." }], isError: true };
        }
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "image_studio_character",
    description:
      "Game characters for 3D through Image Studio's Characters section, one Characters project per folder (Muse Image). Modes: ideas (4 concepts, each the full body from the front and the back on one picture, straight-on; may hold their equipment), model (the front view for image-to-3D and rigging: symmetric A-pose, empty hands, plain white, orthographic), turnaround (front and back side by side, cut into views/front.png and views/back.png), equipment (the held items alone on one sheet, side view, cut into parts/*.png), accessories (worn pieces — helmet, hair, pauldrons, wings, cape — alone on one sheet, cut into parts/*.png). body blocky = a Roblox R15 block avatar with flat-painted clothing whose turnaround the toolkit's roblox_blocky.py builds in Blender. Runs at once, no Send form.",
    instructions:
      "For a game character meant for a 3D model (Hunyuan3D / TRELLIS on gpu3d, Roblox Avatar Setup, UniRig) call image_studio_character, not image_studio_generate. Split the request: prompt = who the character is and what it wears (helmet, mask, vest, pouches, boots stay on the body); equipment = everything held in the hands or carried apart (rifle, axe, torch, shield, backpack if it should come off), \";\"-separated. The plugin keeps equipment out of model and turnaround and draws it with mode equipment, so a weapon never grows into the body mesh. name = a short file name (\"soldier\"). body = humanoid (default; also zombies, robots, anything on two legs with arms) | quadruped (horse, wolf, beast on four legs; its 3D picture is a three-quarter view) | winged (wings spread out: harpy, dragon, bat) | legless (serpent, slime, ghost, floating body) | blocky (a Roblox R15 block avatar: exact block proportions, arms down, clothing painted flat on the block faces; put helmets, hair, pauldrons, wings, capes in accessories and draw them with mode accessories; the turnaround goes to Roblox/toolkit assets3d/roblox_blocky.py, which builds the 15 R15 blocks in Blender with the views projected onto them): it picks the neutral rigging pose. Flow: ideas → the user picks one → model with images=[that picture] → turnaround (front and back) with images=[the model front.png] → equipment with images=[the idea picture]. Do not describe the pose, background, camera or art style in prompt: the plugin adds the A-pose, white background, orthographic camera and the project's theme, presets and approved characters. Set the look: bb image-studio character project --theme … --tags stylized|blocky|chibi|lowpoly|realistic|toon|painted; make an approved character a reference: bb image-studio character ref --image <path>. Report front.png, views/ and parts/ paths; the front.png (or views/front.png) is the image-to-3D input.",
    presentation: {
      label: { pending: "Drawing a character", completed: "Drew a character" },
      icon: { glyph: "UserRound" },
    },
    parameters: z.object({
      mode: characterModeSchema,
      prompt: z.string().default(""),
      equipment: z.string().optional(),
      name: z.string().optional(),
      body: bodySchema.optional(),
      accessories: z.string().optional(),
      project: z.string().optional(),
      images: z.array(z.string().min(1)).max(4).optional(),
    }),
    async execute(input, ctx) {
      try {
        const run = await runGui({
          projectId: ctx.projectId || null,
          styleId: input.project,
          section: "characters",
          mode: input.mode,
          prompt: input.prompt,
          states: false,
          images: input.images,
          equipment: input.equipment,
          character: input.name,
          body: input.body,
          accessories: input.accessories,
          ...(await threadFolder(ctx.threadId, ctx.projectId || null)),
        });
        const text = guiSummary(run);
        return run.generations.length === 0 ? { content: [{ type: "text", text: text || "Nothing was generated." }], isError: true } : text;
      } catch (error) {
        if (isStaleHandleError(error) || error instanceof ReloadingError) {
          return { content: [{ type: "text", text: "Image Studio was reloaded while this ran and nothing was saved. Call image_studio_character again." }], isError: true };
        }
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "image_studio_item",
    description:
      "Manage a model-section item (concept → blueprint → model → uv-guide → texture → preview): create, list, show status, attach files or runs by reference, select an entry.",
    instructions:
      "Use image_studio_item to drive the item pipeline. action create|list|show|attach|select. item is the slug id. attach: step concept|blueprint|model|uv-guide|texture|preview; file for model paths; image for concept paths or gallery ids; run for an existing model run folder. show returns itemSummary text describing the next step.",
    presentation: {
      label: { pending: "Updating item", completed: "Updated item" },
      icon: { glyph: "Palette" },
    },
    parameters: z.object({
      action: z.enum(["create", "list", "show", "attach", "select", "export"]),
      scale: z.string().optional(),
      item: z.string().optional(),
      step: z.enum(["concept", "blueprint", "model", "uv-guide", "texture", "preview", "export"]).optional(),
      file: z.string().optional(),
      image: z.string().optional(),
      run: z.string().optional(),
      entry: z.string().optional(),
      name: z.string().optional(),
      select: z.boolean().optional(),
      project: z.string().optional(),
    }),
    async execute(input, ctx) {
      try {
        const folder = await threadFolder(ctx.threadId, ctx.projectId || null);
        if (!folder.cwd || !folder.hostId) {
          return { content: [{ type: "text", text: "Items need a project folder on a host." }], isError: true };
        }
        const style = await resolveGuiProject({
          styleId: input.project,
          origin: folder.cwd,
          projectId: ctx.projectId || null,
          section: "model",
        });
        const game = await gameOf(style);
        if (input.action === "list") {
          const rows = await readItemIndex(style.id);
          const text =
            rows.length === 0 ? "No items in this model project yet." : rows.map((row) => `${row.name} (${row.id})`).join("\n");
          return text;
        }
        if (!input.item) {
          return { content: [{ type: "text", text: "item id is required." }], isError: true };
        }
        if (input.action === "create") {
          let item = await ensureItem(folder.cwd, folder.hostId, style, input.item, game?.id ?? null);
          if (input.name) {
            item = itemSchema.parse({ ...item, name: input.name, updatedAt: new Date().toISOString() });
            await saveItem(folder.cwd, folder.hostId, style, item);
          }
          return itemSummary(item);
        }
        if (input.action === "show") {
          const item = await loadItemForShow(folder.cwd, folder.hostId, style, input.item);
          return itemSummary(item);
        }
        if (input.action === "select") {
          if (!input.step || !input.entry) {
            return { content: [{ type: "text", text: "select needs step and entry." }], isError: true };
          }
          let item = await loadItemForShow(folder.cwd, folder.hostId, style, input.item);
          item = selectEntry(item, input.step, input.entry, "agent");
          await saveItem(folder.cwd, folder.hostId, style, item);
          return itemSummary(item);
        }
        if (input.action === "export") {
          const scaleOverride = input.scale !== undefined ? Number(input.scale) : undefined;
          const run = await runItemExport({
            cwd: folder.cwd,
            hostId: folder.hostId,
            style,
            itemId: input.item,
            scaleOverride,
            selectedBy: "agent",
          });
          return run.summary;
        }
        if (input.action === "attach") {
          if (!input.step) {
            return { content: [{ type: "text", text: "attach needs step." }], isError: true };
          }
          let item = await ensureItem(folder.cwd, folder.hostId, style, input.item, game?.id ?? null);
          let entry;
          if (input.step === "concept") {
            const ref = input.image ?? input.file;
            if (!ref) return { content: [{ type: "text", text: "concept attach needs image or file." }], isError: true };
            entry = attachConceptEntry(ref, "attached");
          } else if (input.step === "model") {
            if (!input.file) return { content: [{ type: "text", text: "model attach needs file." }], isError: true };
            entry = attachModelFileEntry(input.file);
          } else if (input.run) {
            const files =
              input.step === "blueprint"
                ? filesFromBlueprintRunFolder(input.run)
                : input.step === "uv-guide"
                  ? filesFromTextureRunFolder(input.run)
                  : input.step === "texture" || input.step === "preview"
                    ? filesFromTextureTakeFolder(input.run)
                    : filesFromTextureRunFolder(input.run);
            entry = attachRunFolderEntry(input.step, input.run, files);
          } else {
            return { content: [{ type: "text", text: "attach needs file, image, or run." }], isError: true };
          }
          item = addEntry(item, input.step, entry, { select: input.select, selectedBy: "agent" });
          await saveItem(folder.cwd, folder.hostId, style, item);
          return itemSummary(item);
        }
        return { content: [{ type: "text", text: "Unknown action." }], isError: true };
      } catch (error) {
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "image_studio_model",
    description:
      "Game model textures and modeling blueprints (Muse Image). Mode texture-uv: Blender bakes a colour guide on the project host, Muse repaints each UV island, the result is applied back with a before/after preview. Mode blueprint: orthographic clay wireframe views cut from one sheet for a 3D artist (decorative reference, not a mesh). Runs at once, no Send form.",
    instructions:
      "texture-uv: pass mode texture-uv, the model path, and a style prompt. Optional images (up to 2): concept art, then style reference. Output: image-studio/model/<project>/<take>/ with color.png, guide.png, mask.png, preview.png, parts.json, model.blend and manifest.json. blueprint: pass mode blueprint and images[0] as concept; optional views (front, side, back, top), style clay+wire or clean line, soft (dangling parts), rigid, subject, sideSeparate (default true). Output: image-studio/model/<project>/<run>/blueprint/ with sheet.png, side-sheet.png when side is drawn separately, one PNG per view, and views.json (anchors for soft parts, sheetSideSimilarity). By default the side view is always a second Muse call (90° profile with the cut front as image 2). Set sideSeparate false to keep the side from the main sheet only. In a Roblox game folder the project inherits the game's look like GUI and Characters.",
    presentation: {
      label: { pending: "Working on model image", completed: "Finished model image" },
      icon: { glyph: "Palette" },
    },
    parameters: imageStudioModelParamsSchema,
    async execute(input, ctx) {
      try {
        const folder = await threadFolder(ctx.threadId, ctx.projectId || null);
        if (input.mode === "blueprint") {
          let images = input.images ?? [];
          if (input.item && !images[0] && folder.cwd && folder.hostId) {
            const style = await resolveGuiProject({
              styleId: input.project,
              origin: folder.cwd,
              projectId: ctx.projectId || null,
              section: "model",
            });
            const game = await gameOf(style);
            const item = await ensureItem(folder.cwd, folder.hostId, style, input.item, game?.id ?? null);
            images = [resolveBlueprintConceptFromItem(item)];
          }
          const run = await runModelBlueprint({
            projectId: ctx.projectId || null,
            styleId: input.project,
            images,
            views: input.views,
            style: input.style,
            subject: input.subject,
            soft: input.soft,
            rigid: input.rigid,
            sideSeparate: input.sideSeparate,
            blueprintModel: input.blueprintModel,
            resolution: input.resolution,
            gateway: input.gateway,
            itemId: input.item,
            ...folder,
          });
          const text = blueprintSummary(run);
          return !run.blueprint ? { content: [{ type: "text", text: text || "Nothing was generated." }], isError: true } : text;
        }
        let modelPath = input.model;
        let images = input.images ?? [];
        if (input.item && folder.cwd && folder.hostId) {
          const style = await resolveGuiProject({
            styleId: input.project,
            origin: folder.cwd,
            projectId: ctx.projectId || null,
            section: "model",
          });
          const game = await gameOf(style);
          const item = await ensureItem(folder.cwd, folder.hostId, style, input.item, game?.id ?? null);
          const resolved = resolveTextureUvInputsFromItem(item, { modelPath, conceptImage: images[0] });
          modelPath = resolved.modelPath;
          if (resolved.conceptImage) images = [resolved.conceptImage, ...images.slice(1)];
        }
        if (!modelPath?.trim()) {
          return { content: [{ type: "text", text: "texture-uv needs model or item with a model step." }], isError: true };
        }
        const run = await runModelTextureUv({
          projectId: ctx.projectId || null,
          styleId: input.project,
          mode: input.mode,
          model: modelPath,
          object: input.object,
          prompt: input.prompt,
          parts: input.parts,
          images,
          size: input.size,
          variants: input.variants,
          subject: input.subject,
          conceptNote: input.conceptNote,
          projectConcept: input.projectConcept,
          conceptView: input.conceptView,
          guideFix: input.guideFix,
          itemId: input.item,
          ...folder,
        });
        const text = modelSummary(run);
        return run.takes.length === 0 ? { content: [{ type: "text", text: text || "Nothing was generated." }], isError: true } : text;
      } catch (error) {
        if (isStaleHandleError(error) || error instanceof ReloadingError) {
          return { content: [{ type: "text", text: "Image Studio was reloaded while this ran and nothing was saved. Call image_studio_model again." }], isError: true };
        }
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "image_studio_roblox",
    description:
      "Roblox game assets through Image Studio's Roblox section, one game per folder (Muse Image), fitted to what Roblox takes. Modes: icon (512×512), thumbnail (1920×1080; variants 3-4 make a set of different shots), logo (transparent title logo), loading (loading screen art), badges / passes / products (opaque 512×512 icons composed for the circle crop, cut from one sheet), items (transparent item icons), props (props and buildings on white, cut for image-to-3D), texture (seamless color.png + normal.png 1024), skybox (the six Sky faces), decal (a flat picture for a surface), vfx (glowing particle textures, transparent), flipbook (a 2×2 or 4×4 particle animation). Runs at once, no Send form.",
    instructions:
      "For Roblox game art call image_studio_roblox: the game icon, thumbnails, logo, badges, game passes, developer products, item icons, props for 3D, textures, skyboxes, decals and particle effects. The game's GUI goes to image_studio_gui and its characters to image_studio_character: in a game's folder they land in that game and share its look. Generations go to the game of this thread's folder (created on first use, named after the folder); pass project only for another game (`bb image-studio roblox projects`). prompt: what the picture shows (icon, thumbnail, decal, flipbook), the surface (texture), the sky (skybox), the name in quotes (logo); for badges, passes, products, items, props and vfx the list, one per line or separated by \";\" (\"VIP; 2x Coins; Speed boost\"). variants 1-4 draws takes of single pictures; frames 4|16 for flipbook; aspect for decal. Do not describe the art style: the plugin adds the game's theme, art style and approved art. Report the finished files (icon.png, thumbnail.png, parts/, SkyboxFt.png…) and manifest.json, which says where each goes in Roblox. Set the look: bb image-studio roblox project --theme … --tags simulator|stylized|lowpoly|realistic|anime|horror|cartoon|voxel; make approved art a reference: bb image-studio roblox ref --image <path>.",
    presentation: {
      label: { pending: "Drawing Roblox assets", completed: "Drew Roblox assets" },
      icon: { glyph: "Palette" },
    },
    parameters: z.object({
      mode: robloxModeSchema,
      prompt: z.string().default(""),
      project: z.string().optional(),
      variants: z.number().int().min(1).max(MAX_VARIANTS).optional(),
      frames: z.number().int().optional(),
      aspect: z.enum(DECAL_ASPECTS).optional(),
      images: z.array(z.string().min(1)).max(4).optional(),
    }),
    async execute(input, ctx) {
      try {
        const run = await runGui({
          projectId: ctx.projectId || null,
          styleId: input.project,
          section: "roblox",
          mode: input.mode,
          prompt: input.prompt,
          states: false,
          images: input.images,
          variants: input.variants,
          frames: input.frames,
          aspect: input.aspect,
          ...(await threadFolder(ctx.threadId, ctx.projectId || null)),
        });
        const text = guiSummary(run);
        return run.generations.length === 0 ? { content: [{ type: "text", text: text || "Nothing was generated." }], isError: true } : text;
      } catch (error) {
        if (isStaleHandleError(error) || error instanceof ReloadingError) {
          return { content: [{ type: "text", text: "Image Studio was reloaded while this ran and nothing was saved. Call image_studio_roblox again." }], isError: true };
        }
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "image_studio_generate",
    description:
      "Generate a project photo through Image Studio, or edit existing pictures passed in images (file path, gallery id, or URL). Always call this instead of the CLI when chatting with the user: it opens buttons for model, aspect ratio, and size with the last choice preselected. Nano Banana size defaults to 2K. With a profile, the plugin attaches the reference sheet photos it needs (refs: auto by default). Wait for Send.",
    instructions:
      "Not for game or site interfaces (GUI, HUD, buttons, UI kits) and not for game characters, their turnarounds or weapons: those go to image_studio_gui and image_studio_character, which run at once without the Send form, at the sizes their section fixes, and need no confirmation. When the user wants a photo, call image_studio_generate with the scene prompt (and profile name if they named a person). To change an existing picture, pass it in images and write an edit prompt. Do not pass model/aspect/size unless the user named them this turn. Do not describe the person's face or body in prompt: the plugin injects the identity and the reference photos. Pass refs only to force slots (\"all\", or e.g. \"face-front,body-back\"); leave it out for the automatic choice. The result lists the reference slots that were sent. Do not run bb image-studio generate in chat — that skips the picker. Wait until the user presses Send.",
    presentation: {
      label: { pending: "Waiting to generate a photo", completed: "Generated a photo" },
      icon: { glyph: "Palette" },
    },
    parameters: z.object({
      prompt: z.string().min(1),
      profile: z.string().optional(),
      images: z.array(z.string().min(1)).max(8).optional(),
      model: z.string().optional(),
      gateway: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
      refs: z.string().optional(),
    }),
    async execute(input, ctx) {
      const settings = await readSettings();
      const last = await readLastGenerate();
      const selected = resolvePickerSelection({
        enabled: enabledFromSettings(settings),
        defaultGateway: settings.defaultGateway,
        last,
        suggestedModel: input.model,
        suggestedGateway: input.gateway,
        suggestedAspect: input.aspectRatio,
        suggestedResolution: input.resolution,
      });
      const profiles = await readProfileList();
      const profile = input.profile ? findProfile(profiles, input.profile) : null;
      if (input.profile && !profile) {
        return { content: [{ type: "text", text: `No person profile named "${input.profile}".` }], isError: true };
      }
      let result;
      try {
        result = await bb.ui.requestInput(
          {
            threadId: ctx.threadId,
            rendererId: GENERATE_PICKER_ID,
            title: "Generate photo",
            payload: JSON.parse(
              JSON.stringify({
                prompt: input.prompt,
                profileName: profile?.name ?? null,
                sourceImages: input.images ?? [],
                models: MODEL_IDS.map((id) => ({
                  id,
                  enabled: modelEnabled(id, enabledFromSettings(settings)),
                })),
                selected,
                locale: settings.uiLocale === "auto" ? undefined : settings.uiLocale,
              }),
            ),
          },
          { signal: ctx.signal },
        );
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Could not show the generate buttons (${describe(error)}). Only one prompt can wait at a time.`,
            },
          ],
          isError: true,
        };
      }
      if (result.outcome === "cancelled") {
        return {
          content: [
            {
              type: "text",
              text:
                result.reason === "timeout"
                  ? "The generate form timed out. Ask the user again if they still want the photo."
                  : "The user cancelled the generate form. Do not generate.",
            },
          ],
          isError: true,
        };
      }
      const choice = pickerResponseSchema.safeParse(result.value);
      if (!choice.success) {
        return { content: [{ type: "text", text: "The generate form returned an invalid choice." }], isError: true };
      }

      let cwd: string | undefined;
      let hostId: string | undefined;
      if (ctx.projectId) {
        try {
          const project = await bb.sdk.projects.get({ projectId: ctx.projectId });
          const source = project.sources[0];
          cwd = source?.path;
          hostId = source?.hostId;
        } catch (error) {
          warn(`project path: ${describe(error)}`);
        }
      }

      try {
        const record = await runGenerate({
          projectId: ctx.projectId || null,
          prompt: input.prompt,
          model: choice.data.model,
          gateway: choice.data.gateway,
          profile: profile?.name ?? input.profile,
          images: input.images,
          refs: input.refs,
          aspectRatio: choice.data.aspectRatio,
          resolution: modelUsesResolution(choice.data.model) ? choice.data.resolution : undefined,
          cwd,
          hostId,
        });
        return [
          `Saved ${record.filename} via ${record.model} on ${record.gateway}`,
          record.width && record.height ? `${record.width}×${record.height}` : null,
          modelUsesResolution(choice.data.model) ? `size ${choice.data.resolution}` : null,
          record.projectPath ? record.projectPath : null,
          record.refsUsed
            ? `References sent: ${record.refsUsed.length > 0 ? record.refsUsed.join(", ") : "none"}${record.refsDropped ? ` (left out: ${record.refsDropped.join(", ")})` : ""}${record.refsSelector ? ` [chosen by ${record.refsSelector}]` : ""}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      } catch (error) {
        if (error instanceof SavedAfterReload) {
          return `${error.message}\nSaved ${error.record.filename} via ${error.record.model} on ${error.record.gateway}`;
        }
        if (isStaleHandleError(error) || error instanceof ReloadingError) {
          return {
            content: [{ type: "text", text: "Image Studio was reloaded while this ran and nothing was saved. Call image_studio_generate again." }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.configure(() => ({
    tools: ["image_studio_generate", "image_studio_gui", "image_studio_character", "image_studio_roblox", "image_studio_item", "image_studio_model"],
    skills: ["image-studio"],
  }));

  // Finish what the plugin can before a reload: refuse new jobs, give running ones time to save.
  // Whatever outlives the wait is still safe: the image is written to disk and journaled, and the next
  // instance adopts it.
  const recoveryTimer = setInterval(() => {
    void recoverPending().then(
      (adopted) => {
        if (adopted > 0) warn(`recovered ${adopted} job(s) cut off by a reload`);
      },
      () => undefined,
    );
  }, RECOVER_EVERY_MS);
  recoveryTimer.unref?.();
  void recoverPending().catch(() => undefined);

  bb.onDispose(async () => {
    draining = true;
    clearInterval(recoveryTimer);
    if (inFlight.size > 0) {
      warn(`reload: waiting up to ${DRAIN_MS / 1000}s for ${inFlight.size} running job(s)`);
      await Promise.race([
        Promise.allSettled([...inFlight]),
        new Promise<void>((resolve) => setTimeout(resolve, DRAIN_MS).unref?.()),
      ]);
    }
    warn("disposed");
  });
}

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  FAL_ENDPOINTS,
  KIE_MODELS,
  MODEL_IDS,
  pickSecret,
  resolveRoute,
} from "./src/models.js";
import { findProfile, parseProfiles, profileSchema, type PersonProfile } from "./src/profiles.js";
import { composePrompt } from "./src/prompt.js";
import { falGenerate, kieGenerate } from "./src/providers.js";
import { encodeWebp, imageSize, WEBP_FULL, WEBP_THUMB } from "./src/encode-webp.js";
import { enabledFromSettings, mergeSettings, type StudioSettings } from "./src/settings.js";
import {
  GENERATE_PICKER_ID,
  lastChoiceSchema,
  modelUsesResolution,
  parseLastChoice,
  pickerResponseSchema,
  resolvePickerSelection,
  type LastChoice,
} from "./src/formats.js";

const ENV_CATALOG_PLUGIN_ID = "env-catalog";
const SETTINGS_KEY = "settings";
const PROFILES_KEY = "profiles";
const LAST_GENERATE_KEY = "last-generate";
const LAST_GENERATE_RES_2K = "last-generate-res-default-2k";
const CHANGED = "image-studio-changed";

const generationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  createdAt: z.string(),
  prompt: z.string(),
  composedPrompt: z.string(),
  model: z.string(),
  gateway: z.string(),
  profileId: z.string().nullable(),
  profileName: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  projectPath: z.string().nullable(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type Generation = z.infer<typeof generationSchema>;

const secretFileSchema = z.object({
  falApiKey: z.string().default(""),
  kieApiKey: z.string().default(""),
});

export const rpcContract = defineRpcContract({
  snapshot: {
    input: z.object({ projectId: z.string().nullable() }),
    output: z.object({
      settings: z.object({
        nanoBanana2: z.boolean(),
        nanoBananaPro: z.boolean(),
        museImage: z.boolean(),
        defaultGateway: z.enum(["fal", "kie"]),
        falKeyCatalog: z.string(),
        kieKeyCatalog: z.string(),
        uiLocale: z.enum(["auto", "en", "ru"]),
      }),
      secrets: z.object({
        falConfigured: z.boolean(),
        kieConfigured: z.boolean(),
      }),
      catalog: z.object({ available: z.boolean(), names: z.array(z.string()) }),
      profiles: z.array(profileSchema),
      generations: z.array(generationSchema),
      lastGenerate: lastChoiceSchema.nullable(),
    }),
  },
  update_settings: {
    input: z.object({
      nanoBanana2: z.boolean().optional(),
      nanoBananaPro: z.boolean().optional(),
      museImage: z.boolean().optional(),
      defaultGateway: z.enum(["fal", "kie"]).optional(),
      falKeyCatalog: z.string().optional(),
      kieKeyCatalog: z.string().optional(),
      uiLocale: z.enum(["auto", "en", "ru"]).optional(),
    }),
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
      slot: z.enum(["selfie-0", "selfie-1", "selfie-2", "manicure"]),
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
      kind: z.enum(["selfie", "manicure"]).default("selfie"),
    }),
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
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
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
});

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function restAfter(argv: string[], command: string): string {
  const skip = new Set(["--model", "--gateway", "--profile", "--aspect", "--resolution", "--json"]);
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

  const rootDir = join(bb.server.experimental_dataDir, "plugins", bb.pluginId);
  const secretsFile = join(rootDir, "secrets.json");

  async function ensureRoot(): Promise<void> {
    await mkdir(rootDir, { recursive: true });
  }

  async function readSettings(): Promise<StudioSettings> {
    return mergeSettings(await bb.storage.kv.get<unknown>(SETTINGS_KEY));
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
        bb.log.warn(`fal catalog key: ${describe(error)}`);
      }
    }
    if (settings.kieKeyCatalog) {
      try {
        kieCatalog = await catalogValue(settings.kieKeyCatalog);
      } catch (error) {
        bb.log.warn(`kie catalog key: ${describe(error)}`);
      }
    }
    return {
      fal: pickSecret(stored.falApiKey, falCatalog),
      kie: pickSecret(stored.kieApiKey, kieCatalog),
    };
  }

  async function readProfileList(): Promise<PersonProfile[]> {
    return parseProfiles(await bb.storage.kv.get<unknown>(PROFILES_KEY));
  }

  async function writeProfileList(profiles: PersonProfile[]): Promise<void> {
    await bb.storage.kv.set(PROFILES_KEY, profiles);
    bb.realtime.publish(CHANGED, { kind: "profiles" });
  }

  async function readLastGenerate(): Promise<LastChoice | null> {
    const last = parseLastChoice(await bb.storage.kv.get<unknown>(LAST_GENERATE_KEY));
    const moved = await bb.storage.kv.get<boolean>(LAST_GENERATE_RES_2K);
    if (moved === true) return last;
    await bb.storage.kv.set(LAST_GENERATE_RES_2K, true);
    if (last?.resolution === "1K") {
      const next = { ...last, resolution: "2K" as const };
      await writeLastGenerate(next);
      return next;
    }
    return last;
  }

  async function writeLastGenerate(choice: LastChoice): Promise<void> {
    await bb.storage.kv.set(LAST_GENERATE_KEY, choice);
  }

  const STUDIO_GALLERY = "studio";

  function generationsKey(projectId: string): string {
    return `generations:${projectId}`;
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
    if (dirty) await bb.storage.kv.set(generationsKey(projectId), items);
    return items;
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
    await bb.storage.kv.set(generationsKey(STUDIO_GALLERY), collected);
    return collected;
  }

  async function writeGenerations(projectId: string, items: Generation[]): Promise<void> {
    await bb.storage.kv.set(generationsKey(projectId), items);
    const studio = await readGenerations(STUDIO_GALLERY);
    const incoming = new Set(items.map((item) => item.id));
    const merged = [...items, ...studio.filter((item) => !incoming.has(item.id))].slice(0, 80);
    await bb.storage.kv.set(generationsKey(STUDIO_GALLERY), merged);
    bb.realtime.publish(CHANGED, { kind: "generations", projectId });
  }

  function profileDir(id: string): string {
    return join(rootDir, "profiles", id);
  }

  function generationPath(projectId: string, filename: string): string {
    return join(rootDir, "generations", projectId, filename);
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
      try {
        const bytes = await readFile(thumbPath);
        return { mimeType: "image/webp", base64: bytes.toString("base64") };
      } catch {
        const source = await readFile(sourcePath);
        const thumb = await encodeWebp(source, WEBP_THUMB);
        await writeFile(thumbPath, thumb);
        return { mimeType: "image/webp", base64: thumb.toString("base64") };
      }
    }

    try {
      const bytes = await readFile(webpPath);
      return { mimeType: "image/webp", base64: bytes.toString("base64") };
    } catch {
      const source = await readFile(sourcePath);
      const webp = await encodeWebp(source, WEBP_FULL);
      await writeFile(webpPath, webp);
      return { mimeType: "image/webp", base64: webp.toString("base64") };
    }
  }

  async function photoDataUris(profile: PersonProfile): Promise<string[]> {
    const uris: string[] = [];
    const selfies = [...profile.photos].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    for (const photo of selfies) {
      try {
        const bytes = await readFile(join(profileDir(profile.id), photo.filename));
        uris.push(`data:${photo.mimeType};base64,${bytes.toString("base64")}`);
      } catch (error) {
        bb.log.warn(`profile photo missing: ${describe(error)}`);
      }
    }
    if (profile.gender === "female" && profile.manicurePhoto) {
      try {
        const bytes = await readFile(join(profileDir(profile.id), profile.manicurePhoto.filename));
        uris.push(`data:${profile.manicurePhoto.mimeType};base64,${bytes.toString("base64")}`);
      } catch (error) {
        bb.log.warn(`manicure photo missing: ${describe(error)}`);
      }
    }
    return uris;
  }

  async function runGenerate(input: {
    projectId: string | null;
    prompt: string;
    model?: string;
    gateway?: string;
    profile?: string;
    aspectRatio?: string;
    resolution?: string;
    cwd?: string;
    hostId?: string;
  }): Promise<Generation> {
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

    const composedPrompt = composePrompt({
      userPrompt: input.prompt,
      model: route.model,
      profile: profile
        ? {
            name: profile.name,
            gender: profile.gender,
            age: profile.age,
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            bodyType: profile.bodyType,
            bust: profile.bust,
            photoCount: profile.photos.length,
            hasManicure: Boolean(profile.gender === "female" && profile.manicurePhoto),
          }
        : undefined,
    });

    const references = profile ? await photoDataUris(profile) : [];
    const job = {
      prompt: composedPrompt,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      referenceDataUris: references,
    };

    const falEndpoint =
      references.length > 0 ? FAL_ENDPOINTS[route.model].edit : FAL_ENDPOINTS[route.model].generate;
    const result =
      route.gateway === "kie"
        ? await kieGenerate(keys.kie!, KIE_MODELS[route.model]!, job)
        : await falGenerate(keys.fal!, falEndpoint, job);

    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) throw new Error(`Could not download the generated image (${imageResponse.status})`);
    const original = Buffer.from(await imageResponse.arrayBuffer());
    const display = await encodeWebp(original, WEBP_FULL);
    const thumb = await encodeWebp(display, WEBP_THUMB);
    const size = (await imageSize(display)) ?? (await imageSize(original));
    const id = randomUUID().slice(0, 8);
    const filename = `${id}.webp`;
    const projectId = input.projectId ?? "unscoped";
    await mkdir(join(rootDir, "generations", projectId), { recursive: true });
    await writeFile(generationPath(projectId, filename), display);
    await writeFile(generationPath(projectId, `${id}.thumb.webp`), thumb);

    let projectPath: string | null = null;
    if (input.cwd) {
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
        bb.log.warn(`project copy skipped: ${describe(error)}`);
      }
    }

    const record: Generation = {
      id,
      projectId,
      createdAt: new Date().toISOString(),
      prompt: input.prompt,
      composedPrompt,
      model: route.model,
      gateway: route.gateway,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
      filename,
      mimeType: "image/webp",
      projectPath,
      width: size?.width,
      height: size?.height,
    };
    await writeGenerations(projectId, [record, ...(await readGenerations(projectId))].slice(0, 80));
    const remembered = parseLastChoice({
      model: record.model,
      gateway: record.gateway,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
    });
    if (remembered) await writeLastGenerate(remembered);
    else {
      const last = await readLastGenerate();
      const merged = resolvePickerSelection({
        enabled: enabledFromSettings(settings),
        defaultGateway: settings.defaultGateway,
        last,
        suggestedModel: record.model,
        suggestedGateway: record.gateway,
        suggestedAspect: input.aspectRatio,
        suggestedResolution: input.resolution,
      });
      await writeLastGenerate(merged);
    }
    return record;
  }

  bb.rpc.register(rpcContract, {
    snapshot: async ({ projectId }) => {
      const [settings, secrets, catalog, profiles, generations, lastGenerate] = await Promise.all([
        readSettings(),
        readSecrets(),
        catalogKeys(),
        readProfileList(),
        readStudioGallery(projectId),
        readLastGenerate(),
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
      };
    },
    update_settings: async (patch) => {
      const current = await readSettings();
      const next = { ...current };
      if (patch.nanoBanana2 !== undefined) next.nanoBanana2 = patch.nanoBanana2;
      if (patch.nanoBananaPro !== undefined) next.nanoBananaPro = patch.nanoBananaPro;
      if (patch.museImage !== undefined) next.museImage = patch.museImage;
      if (patch.defaultGateway !== undefined) next.defaultGateway = patch.defaultGateway;
      if (patch.falKeyCatalog !== undefined) next.falKeyCatalog = patch.falKeyCatalog;
      if (patch.kieKeyCatalog !== undefined) next.kieKeyCatalog = patch.kieKeyCatalog;
      if (patch.uiLocale !== undefined) next.uiLocale = patch.uiLocale;
      await writeSettings(next);
      return { saved: true };
    },
    set_secret: async ({ slot, value }) => {
      const current = await readSecrets();
      current[slot] = value.trim();
      await writeSecrets(current);
      bb.realtime.publish(CHANGED, { kind: "secrets" });
      return { saved: true };
    },
    save_profile: async (input) => {
      const profiles = await readProfileList();
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
        if (input.gender === "male") existing.manicurePhoto = null;
        existing.updatedAt = now;
        await writeProfileList(profiles);
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
        photos: [],
        manicurePhoto: null,
        createdAt: now,
        updatedAt: now,
      };
      await writeProfileList([...profiles, created]);
      return created;
    },
    delete_profile: async ({ id }) => {
      const profiles = await readProfileList();
      const next = profiles.filter((item) => item.id !== id);
      if (next.length === profiles.length) return { removed: false };
      await writeProfileList(next);
      return { removed: true };
    },
    add_photo: async ({ profileId, slot, filename, mimeType, base64 }) => {
      const profiles = await readProfileList();
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      if (slot === "manicure" && profile.gender !== "female") {
        throw new Error("Manicure photos are only stored on female profiles.");
      }
      const id = randomUUID().slice(0, 8);
      const safeName = `${id}-${filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}`;
      await mkdir(profileDir(profile.id), { recursive: true });
      await writeFile(join(profileDir(profile.id), safeName), Buffer.from(base64, "base64"));
      const record = { id, filename: safeName, mimeType };
      if (slot === "manicure") {
        profile.manicurePhoto = record;
      } else {
        const selfieSlot = Number(slot.slice(-1)) as 0 | 1 | 2;
        profile.photos = profile.photos.filter((photo) => (photo.slot ?? 0) !== selfieSlot);
        profile.photos.push({ ...record, slot: selfieSlot });
        profile.photos.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
      }
      profile.updatedAt = new Date().toISOString();
      await writeProfileList(profiles);
      return profile;
    },
    remove_photo: async ({ profileId, photoId, kind }) => {
      const profiles = await readProfileList();
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      if (kind === "manicure") {
        if (profile.manicurePhoto?.id === photoId) profile.manicurePhoto = null;
      } else {
        profile.photos = profile.photos.filter((photo) => photo.id !== photoId);
      }
      profile.updatedAt = new Date().toISOString();
      await writeProfileList(profiles);
      return profile;
    },
    profile_photo_preview: async ({ profileId, photoId }) => {
      const profiles = await readProfileList();
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error("Profile not found");
      const photo =
        profile.photos.find((item) => item.id === photoId) ??
        (profile.manicurePhoto?.id === photoId ? profile.manicurePhoto : null);
      if (!photo) throw new Error("Photo not found");
      const bytes = await readFile(join(profileDir(profile.id), photo.filename));
      return { mimeType: photo.mimeType, base64: bytes.toString("base64") };
    },
    generate: async (input) => {
      let cwd: string | undefined;
      let hostId: string | undefined;
      if (input.projectId) {
        try {
          const project = await bb.sdk.projects.get({ projectId: input.projectId });
          const source = project.sources[0];
          cwd = source?.path;
          hostId = source?.hostId;
        } catch (error) {
          bb.log.warn(`project path: ${describe(error)}`);
        }
      }
      return runGenerate({ ...input, cwd, hostId });
    },
    generation_preview: async ({ id, projectId, variant }) => {
      const items = await readStudioGallery(projectId);
      const item = items.find((entry) => entry.id === id) ?? (await readGenerations(projectId)).find((entry) => entry.id === id);
      if (!item) throw new Error("Generation not found");
      return previewGeneration(item, variant ?? "thumb");
    },
  });

  const usage = [
    "Usage:",
    "  bb image-studio generate --prompt <text> [--model nano-banana-2|nano-banana-pro|muse-image]",
    "                           [--gateway fal|kie] [--profile <name>] [--aspect 1:1] [--json]",
    "  bb image-studio profiles [--json]",
    "  bb image-studio models [--json]",
  ].join("\n");

  bb.cli.register({
    name: "image-studio",
    summary: "Generate images for the current BB project through fal.ai or kie.ai",
    commands: [
      {
        name: "generate",
        summary: "Generate an image and save it under the project",
        usage: "bb image-studio generate --prompt <text> [--model nano-banana-2] [--profile Name]",
      },
      {
        name: "profiles",
        summary: "List people profiles",
        usage: "bb image-studio profiles [--json]",
      },
      {
        name: "models",
        summary: "Show enabled models and whether keys are present",
        usage: "bb image-studio models [--json]",
      },
    ],
    async run(argv, ctx) {
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
            profiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
              gender: profile.gender,
              selfies: profile.photos.length,
              manicure: Boolean(profile.manicurePhoto),
            })),
            profiles.length === 0
              ? "No people profiles."
              : profiles
                  .map((profile) => {
                    const nails = profile.manicurePhoto ? ", manicure" : "";
                    return `${profile.name} (${profile.id}, ${profile.photos.length} selfies${nails})`;
                  })
                  .join("\n"),
          );
        }
        case "models": {
          const settings = await readSettings();
          const keys = await resolvedKeys();
          const payload = {
            enabled: enabledFromSettings(settings),
            defaultGateway: settings.defaultGateway,
            falKey: Boolean(keys.fal),
            kieKey: Boolean(keys.kie),
          };
          return reply(
            payload,
            [
              `Nano Banana 2: ${settings.nanoBanana2 ? "on" : "off"}`,
              `Nano Banana Pro: ${settings.nanoBananaPro ? "on" : "off"}`,
              `Muse Image: ${settings.museImage ? "on" : "off"}`,
              `Preferred gateway: ${settings.defaultGateway}`,
              `fal.ai key: ${keys.fal ? "yes" : "no"}`,
              `kie.ai key: ${keys.kie ? "yes" : "no"}`,
            ].join("\n"),
          );
        }
        case "generate": {
          const prompt = flag(argv, "--prompt") || restAfter(argv, "generate");
          if (!prompt) return { exitCode: 1, stderr: usage };
          try {
            const record = await runGenerate({
              projectId: ctx.projectId ?? null,
              prompt,
              model: flag(argv, "--model"),
              gateway: flag(argv, "--gateway"),
              profile: flag(argv, "--profile"),
              aspectRatio: flag(argv, "--aspect"),
              resolution: flag(argv, "--resolution"),
              cwd: ctx.cwd,
            });
            return reply(
              record,
              `Saved ${record.filename} via ${record.model} on ${record.gateway}${record.projectPath ? `\n${record.projectPath}` : ""}`,
            );
          } catch (error) {
            return { exitCode: 1, stderr: describe(error) };
          }
        }
      }
      return { exitCode: 1, stderr: usage };
    },
  });

  bb.agents.registerTool({
    name: "image_studio_generate",
    description:
      "Generate a project photo through Image Studio. Always call this instead of the CLI when chatting with the user: it opens buttons for model, aspect ratio, and size with the last choice preselected. Nano Banana size defaults to 2K. Wait for Send.",
    instructions:
      "When the user wants a photo, call image_studio_generate with the scene prompt (and profile name if they named a person). Do not pass model/aspect/size unless the user named them this turn. Do not run bb image-studio generate in chat — that skips the picker. Wait until the user presses Send.",
    presentation: {
      label: { pending: "Waiting to generate a photo", completed: "Generated a photo" },
      icon: { glyph: "Palette" },
    },
    parameters: z.object({
      prompt: z.string().min(1),
      profile: z.string().optional(),
      model: z.string().optional(),
      gateway: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional(),
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
                models: MODEL_IDS.map((id) => ({
                  id,
                  enabled:
                    id === "nano-banana-2"
                      ? settings.nanoBanana2
                      : id === "nano-banana-pro"
                        ? settings.nanoBananaPro
                        : settings.museImage,
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
          bb.log.warn(`project path: ${describe(error)}`);
        }
      }

      try {
        const record = await runGenerate({
          projectId: ctx.projectId || null,
          prompt: input.prompt,
          model: choice.data.model,
          gateway: choice.data.gateway,
          profile: profile?.name ?? input.profile,
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
        ]
          .filter(Boolean)
          .join("\n");
      } catch (error) {
        return { content: [{ type: "text", text: describe(error) }], isError: true };
      }
    },
  });

  bb.agents.configure(() => ({
    tools: ["image_studio_generate"],
    skills: ["image-studio"],
  }));

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}

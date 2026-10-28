import { z } from "zod";
import { slugify } from "./gui.ts";

export const ITEM_STEPS = [
  "concept",
  "blueprint",
  "model",
  "uv-guide",
  "texture",
  "preview",
  "export",
] as const;
export type ItemStep = (typeof ITEM_STEPS)[number];

export const ITEM_STEP_STATUSES = ["empty", "running", "done"] as const;
export type ItemStepStatus = (typeof ITEM_STEP_STATUSES)[number];

export const ITEM_SELECTED_BY = ["agent", "user", "cli"] as const;
export type ItemSelectedBy = (typeof ITEM_SELECTED_BY)[number];

export const ITEM_ENTRY_SOURCES = ["generated", "attached"] as const;
export type ItemEntrySource = (typeof ITEM_ENTRY_SOURCES)[number];

export const itemEntrySchema = z.object({
  id: z.string().min(1),
  source: z.enum(ITEM_ENTRY_SOURCES),
  createdAt: z.string(),
  files: z.record(z.string(), z.string()),
  prompt: z.string().optional(),
  model: z.string().optional(),
  gateway: z.string().optional(),
  priceUsd: z.number().nullable().optional(),
  runFolder: z.string().optional(),
  note: z.string().optional(),
});
export type ItemEntry = z.infer<typeof itemEntrySchema>;

export const itemStepSchema = z.object({
  status: z.enum(ITEM_STEP_STATUSES),
  selected: z.string().nullable(),
  selectedBy: z.enum(ITEM_SELECTED_BY).nullable(),
  entries: z.array(itemEntrySchema),
});
export type ItemStepState = z.infer<typeof itemStepSchema>;

export const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  project: z.string().min(1),
  gameId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.record(z.enum(ITEM_STEPS), itemStepSchema),
});
export type Item = z.infer<typeof itemSchema>;

export const itemIndexRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  steps: z.record(z.enum(ITEM_STEPS), z.enum(ITEM_STEP_STATUSES)),
  thumbnails: z.record(z.string(), z.string()).default({}),
});
export type ItemIndexRow = z.infer<typeof itemIndexRowSchema>;

export function emptyItemSteps(): Record<ItemStep, ItemStepState> {
  const steps = {} as Record<ItemStep, ItemStepState>;
  for (const step of ITEM_STEPS) {
    steps[step] = { status: "empty", selected: null, selectedBy: null, entries: [] };
  }
  return steps;
}

export function createItem(input: {
  id: string;
  name?: string;
  project: string;
  gameId?: string | null;
  now?: string;
}): Item {
  const now = input.now ?? new Date().toISOString();
  const slug = slugify(input.id, "item");
  return itemSchema.parse({
    id: slug,
    name: input.name?.trim() || slug,
    project: input.project,
    gameId: input.gameId ?? null,
    createdAt: now,
    updatedAt: now,
    steps: emptyItemSteps(),
  });
}

export function stepStatus(item: Item, step: ItemStep): ItemStepStatus {
  return item.steps[step].status;
}

export function addEntry(
  item: Item,
  step: ItemStep,
  entry: ItemEntry,
  options?: { select?: boolean; selectedBy?: ItemSelectedBy | null },
): Item {
  const state = item.steps[step];
  const entries = [...state.entries, entry];
  let selected = state.selected;
  let selectedBy = state.selectedBy;
  let status = state.status;
  if (options?.select) {
    selected = entry.id;
    selectedBy = options.selectedBy ?? "cli";
    status = "done";
  } else if (
    step !== "texture" &&
    step !== "preview" &&
    entries.length > 0 &&
    status === "empty"
  ) {
    status = "done";
  }
  const now = new Date().toISOString();
  return itemSchema.parse({
    ...item,
    updatedAt: now,
    steps: {
      ...item.steps,
      [step]: { ...state, entries, selected, selectedBy, status },
    },
  });
}

export function isTextureTakeFolderName(name: string): boolean {
  return /^take-\d+$/i.test(name.trim());
}

export function takeNameFromFolder(folder: string): string {
  const normalized = folder.replace(/\\/g, "/").replace(/\/$/, "");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

/** Resolve take folder paths under a texture-uv run root (or a single take folder). */
export function resolveTakeFolderPaths(runFolder: string, listedChildNames: readonly string[]): string[] {
  const base = runFolder.replace(/\\/g, "/").replace(/\/$/, "");
  const baseName = takeNameFromFolder(base);
  if (isTextureTakeFolderName(baseName)) return [base];
  const takes = listedChildNames
    .filter((name) => isTextureTakeFolderName(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => joinPosix(base, name));
  return takes;
}

export function buildAttachEntriesForTextureUvRun(
  runFolder: string,
  step: "texture" | "preview",
  takeFolderPaths: readonly string[],
): ItemEntry[] {
  if (takeFolderPaths.length === 0) {
    const need = step === "texture" ? "color.png" : "preview.png";
    throw new Error(`No take folders with ${need} under "${runFolder}".`);
  }
  return takeFolderPaths.map((takeFolder) => {
    const takeName = takeNameFromFolder(takeFolder);
    const files: Record<string, string> =
      step === "texture"
        ? { color: joinPosix(takeFolder, "color.png"), manifest: joinPosix(takeFolder, "manifest.json") }
        : { preview: joinPosix(takeFolder, "preview.png") };
    return {
      id: takeName,
      source: "attached",
      createdAt: new Date().toISOString(),
      runFolder: takeFolder,
      files,
    };
  });
}

function previewEntryForTextureTake(item: Item, takeFolder: string, takeName: string): ItemEntry | undefined {
  return item.steps.preview.entries.find(
    (e) => e.runFolder === takeFolder || e.id === takeName || e.files.preview === joinPosix(takeFolder, "preview.png"),
  );
}

export function previewSatisfiedForSelectedTexture(item: Item): boolean {
  const texId = item.steps.texture.selected;
  if (!texId) return false;
  const tex = item.steps.texture.entries.find((e) => e.id === texId);
  if (!tex) return false;
  const takeFolder = textureTakeDirFromEntry(tex);
  const takeName = takeNameFromFolder(takeFolder);
  const previewId = item.steps.preview.selected;
  if (previewId) {
    const selected = item.steps.preview.entries.find((e) => e.id === previewId);
    if (selected && (selected.runFolder === takeFolder || selected.id === takeName)) return true;
  }
  return Boolean(previewEntryForTextureTake(item, takeFolder, takeName));
}

export function stepIsDone(item: Item, step: ItemStep): boolean {
  const state = item.steps[step];
  if (state.status === "done") return true;
  if (step === "preview" && previewSatisfiedForSelectedTexture(item)) return true;
  return false;
}

function selectStepOnly(item: Item, step: ItemStep, entryId: string, by: ItemSelectedBy): Item {
  const state = item.steps[step];
  if (!state.entries.some((e) => e.id === entryId)) {
    throw new Error(`No entry "${entryId}" on step ${step}.`);
  }
  const now = new Date().toISOString();
  return itemSchema.parse({
    ...item,
    updatedAt: now,
    steps: {
      ...item.steps,
      [step]: { ...state, selected: entryId, selectedBy: by, status: "done" },
    },
  });
}

function selectTextureTake(item: Item, entryId: string, by: ItemSelectedBy): Item {
  let next = selectStepOnly(item, "texture", entryId, by);
  const tex = next.steps.texture.entries.find((e) => e.id === entryId);
  if (!tex) return next;
  const takeFolder = textureTakeDirFromEntry(tex);
  const takeName = takeNameFromFolder(takeFolder);
  let preview = previewEntryForTextureTake(next, takeFolder, takeName);
  if (!preview) {
    preview = {
      id: takeName,
      source: "attached",
      createdAt: new Date().toISOString(),
      runFolder: takeFolder,
      files: { preview: joinPosix(takeFolder, "preview.png") },
    };
    next = addEntry(next, "preview", preview, { select: false });
  }
  return selectStepOnly(next, "preview", preview.id, by);
}

export function selectEntry(item: Item, step: ItemStep, entryId: string, by: ItemSelectedBy): Item {
  if (step === "texture") return selectTextureTake(item, entryId, by);
  return selectStepOnly(item, step, entryId, by);
}

export function detachEntry(item: Item, step: ItemStep, entryId: string): Item {
  const state = item.steps[step];
  if (!state.entries.some((e) => e.id === entryId)) {
    throw new Error(`No entry "${entryId}" on step ${step}.`);
  }
  const removed = state.entries.find((e) => e.id === entryId);
  const entries = state.entries.filter((e) => e.id !== entryId);
  let selected = state.selected === entryId ? null : state.selected;
  let selectedBy = selected ? state.selectedBy : null;
  let status: ItemStepStatus = entries.length === 0 ? "empty" : selected ? "done" : "empty";
  if (entries.length > 0 && !selected && step !== "texture" && step !== "preview") {
    status = state.status === "running" ? "running" : "empty";
  }
  const now = new Date().toISOString();
  let steps = {
    ...item.steps,
    [step]: { ...state, entries, selected, selectedBy, status },
  };
  if (step === "texture" && removed && state.selected === entryId) {
    const takeFolder = removed.runFolder ?? textureTakeDirFromEntry(removed);
    const takeName = takeNameFromFolder(takeFolder);
    const previewState = steps.preview;
    if (
      previewState.selected &&
      previewState.entries.find((e) => e.id === previewState.selected)?.runFolder === takeFolder
    ) {
      steps = {
        ...steps,
        preview: { ...previewState, selected: null, selectedBy: null, status: previewState.entries.length ? "empty" : "empty" },
      };
    }
  }
  return itemSchema.parse({ ...item, updatedAt: now, steps });
}

export function setStepRunning(item: Item, step: ItemStep): Item {
  const now = new Date().toISOString();
  return itemSchema.parse({
    ...item,
    updatedAt: now,
    steps: {
      ...item.steps,
      [step]: { ...item.steps[step], status: "running" },
    },
  });
}

export function nextStep(item: Item): ItemStep | null {
  for (const step of ITEM_STEPS) {
    if (!stepIsDone(item, step)) return step;
  }
  return null;
}

export function itemSummary(item: Item): string {
  const lines = [`Item ${item.name} (${item.id}) — project ${item.project}`];
  for (const step of ITEM_STEPS) {
    const s = item.steps[step];
    const mark = s.status === "done" ? "✓" : s.status === "running" ? "…" : "—";
    const pick = s.selected ? ` selected ${s.selected}` : s.entries.length ? ` ${s.entries.length} entr${s.entries.length === 1 ? "y" : "ies"}` : "";
    lines.push(`  ${mark} ${step}${pick}`);
  }
  const next = nextStep(item);
  if (next) {
    lines.push(`Continue with step "${next}".`);
    if (next === "concept") lines.push("Attach or generate a concept image.");
    else if (next === "blueprint") lines.push("Attach a blueprint run or generate blueprint from the concept.");
    else if (next === "model") lines.push("Attach an .fbx/.glb/.blend model file.");
    else if (next === "uv-guide") lines.push("Run texture-uv or attach a run with guide/mask/parts.");
    else if (next === "texture") lines.push("Run texture-uv or attach texture takes; select a take when ready.");
    else if (next === "preview") lines.push("Preview comes from texture takes.");
    else if (next === "export") lines.push("Run item export when a texture take is selected.");
  } else {
    lines.push("All steps are done.");
  }
  return lines.join("\n");
}

export function priceFor(model: string, gateway: string, resolution?: string): number | null {
  const m = model.trim().toLowerCase();
  const g = gateway.trim().toLowerCase();
  if ((m === "muse-image" || m === "muse") && g === "fal") return 0.01;
  if (m === "nano-banana-2.1" && g === "kie" && (resolution === undefined || resolution === "1K")) return 0.02;
  return null;
}

export function itemJsonRelPath(modelProjectSlug: string, itemId: string): string {
  return joinPosix("image-studio", "model", modelProjectSlug, "items", itemId, "item.json");
}

export function itemRunRelPath(modelProjectSlug: string, itemId: string, step: string, runId: string): string {
  return joinPosix("image-studio", "model", modelProjectSlug, "items", itemId, `${step}-${runId}`);
}

export function itemExportRelDir(modelProjectSlug: string, itemId: string): string {
  return joinPosix("image-studio", "model", modelProjectSlug, "items", itemId, "export");
}

export const itemExportFilesSchema = z.object({
  fbx: z.string(),
  blend: z.string(),
  color: z.string(),
  normal: z.string(),
  roughness: z.string().optional(),
  metal: z.string().optional(),
});

export const itemExportJsonSchema = z.object({
  item: z.string(),
  files: itemExportFilesSchema,
  fbxScale: z.number().positive(),
  uvLayer: z.string(),
  roblox: z.object({
    meshPart: z.string(),
    surfaceAppearance: z.object({
      ColorMap: z.string(),
      NormalMap: z.string(),
      RoughnessMap: z.string().optional(),
      MetalnessMap: z.string().optional(),
    }),
  }),
  notes: z.array(z.string()).default([]),
});
export type ItemExportJson = z.infer<typeof itemExportJsonSchema>;

export function buildItemExportJson(input: {
  itemId: string;
  files: z.infer<typeof itemExportFilesSchema>;
  fbxScale: number;
  uvLayer: string;
  notes?: string[];
}): ItemExportJson {
  const notes = [...(input.notes ?? [])];
  if (input.files.roughness) notes.push("roughness map uses the source model UV, not ImageStudioUV");
  if (input.files.metal) notes.push("metalness map uses the source model UV, not ImageStudioUV");
  return itemExportJsonSchema.parse({
    item: input.itemId,
    files: input.files,
    fbxScale: input.fbxScale,
    uvLayer: input.uvLayer,
    roblox: {
      meshPart: input.files.fbx,
      surfaceAppearance: {
        ColorMap: input.files.color,
        NormalMap: input.files.normal,
        ...(input.files.roughness ? { RoughnessMap: input.files.roughness } : {}),
        ...(input.files.metal ? { MetalnessMap: input.files.metal } : {}),
      },
    },
    notes,
  });
}

export function requireSelectedTextureEntry(item: Item): ItemEntry {
  const state = item.steps.texture;
  const id = state.selected;
  if (!id) {
    throw new Error(`Item "${item.id}" has no selected texture entry on step texture. Select a take first.`);
  }
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) {
    throw new Error(`Item "${item.id}" selected texture entry "${id}" is missing.`);
  }
  const color = entry.files.color ?? Object.values(entry.files)[0];
  if (!color) {
    throw new Error(`Item "${item.id}" texture entry "${id}" has no color file.`);
  }
  return entry;
}

export function textureTakeDirFromEntry(entry: ItemEntry): string {
  if (entry.runFolder) return entry.runFolder.replace(/\\/g, "/");
  const color = entry.files.color;
  if (!color) throw new Error("Texture entry has no run folder or color path.");
  const normalized = color.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : normalized;
}

export function recordExportGenerated(
  item: Item,
  exportDir: string,
  files: Record<string, string>,
  selectedBy: ItemSelectedBy = "cli",
): Item {
  const entry: ItemEntry = {
    id: newItemEntryId("export"),
    source: "generated",
    createdAt: new Date().toISOString(),
    runFolder: exportDir,
    files,
  };
  return addEntry(item, "export", entry, { select: true, selectedBy });
}

function joinPosix(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}

export function itemIndexFromItem(item: Item): ItemIndexRow {
  const steps = {} as Record<ItemStep, ItemStepStatus>;
  const thumbnails: Record<string, string> = {};
  for (const step of ITEM_STEPS) {
    steps[step] = item.steps[step].status;
    const selected = item.steps[step].selected;
    const entry = selected ? item.steps[step].entries.find((e) => e.id === selected) : item.steps[step].entries[0];
    if (entry) {
      const thumb =
        entry.files.preview ??
        entry.files.concept ??
        entry.files.sheet ??
        entry.files.guide ??
        entry.files.color ??
        Object.values(entry.files)[0];
      if (thumb) thumbnails[step] = thumb;
    }
  }
  return itemIndexRowSchema.parse({
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    steps,
    thumbnails,
  });
}

export function selectedEntryFiles(item: Item, step: ItemStep): Record<string, string> | null {
  const state = item.steps[step];
  const id = state.selected ?? state.entries[0]?.id;
  if (!id) return null;
  const entry = state.entries.find((e) => e.id === id);
  return entry?.files ?? null;
}

export function resolveTextureUvInputsFromItem(
  item: Item,
  overrides: { modelPath?: string; conceptImage?: string },
): { modelPath: string; conceptImage?: string } {
  const modelPath =
    overrides.modelPath ??
    selectedEntryFiles(item, "model")?.model ??
    selectedEntryFiles(item, "model")?.file ??
    Object.values(selectedEntryFiles(item, "model") ?? {})[0];
  if (!modelPath) {
    throw new Error(`Item "${item.id}" has no selected model on step model. Attach or select a model first.`);
  }
  const conceptFiles = selectedEntryFiles(item, "concept");
  const conceptImage =
    overrides.conceptImage ??
    conceptFiles?.concept ??
    conceptFiles?.image ??
    Object.values(conceptFiles ?? {})[0];
  return { modelPath, conceptImage };
}

export function resolveBlueprintConceptFromItem(item: Item, overrideConcept?: string): string {
  const concept =
    overrideConcept ??
    selectedEntryFiles(item, "concept")?.concept ??
    selectedEntryFiles(item, "concept")?.image ??
    Object.values(selectedEntryFiles(item, "concept") ?? {})[0];
  if (!concept) {
    throw new Error(`Item "${item.id}" has no selected concept on step concept. Attach or select a concept first.`);
  }
  return concept;
}

export type ItemCliAction = "create" | "list" | "show" | "attach" | "select" | "detach" | "export";

export type ItemCliParsed =
  | { action: "create"; item: string; name?: string }
  | { action: "list" }
  | { action: "show"; item: string; json?: boolean }
  | { action: "export"; item: string; scale?: string }
  | {
      action: "attach";
      item: string;
      step: ItemStep;
      file?: string;
      image?: string;
      run?: string;
      select?: boolean;
    }
  | { action: "select"; item: string; step: ItemStep; entry: string }
  | { action: "detach"; item: string; step: ItemStep; entry: string };

export function parseItemCli(argv: readonly string[]): ItemCliParsed {
  const itemIdx = argv.indexOf("item");
  if (itemIdx < 0) throw new Error("Expected model item subcommand.");
  const sub = argv[itemIdx + 1];
  if (!sub) throw new Error("model item needs create|list|show|attach|select|detach|export.");
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (sub === "create") {
    const item = flag("--item");
    if (!item) throw new Error("item create requires --item <id>.");
    return { action: "create", item, name: flag("--name") };
  }
  if (sub === "list") return { action: "list" };
  if (sub === "show") {
    const item = flag("--item");
    if (!item) throw new Error("item show requires --item <id>.");
    return { action: "show", item, json: argv.includes("--json") };
  }
  if (sub === "select") {
    const item = flag("--item");
    const step = flag("--step") as ItemStep | undefined;
    const entry = flag("--entry");
    if (!item || !step || !entry) throw new Error("item select requires --item, --step, and --entry.");
    if (!ITEM_STEPS.includes(step)) throw new Error(`--step must be one of ${ITEM_STEPS.join(", ")}.`);
    return { action: "select", item, step, entry };
  }
  if (sub === "detach") {
    const item = flag("--item");
    const step = flag("--step") as ItemStep | undefined;
    const entry = flag("--entry");
    if (!item || !step || !entry) throw new Error("item detach requires --item, --step, and --entry.");
    if (!ITEM_STEPS.includes(step)) throw new Error(`--step must be one of ${ITEM_STEPS.join(", ")}.`);
    return { action: "detach", item, step, entry };
  }
  if (sub === "export") {
    const item = flag("--item");
    if (!item) throw new Error("item export requires --item <id>.");
    return { action: "export", item, scale: flag("--scale") };
  }
  if (sub === "attach") {
    const item = flag("--item");
    const step = flag("--step") as ItemStep | undefined;
    if (!item || !step) throw new Error("item attach requires --item and --step.");
    if (!ITEM_STEPS.includes(step)) throw new Error(`--step must be one of ${ITEM_STEPS.join(", ")}.`);
    const file = flag("--file");
    const image = flag("--image");
    const run = flag("--run");
    if (!file && !image && !run) throw new Error("item attach needs --file, --image, or --run.");
    return {
      action: "attach",
      item,
      step,
      file,
      image,
      run,
      select: argv.includes("--select"),
    };
  }
  throw new Error(`Unknown model item subcommand "${sub}".`);
}

export function newItemEntryId(prefix = "entry"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

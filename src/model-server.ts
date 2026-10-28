import { dirname, join } from "node:path";
import {
  addEntry,
  itemIndexRowSchema,
  itemJsonRelPath,
  newItemEntryId,
  type Item,
  type ItemEntry,
  type ItemIndexRow,
  type ItemSelectedBy,
  type ItemStep,
} from "./item.ts";

export const ITEM_INDEX_PREFIX = "item-index:" as const;

export function itemIndexKvKey(styleId: string): string {
  return `${ITEM_INDEX_PREFIX}${styleId}`;
}

export function parseItemIndex(raw: unknown): ItemIndexRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    const parsed = itemIndexRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Merge one row into the index list (newest updatedAt first). */
export function upsertItemIndex(rows: ItemIndexRow[], row: ItemIndexRow): ItemIndexRow[] {
  const rest = rows.filter((r) => r.id !== row.id);
  return [row, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function attachConceptEntry(pathOrGallery: string, source: "attached"): ItemEntry {
  const isGallery = !pathOrGallery.includes("/") && !pathOrGallery.includes("\\") && !pathOrGallery.includes(".");
  return {
    id: newItemEntryId("concept"),
    source,
    createdAt: new Date().toISOString(),
    files: isGallery ? { galleryId: pathOrGallery } : { concept: pathOrGallery },
  };
}

export function attachModelFileEntry(modelPath: string): ItemEntry {
  return {
    id: newItemEntryId("model"),
    source: "attached",
    createdAt: new Date().toISOString(),
    files: { model: modelPath },
  };
}

export function attachRunFolderEntry(step: ItemStep, runFolder: string, files: Record<string, string>): ItemEntry {
  return {
    id: newItemEntryId(step),
    source: "attached",
    createdAt: new Date().toISOString(),
    runFolder,
    files,
  };
}

/** Known files when attaching an existing texture-uv run folder (by reference). */
export function filesFromTextureRunFolder(runFolder: string): Record<string, string> {
  const base = runFolder.replace(/\\/g, "/").replace(/\/$/, "");
  return {
    guide: join(base, "guide.png"),
    mask: join(base, "mask.png"),
    parts: join(base, "parts.json"),
  };
}

export function filesFromBlueprintRunFolder(runFolder: string): Record<string, string> {
  const base = runFolder.replace(/\\/g, "/").replace(/\/$/, "");
  const blueprintDir = base.endsWith("/blueprint") ? base : join(base, "blueprint");
  return {
    sheet: join(blueprintDir, "sheet.png"),
    views: join(blueprintDir, "views.json"),
    dir: blueprintDir,
  };
}

export function filesFromTextureTakeFolder(takeFolder: string): Record<string, string> {
  const base = takeFolder.replace(/\\/g, "/").replace(/\/$/, "");
  return {
    color: join(base, "color.png"),
    preview: join(base, "preview.png"),
    manifest: join(base, "manifest.json"),
  };
}

export function recordBlueprintGenerated(
  item: Item,
  runFolder: string,
  files: Record<string, string>,
  meta: { prompt?: string; model?: string; gateway?: string; priceUsd?: number | null },
): Item {
  const entry: ItemEntry = {
    id: newItemEntryId("blueprint"),
    source: "generated",
    createdAt: new Date().toISOString(),
    runFolder,
    files,
    ...meta,
  };
  return addEntry(item, "blueprint", entry, { select: true, selectedBy: "agent" });
}

export function recordTextureUvGenerated(
  item: Item,
  runFolder: string,
  takes: Array<{ takeFolder: string; color: string; preview: string; manifest: string }>,
  guideFiles: { guide: string; mask: string; parts: string },
  meta: { prompt?: string; model?: string; gateway?: string; priceUsd?: number | null },
): Item {
  let next = item;
  const uvEntry: ItemEntry = {
    id: newItemEntryId("uv"),
    source: "generated",
    createdAt: new Date().toISOString(),
    runFolder,
    files: guideFiles,
    ...meta,
  };
  next = addEntry(next, "uv-guide", uvEntry, { select: true, selectedBy: "agent" });
  for (const take of takes) {
    const textureEntry: ItemEntry = {
      id: newItemEntryId("tex"),
      source: "generated",
      createdAt: new Date().toISOString(),
      runFolder: take.takeFolder,
      files: { color: take.color, manifest: take.manifest },
      ...meta,
    };
    next = addEntry(next, "texture", textureEntry, { select: false });
    const previewEntry: ItemEntry = {
      id: newItemEntryId("prev"),
      source: "generated",
      createdAt: new Date().toISOString(),
      runFolder: take.takeFolder,
      files: { preview: take.preview },
    };
    next = addEntry(next, "preview", previewEntry, { select: false });
  }
  return next;
}

export function itemJsonPathForProject(modelProjectSlug: string, itemId: string): string {
  return itemJsonRelPath(modelProjectSlug, itemId);
}

export function itemHostDir(modelProjectSlug: string, itemId: string): string {
  return dirname(itemJsonRelPath(modelProjectSlug, itemId));
}

export type ItemWriteContext = {
  selectedBy?: ItemSelectedBy;
};

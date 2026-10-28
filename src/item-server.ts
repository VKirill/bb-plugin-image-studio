import { z } from "zod";
import {
  ITEM_STEPS,
  ITEM_STEP_STATUSES,
  itemIndexRowSchema,
  itemSchema,
  type Item,
  type ItemIndexRow,
  type ItemStep,
  type ItemStepStatus,
} from "./item.ts";

export const itemThumbSchema = z.object({
  mimeType: z.string(),
  base64: z.string(),
});
export type ItemThumb = z.infer<typeof itemThumbSchema>;

export const itemWithThumbsSchema = itemSchema.extend({
  thumbnails: z.record(z.string(), z.record(z.string(), itemThumbSchema)).default({}),
});
export type ItemWithThumbs = z.infer<typeof itemWithThumbsSchema>;

export const itemIndexRowWithThumbsSchema = itemIndexRowSchema.extend({
  thumbs: z.record(z.string(), itemThumbSchema).default({}),
});
export type ItemIndexRowWithThumbs = z.infer<typeof itemIndexRowWithThumbsSchema>;

export interface StepStripItem {
  step: ItemStep;
  status: ItemStepStatus;
  mark: "✓" | "…" | "—";
  thumb?: ItemThumb;
}

export function stepStatusMark(status: ItemStepStatus): "✓" | "…" | "—" {
  if (status === "done") return "✓";
  if (status === "running") return "…";
  return "—";
}

export function buildStepStrip(
  steps: Record<ItemStep, ItemStepStatus>,
  thumbs?: Partial<Record<ItemStep, ItemThumb>>,
): StepStripItem[] {
  return ITEM_STEPS.map((step) => {
    const status = steps[step] ?? "empty";
    return {
      step,
      status,
      mark: stepStatusMark(status),
      ...(thumbs?.[step] ? { thumb: thumbs[step] } : {}),
    };
  });
}

export { buildAttachEntriesForTextureUvRun, resolveTakeFolderPaths } from "./item.ts";

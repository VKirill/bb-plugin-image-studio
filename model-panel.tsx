import { useEffect, useState } from "react";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ProjectPicker } from "./gui-panel";
import { t } from "./i18n";
import type { I18nKey, Locale } from "./i18n";
import { PALETTE_KEYS, type GuiStyle, type PaletteKey } from "./src/gui";
import {
  MODEL_CONCEPT_VIEWS,
  MODEL_TEXTURE_SIZES,
  parseModelPartsText,
  type ModelConceptView,
  type ModelMode,
  type ModelTakeWithThumbs,
  type ModelTextureSize,
} from "./src/model";
import { BLUEPRINT_VIEW_NAMES, type BlueprintStyle, type BlueprintViewName } from "./src/blueprint";
import type { RpcApi } from "./src/rpc-api";
import { ITEM_STEPS, type ItemStep } from "./src/item";
import {
  buildStepStrip,
  type ItemIndexRowWithThumbs,
  type ItemWithThumbs,
} from "./src/item-server";

const TEXTAREA_CLASS =
  "min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const PALETTE_LABEL: Record<PaletteKey, I18nKey> = {
  background: "guiPaletteBackground",
  button: "guiPaletteButton",
  outline: "guiPaletteOutline",
  highlight: "guiPaletteHighlight",
  text: "guiPaletteText",
};

const THUMB_LABEL: Record<string, I18nKey> = {
  guide: "modelThumbGuide",
  color: "modelThumbColor",
  preview: "modelThumbPreview",
  sheet: "modelThumbSheet",
  front: "modelBlueprintViews",
  side: "modelBlueprintViews",
  back: "modelBlueprintViews",
  top: "modelBlueprintViews",
};

type Draft = Pick<GuiStyle, "name" | "theme" | "tags" | "palette" | "notes">;

function draftOf(style: GuiStyle | null, name = ""): Draft {
  const empty = { background: "", button: "", outline: "", highlight: "", text: "" };
  return style
    ? { name: style.name, theme: style.theme, tags: [...style.tags], palette: { ...style.palette }, notes: style.notes }
    : { name, theme: "", tags: [], palette: { ...empty }, notes: "" };
}

export function ModelPanel({
  api,
  projectId,
  styles,
  version,
  locale,
  initialItemId,
  onError,
  onChanged,
}: {
  api: RpcApi<typeof rpcContract>;
  projectId: string | null;
  styles: GuiStyle[];
  version: number;
  locale: Locale;
  initialItemId?: string | null;
  onError: (cause: unknown) => void;
  onChanged: () => void;
}) {
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const [subTab, setSubTab] = useState<"runs" | "items">(initialItemId ? "items" : "runs");
  const [items, setItems] = useState<ItemIndexRowWithThumbs[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId ?? null);
  const [activeItem, setActiveItem] = useState<ItemWithThumbs | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const style = styles.find((item) => item.id === styleId) ?? null;
  const [draft, setDraft] = useState<Draft>(draftOf(style));
  const [mode, setMode] = useState<ModelMode>("texture-uv");
  const [takes, setTakes] = useState<ModelTakeWithThumbs[]>([]);
  const [running, setRunning] = useState(0);

  const [modelPath, setModelPath] = useState("");
  const [objectName, setObjectName] = useState("");
  const [subject, setSubject] = useState("");
  const [partsText, setPartsText] = useState("");
  const [conceptPath, setConceptPath] = useState("");
  const [stylePath, setStylePath] = useState("");
  const [conceptNote, setConceptNote] = useState("");
  const [projectConcept, setProjectConcept] = useState(false);
  const [conceptView, setConceptView] = useState<ModelConceptView>("front");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [size, setSize] = useState<ModelTextureSize>(1024);
  const [variants, setVariants] = useState(1);
  const [bpViews, setBpViews] = useState<BlueprintViewName[]>(["front", "side", "back"]);
  const [bpStyle, setBpStyle] = useState<BlueprintStyle>("clay+wire");
  const [softText, setSoftText] = useState("");
  const [rigidText, setRigidText] = useState("");
  const [sideSeparate, setSideSeparate] = useState(true);

  useEffect(() => {
    if ((!styleId || !styles.some((item) => item.id === styleId)) && !creating) setStyleId(styles[0]?.id ?? "");
  }, [styles, styleId, creating]);

  useEffect(() => {
    if (!creating) setDraft(draftOf(style));
  }, [styleId, style?.updatedAt, creating]);

  useEffect(() => {
    if (initialItemId) {
      setSubTab("items");
      setSelectedItemId(initialItemId);
    }
  }, [initialItemId]);

  useEffect(() => {
    if (!styleId) {
      setTakes([]);
      setItems([]);
      setActiveItem(null);
      return;
    }
    let live = true;
    api.model_takes({ styleId }).then((list) => live && setTakes(list), onError);
    api.model_items({ styleId }).then((list) => live && setItems(list), onError);
    return () => {
      live = false;
    };
  }, [api, styleId, version, onError]);

  useEffect(() => {
    if (!styleId || !selectedItemId) {
      setActiveItem(null);
      return;
    }
    let live = true;
    api
      .model_item({ styleId, item: selectedItemId })
      .then((it) => live && setActiveItem(it), onError);
    return () => {
      live = false;
    };
  }, [api, styleId, selectedItemId, version, onError]);

  const saveDraft = async () => {
    const saved = await api.save_gui_style({
      id: creating ? undefined : styleId || undefined,
      projectId,
      section: "model",
      name: draft.name.trim() || t("guiNewStyle", {}, locale),
      theme: draft.theme,
      tags: draft.tags,
      palette: draft.palette,
      notes: draft.notes,
    });
    setCreating(false);
    setStyleId(saved.id);
    onChanged();
  };

  const ready =
    mode === "texture-uv"
      ? modelPath.trim() !== "" && taskPrompt.trim() !== ""
      : conceptPath.trim() !== "" && subject.trim() !== "";

  const generate = () => {
    if (!ready) return;
    setRunning((n) => n + 1);
    const parts = parseModelPartsText(partsText);
    const images =
      mode === "blueprint"
        ? [conceptPath.trim()]
        : [conceptPath.trim(), stylePath.trim()].filter(Boolean);
    const splitList = (text: string) =>
      text
        .split(/[;\n]/)
        .map((part) => part.trim())
        .filter(Boolean);
    api
      .model_generate({
        projectId,
        styleId: styleId || undefined,
        mode,
        model: mode === "texture-uv" ? modelPath.trim() : undefined,
        object: objectName.trim() || undefined,
        prompt: mode === "texture-uv" ? taskPrompt.trim() : "",
        parts: parts.length > 0 ? parts : undefined,
        images: images.length > 0 ? images : undefined,
        size,
        variants,
        subject: subject.trim() || undefined,
        conceptNote: conceptNote.trim() || undefined,
        projectConcept,
        conceptView,
        views: mode === "blueprint" ? bpViews : undefined,
        style: mode === "blueprint" ? bpStyle : undefined,
        soft: mode === "blueprint" ? splitList(softText) : undefined,
        rigid: mode === "blueprint" ? splitList(rigidText) : undefined,
        sideSeparate: mode === "blueprint" ? sideSeparate : undefined,
      })
      .then((result) => {
        if (result.errors.length > 0) onError(result.errors.join(" | "));
        onChanged();
      }, onError)
      .finally(() => setRunning((n) => n - 1));
  };

  const toggleView = (view: BlueprintViewName) => {
    setBpViews((current) =>
      current.includes(view) ? current.filter((item) => item !== view) : [...current, view].sort(),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-border flex w-full max-w-5xl flex-col gap-4 px-4 pb-6 pt-3 md:px-5 md:pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-2 text-xl font-medium">{t("tabModel", {}, locale)}</h1>
            <ProjectPicker
              styles={styles}
              value={styleId}
              creating={creating}
              locale={locale}
              heading={t("modelProjects", {}, locale)}
              onPick={(id) => {
                setCreating(false);
                setStyleId(id);
              }}
              onNew={() => {
                setCreating(true);
                setSettingsOpen(true);
                setDraft(draftOf(null, `${t("guiNewStyle", {}, locale)} ${styles.length + 1}`));
              }}
            />
            {style && !creating ? (
              <Button
                type="button"
                size="icon"
                variant={settingsOpen ? "secondary" : "ghost"}
                aria-label={t("guiStyleSettings", {}, locale)}
                aria-pressed={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Icon name="SlidersHorizontal" className="size-4" />
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2 border-b border-border pb-2" role="tablist">
            <Button
              type="button"
              size="sm"
              variant={subTab === "runs" ? "secondary" : "ghost"}
              onClick={() => {
                setSubTab("runs");
                setSelectedItemId(null);
              }}
            >
              {t("modelSubTabRuns", {}, locale)}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={subTab === "items" ? "secondary" : "ghost"}
              onClick={() => setSubTab("items")}
            >
              {t("modelSubTabItems", {}, locale)}
            </Button>
          </div>

          {styles.length === 0 && !creating ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("modelNoStyles", {}, locale)}
            </p>
          ) : null}

          {(style || creating) && (settingsOpen || creating) ? (
            <div className="rounded-lg border border-border">
              <form
                className="flex flex-col gap-3 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveDraft().catch(onError);
                }}
              >
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiName", {}, locale)}</span>
                  <Input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiTheme", {}, locale)}</span>
                  <Input
                    value={draft.theme}
                    placeholder={t("guiThemePlaceholder", {}, locale)}
                    onChange={(event) => setDraft({ ...draft, theme: event.target.value })}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiPalette", {}, locale)}</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PALETTE_KEYS.map((key) => (
                      <label key={key} className="flex flex-col gap-0.5 text-xs">
                        {t(PALETTE_LABEL[key], {}, locale)}
                        <Input
                          value={draft.palette[key]}
                          placeholder="#000000"
                          onChange={(event) =>
                            setDraft({ ...draft, palette: { ...draft.palette, [key]: event.target.value } })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiNotes", {}, locale)}</span>
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  />
                </label>
                <Button type="submit" size="sm" className="self-start">
                  {t("guiSave", {}, locale)}
                </Button>
              </form>
            </div>
          ) : null}

          {style && !creating ? (
            subTab === "items" ? (
              selectedItemId && activeItem ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedItemId(null)}
                    >
                      <Icon name="ArrowLeft" className="mr-1 size-4" />
                      {t("modelItemBack", {}, locale)}
                    </Button>
                    <h2 className="text-lg font-medium">{activeItem.name}</h2>
                    <span className="text-xs text-muted-foreground">({activeItem.id})</span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {ITEM_STEPS.map((stepKey) => {
                      const stepState = activeItem.steps[stepKey];
                      const stepThumbs = activeItem.thumbnails[stepKey] ?? {};
                      return (
                        <div key={stepKey} className="rounded-lg border border-border p-3">
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {t(
                                  stepKey === "concept"
                                    ? "modelItemStepConcept"
                                    : stepKey === "blueprint"
                                      ? "modelItemStepBlueprint"
                                      : stepKey === "model"
                                        ? "modelItemStepModel"
                                        : stepKey === "uv-guide"
                                          ? "modelItemStepUvGuide"
                                          : stepKey === "texture"
                                            ? "modelItemStepTexture"
                                            : stepKey === "preview"
                                              ? "modelItemStepPreview"
                                              : "modelItemStepExport",
                                  {},
                                  locale,
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({stepState.status === "done" ? "✓" : stepState.status === "running" ? "…" : "—"})
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {stepState.entries.length} {t("modelItemEntries", {}, locale)}
                            </span>
                          </div>

                          {stepState.entries.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t("modelItemNoEntries", {}, locale)}</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                              {stepState.entries.map((entry) => {
                                const isSelected = stepState.selected === entry.id;
                                const thumb = stepThumbs[entry.id];
                                return (
                                  <div
                                    key={entry.id}
                                    className={`relative flex flex-col overflow-hidden rounded-md border p-1 ${
                                      isSelected
                                        ? "border-primary ring-2 ring-primary"
                                        : "border-border hover:border-muted-foreground"
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="relative block aspect-square w-full overflow-hidden rounded bg-muted text-left"
                                      onClick={() => {
                                        if (stepKey === "texture" || stepKey === "model" || stepKey === "concept") {
                                          api
                                            .model_item_select({
                                              styleId,
                                              item: activeItem.id,
                                              step: stepKey,
                                              entry: entry.id,
                                            })
                                            .then((updated) => setActiveItem(updated), onError);
                                        }
                                      }}
                                    >
                                      {thumb ? (
                                        <img
                                          src={`data:${thumb.mimeType};base64,${thumb.base64}`}
                                          alt={entry.id}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center p-1 text-[10px] text-muted-foreground">
                                          {entry.id}
                                        </div>
                                      )}
                                      {isSelected ? (
                                        <span className="absolute bottom-1 right-1 rounded bg-primary px-1 text-[9px] text-primary-foreground">
                                          ✓
                                        </span>
                                      ) : null}
                                    </button>
                                    <div className="mt-1 flex items-center justify-between text-[10px]">
                                      <span className="truncate text-muted-foreground">{entry.source}</span>
                                      {stepKey === "texture" && !isSelected ? (
                                        <button
                                          type="button"
                                          className="text-primary underline hover:opacity-80"
                                          onClick={() => {
                                            api
                                              .model_item_select({
                                                styleId,
                                                item: activeItem.id,
                                                step: "texture",
                                                entry: entry.id,
                                              })
                                              .then((updated) => setActiveItem(updated), onError);
                                          }}
                                        >
                                          {t("modelItemSelectTake", {}, locale)}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("modelItemsEmpty", {}, locale)}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((it) => {
                    const strip = buildStepStrip(it.steps, it.thumbs);
                    return (
                      <li
                        key={it.id}
                        className="cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/30"
                        onClick={() => setSelectedItemId(it.id)}
                      >
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{it.name}</span>
                            <span className="text-xs text-muted-foreground">({it.id})</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(it.updatedAt).toLocaleString(locale)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto py-1">
                          {strip.map((stepInfo) => (
                            <div
                              key={stepInfo.step}
                              className="flex flex-col items-center gap-1 rounded border border-border bg-background p-1.5 min-w-[4rem]"
                            >
                              <div className="relative aspect-square size-12 overflow-hidden rounded bg-muted">
                                {stepInfo.thumb ? (
                                  <img
                                    src={`data:${stepInfo.thumb.mimeType};base64,${stepInfo.thumb.base64}`}
                                    alt={stepInfo.step}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                    {stepInfo.mark}
                                  </div>
                                )}
                                <span className="absolute bottom-0.5 right-0.5 rounded bg-background/80 px-1 text-[9px] font-bold">
                                  {stepInfo.mark}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {t(
                                  stepInfo.step === "concept"
                                    ? "modelItemStepConcept"
                                    : stepInfo.step === "blueprint"
                                      ? "modelItemStepBlueprint"
                                      : stepInfo.step === "model"
                                        ? "modelItemStepModel"
                                        : stepInfo.step === "uv-guide"
                                          ? "modelItemStepUvGuide"
                                          : stepInfo.step === "texture"
                                            ? "modelItemStepTexture"
                                            : stepInfo.step === "preview"
                                              ? "modelItemStepPreview"
                                              : "modelItemStepExport",
                                  {},
                                  locale,
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : takes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("modelNoTakes", {}, locale)}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {takes.map((take) => (
                  <li key={take.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {take.mode === "texture-uv" ? t("modelTakeTextureUv", {}, locale) : t("modelTakeBlueprint", {}, locale)}
                      </span>
                      <span className="text-muted-foreground">{new Date(take.createdAt).toLocaleString(locale)}</span>
                      {take.sideRegenerated ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t("modelSideRedrawn", {}, locale)}</span>
                      ) : null}
                    </div>
                    <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{take.prompt}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {Object.entries(take.thumbs).map(([key, thumb]) => (
                        <figure key={key} className="overflow-hidden rounded-md bg-muted">
                          <img
                            src={`data:${thumb.mimeType};base64,${thumb.base64}`}
                            alt={key}
                            loading="lazy"
                            className="block h-auto w-full"
                          />
                          <figcaption className="px-1 py-0.5 text-center text-[10px] text-muted-foreground">
                            {t(THUMB_LABEL[key] ?? "modelThumbSheet", {}, locale)}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    {take.files.manifest ? (
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {t("modelManifest", {}, locale)}: {take.files.manifest}
                      </p>
                    ) : take.files.views ? (
                      <p className="mt-2 break-all text-xs text-muted-foreground">{take.files.views}</p>
                    ) : null}
                    {take.warnings.length > 0 ? (
                      <p className="mt-2 text-xs text-destructive">
                        {t("modelWarnings", {}, locale)}: {take.warnings.join("; ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>

      <form
        className="flex shrink-0 flex-col gap-2 border-t border-border bg-background p-2 md:p-3"
        onSubmit={(event) => {
          event.preventDefault();
          generate();
        }}
      >
        <div className="flex flex-wrap gap-1" role="group">
          {(["texture-uv", "blueprint"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={mode === item ? "default" : "outline"}
              onClick={() => setMode(item)}
            >
              {t(item === "texture-uv" ? "modelModeTextureUv" : "modelModeBlueprint", {}, locale)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(mode === "texture-uv" ? "modelHintTextureUv" : "modelHintBlueprint", {}, locale)}
        </p>

        {mode === "texture-uv" ? (
          <>
            <Input
              value={modelPath}
              placeholder={t("modelPathPlaceholder", {}, locale)}
              aria-label={t("modelPath", {}, locale)}
              onChange={(event) => setModelPath(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[10rem] flex-1"
                value={objectName}
                placeholder={t("modelObject", {}, locale)}
                aria-label={t("modelObject", {}, locale)}
                onChange={(event) => setObjectName(event.target.value)}
              />
              <Input
                className="min-w-[10rem] flex-1"
                value={subject}
                placeholder={t("modelSubject", {}, locale)}
                aria-label={t("modelSubject", {}, locale)}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <textarea
              className={TEXTAREA_CLASS}
              rows={3}
              value={partsText}
              placeholder={t("modelPartsPlaceholder", {}, locale)}
              aria-label={t("modelParts", {}, locale)}
              onChange={(event) => setPartsText(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[12rem] flex-1"
                value={conceptPath}
                placeholder={t("modelConceptImage", {}, locale)}
                aria-label={t("modelConceptImage", {}, locale)}
                onChange={(event) => setConceptPath(event.target.value)}
              />
              <Input
                className="min-w-[12rem] flex-1"
                value={stylePath}
                placeholder={t("modelStyleImage", {}, locale)}
                aria-label={t("modelStyleImage", {}, locale)}
                onChange={(event) => setStylePath(event.target.value)}
              />
            </div>
            <Input
              value={conceptNote}
              placeholder={t("modelConceptNote", {}, locale)}
              aria-label={t("modelConceptNote", {}, locale)}
              onChange={(event) => setConceptNote(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={projectConcept} onChange={(event) => setProjectConcept(event.target.checked)} />
                {t("modelProjectConcept", {}, locale)}
              </label>
              <label className="flex items-center gap-1.5">
                {t("modelConceptView", {}, locale)}
                <select
                  className="h-8 rounded-md border border-input bg-background px-2"
                  value={conceptView}
                  onChange={(event) => setConceptView(event.target.value as ModelConceptView)}
                >
                  {MODEL_CONCEPT_VIEWS.map((view) => (
                    <option key={view} value={view}>{view}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                {t("modelSize", {}, locale)}
                <select
                  className="h-8 rounded-md border border-input bg-background px-2"
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value) as ModelTextureSize)}
                >
                  {MODEL_TEXTURE_SIZES.map((edge) => (
                    <option key={edge} value={edge}>{edge}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                {t("modelVariants", {}, locale)}
                <select
                  className="h-8 rounded-md border border-input bg-background px-2"
                  value={variants}
                  onChange={(event) => setVariants(Number(event.target.value))}
                >
                  {[1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              className={TEXTAREA_CLASS}
              rows={3}
              value={taskPrompt}
              placeholder={t("modelTaskPlaceholder", {}, locale)}
              aria-label={t("modelTaskPrompt", {}, locale)}
              onChange={(event) => setTaskPrompt(event.target.value)}
            />
          </>
        ) : (
          <>
            <Input
              value={conceptPath}
              placeholder={t("modelConceptImage", {}, locale)}
              aria-label={t("modelConceptImage", {}, locale)}
              onChange={(event) => setConceptPath(event.target.value)}
            />
            <Input
              value={subject}
              placeholder={t("modelSubject", {}, locale)}
              aria-label={t("modelSubject", {}, locale)}
              onChange={(event) => setSubject(event.target.value)}
            />
            <div className="flex flex-wrap gap-1" role="group" aria-label={t("modelBlueprintViews", {}, locale)}>
              {BLUEPRINT_VIEW_NAMES.map((view) => (
                <Button
                  key={view}
                  type="button"
                  size="sm"
                  variant={bpViews.includes(view) ? "secondary" : "outline"}
                  aria-pressed={bpViews.includes(view)}
                  onClick={() => toggleView(view)}
                >
                  {view}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              {t("modelBlueprintStyle", {}, locale)}
              <select
                className="h-8 rounded-md border border-input bg-background px-2"
                value={bpStyle}
                onChange={(event) => setBpStyle(event.target.value as BlueprintStyle)}
              >
                <option value="clay+wire">clay+wire</option>
                <option value="clean line">clean line</option>
              </select>
            </label>
            <Input
              value={softText}
              placeholder={t("modelSoftPlaceholder", {}, locale)}
              aria-label={t("modelSoftParts", {}, locale)}
              onChange={(event) => setSoftText(event.target.value)}
            />
            <Input
              value={rigidText}
              placeholder={t("modelRigidPlaceholder", {}, locale)}
              aria-label={t("modelRigidParts", {}, locale)}
              onChange={(event) => setRigidText(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sideSeparate}
                onChange={(event) => setSideSeparate(event.target.checked)}
              />
              {t("modelSideSeparate", {}, locale)}
            </label>
          </>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={!ready || running > 0 || creating}>
            {running > 0 ? t("modelGenerating", {}, locale) : t("modelGenerate", {}, locale)}
          </Button>
        </div>
      </form>
    </div>
  );
}

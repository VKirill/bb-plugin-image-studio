import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ProjectPicker } from "./gui-panel";
import type { GuiItem } from "./gui-panel";
import { t } from "./i18n";
import type { I18nKey, Locale } from "./i18n";
import { GUI_MAX_REFS, PALETTE_KEYS, type GuiStyle, type PaletteKey } from "./src/gui";
import {
  LIST_MODES,
  MAX_LIST,
  MAX_VARIANTS,
  MODE_CATEGORY,
  VARIANT_MODES,
  WEB_CATEGORIES,
  WEB_MODES,
  WEB_PRESET_IDS,
  type WebCategory,
  type WebMode,
} from "./src/web";
import { parseList } from "./src/roblox";
import type { RpcApi } from "./src/rpc-api";
import { fileToBase64 } from "./lib/files";
import { mapParallel } from "./src/queue";

/** The site's gallery pictures, as `gui_generations` lists them: label and run, no mode (web records keep only the label). */
export type WebItem = GuiItem;

type Draft = Pick<GuiStyle, "name" | "theme" | "tags" | "palette" | "notes">;

const TEXTAREA_CLASS =
  "min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const PALETTE_LABEL: Record<PaletteKey, I18nKey> = {
  background: "guiPaletteBackground",
  button: "guiPaletteButton",
  outline: "guiPaletteOutline",
  highlight: "guiPaletteHighlight",
  text: "guiPaletteText",
};
const EMPTY_PALETTE: GuiStyle["palette"] = { background: "", button: "", outline: "", highlight: "", text: "" };

function draftOf(style: GuiStyle | null, name = ""): Draft {
  return style
    ? { name: style.name, theme: style.theme, tags: [...style.tags], palette: { ...style.palette }, notes: style.notes }
    : { name, theme: "", tags: [], palette: { ...EMPTY_PALETTE }, notes: "" };
}

/** Records of one request (four ideas, a favicon set) side by side, newest request first. */
function groupRuns(items: readonly WebItem[]): WebItem[][] {
  const runs: WebItem[][] = [];
  const byRun = new Map<string, WebItem[]>();
  for (const item of items) {
    const key = item.guiRun ?? item.id;
    let run = byRun.get(key);
    if (!run) {
      run = [];
      byRun.set(key, run);
      runs.push(run);
    }
    run.push(item);
  }
  return runs.map((run) => [...run].sort((a, b) => (a.guiLabel ?? "").localeCompare(b.guiLabel ?? "")));
}

/** The site's tabs: everything at once, then one per asset group. */
type WebTab = "all" | WebCategory;
const WEB_TABS: readonly WebTab[] = ["all", ...WEB_CATEGORIES];
const CATEGORY_LABEL: Record<WebTab, I18nKey> = {
  all: "webCatAll",
  concepts: "webCatConcepts",
  brand: "webCatBrand",
  graphics: "webCatGraphics",
};
const CATEGORY_HINT: Record<WebCategory, I18nKey> = {
  concepts: "webCatHintConcepts",
  brand: "webCatHintBrand",
  graphics: "webCatHintGraphics",
};
/** What the form shows per mode: the chip, the hint line and the textarea placeholder. */
const MODE_INFO: Record<WebMode, { label: I18nKey; hint: I18nKey; placeholder: I18nKey }> = {
  ideas: { label: "webModeIdeas", hint: "webHintIdeas", placeholder: "webPlaceholderIdeas" },
  page: { label: "webModePage", hint: "webHintPage", placeholder: "webPlaceholderDraw" },
  mobile: { label: "webModeMobile", hint: "webHintMobile", placeholder: "webPlaceholderDraw" },
  block: { label: "webModeBlock", hint: "webHintBlock", placeholder: "webPlaceholderDraw" },
  logo: { label: "webModeLogo", hint: "webHintLogo", placeholder: "webPlaceholderLogo" },
  favicon: { label: "webModeFavicon", hint: "webHintFavicon", placeholder: "webPlaceholderDraw" },
  og: { label: "webModeOg", hint: "webHintOg", placeholder: "webPlaceholderDraw" },
  hero: { label: "webModeHero", hint: "webHintHero", placeholder: "webPlaceholderDraw" },
  cover: { label: "webModeCover", hint: "webHintCover", placeholder: "webPlaceholderDraw" },
  illustrations: { label: "webModeIllustrations", hint: "webHintIllustrations", placeholder: "webPlaceholderList" },
  icons: { label: "webModeIcons", hint: "webHintIcons", placeholder: "webPlaceholderList" },
  background: { label: "webModeBackground", hint: "webHintBackground", placeholder: "webPlaceholderDraw" },
  pattern: { label: "webModePattern", hint: "webHintPattern", placeholder: "webPlaceholderDraw" },
};
/** The first mode of a group tab: what the tab opens with. */
const firstMode = (category: WebCategory): WebMode =>
  WEB_MODES.find((item) => MODE_CATEGORY[item] === category) ?? "ideas";

export function WebPanel({
  api,
  projectId,
  styles,
  version,
  locale,
  onError,
  onChanged,
  onOpen,
}: {
  api: RpcApi<typeof rpcContract>;
  projectId: string | null;
  /** The site projects (section "web"), most recently used first. */
  styles: GuiStyle[];
  /** Bumped by the parent on every change event, so the open site's list reloads. */
  version: number;
  locale: Locale;
  onError: (cause: unknown) => void;
  onChanged: () => void;
  onOpen: (items: WebItem[], index: number, thumbs: Record<string, string>) => void;
}) {
  const [styleId, setStyleId] = useState(styles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const style = styles.find((item) => item.id === styleId) ?? null;
  const [draft, setDraft] = useState<Draft>(draftOf(style));
  const [items, setItems] = useState<WebItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<WebTab>("all");
  const [mode, setMode] = useState<WebMode>("ideas");
  const [prompt, setPrompt] = useState("");
  const [variants, setVariants] = useState(1);
  const [running, setRunning] = useState(0);
  const [refPreviews, setRefPreviews] = useState<Record<string, string>>({});
  const requestedRefs = useRef(new Set<string>());
  const requestedThumbs = useRef(new Set<string>());
  const upload = useRef<HTMLInputElement>(null);

  // No site picked (first open, or the open one was deleted): the most recently used one.
  useEffect(() => {
    if ((!styleId || !styles.some((item) => item.id === styleId)) && !creating) setStyleId(styles[0]?.id ?? "");
  }, [styles, styleId, creating]);
  useEffect(() => {
    if (!creating) setDraft(draftOf(style));
  }, [styleId, style?.updatedAt, creating]);

  useEffect(() => {
    if (!styleId) {
      setItems([]);
      return;
    }
    let live = true;
    api.gui_generations({ styleId }).then((list) => live && setItems(list), onError);
    return () => {
      live = false;
    };
  }, [api, styleId, version, onError]);

  useEffect(() => {
    const todo = items.filter((item) => !requestedThumbs.current.has(item.id));
    for (const item of todo) requestedThumbs.current.add(item.id);
    void mapParallel(todo, 6, async (item) => {
      try {
        const file = await api.generation_preview({ id: item.id, projectId: item.projectId, variant: "thumb" });
        setThumbs((current) => ({ ...current, [item.id]: `data:${file.mimeType};base64,${file.base64}` }));
      } catch {
        // stays a placeholder
      }
    });
  }, [items, api]);

  useEffect(() => {
    for (const item of styles) {
      for (const ref of item.refs) {
        if (requestedRefs.current.has(ref.id)) continue;
        requestedRefs.current.add(ref.id);
        void api
          .gui_ref_preview({ styleId: item.id, refId: ref.id })
          .then((file) => setRefPreviews((current) => ({ ...current, [ref.id]: `data:${file.mimeType};base64,${file.base64}` })))
          .catch(() => undefined);
      }
    }
  }, [styles, api]);

  const modes = category === "all" ? WEB_MODES : WEB_MODES.filter((item) => MODE_CATEGORY[item] === category);
  const modeInfo = MODE_INFO[mode];
  const listMode = LIST_MODES.includes(mode);
  const listRows = listMode ? parseList(prompt) : [];
  const listMax = listMode ? (MAX_LIST[mode] ?? 0) : 0;
  const listTooLong = listRows.length > listMax;
  const ready = listMode ? listRows.length > 0 && !listTooLong : mode === "logo" || prompt.trim() !== "";

  const saveDraft = async () => {
    const saved = await api.save_gui_style({
      id: creating ? undefined : styleId || undefined,
      projectId,
      section: "web",
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

  const makeReference = async (item: WebItem) => {
    if (!style) return;
    await api.add_gui_ref({ styleId: style.id, generationId: item.id, role: "concept" });
    setSettingsOpen(true);
    onChanged();
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!style) return;
    for (const file of files) {
      await api.add_gui_ref({
        styleId: style.id,
        role: "concept",
        filename: file.name,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        base64: await fileToBase64(file),
      });
    }
    onChanged();
  };

  const generate = () => {
    if (!ready || creating) return;
    setRunning((count) => count + 1);
    api
      .gui_generate({
        projectId,
        styleId: styleId || undefined,
        section: "web",
        mode,
        prompt: prompt.trim(),
        variants: VARIANT_MODES.includes(mode) ? variants : 1,
      })
      .then((result) => {
        if (result.errors.length > 0) onError(result.errors.join(" | "));
        const made = result.generations[0]?.guiStyleId;
        if (made) setStyleId(made);
        onChanged();
      }, onError)
      .finally(() => setRunning((count) => count - 1));
  };

  const togglePreset = (preset: string) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(preset) ? current.tags.filter((tag) => tag !== preset) : [...current.tags, preset],
    }));

  const ordered = groupRuns(items).flat();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-border flex w-full max-w-5xl flex-col gap-4 px-4 pt-3 md:px-5 md:pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-2 text-xl font-medium">{t("tabWeb", {}, locale)}</h1>
            <ProjectPicker
              styles={styles}
              value={styleId}
              creating={creating}
              locale={locale}
              heading={t("webProjects", {}, locale)}
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

          {style && !creating ? (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-1" role="tablist">
                {WEB_TABS.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    role="tab"
                    aria-selected={category === item}
                    variant={category === item ? "secondary" : "ghost"}
                    onClick={() => {
                      setCategory(item);
                      if (item !== "all") setMode(firstMode(item));
                    }}
                  >
                    {t(CATEGORY_LABEL[item], {}, locale)}
                  </Button>
                ))}
              </div>
              {category !== "all" ? (
                <p className="text-xs text-muted-foreground">{t(CATEGORY_HINT[category], {}, locale)}</p>
              ) : null}
            </div>
          ) : null}

          {styles.length === 0 && !creating ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("webNoStyles", {}, locale)}
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
                {style?.origin && !creating ? (
                  <p className="break-all text-xs text-muted-foreground">{t("guiOrigin", { path: style.origin }, locale)}</p>
                ) : null}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiName", {}, locale)}</span>
                  <Input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiTheme", {}, locale)}</span>
                  <Input
                    value={draft.theme}
                    placeholder={t("webThemePlaceholder", {}, locale)}
                    onChange={(event) => setDraft({ ...draft, theme: event.target.value })}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiPresets", {}, locale)}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEB_PRESET_IDS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={draft.tags.includes(preset) ? "secondary" : "outline"}
                        aria-pressed={draft.tags.includes(preset)}
                        onClick={() => togglePreset(preset)}
                      >
                        {draft.tags.includes(preset) ? <Icon name="Check" className="size-3.5" /> : null}
                        {preset}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiPalette", {}, locale)}</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {PALETTE_KEYS.map((key) => (
                      <div key={key} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                        <input
                          type="color"
                          className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                          value={draft.palette[key] || "#000000"}
                          aria-label={t(PALETTE_LABEL[key], {}, locale)}
                          onChange={(event) => setDraft({ ...draft, palette: { ...draft.palette, [key]: event.target.value } })}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {t(PALETTE_LABEL[key], {}, locale)}
                          <span className="block font-mono text-muted-foreground">{draft.palette[key] || "—"}</span>
                        </span>
                        {draft.palette[key] ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t("guiPaletteClear", {}, locale)}
                            onClick={() => setDraft({ ...draft, palette: { ...draft.palette, [key]: "" } })}
                          >
                            <Icon name="X" className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiNotes", {}, locale)}</span>
                  <Input
                    value={draft.notes}
                    placeholder={t("webNotesPlaceholder", {}, locale)}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  />
                </label>
                {style && !creating ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{t("guiRefs", {}, locale)}</span>
                    <p className="text-xs text-muted-foreground">{t("webRefsHint", { max: GUI_MAX_REFS }, locale)}</p>
                    <div className="flex flex-wrap gap-2">
                      {style.refs.map((ref) => (
                        <div key={ref.id} className="relative h-20 w-28 overflow-hidden rounded-md border border-border bg-muted">
                          {refPreviews[ref.id] ? <img src={refPreviews[ref.id]} alt="" className="h-full w-full object-cover" /> : null}
                          <span className="absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[10px]">
                            {t("webRoleConcept", {}, locale)}
                          </span>
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded bg-background/85 p-0.5"
                            aria-label={t("guiRemoveRef", {}, locale)}
                            onClick={() => void api.remove_gui_ref({ styleId: style.id, refId: ref.id }).then(onChanged, onError)}
                          >
                            <Icon name="X" className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      {style.refs.length < GUI_MAX_REFS ? (
                        <button
                          type="button"
                          className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => upload.current?.click()}
                        >
                          <Icon name="Plus" className="size-4" />
                          {t("guiUpload", {}, locale)}
                        </button>
                      ) : null}
                      <input
                        ref={upload}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(event) => void onUpload(event).catch(onError)}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="submit" size="sm">
                    {t("guiSave", {}, locale)}
                  </Button>
                  {style && !creating ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!window.confirm(t("guiDeleteConfirm", { name: style.name }, locale))) return;
                        void api.delete_gui_style({ id: style.id }).then(onChanged, onError);
                      }}
                    >
                      <Icon name="Trash2" className="size-4" />
                      {t("guiDelete", {}, locale)}
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          ) : null}

          {style && !creating ? (
            ordered.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("guiNoResults", {}, locale)}</p>
            ) : (
              <ul className="columns-2 gap-2 sm:columns-3 lg:columns-4">
                {ordered.map((item, index) => {
                  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : "16 / 9";
                  return (
                    <li key={item.id} className="group relative mb-2 break-inside-avoid">
                      <button
                        type="button"
                        className="block w-full overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onOpen(ordered, index, thumbs)}
                      >
                        {thumbs[item.id] ? (
                          <img src={thumbs[item.id]} alt={item.prompt} loading="lazy" className="block h-auto w-full" style={{ aspectRatio: ratio }} />
                        ) : (
                          <span className="block w-full" style={{ aspectRatio: ratio }} />
                        )}
                      </button>
                      {item.guiLabel ? (
                        <span className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-background/85 px-1 text-[10px]">
                          {item.guiLabel}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 rounded-md bg-background/85 p-1.5 shadow-sm transition-opacity disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        title={t("guiUseRef", {}, locale)}
                        aria-label={t("guiUseRef", {}, locale)}
                        disabled={style.refs.length >= GUI_MAX_REFS}
                        onClick={() => void makeReference(item).catch(onError)}
                      >
                        <Icon name="Star" className="size-4" />
                      </button>
                    </li>
                  );
                })}
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
        <div className="flex flex-wrap items-center gap-1" role="group">
          {modes.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={mode === item ? "default" : "outline"}
              onClick={() => setMode(item)}
            >
              {t(MODE_INFO[item].label, {}, locale)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(modeInfo.hint, {}, locale)}</p>
        <textarea
          className={TEXTAREA_CLASS}
          value={prompt}
          rows={listMode ? 4 : 2}
          placeholder={t(modeInfo.placeholder, {}, locale)}
          aria-label={t(modeInfo.label, {}, locale)}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              generate();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {listMode && prompt.trim() !== "" ? (
              <span className={listTooLong ? "text-destructive" : "text-muted-foreground"}>
                {t("webItemsCount", { count: listRows.length, max: listMax }, locale)}
              </span>
            ) : null}
            {VARIANT_MODES.includes(mode) ? (
              <label className="flex items-center gap-1.5">
                {t("webVariants", {}, locale)}
                <select
                  className="h-8 rounded-md border border-input bg-background px-2"
                  value={variants}
                  onChange={(event) => setVariants(Number(event.target.value))}
                >
                  {Array.from({ length: MAX_VARIANTS }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <Button type="submit" disabled={!ready || creating}>
            {running > 0 ? <Icon name="Loading" className="size-4 animate-spin" /> : <Icon name="Palette" className="size-4" />}
            {running > 0 ? `${t("guiGenerating", {}, locale)} (${running})` : t("guiGenerate", {}, locale)}
          </Button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { t } from "./i18n";
import type { I18nKey, Locale } from "./i18n";
import { GUI_MAX_REFS, GUI_PRESET_IDS, PALETTE_KEYS, type GuiMode, type GuiStyle, type PaletteKey } from "./src/gui";
import type { RpcApi } from "./src/rpc-api";
import { fileToBase64 } from "./lib/files";

export type GuiItem = {
  id: string;
  prompt: string;
  width?: number;
  height?: number;
  projectPath: string | null;
  guiStyleId?: string | null;
  guiMode?: GuiMode;
  guiLabel?: string;
  guiParts?: number;
  guiMissing?: string[];
  guiDir?: string | null;
};

type Draft = Pick<GuiStyle, "name" | "theme" | "tags" | "palette" | "notes">;

const MODES: ReadonlyArray<{ id: GuiMode; label: I18nKey; hint: I18nKey; placeholder: I18nKey }> = [
  { id: "ideas", label: "guiModeIdeas", hint: "guiHintIdeas", placeholder: "guiPlaceholderIdeas" },
  { id: "screen", label: "guiModeScreen", hint: "guiHintScreen", placeholder: "guiPlaceholderIdeas" },
  { id: "elements", label: "guiModeElements", hint: "guiHintElements", placeholder: "guiPlaceholderElements" },
  { id: "kit", label: "guiModeKit", hint: "guiHintKit", placeholder: "guiPlaceholderKit" },
];
const PALETTE_LABEL: Record<PaletteKey, I18nKey> = {
  background: "guiPaletteBackground",
  button: "guiPaletteButton",
  outline: "guiPaletteOutline",
  highlight: "guiPaletteHighlight",
  text: "guiPaletteText",
};
const EMPTY_PALETTE: GuiStyle["palette"] = { background: "", button: "", outline: "", highlight: "", text: "" };
const TEXTAREA_CLASS =
  "min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function draftOf(style: GuiStyle | null, name = ""): Draft {
  return style
    ? { name: style.name, theme: style.theme, tags: [...style.tags], palette: { ...style.palette }, notes: style.notes }
    : { name, theme: "", tags: [], palette: { ...EMPTY_PALETTE }, notes: "" };
}

export function GuiPanel({
  api,
  projectId,
  styles,
  items,
  thumbs,
  locale,
  onError,
  onChanged,
  onOpen,
}: {
  api: RpcApi<typeof rpcContract>;
  projectId: string | null;
  styles: GuiStyle[];
  items: GuiItem[];
  thumbs: Record<string, string>;
  locale: Locale;
  onError: (cause: unknown) => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
}) {
  const [styleId, setStyleId] = useState<string>(styles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const style = styles.find((item) => item.id === styleId) ?? null;
  const [draft, setDraft] = useState<Draft>(draftOf(style));
  const [mode, setMode] = useState<GuiMode>("ideas");
  const [prompt, setPrompt] = useState("");
  const [states, setStates] = useState(false);
  const [running, setRunning] = useState(0);
  const [refPreviews, setRefPreviews] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const upload = useRef<HTMLInputElement>(null);

  // A deleted or foreign style falls back to the first one.
  useEffect(() => {
    if (styleId && !styles.some((item) => item.id === styleId)) setStyleId(styles[0]?.id ?? "");
  }, [styles, styleId]);
  useEffect(() => {
    if (!creating) setDraft(draftOf(style));
  }, [styleId, style?.updatedAt, creating]);

  useEffect(() => {
    for (const item of styles) {
      for (const ref of item.refs) {
        if (requested.current.has(ref.id)) continue;
        requested.current.add(ref.id);
        void api
          .gui_ref_preview({ styleId: item.id, refId: ref.id })
          .then((file) => setRefPreviews((current) => ({ ...current, [ref.id]: `data:${file.mimeType};base64,${file.base64}` })))
          .catch(() => undefined);
      }
    }
  }, [styles, api]);

  const results = items.filter((item) => item.guiMode && (styleId ? item.guiStyleId === styleId : !item.guiStyleId));
  const modeInfo = MODES.find((item) => item.id === mode)!;
  const needsPrompt = mode !== "kit";

  const saveDraft = async () => {
    const saved = await api.save_gui_style({
      id: creating ? undefined : styleId || undefined,
      projectId,
      name: draft.name.trim() || t("guiNewStyle", {}, locale),
      theme: draft.theme,
      tags: draft.tags,
      palette: draft.palette,
      notes: draft.notes,
    });
    setCreating(false);
    setStyleId(saved.id);
    onChanged();
    return saved;
  };

  const makeReference = async (item: GuiItem) => {
    let target = style;
    if (!target) {
      target = await saveDraftFromScratch();
      setSettingsOpen(true);
    }
    await api.add_gui_ref({ styleId: target.id, generationId: item.id, role: "concept" });
    onChanged();
  };

  const saveDraftFromScratch = async () => {
    const saved = await api.save_gui_style({
      projectId,
      name: `${t("guiNewStyle", {}, locale)} ${styles.length + 1}`,
      theme: "",
      tags: [],
      palette: { ...EMPTY_PALETTE },
      notes: "",
    });
    setStyleId(saved.id);
    return saved;
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
    if (needsPrompt && prompt.trim() === "") return;
    setRunning((count) => count + 1);
    api
      .gui_generate({ projectId, styleId: styleId || undefined, mode, prompt: prompt.trim(), states: mode === "elements" && states })
      .then((result) => {
        if (result.errors.length > 0) onError(result.errors.join(" | "));
        onChanged();
      }, onError)
      .finally(() => setRunning((count) => count - 1));
  };

  const togglePreset = (preset: string) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(preset) ? current.tags.filter((tag) => tag !== preset) : [...current.tags, preset],
    }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-border flex w-full max-w-5xl flex-col gap-4 px-4 pb-6 pt-3 md:px-5 md:pt-4">
          <div>
            <h1 className="text-xl font-medium">{t("tabGui", {}, locale)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("guiHint", {}, locale)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("guiStyleSettings", {}, locale)}>
            <Button
              type="button"
              size="sm"
              variant={!styleId && !creating ? "default" : "outline"}
              onClick={() => {
                setCreating(false);
                setStyleId("");
              }}
            >
              {t("guiNoStyle", {}, locale)}
            </Button>
            {styles.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={item.id === styleId && !creating ? "default" : "outline"}
                onClick={() => {
                  setCreating(false);
                  setStyleId(item.id);
                }}
              >
                {item.name}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={creating ? "default" : "ghost"}
              onClick={() => {
                setCreating(true);
                setSettingsOpen(true);
                setDraft(draftOf(null, `${t("guiNewStyle", {}, locale)} ${styles.length + 1}`));
              }}
            >
              <Icon name="Plus" className="size-4" />
              {t("guiNewStyle", {}, locale)}
            </Button>
          </div>

          {styles.length === 0 && !creating ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t("guiNoStyles", {}, locale)}
            </p>
          ) : null}

          {style || creating ? (
            <details
              className="rounded-lg border border-border"
              open={settingsOpen || creating}
              onToggle={(event) => setSettingsOpen((event.target as HTMLDetailsElement).open)}
            >
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <Icon name="SlidersHorizontal" className="size-4 shrink-0" />
                {t("guiStyleSettings", {}, locale)}
                {style && !creating ? (
                  <span className="truncate font-normal text-muted-foreground">
                    · {[style.theme, ...style.tags].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </summary>
              <form
                className="flex flex-col gap-3 border-t border-border p-3"
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
                  <span className="text-xs text-muted-foreground">{t("guiPresets", {}, locale)}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {GUI_PRESET_IDS.map((preset) => (
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
                    placeholder={t("guiNotesPlaceholder", {}, locale)}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  />
                </label>
                {style && !creating ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{t("guiRefs", {}, locale)}</span>
                    <p className="text-xs text-muted-foreground">{t("guiRefsHint", { max: GUI_MAX_REFS }, locale)}</p>
                    <div className="flex flex-wrap gap-2">
                      {style.refs.map((ref) => (
                        <div key={ref.id} className="relative h-20 w-28 overflow-hidden rounded-md border border-border bg-muted">
                          {refPreviews[ref.id] ? <img src={refPreviews[ref.id]} alt="" className="h-full w-full object-cover" /> : null}
                          <span className="absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[10px]">
                            {t(ref.role === "art" ? "guiRoleArt" : "guiRoleConcept", {}, locale)}
                          </span>
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded bg-background/85 p-0.5"
                            aria-label={t("guiDelete", {}, locale)}
                            onClick={() =>
                              void api.remove_gui_ref({ styleId: style.id, refId: ref.id }).then(onChanged, onError)
                            }
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
            </details>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{t("guiResults", {}, locale)}</h2>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("guiNoResults", {}, locale)}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((item) => (
                  <li key={item.id} className="flex flex-col overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      className="block bg-muted"
                      style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : "16 / 9" }}
                      onClick={() => onOpen(item.id)}
                    >
                      {thumbs[item.id] ? <img src={thumbs[item.id]} alt={item.prompt} className="h-full w-full object-contain" /> : null}
                    </button>
                    <div className="flex flex-col gap-1 p-2 text-xs">
                      <span className="font-medium">{item.guiLabel}</span>
                      <span className="line-clamp-2 text-muted-foreground">{item.prompt}</span>
                      {item.guiParts !== undefined ? (
                        <span>
                          {t("guiParts", { count: item.guiParts }, locale)}
                          {item.guiMissing?.length ? ` · ${t("guiMissing", { names: item.guiMissing.join(", ") }, locale)}` : ""}
                        </span>
                      ) : null}
                      {item.guiDir ?? item.projectPath ? (
                        <span className="break-all font-mono text-[10px] text-muted-foreground">{item.guiDir ?? item.projectPath}</span>
                      ) : null}
                      {item.guiMode === "ideas" || item.guiMode === "screen" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1 self-start"
                          onClick={() => void makeReference(item).catch(onError)}
                        >
                          <Icon name="Star" className="size-3.5" />
                          {t("guiUseRef", {}, locale)}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
          {MODES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={mode === item.id ? "default" : "outline"}
              onClick={() => setMode(item.id)}
            >
              {t(item.label, {}, locale)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t(modeInfo.hint, {}, locale)}</p>
        <textarea
          className={TEXTAREA_CLASS}
          value={prompt}
          rows={mode === "elements" ? 4 : 2}
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
          {mode === "elements" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={states} onChange={(event) => setStates(event.target.checked)} />
              {t("guiStates", {}, locale)}
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={needsPrompt && prompt.trim() === ""}>
            {running > 0 ? <Icon name="Loading" className="size-4 animate-spin" /> : <Icon name="Palette" className="size-4" />}
            {running > 0 ? `${t("guiGenerating", {}, locale)} (${running})` : t("guiGenerate", {}, locale)}
          </Button>
        </div>
      </form>
    </div>
  );
}

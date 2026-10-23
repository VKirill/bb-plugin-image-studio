import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "./i18n";
import type { I18nKey, Locale } from "./i18n";
import { GUI_MAX_REFS, GUI_PRESET_IDS, PALETTE_KEYS, type GuiMode, type GuiStyle, type PaletteKey } from "./src/gui";
import { CHARACTER_PRESET_IDS, type CharacterMode } from "./src/characters";
import type { RpcApi } from "./src/rpc-api";
import { fileToBase64 } from "./lib/files";
import { mapParallel } from "./src/queue";

export type GuiItem = {
  id: string;
  projectId: string;
  prompt: string;
  model: string;
  gateway: string;
  profileName: string | null;
  createdAt: string;
  width?: number;
  height?: number;
  projectPath: string | null;
  guiStyleId?: string | null;
  guiMode?: GuiMode | CharacterMode;
  guiLabel?: string;
  guiRun?: string;
  guiParts?: number;
  guiMissing?: string[];
  guiDir?: string | null;
  guiCharacter?: string;
};

export type Section = "gui" | "characters";

type Draft = Pick<GuiStyle, "name" | "theme" | "tags" | "palette" | "notes">;

type ModeInfo = { id: GuiMode | CharacterMode; label: I18nKey; hint: I18nKey; placeholder: I18nKey };
const MODES: Record<Section, readonly ModeInfo[]> = {
  gui: [
    { id: "ideas", label: "guiModeIdeas", hint: "guiHintIdeas", placeholder: "guiPlaceholderIdeas" },
    { id: "screen", label: "guiModeScreen", hint: "guiHintScreen", placeholder: "guiPlaceholderIdeas" },
    { id: "elements", label: "guiModeElements", hint: "guiHintElements", placeholder: "guiPlaceholderElements" },
    { id: "kit", label: "guiModeKit", hint: "guiHintKit", placeholder: "guiPlaceholderKit" },
  ],
  characters: [
    { id: "ideas", label: "guiModeIdeas", hint: "charHintIdeas", placeholder: "charPlaceholder" },
    { id: "model", label: "charModeModel", hint: "charHintModel", placeholder: "charPlaceholder" },
    { id: "turnaround", label: "charModeTurnaround", hint: "charHintTurnaround", placeholder: "charPlaceholder" },
    { id: "equipment", label: "charModeEquipment", hint: "charHintEquipment", placeholder: "charPlaceholderOwner" },
  ],
};
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

/** Records of one request (four ideas, two kit sheets) side by side, newest request first. */
function groupRuns(items: readonly GuiItem[]): GuiItem[][] {
  const runs: GuiItem[][] = [];
  const byRun = new Map<string, GuiItem[]>();
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

export function GuiPanel({
  section = "gui",
  api,
  projectId,
  styles,
  version,
  locale,
  onError,
  onChanged,
  onOpen,
}: {
  /** GUI projects or Characters projects: the same projects machinery, different modes and prompts. */
  section?: Section;
  api: RpcApi<typeof rpcContract>;
  projectId: string | null;
  /** This section's projects, most recently used first. */
  styles: GuiStyle[];
  /** Bumped by the parent on every change event, so the open project's list reloads. */
  version: number;
  locale: Locale;
  onError: (cause: unknown) => void;
  onChanged: () => void;
  onOpen: (items: GuiItem[], index: number, thumbs: Record<string, string>) => void;
}) {
  const [styleId, setStyleId] = useState<string>(styles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const style = styles.find((item) => item.id === styleId) ?? null;
  const [draft, setDraft] = useState<Draft>(draftOf(style));
  const [items, setItems] = useState<GuiItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<GuiMode | CharacterMode>("ideas");
  const [prompt, setPrompt] = useState("");
  const [equipment, setEquipment] = useState("");
  const [character, setCharacter] = useState("");
  const characters = section === "characters";
  const [states, setStates] = useState(false);
  const [running, setRunning] = useState(0);
  const [refPreviews, setRefPreviews] = useState<Record<string, string>>({});
  const requestedRefs = useRef(new Set<string>());
  const requestedThumbs = useRef(new Set<string>());
  const upload = useRef<HTMLInputElement>(null);

  // No project picked (first open, or the open one was deleted): the most recently used one.
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

  const ordered = groupRuns(items).flat();
  const modeInfo = MODES[section].find((item) => item.id === mode) ?? MODES[section][0]!;
  const needsPrompt = characters ? (mode === "equipment" ? equipment.trim() !== "" : true) : mode !== "kit";
  const ready = characters && mode === "equipment" ? equipment.trim() !== "" : !needsPrompt || prompt.trim() !== "";

  const saveDraft = async () => {
    const saved = await api.save_gui_style({
      id: creating ? undefined : styleId || undefined,
      projectId,
      section,
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

  const makeReference = async (item: GuiItem) => {
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

  const generate = (override?: { mode: CharacterMode; item: GuiItem }) => {
    if (!override && !ready) return;
    const runMode = override?.mode ?? mode;
    // From a picture: its description and name carry over, the picture becomes the design reference.
    const description = override ? prompt.trim() || override.item.prompt : prompt.trim();
    if (override?.mode === "equipment" && equipment.trim() === "") {
      onError(t("charNeedEquipment", {}, locale));
      return;
    }
    setRunning((count) => count + 1);
    api
      .gui_generate({
        projectId,
        styleId: styleId || undefined,
        section,
        mode: runMode,
        prompt: description,
        states: runMode === "elements" && states,
        ...(characters
          ? {
              equipment: equipment.trim(),
              character: character.trim() || override?.item.guiCharacter || "",
              images: override ? [override.item.id] : [],
            }
          : {}),
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-border flex w-full max-w-5xl flex-col gap-4 px-4 pb-6 pt-3 md:px-5 md:pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-2 text-xl font-medium">{t(characters ? "tabCharacters" : "tabGui", {}, locale)}</h1>
            <ProjectPicker
              styles={styles}
              value={styleId}
              creating={creating}
              locale={locale}
              heading={t(characters ? "charProjects" : "guiProjects", {}, locale)}
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

          {styles.length === 0 && !creating ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              {t(characters ? "charNoStyles" : "guiNoStyles", {}, locale)}
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
                    placeholder={t(characters ? "charThemePlaceholder" : "guiThemePlaceholder", {}, locale)}
                    onChange={(event) => setDraft({ ...draft, theme: event.target.value })}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiPresets", {}, locale)}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(characters ? CHARACTER_PRESET_IDS : GUI_PRESET_IDS).map((preset) => (
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
                {characters ? null : <div className="flex flex-col gap-1">
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
                </div>}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("guiNotes", {}, locale)}</span>
                  <Input
                    value={draft.notes}
                    placeholder={t(characters ? "charNotesPlaceholder" : "guiNotesPlaceholder", {}, locale)}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  />
                </label>
                {style && !creating ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{t("guiRefs", {}, locale)}</span>
                    <p className="text-xs text-muted-foreground">{t(characters ? "charRefsHint" : "guiRefsHint", { max: GUI_MAX_REFS }, locale)}</p>
                    <div className="flex flex-wrap gap-2">
                      {style.refs.map((ref) => (
                        <div key={ref.id} className="relative h-20 w-28 overflow-hidden rounded-md border border-border bg-muted">
                          {refPreviews[ref.id] ? <img src={refPreviews[ref.id]} alt="" className="h-full w-full object-cover" /> : null}
                          <span className="absolute bottom-1 left-1 rounded bg-background/85 px-1 text-[10px]">
                            {t(ref.role === "art" ? "guiRoleArt" : characters ? "charRoleConcept" : "guiRoleConcept", {}, locale)}
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
                      {characters ? (
                        <CharacterActions
                          item={item}
                          locale={locale}
                          refsFull={style.refs.length >= GUI_MAX_REFS}
                          onReference={() => void makeReference(item).catch(onError)}
                          onRun={(next) => generate({ mode: next, item })}
                        />
                      ) : item.guiMode === "ideas" || item.guiMode === "screen" ? (
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
                      ) : null}
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
          {MODES[section].map((item) => (
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
        {characters ? (
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-40"
              value={character}
              maxLength={80}
              placeholder={t("charName", {}, locale)}
              aria-label={t("charName", {}, locale)}
              onChange={(event) => setCharacter(event.target.value)}
            />
            <Input
              className="min-w-[12rem] flex-1"
              value={equipment}
              placeholder={t("charEquipmentPlaceholder", {}, locale)}
              aria-label={t("charEquipment", {}, locale)}
              onChange={(event) => setEquipment(event.target.value)}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {mode === "elements" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={states} onChange={(event) => setStates(event.target.checked)} />
              {t("guiStates", {}, locale)}
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!ready || creating}>
            {running > 0 ? <Icon name="Loading" className="size-4 animate-spin" /> : <Icon name="Palette" className="size-4" />}
            {running > 0 ? `${t("guiGenerating", {}, locale)} (${running})` : t("guiGenerate", {}, locale)}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Hover actions on a character picture: make it a style reference, or take it to the next step with it as the design. */
function CharacterActions({
  item,
  locale,
  refsFull,
  onReference,
  onRun,
}: {
  item: GuiItem;
  locale: Locale;
  refsFull: boolean;
  onReference: () => void;
  onRun: (mode: CharacterMode) => void;
}) {
  const next: ReadonlyArray<{ mode: CharacterMode; icon: "ArrowRight" | "RotateCcw" | "PackageReceive"; label: I18nKey }> =
    item.guiMode === "ideas"
      ? [
          { mode: "model", icon: "ArrowRight", label: "charToModel" },
          { mode: "equipment", icon: "PackageReceive", label: "charToEquipment" },
        ]
      : item.guiMode === "model"
        ? [{ mode: "turnaround", icon: "RotateCcw", label: "charToTurnaround" }]
        : [];
  if (item.guiMode !== "ideas" && item.guiMode !== "model") return null;
  const button =
    "rounded-md bg-background/85 p-1.5 shadow-sm transition-opacity disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100";
  return (
    <div className="absolute right-1.5 top-1.5 flex gap-1">
      {next.map((action) => (
        <button key={action.mode} type="button" className={button} title={t(action.label, {}, locale)} aria-label={t(action.label, {}, locale)} onClick={() => onRun(action.mode)}>
          <Icon name={action.icon} className="size-4" />
        </button>
      ))}
      <button type="button" className={button} title={t("guiUseRef", {}, locale)} aria-label={t("guiUseRef", {}, locale)} disabled={refsFull} onClick={onReference}>
        <Icon name="Star" className="size-4" />
      </button>
    </div>
  );
}

/** The project switcher: a searchable list, so twenty or fifty projects stay one click away. */
function ProjectPicker({
  styles,
  value,
  creating,
  locale,
  heading,
  onPick,
  onNew,
}: {
  styles: GuiStyle[];
  value: string;
  creating: boolean;
  locale: Locale;
  heading: string;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = styles.find((item) => item.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={heading}
          className="h-9 min-w-[12rem] max-w-full justify-between gap-2 px-3 font-normal"
        >
          <span className="min-w-0 truncate">
            {creating ? t("guiNewStyle", {}, locale) : (current?.name ?? t("guiPickProject", {}, locale))}
          </span>
          <Icon name="ChevronDown" className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0" mobileTitle={heading}>
        <Command>
          <CommandInput placeholder={t("guiSearchProjects", {}, locale)} />
          <CommandList>
            <CommandEmpty>{t("guiNoMatch", {}, locale)}</CommandEmpty>
            {styles.length > 0 ? (
              <CommandGroup heading={heading}>
                {styles.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.id}`}
                    onSelect={() => {
                      onPick(item.id);
                      setOpen(false);
                    }}
                  >
                    <Icon name="Check" className={item.id === value && !creating ? "opacity-100" : "opacity-0"} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup>
              <CommandItem
                value="+ new project"
                onSelect={() => {
                  onNew();
                  setOpen(false);
                }}
              >
                <Icon name="Plus" />
                {t("guiNewStyle", {}, locale)}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

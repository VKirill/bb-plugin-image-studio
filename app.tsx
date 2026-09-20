import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { definePluginApp, useBbContext, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon, preloadExtendedIcons } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { GeneratePickerForm, GeneratePickerInteraction } from "./generate-picker";
import { ModelCatalogField } from "./model-catalog";
import { detectLocale, t } from "./i18n";
import type { I18nKey, Locale } from "./i18n";
import { selfieAt, BODY_OPTIONS, BUST_OPTIONS, type PersonProfile } from "./src/profiles";
import { aspectLabel, DEFAULT_LAST_CHOICE, GENERATE_PICKER_ID, type LastChoice } from "./src/formats";
import { MODEL_IDS, modelFalOnly } from "./src/models";
import { enabledFromSettings, type StudioSettings } from "./src/settings";

type Tab = "settings" | "people" | "gallery";
type UiLocale = "auto" | "en" | "ru";
type PhotoSlotId = "selfie-0" | "selfie-1" | "selfie-2" | "manicure";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SELECT_CLASS = "h-8 rounded-md border border-input bg-background px-2 text-sm";

function imageFiles(list: FileList | null, max: number): File[] {
  return Array.from(list ?? []).filter((file) => IMAGE_TYPES.has(file.type)).slice(0, max);
}
type GenerationItem = {
  id: string;
  projectId: string;
  prompt: string;
  model: string;
  gateway: string;
  profileName: string | null;
  createdAt: string;
  width?: number;
  height?: number;
};

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

function resolveLocale(mode: UiLocale): Locale {
  return mode === "en" || mode === "ru" ? mode : detectLocale();
}

function KeyBlock({
  label,
  catalog,
  catalogName,
  configured,
  locale,
  onLink,
  onSave,
}: {
  label: string;
  catalog: { available: boolean; names: string[] };
  catalogName: string;
  configured: boolean;
  locale: Locale;
  onLink: (name: string) => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(!configured);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="text-sm font-medium">{label}</div>
      {catalog.available ? (
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={catalogName}
          onChange={(event) => onLink(event.target.value)}
        >
          <option value="">{t("catalogManual", {}, locale)}</option>
          {catalogName && !catalog.names.includes(catalogName) ? (
            <option value={catalogName}>{catalogName}</option>
          ) : null}
          {catalog.names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-muted-foreground">{t("catalogUnavailable", {}, locale)}</p>
      )}
      {catalogName ? (
        <p className="text-xs text-muted-foreground">{t("catalogLinked", { name: catalogName }, locale)}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {configured ? t("keySaved", {}, locale) : t("keyMissing", {}, locale)}
      </p>
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (draft.trim() === "") return;
            onSave(draft.trim());
            setDraft("");
            setEditing(false);
          }}
        >
          <Input
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("keyPlaceholder", {}, locale)}
            autoComplete="off"
          />
          <Button type="submit" disabled={draft.trim() === ""}>
            {t("saveKey", {}, locale)}
          </Button>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          {t("replaceKey", {}, locale)}
        </Button>
      )}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PhotoSlot({
  label,
  preview,
  locale,
  multiple,
  onPick,
  onClear,
}: {
  label: string;
  preview: string | null;
  locale: Locale;
  multiple?: boolean;
  onPick: (files: File[]) => void;
  onClear?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="relative">
        <label className="relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40 hover:bg-muted">
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="UserRoundPlus" className="size-5 text-muted-foreground" />
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={multiple}
            className="hidden"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const files = imageFiles(event.target.files, multiple ? 3 : 1);
              event.target.value = "";
              if (files.length > 0) onPick(files);
            }}
          />
        </label>
        {preview && onClear ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-1 top-1 size-6"
            aria-label={t("removePhoto", {}, locale)}
            onClick={(event) => {
              event.preventDefault();
              onClear();
            }}
          >
            <Icon name="X" className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return text.includes(",") ? text.slice(text.indexOf(",") + 1) : text;
}

function PersonCard({
  profile,
  locale,
  previews,
  onSave,
  onDelete,
  onError,
  onPhoto,
  onRemovePhoto,
}: {
  profile?: PersonProfile;
  locale: Locale;
  previews: Record<string, string>;
  onSave: (input: {
    id?: string;
    name: string;
    gender: "male" | "female";
    age: number;
    heightCm: number;
    weightKg: number;
    bodyType: string;
    bust: string;
  }) => Promise<PersonProfile>;
  onDelete?: () => void;
  onError?: (cause: unknown) => void;
  onPhoto: (profileId: string, slot: PhotoSlotId, file: File) => Promise<void>;
  onRemovePhoto: (profileId: string, photoId: string, kind: "selfie" | "manicure") => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: profile?.name ?? "",
    gender: (profile?.gender ?? "female") as "male" | "female",
    age: String(profile?.age ?? 30),
    heightCm: String(profile?.heightCm ?? 168),
    weightKg: String(profile?.weightKg ?? 58),
    bodyType: profile?.bodyType && profile.bodyType.trim() !== "" ? profile.bodyType : "average",
    bust: profile?.bust ?? "",
  });
  const [pending, setPending] = useState<Partial<Record<PhotoSlotId, { file: File; url: string }>>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    return () => {
      for (const item of Object.values(pendingRef.current)) {
        if (item) URL.revokeObjectURL(item.url);
      }
    };
  }, []);

  const previewFor = (slot: PhotoSlotId): string | null => {
    if (pending[slot]) return pending[slot]!.url;
    if (!profile) return null;
    if (slot === "manicure") {
      return profile.manicurePhoto ? previews[profile.manicurePhoto.id] ?? null : null;
    }
    const selfie = selfieAt(profile, Number(slot.slice(-1)) as 0 | 1 | 2);
    return selfie ? previews[selfie.id] ?? null : null;
  };

  const pickSlot = async (slot: PhotoSlotId, file: File) => {
    if (profile) {
      await onPhoto(profile.id, slot, file);
      return;
    }
    setPending((current) => {
      const previous = current[slot];
      if (previous) URL.revokeObjectURL(previous.url);
      return { ...current, [slot]: { file, url: URL.createObjectURL(file) } };
    });
  };

  const pickSelfies = async (files: File[], start = 0) => {
    const slots: PhotoSlotId[] = ["selfie-0", "selfie-1", "selfie-2"];
    for (let index = 0; index < files.length && start + index < slots.length; index += 1) {
      await pickSlot(slots[start + index], files[index]);
    }
  };

  const clearSlot = async (slot: PhotoSlotId) => {
    if (profile) {
      if (slot === "manicure" && profile.manicurePhoto) {
        await onRemovePhoto(profile.id, profile.manicurePhoto.id, "manicure");
      } else {
        const selfie = selfieAt(profile, Number(slot.slice(-1)) as 0 | 1 | 2);
        if (selfie) await onRemovePhoto(profile.id, selfie.id, "selfie");
      }
      return;
    }
    setPending((current) => {
      const previous = current[slot];
      if (previous) URL.revokeObjectURL(previous.url);
      const next = { ...current };
      delete next[slot];
      return next;
    });
  };

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              const saved = await onSave({
                ...(profile?.id ? { id: profile.id } : {}),
                name: draft.name,
                gender: draft.gender,
                age: Number(draft.age),
                heightCm: Number(draft.heightCm),
                weightKg: Number(draft.weightKg),
                bodyType: draft.bodyType || "average",
                bust: draft.bust,
              });
              const uploads = Object.entries(pending) as Array<[PhotoSlotId, { file: File; url: string }]>;
              for (const [slot, item] of uploads) {
                if (slot === "manicure" && saved.gender !== "female") continue;
                await onPhoto(saved.id, slot, item.file);
                URL.revokeObjectURL(item.url);
              }
              setPending({});
              if (!profile) {
                setDraft({
                  name: "",
                  gender: draft.gender,
                  age: draft.age,
                  heightCm: draft.heightCm,
                  weightKg: draft.weightKg,
                  bodyType: draft.bodyType,
                  bust: "",
                });
              }
            } catch (cause) {
              onError?.(cause);
            }
          })();
        }}
      >
        <div>
          <h2 className="text-sm font-medium">{profile ? profile.name : t("newPerson", {}, locale)}</h2>
          {profile ? null : (
            <p className="mt-1 text-xs text-muted-foreground">{t("newPersonHint", {}, locale)}</p>
          )}
        </div>
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t("photos", {}, locale)}</h3>
            <label>
              <span className="sr-only">{t("addPhotos", {}, locale)}</span>
              <Button type="button" variant="outline" size="sm" asChild>
                <span>{t("addPhotos", {}, locale)}</span>
              </Button>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const files = imageFiles(event.target.files, 3);
                  event.target.value = "";
                  if (files.length > 0) void pickSelfies(files);
                }}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t("addPhotosHint", {}, locale)}</p>
          <div className="grid max-w-xl grid-cols-4 gap-2">
            {([0, 1, 2] as const).map((slot) => (
              <PhotoSlot
                key={slot}
                locale={locale}
                multiple
                label={t("selfie", { n: slot + 1 }, locale)}
                preview={previewFor(`selfie-${slot}`)}
                onPick={(files) => void pickSelfies(files, slot)}
                onClear={() => void clearSlot(`selfie-${slot}`)}
              />
            ))}
            {draft.gender === "female" ? (
              <PhotoSlot
                locale={locale}
                label={t("manicure", {}, locale)}
                preview={previewFor("manicure")}
                onPick={(files) => {
                  const file = files[0];
                  if (file) void pickSlot("manicure", file);
                }}
                onClear={() => void clearSlot("manicure")}
              />
            ) : (
              <div />
            )}
          </div>
          {draft.gender === "female" ? (
            <p className="text-xs text-muted-foreground">{t("manicureHint", {}, locale)}</p>
          ) : null}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("details", {}, locale)}</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Field label={t("name", {}, locale)} className="col-span-2">
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
            </Field>
            <Field label={t("gender", {}, locale)}>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={draft.gender}
                onChange={(event) =>
                  setDraft({ ...draft, gender: event.target.value === "female" ? "female" : "male" })
                }
              >
                <option value="male">{t("male", {}, locale)}</option>
                <option value="female">{t("female", {}, locale)}</option>
              </select>
            </Field>
            <Field label={t("age", {}, locale)}>
              <Input
                type="number"
                min={1}
                value={draft.age}
                onChange={(event) => setDraft({ ...draft, age: event.target.value })}
              />
            </Field>
            <Field label={t("height", {}, locale)}>
              <Input
                type="number"
                min={1}
                value={draft.heightCm}
                onChange={(event) => setDraft({ ...draft, heightCm: event.target.value })}
              />
            </Field>
            <Field label={t("weight", {}, locale)}>
              <Input
                type="number"
                min={1}
                value={draft.weightKg}
                onChange={(event) => setDraft({ ...draft, weightKg: event.target.value })}
              />
            </Field>
            <Field label={t("bodyType", {}, locale)} className="col-span-2">
              <select
                className={SELECT_CLASS}
                value={draft.bodyType}
                onChange={(event) => setDraft({ ...draft, bodyType: event.target.value })}
              >
                {BODY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.key as I18nKey, {}, locale)}
                  </option>
                ))}
                {draft.bodyType && !BODY_OPTIONS.some((option) => option.value === draft.bodyType) ? (
                  <option value={draft.bodyType}>{draft.bodyType}</option>
                ) : null}
              </select>
            </Field>
            {draft.gender === "female" ? (
              <Field label={t("bust", {}, locale)} className="col-span-2">
                <select
                  className={SELECT_CLASS}
                  value={draft.bust}
                  onChange={(event) => setDraft({ ...draft, bust: event.target.value })}
                >
                  <option value="">{t("bustNone", {}, locale)}</option>
                  {BUST_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.key as I18nKey, {}, locale)}
                    </option>
                  ))}
                  {draft.bust && !BUST_OPTIONS.some((option) => option.value === draft.bust) ? (
                    <option value={draft.bust}>{draft.bust}</option>
                  ) : null}
                </select>
              </Field>
            ) : null}
          </div>
        </section>
        <div className="flex justify-end gap-2">
          {onDelete ? (
            <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
              {t("deletePerson", {}, locale)}
            </Button>
          ) : null}
          <Button type="submit">
            {profile ? t("saveChanges", {}, locale) : t("addPerson", {}, locale)}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PhotoViewer({
  items,
  index,
  thumbs,
  fullPreviews,
  locale,
  onIndex,
  onClose,
}: {
  items: GenerationItem[];
  index: number;
  thumbs: Record<string, string>;
  fullPreviews: Record<string, string>;
  locale: Locale;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const src = item ? (fullPreviews[item.id] ?? thumbs[item.id]) : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndex(index === 0 ? items.length - 1 : index - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndex(index === items.length - 1 ? 0 : index + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onIndex]);

  if (!item) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        hideCloseButton
        className="max-h-[92vh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <DialogTitle className="truncate text-sm font-medium">
            {t("photoOf", { current: index + 1, total: items.length }, locale)}
          </DialogTitle>
          <DialogDescription className="sr-only">{item.prompt}</DialogDescription>
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={t("closeViewer", {}, locale)} onClick={onClose}>
            <Icon name="X" className="size-4" />
          </Button>
        </div>
        <div className="relative flex min-h-[16rem] flex-1 items-center justify-center bg-muted">
          {src ? (
            <img src={src} alt={item.prompt} className="max-h-[min(70vh,36rem)] w-full object-contain" />
          ) : (
            <div className="text-sm text-muted-foreground">{t("loading", {}, locale)}</div>
          )}
          {items.length > 1 ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 size-8 -translate-y-1/2"
                aria-label={t("previousPhoto", {}, locale)}
                onClick={() => onIndex(index === 0 ? items.length - 1 : index - 1)}
              >
                <Icon name="ChevronLeft" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 size-8 -translate-y-1/2"
                aria-label={t("nextPhoto", {}, locale)}
                onClick={() => onIndex(index === items.length - 1 ? 0 : index + 1)}
              >
                <Icon name="ChevronRight" className="size-4" />
              </Button>
            </>
          ) : null}
        </div>
        <div className="border-t border-border px-3 py-2">
          <p className="line-clamp-2 text-sm">{item.prompt}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.model} · {item.gateway}
            {item.width && item.height ? ` · ${item.width}×${item.height} (${aspectLabel(item.width, item.height)})` : ""}
            {item.profileName ? ` · ${item.profileName}` : ""}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StudioPage({ initialView = "gallery" }: { initialView?: Tab }) {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId } = useBbContext();
  const [tab, setTab] = useState<Tab>(initialView);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [catalog, setCatalog] = useState<{ available: boolean; names: string[] }>({
    available: false,
    names: [],
  });
  const [secrets, setSecrets] = useState({ falConfigured: false, kieConfigured: false });
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [generations, setGenerations] = useState<GenerationItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [fullPreviews, setFullPreviews] = useState<Record<string, string>>({});
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [gateway, setGateway] = useState("");
  const [resolution, setResolution] = useState<LastChoice["resolution"]>(DEFAULT_LAST_CHOICE.resolution);
  const [profileId, setProfileId] = useState("");
  const primedChoice = useRef(false);
  const [busy, setBusy] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const locale = useMemo(() => resolveLocale(settings?.uiLocale ?? "auto"), [settings?.uiLocale]);

  useEffect(() => {
    void preloadExtendedIcons();
  }, []);

  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);

  const load = useCallback(() => {
    rpc
      .call("snapshot", { projectId: projectId ?? null })
      .then((snap) => {
        setSettings(snap.settings);
        setCatalog(snap.catalog);
        setSecrets(snap.secrets);
        setProfiles(snap.profiles);
        setGenerations(snap.generations);
        if (!primedChoice.current && snap.lastGenerate) {
          primedChoice.current = true;
          setModel(snap.lastGenerate.model);
          setGateway(snap.lastGenerate.gateway);
          setResolution(snap.lastGenerate.resolution);
        }
        setError(null);
      }, report);
  }, [rpc, projectId, report]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime("image-studio-changed", load);

  useEffect(() => {
    for (const item of generations) {
      if (thumbs[item.id]) continue;
      void rpc
        .call("generation_preview", { id: item.id, projectId: item.projectId, variant: "thumb" })
        .then((file) => {
          setThumbs((current) => ({
            ...current,
            [item.id]: `data:${file.mimeType};base64,${file.base64}`,
          }));
        })
        .catch(() => undefined);
    }
  }, [generations, thumbs, rpc]);

  useEffect(() => {
    if (viewerIndex === null) return;
    const item = generations[viewerIndex];
    if (!item || fullPreviews[item.id]) return;
    void rpc
      .call("generation_preview", { id: item.id, projectId: item.projectId, variant: "full" })
      .then((file) => {
        setFullPreviews((current) => ({
          ...current,
          [item.id]: `data:${file.mimeType};base64,${file.base64}`,
        }));
      })
      .catch(() => undefined);
  }, [fullPreviews, generations, rpc, viewerIndex]);

  useEffect(() => {
    for (const profile of profiles) {
      const photos = [
        ...profile.photos,
        ...(profile.manicurePhoto ? [profile.manicurePhoto] : []),
      ];
      for (const photo of photos) {
        if (photoPreviews[photo.id]) continue;
        void rpc
          .call("profile_photo_preview", { profileId: profile.id, photoId: photo.id })
          .then((file) => {
            setPhotoPreviews((current) => ({
              ...current,
              [photo.id]: `data:${file.mimeType};base64,${file.base64}`,
            }));
          })
          .catch(() => undefined);
      }
    }
  }, [photoPreviews, profiles, rpc]);

  const saveSettings = (patch: Partial<StudioSettings>) => {
    rpc.call("update_settings", patch).then(load, report);
  };

  const uploadPhoto = async (targetId: string, slot: PhotoSlotId, file: File) => {
    await rpc.call("add_photo", {
      profileId: targetId,
      slot,
      filename: file.name,
      mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      base64: await fileToBase64(file),
    });
    load();
  };

  const falOnlySelected = modelFalOnly((model || "nano-banana-2") as LastChoice["model"]);

  const navItems: Array<{ id: Tab; icon: "GridView" | "UserRound" | "Settings"; label: string }> = [
    { id: "gallery", icon: "GridView", label: t("tabGallery", {}, locale) },
    { id: "people", icon: "UserRound", label: t("tabProfiles", {}, locale) },
    { id: "settings", icon: "Settings", label: t("tabSettings", {}, locale) },
  ];

  const pickerValue = {
    model: (model || "nano-banana-2") as LastChoice["model"],
    gateway: (falOnlySelected ? "fal" : gateway || "kie") as LastChoice["gateway"],
    resolution,
  };
  const pickerEnabled = settings
    ? enabledFromSettings(settings)
    : Object.fromEntries(
        MODEL_IDS.map((id) => [id, id === "nano-banana-2" || id === "nano-banana-pro" || id === "muse-image"]),
      );
  const onPickerChange = (next: LastChoice) => {
    setModel(next.model);
    setGateway(next.gateway);
    setResolution(next.resolution);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <nav
        className="order-last flex shrink-0 items-stretch justify-around gap-0.5 border-t border-border bg-background px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 md:order-first md:w-[11.5rem] md:flex-col md:justify-start md:gap-0.5 md:border-r md:border-t-0 md:p-2"
        aria-label={t("pluginTitle", {}, locale)}
      >
        {navItems.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={tab === item.id ? "secondary" : "ghost"}
            size="sm"
            className="h-11 min-h-11 min-w-0 flex-1 flex-col gap-0.5 px-1 text-center text-[11px] font-medium leading-tight md:h-8 md:min-h-8 md:w-full md:flex-none md:flex-row md:justify-start md:gap-2 md:px-2 md:text-left md:text-sm md:leading-normal"
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} className="size-4 shrink-0" />
            <span className="max-w-full truncate">{item.label}</span>
          </Button>
        ))}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tab === "gallery" ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 md:px-4 md:py-3">
              <h1 className="text-lg font-medium md:text-xl">{t("tabGallery", {}, locale)}</h1>
              {error ? (
                <p role="alert" className="min-w-0 truncate text-sm text-destructive">
                  {t("error", {}, locale)}: {error}
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {generations.length === 0 ? (
                <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 px-4 text-center">
                  <Icon name="GridView" className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t("galleryEmpty", {}, locale)}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">{t("galleryEmptyHint", {}, locale)}</p>
                </div>
              ) : (
                <ul className="columns-2 gap-2 p-2 sm:columns-3 sm:p-3 lg:columns-4 xl:columns-5">
                  {generations.map((item, index) => {
                    const ratio =
                      item.width && item.height
                        ? `${item.width} / ${item.height}`
                        : undefined;
                    const label =
                      item.width && item.height ? aspectLabel(item.width, item.height) : null;
                    return (
                    <li key={item.id} className="mb-2 break-inside-avoid">
                      <button
                        type="button"
                        className="relative block w-full overflow-hidden rounded-md bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setViewerIndex(index)}
                      >
                        {thumbs[item.id] ? (
                          <img
                            src={thumbs[item.id]}
                            alt={item.prompt}
                            loading="lazy"
                            width={item.width}
                            height={item.height}
                            className="block h-auto w-full"
                            style={ratio ? { aspectRatio: ratio } : undefined}
                          />
                        ) : (
                          <span
                            className="block w-full bg-muted"
                            style={{ aspectRatio: ratio ?? "1 / 1" }}
                          >
                            <span className="sr-only">{t("loading", {}, locale)}</span>
                          </span>
                        )}
                        {label ? (
                          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-background/85 px-1 py-0.5 text-[10px] font-medium tabular-nums text-foreground">
                            {label}
                          </span>
                        ) : null}
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <form
              className="flex shrink-0 flex-col gap-2 border-t border-border bg-background p-2 md:p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (prompt.trim() === "" || busy) return;
                setBusy(true);
                rpc
                  .call("generate", {
                    projectId: projectId ?? null,
                    prompt: prompt.trim(),
                    model: model || undefined,
                    gateway: falOnlySelected ? "fal" : gateway || undefined,
                    profile: profileId || undefined,
                    resolution: falOnlySelected && model === "muse-image" ? undefined : resolution,
                  })
                  .then(() => {
                    setPrompt("");
                    load();
                  }, report)
                  .finally(() => setBusy(false));
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t("prompt", {}, locale)}
                  aria-label={t("prompt", {}, locale)}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-11 shrink-0 md:hidden"
                  disabled={busy || prompt.trim() === ""}
                  aria-label={busy ? t("generating", {}, locale) : t("generate", {}, locale)}
                >
                  <Icon name="Palette" className="size-4" />
                </Button>
                <Button type="submit" className="hidden shrink-0 md:inline-flex" disabled={busy || prompt.trim() === ""}>
                  {busy ? t("generating", {}, locale) : t("generate", {}, locale)}
                </Button>
              </div>
              <select
                className="h-11 rounded-md border border-input bg-background px-2 text-sm md:h-8"
                value={profileId}
                aria-label={t("profile", {}, locale)}
                onChange={(event) => setProfileId(event.target.value)}
              >
                <option value="">{t("profileNone", {}, locale)}</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <details className="md:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <Icon name="SlidersHorizontal" className="size-4 shrink-0" />
                  {t("generateOptions", {}, locale)}
                </summary>
                <div className="pt-2">
                  <GeneratePickerForm
                    showAspect={false}
                    compact
                    value={pickerValue}
                    locale={locale}
                    enabledModels={pickerEnabled}
                    busy={busy}
                    onChange={onPickerChange}
                  />
                </div>
              </details>
              <div className="hidden md:block">
                <GeneratePickerForm
                  showAspect={false}
                  value={pickerValue}
                  locale={locale}
                  enabledModels={pickerEnabled}
                  busy={busy}
                  onChange={onPickerChange}
                />
              </div>
            </form>
            {viewerIndex !== null ? (
              <PhotoViewer
                items={generations}
                index={viewerIndex}
                thumbs={thumbs}
                fullPreviews={fullPreviews}
                locale={locale}
                onIndex={setViewerIndex}
                onClose={() => setViewerIndex(null)}
              />
            ) : null}
          </>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-border w-full max-w-3xl px-4 pb-8 pt-3 md:px-5 md:pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-medium">
                {tab === "people" ? t("tabProfiles", {}, locale) : t("tabSettings", {}, locale)}
              </h1>
              {tab === "people" ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("peopleHint", {}, locale)}</p>
              ) : null}
              {tab === "settings" ? (
                <p className="mt-1 text-sm text-muted-foreground">{t("settingsHint", {}, locale)}</p>
              ) : null}
            </div>
            {tab === "settings" ? (
              <div className="flex items-center gap-1" role="group" aria-label={t("language", {}, locale)}>
                {(["auto", "en", "ru"] as const).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={(settings?.uiLocale ?? "auto") === item ? "default" : "outline"}
                    onClick={() => saveSettings({ uiLocale: item })}
                  >
                    {item === "auto"
                      ? t("languageAuto", {}, locale)
                      : item === "en"
                        ? t("languageEn", {}, locale)
                        : t("languageRu", {}, locale)}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t("error", {}, locale)}: {error}
          </p>
        ) : null}

        {tab === "settings" && settings ? (
          <div className="mt-5 flex flex-col gap-5">
            <section>
              <h2 className="mb-3 text-sm font-medium">{t("modelsHeading", {}, locale)}</h2>
              <ModelCatalogField settings={settings} locale={locale} onChange={saveSettings} />
              <p className="mt-2 text-xs text-muted-foreground">{t("falOnlyModels", {}, locale)}</p>
              <label className="mt-4 block text-sm">
                {t("defaultGateway", {}, locale)}
                <select
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={settings.defaultGateway}
                  onChange={(event) =>
                    saveSettings({ defaultGateway: event.target.value === "kie" ? "kie" : "fal" })
                  }
                >
                  <option value="kie">{t("gatewayKie", {}, locale)}</option>
                  <option value="fal">{t("gatewayFal", {}, locale)}</option>
                </select>
              </label>
              <p className="mt-1 text-xs text-muted-foreground">{t("gatewayNanoOnly", {}, locale)}</p>
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">{t("keysHeading", {}, locale)}</h2>
              <KeyBlock
                label={t("falKey", {}, locale)}
                catalog={catalog}
                catalogName={settings.falKeyCatalog}
                configured={secrets.falConfigured}
                locale={locale}
                onLink={(name) => saveSettings({ falKeyCatalog: name })}
                onSave={(value) => rpc.call("set_secret", { slot: "falApiKey", value }).then(load, report)}
              />
              <KeyBlock
                label={t("kieKey", {}, locale)}
                catalog={catalog}
                catalogName={settings.kieKeyCatalog}
                configured={secrets.kieConfigured}
                locale={locale}
                onLink={(name) => saveSettings({ kieKeyCatalog: name })}
                onSave={(value) => rpc.call("set_secret", { slot: "kieApiKey", value }).then(load, report)}
              />
            </section>
          </div>
        ) : null}

        {tab === "people" ? (
          <div className="mt-5 flex flex-col gap-4">
            {profiles.length === 0 ? (
              <EmptyState>{t("noPeople", {}, locale)}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <PersonCard
                      profile={profile}
                      locale={locale}
                      previews={photoPreviews}
                      onError={report}
                      onSave={(input) => rpc.call("save_profile", input).then((saved) => {
                        load();
                        return saved;
                      })}
                      onDelete={() => void rpc.call("delete_profile", { id: profile.id }).then(load, report)}
                      onPhoto={uploadPhoto}
                      onRemovePhoto={async (id, photoId, kind) => {
                        await rpc.call("remove_photo", { profileId: id, photoId, kind });
                        load();
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
            <PersonCard
              locale={locale}
              previews={photoPreviews}
              onError={report}
              onSave={async (input) => {
                const saved = await rpc.call("save_profile", input);
                load();
                return saved;
              }}
              onPhoto={uploadPhoto}
              onRemovePhoto={async (id, photoId, kind) => {
                await rpc.call("remove_photo", { profileId: id, photoId, kind });
                load();
              }}
            />
          </div>
        ) : null}
        </div>
        </div>
        )}
      </div>
    </div>
  );
}

function StudioNavPanel() {
  return <StudioPage initialView="gallery" />;
}

function SettingsHome() {
  return <StudioPage initialView="settings" />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "studio",
    title: t("pluginTitle"),
    icon: "Palette",
    path: "studio",
    component: StudioNavPanel,
  });
  app.slots.settingsSection({
    id: "studio-settings",
    title: t("settingsTitle"),
    description: t("settingsHint"),
    component: SettingsHome,
  });
  app.slots.pendingInteraction({
    id: GENERATE_PICKER_ID,
    component: GeneratePickerInteraction,
  });
});

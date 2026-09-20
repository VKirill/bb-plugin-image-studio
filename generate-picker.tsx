import { useMemo, useState } from "react";
import type { PluginPendingInteractionProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "./lib/utils";
import { detectLocale, t } from "./i18n";
import type { Locale } from "./i18n";
import {
  ASPECT_RATIOS,
  pickerPayloadSchema,
  pickerResponseSchema,
  RESOLUTIONS,
  modelUsesResolution,
  type LastChoice,
  type ModelId,
} from "./src/formats";
import { MODEL_IDS, modelFalOnly } from "./src/models";

function ChoiceButtons<T extends string>({
  label,
  values,
  selected,
  disabled,
  onSelect,
  nameFor,
  compact,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  disabled?: boolean;
  onSelect: (value: T) => void;
  nameFor?: (value: T) => string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex gap-1.5", compact ? "min-w-0 items-center" : "flex-col")}>
      <div className={cn("text-xs font-medium text-muted-foreground", compact && "shrink-0")}>
        {label}
      </div>
      <div
        className={cn(
          "flex gap-1.5",
          compact ? "min-w-0 flex-1 flex-nowrap overflow-x-auto pb-0.5" : "flex-wrap",
        )}
      >
        {values.map((value) => {
          const active = value === selected;
          return (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              disabled={disabled}
              aria-pressed={active}
              className={compact ? "h-11 shrink-0 px-3" : undefined}
              onClick={() => onSelect(value)}
            >
              {nameFor ? nameFor(value) : value}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function modelLabel(id: ModelId, locale: Locale): string {
  if (id === "nano-banana-2") return t("modelNano2", {}, locale);
  if (id === "nano-banana-pro") return t("modelNanoPro", {}, locale);
  if (id === "gpt-image-2.5-flare") return t("modelGptFlare", {}, locale);
  if (id === "gpt-image-2.5-sunburst") return t("modelGptSunburst", {}, locale);
  if (id === "flux-2-pro") return t("modelFlux", {}, locale);
  if (id === "seedream-5") return t("modelSeedream", {}, locale);
  if (id === "grok-imagine") return t("modelGrok", {}, locale);
  return t("modelMuse", {}, locale);
}

export function GeneratePickerForm({
  value,
  locale,
  enabledModels,
  busy,
  onChange,
  showAspect = true,
  compact = false,
}: {
  value: LastChoice;
  locale: Locale;
  enabledModels: Partial<Record<ModelId, boolean>>;
  busy?: boolean;
  onChange: (next: LastChoice) => void;
  showAspect?: boolean;
  compact?: boolean;
}) {
  const models = MODEL_IDS.filter((id) => enabledModels[id] === true);
  const showResolution = modelUsesResolution(value.model);
  const showGateway = !modelFalOnly(value.model);

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
      <ChoiceButtons
        compact={compact}
        label={t("model", {}, locale)}
        values={models}
        selected={value.model}
        disabled={busy}
        onSelect={(model) =>
          onChange({
            ...value,
            model,
            gateway: modelFalOnly(model) ? "fal" : modelFalOnly(value.model) ? "kie" : value.gateway,
          })
        }
        nameFor={(id) => modelLabel(id, locale)}
      />
      {showGateway ? (
        <ChoiceButtons
          compact={compact}
          label={t("gateway", {}, locale)}
          values={["kie", "fal"] as const}
          selected={value.gateway}
          disabled={busy}
          onSelect={(gateway) => onChange({ ...value, gateway })}
          nameFor={(id) => (id === "fal" ? t("gatewayFal", {}, locale) : t("gatewayKie", {}, locale))}
        />
      ) : (
        <p className="text-xs text-muted-foreground">{t("falOnlyModels", {}, locale)}</p>
      )}
      {showAspect ? (
        <ChoiceButtons
          compact={compact}
          label={t("aspect", {}, locale)}
          values={ASPECT_RATIOS}
          selected={value.aspectRatio ?? "4:5"}
          disabled={busy}
          onSelect={(aspectRatio) => onChange({ ...value, aspectRatio })}
        />
      ) : null}
      {showResolution ? (
        <ChoiceButtons
          compact={compact}
          label={t("size", {}, locale)}
          values={RESOLUTIONS}
          selected={value.resolution}
          disabled={busy}
          onSelect={(resolution) => onChange({ ...value, resolution })}
        />
      ) : null}
    </div>
  );
}

export function GeneratePickerInteraction({
  interaction,
  submit,
  cancel,
}: PluginPendingInteractionProps) {
  const parsed = useMemo(
    () => pickerPayloadSchema.safeParse(interaction.payload),
    [interaction.payload],
  );
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<LastChoice | null>(parsed.success ? parsed.data.selected : null);
  const locale: Locale =
    parsed.success && (parsed.data.locale === "ru" || parsed.data.locale === "en")
      ? parsed.data.locale
      : detectLocale();

  if (!parsed.success || !choice) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("pickerBroken", {}, locale)}</p>
        <Button type="button" variant="outline" onClick={() => void cancel().catch(() => undefined)}>
          {t("cancelGenerate", {}, locale)}
        </Button>
      </div>
    );
  }

  const enabledModels = Object.fromEntries(parsed.data.models.map((item) => [item.id, item.enabled])) as Partial<
    Record<ModelId, boolean>
  >;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-medium">{t("pickerTitle", {}, locale)}</div>
        <p className="mt-1 text-xs text-muted-foreground">{t("pickerHint", {}, locale)}</p>
        {parsed.data.profileName ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("profile", {}, locale)}: {parsed.data.profileName}
          </p>
        ) : null}
        <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{parsed.data.prompt}</p>
      </div>
      <GeneratePickerForm
        value={choice}
        locale={locale}
        enabledModels={enabledModels}
        busy={busy}
        onChange={setChoice}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            const body = pickerResponseSchema.safeParse(choice);
            if (!body.success) return;
            setBusy(true);
            void submit(body.data)
              .catch(() => undefined)
              .finally(() => setBusy(false));
          }}
        >
          {busy ? t("generating", {}, locale) : t("sendGenerate", {}, locale)}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void cancel().catch(() => undefined)}
        >
          {t("cancelGenerate", {}, locale)}
        </Button>
      </div>
    </div>
  );
}

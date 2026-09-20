import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "./i18n";
import type { Locale } from "./i18n";
import { modelLabel } from "./generate-picker";
import { enabledFromSettings, type StudioSettings } from "./src/settings";
import {
  MODEL_IDS,
  MODEL_SETTING,
  enabledModelList,
  modelEnabled,
  modelFalOnly,
  modelSearchText,
  type ModelId,
} from "./src/models";

export function ModelCatalogField({
  settings,
  locale,
  onChange,
}: {
  settings: StudioSettings;
  locale: Locale;
  onChange: (patch: Partial<StudioSettings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const enabled = useMemo(() => enabledFromSettings(settings), [settings]);
  const onIds = enabledModelList(enabled);

  const toggle = (id: ModelId) => {
    const currentlyOn = modelEnabled(id, enabled);
    if (currentlyOn && onIds.length === 1) return;
    onChange({ [MODEL_SETTING[id]]: !currentlyOn });
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t("modelsHeading", {}, locale)}
            className="h-auto min-h-11 w-full justify-between gap-2 px-3 py-2 text-left font-normal md:min-h-8"
          >
            <span className="min-w-0 truncate">
              {onIds.length === 0
                ? t("modelsEnabledNone", {}, locale)
                : t("modelsEnabledCount", { count: onIds.length }, locale)}
            </span>
            <Icon name="ChevronDown" className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] p-0"
          mobileTitle={t("modelsHeading", {}, locale)}
        >
          <Command>
            <CommandInput placeholder={t("modelsSearch", {}, locale)} />
            <CommandList>
              <CommandEmpty>{t("modelsSearchEmpty", {}, locale)}</CommandEmpty>
              <CommandGroup heading={t("modelsHeading", {}, locale)}>
                {MODEL_IDS.map((id) => {
                  const on = modelEnabled(id, enabled);
                  return (
                    <CommandItem
                      key={id}
                      value={modelSearchText(id, modelLabel(id, locale))}
                      onSelect={() => toggle(id)}
                    >
                      <Icon name="Check" className={on ? "opacity-100" : "opacity-0"} />
                      <span className="min-w-0 flex-1">{modelLabel(id, locale)}</span>
                      {modelFalOnly(id) ? (
                        <span className="text-xs text-muted-foreground">fal.ai</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">fal · kie</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {onIds.map((id) => (
            <span
              key={id}
              className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs"
            >
              {modelLabel(id, locale)}
            </span>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("modelsHint", {}, locale)}</p>
    </div>
  );
}

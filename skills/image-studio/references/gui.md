# GUI section — game interface through Image Studio

Use for game UI work: menus, windows, HUDs, buttons, frames, bars, slots, UI icons. Always **Muse Image** on fal, labels always **English**, frame size picked by the plugin (16:9 mockups, element sheets by grid shape). Do not pass a model or aspect.

## Styles ("GUI projects")

A style belongs to the BB project and holds: name, theme ("vampires vs humans, night, glossy cartoon"), presets (`cartoon`, `gothic`, `fantasy`, `scifi`, `horror`, `cozy`, `minimal`, `crystal`, `pixel`), a palette (panels, buttons, outlines, highlights, text as `#RRGGBB`), extra rules, and up to 6 reference pictures (approved mockups = `concept`, game art = `art`). The plugin adds all of that to every GUI prompt, the references as Image 1…N. **Never describe the style in `prompt`.**

```
bb image-studio gui styles [--json]
bb image-studio gui style --name "Vampire night" --theme "vampires vs humans, night" --tags cartoon,gothic --palette button=#C0203A,outline=#2A1238
bb image-studio gui ref --style "Vampire night" --image image-studio/gui/no-style/ab12cd34-idea-2-gothic/mockup.png
```

## Modes

| Mode | prompt | Result |
|---|---|---|
| `ideas` | what the screen holds | 4 mockups. Style with nothing fixed: 4 preset directions (theme still applies). Fixed style: 4 takes inside it (faithful, bolder, lighter, unexpected). |
| `screen` | what the screen holds | 1 mockup in the style |
| `elements` | the list, one per line or `;` (quote a label: `Play button with the label 'PLAY'`) | one green-key sheet in a strict grid in list order, cut into `parts/<element-name>.png` + `manifest.json`. `states`: one row per element — `_normal`, `_hover`, `_pressed`, `_disabled` (max 6 elements; 16 without states) |
| `kit` | optional extra wishes | the style's standard kit in two sheets: `window-frame, panel, button, button-selected, slider-track, slider-fill, bar-frame, bar-fill, divider, crest` and `tab, tab-selected, close-button, slider-knob, toggle-off, toggle-on, checkbox-off, checkbox-on, slot, slot-selected, badge, icon-button` |

In chat call the tool `image_studio_gui` (`mode`, `prompt`, `style`, `states`, `images`); it runs at once, no Send form. In a script: `bb image-studio gui generate --mode … [--style …] [--states] --prompt "…" [--json]`.

Files land in the project at full size: `image-studio/gui/<style>/<id>-<label>/` with `mockup.png` or `sheet.png`, and for sheets `parts/*.png` and `manifest.json` (name, element, state, position and size of every part). The manifest says `named: false` when the drawing did not follow the grid — then parts are `part-01…` in reading order; `missing` lists cells that came out empty. Re-cut a sheet for free: `bb image-studio gui cut --sheet <path> --elements "a; b; c" [--states]`.

## Good flow

1. No style yet: `ideas` with the screen description → the user picks one.
2. Create the style (theme, presets) and add the picked mockup as a reference (`gui ref` or the panel's “Make reference”).
3. Then `screen` for other windows, `kit` for the standard parts, `elements` for anything extra (icons, special buttons) — all in the same look.
4. Report the paths, the parts folder and anything in `missing`.

# GUI section — game interface through Image Studio

Use for game UI work: menus, windows, HUDs, buttons, frames, bars, slots, UI icons. Always **Muse Image** on fal, labels always **English**, frame size picked by the plugin (16:9 mockups, element sheets by grid shape). Do not pass a model or aspect.

## Projects

GUI work is grouped in **GUI projects**, listed in the panel's GUI tab wherever it is opened. A generation without a named project goes to the project bound to the current folder (the thread's folder for the tool, the shell folder for the CLI); the first one creates it, named after the folder. So a game, a site or a section each collects its own history, grouped by request (mode, prompt, time).

Each project also holds its style: theme ("vampires vs humans, night, glossy cartoon"), presets (`cartoon`, `gothic`, `fantasy`, `scifi`, `horror`, `cozy`, `minimal`, `crystal`, `pixel`), a palette (panels, buttons, outlines, highlights, text as `#RRGGBB`), extra rules, and up to 6 reference pictures (approved mockups = `concept`, game art = `art`). The plugin adds all of that to every GUI prompt, the references as Image 1…N. **Never describe the style in `prompt`.** A project with nothing fixed makes `ideas` explore four preset directions; after the user picks one, make it a reference so everything else follows it.

```
bb image-studio gui projects [--json]            # * marks this folder's project
bb image-studio gui project --theme "vampires vs humans, night" --tags cartoon,gothic --palette button=#C0203A,outline=#2A1238
bb image-studio gui project --name "Vampire night"   # bind an existing project to this folder / create one with that name
bb image-studio gui ref --image image-studio/gui/<project>/<id>-idea-2/mockup.png
bb image-studio gui delete --project <name>          # its list and references; saved files stay
```

Game characters for 3D have their own section with the same kind of projects: [characters.md](characters.md).

Pass `--project <name>` (tool: `project`) only to write into a project other than this folder's.

## Modes

| Mode | prompt | Result |
|---|---|---|
| `ideas` | what the screen holds | 4 mockups. Style with nothing fixed: 4 preset directions (theme still applies). Fixed style: 4 takes inside it (faithful, bolder, lighter, unexpected). |
| `screen` | what the screen holds | 1 mockup in the style |
| `elements` | the list, one per line or `;` (quote a label: `Play button with the label 'PLAY'`) | one green-key sheet in a strict grid in list order, cut into `parts/<element-name>.png` + `manifest.json`. `states`: one row per element — `_normal`, `_hover`, `_pressed`, `_disabled` (max 6 elements; 16 without states) |
| `kit` | optional extra wishes | the style's standard kit in two sheets: `window-frame, panel, button, button-selected, slider-track, slider-fill, bar-frame, bar-fill, divider, crest` and `tab, tab-selected, close-button, slider-knob, toggle-off, toggle-on, checkbox-off, checkbox-on, slot, slot-selected, badge, icon-button` |

In chat call the tool `image_studio_gui` (`mode`, `prompt`, `project`, `states`, `images`); it runs at once, no Send form. In a script: `bb image-studio gui generate --mode … [--project …] [--states] --prompt "…" [--json]`.

Files land in the project at full size: `image-studio/gui/<project>/<id>-<label>/` with `mockup.png` or `sheet.png`, and for sheets `parts/*.png` and `manifest.json` (name, element, state, position and size of every part). The manifest says `named: false` when the drawing did not follow the grid — then parts are `part-01…` in reading order; `missing` lists cells that came out empty. Re-cut a sheet for free: `bb image-studio gui cut --sheet <path> --elements "a; b; c" [--states]`.

## Good flow

1. Fresh project: `ideas` with the screen description → the user picks one.
2. Set the theme/presets (`gui project …`) and add the picked mockup as a reference (`gui ref` or the panel's “Make reference”).
3. Then `screen` for other windows, `kit` for the standard parts, `elements` for anything extra (icons, special buttons) — all in the same look.
4. Report the paths, the parts folder and anything in `missing`.

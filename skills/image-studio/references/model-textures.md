# Model section — hand-painted UV textures and modeling blueprints

Use for a **finished 3D mesh** (FBX, GLB, or `.blend`) that needs a **painted texture that follows its UV islands**, or for **orthographic blueprint views** to model from in Blender. Always **Muse Image** on fal. Runs at once, no Send form.

**Muse does not build the model and does not output a mesh to import.** In `blueprint` mode the wireframe on the sheet is decorative reference only — you model the real mesh in Blender. In `texture-uv` mode the texture is painted on the **finished model's UV** (layer `ImageStudioUV`).

## When to use

| Need | Tool | Mode |
|---|---|---|
| Painted texture on an existing model's unwrap (parts, scorch at rag ends, face on the right island) | `image_studio_model` | `texture-uv` |
| Seamless tiling ground/wall surface (no model) | `image_studio_roblox` | `texture` → `color.png` + `normal.png` |
| Front/side/back orthographic views to block out a new prop or character | `image_studio_model` | `blueprint` |

Concept art for items still starts in `image_studio_roblox` (`items`, `props`) or `image_studio_character`; approve it, then blueprint or model in Blender, then `texture-uv`.

## Tool

`image_studio_model` (or `bb image-studio model generate …` in a hidden thread). One **model project** per folder (`image-studio/model/<project>/…`), same theme/refs pattern as GUI and Characters. In a Roblox game folder the project inherits the game's look — do not describe the game's art style in `prompt`; the plugin adds it.

### Mode `texture-uv`

| Parameter | Role |
|---|---|
| `mode` | `texture-uv` |
| `model` | Path to `.fbx`, `.glb`, or `.blend` |
| `object` | Mesh name when the file has several |
| `prompt` | Effects and per-part paint notes (scorch, wear, fibres) — place effects by location (`only at the BOTTOM end of the rags`) |
| `parts` | Material → label (`mat=handle`) **or** guide palette keys: `#c9c9cd=grey metal clamp`, `light grey=clamp metal` (see `parts.json` `palette[]` after prepare) |
| `images` | Up to 2: `[0]` concept (design reference), `[1]` optional style sheet |
| `projectConcept` | Default **off**. Set **true** only when `images[0]` shows the object straight-on from `conceptView` in the model's pose (faces, eyes, lettering, patterns): cut concept, fill background, **planar project** onto the mesh, bake into `guide.png` before Muse. The concept still goes to Muse as image 2 when projection is off. |
| `conceptView` | `front` \| `back` \| `left` \| `right` (default `front`) |
| `conceptNote` | What image 2 shows (`weathered oak handle, iron rivets`) — not the whole game style |
| `subject` | Short object name in the Muse layout line (defaults from the file name) |
| `size` | `1024` or `2048` |
| `variants` | `1`–`4` Muse takes |
| `guideFix` | Default **`on`** (`on` \| `off`, CLI `--guide-fix on|off`). Fixes Muse's dark gaps on small pieces (`guide * 1.25`) and hue swaps on saturated pieces (`guide * lum(Muse)`); runs before mask dilation. Reports `darkFilled`, `hueFixed`, and `maskPixels` in `manifest.json`. |
| `project` | Another model project name (default: this folder's project) |

**Prepare (run folder):** `guide.png`, `mask.png`, `parts.json` (includes `palette: [{color,name,share}]` from guide colours), `prepare.json`, `model.blend` under `image-studio/model/<project>/<run>/`.

**Each take:** `take-<n>/color.png`, `preview.png` (before/after, two sides), `model.blend`, `manifest.json` (lists `uvLayer`, usually `ImageStudioUV`, and file paths). Shared prepare files stay in the parent `<run>/`.

### Mode `blueprint`

| Parameter | Role |
|---|---|
| `mode` | `blueprint` |
| `images` | `[0]` required — approved concept |
| `views` | Subset of `front`, `side`, `back`, `top` (default front+side+back) |
| `style` | `clay+wire`, `clean line`, or `clean-line` |
| `subject` | Object name on the sheet |
| `soft` | Dangling parts (cloth, rope, hair) — drawn in **light blue** clay; listed in `views.json` with anchors |
| `rigid` | Named rigid parts for the prompt |
| `sideSeparate` | Default **true**. When `views` includes `side`, a **second** Muse call draws only the 90° profile (concept + cut front on grey as image 2). Set **false** to keep the side from the main sheet only. |
| `project` | Optional project override |

**Output:** `image-studio/model/<project>/<run>/blueprint/` — `sheet.png`, `side-sheet.png` (raw side-only Muse sheet when `sideSeparate`), `front.png`, `side.png`, …, `views.json` with `canvas`, per-view `box`, `baseline`, `heightPx`, `parts` (`kind`: `rigid` \| `soft`, `anchor` for soft), `sideRegenerated` (true when the side came from the separate call), `sheetSideSimilarity` (IoU of front vs side on the main sheet, for diagnostics), `warnings`.

By default the plugin classifies silhouettes on the sheet (`views.json` → `classification`) and may relabel mis-tagged views (e.g. edge-on panel was labeled BACK) before a second Muse call draws the missing **side** or **back** profile at the front height.

## Rules (texture-uv)

Proven in production tests; the plugin enforces most of this in Blender prepare:

- **No outlines** on the guide — Muse turns island edges into coloured seam frames. Ban frames in text; guide bake has no island outlines.
- **Large UV islands:** Smart UV angle ~66–72°, island margin **0.03–0.04**; bake margin 16–24 px.
- **Top of each island = top of the model:** `uv.align_rotation` (geometry, Z) then `pack_islands(rotate=False)` so Muse places effects by picture bottom (`only at the BOTTOM end of …`).
- **Flat part colours** on the guide = materials/parts; describe what to paint on each colour in `prompt` / `parts`, not in the game's global style. Materials that already have a **real Principled Base Color** in the FBX keep it (`parts.json` → `kind: "base"`); only default-grey slots get a **marker** hue chosen far from named hues (gold, gem, wood, …). Markers read `#hex marks part "…" (paint it as …)` in the Muse layout; base colours read `#hex = … (its real colour)`.
- **Concept as `images[0]`** always feeds Muse. Turn **`projectConcept` on** only for straight-on concepts (same pose as the mesh) so faces, eyes, lettering and placed patterns are projected before Muse; diagonal concept art will smear if projected.
- **Never** repaint model render views and project them back onto the UV — silhouette and scale drift.
- **Model prep (you, in Blender):** after deleting solid details (eye spheres, bolts, etc.), select the **boundary edges** of the hole and **`bmesh.ops.holes_fill`** (or equivalent) before you call `texture-uv`. Unfilled pits bake as dark holes on the guide. **Prepare does not fill holes** — it keeps intentional open mesh (cloth planes, rag edges) as-is and does not repair topology.
- **Muse:** image roles → `Task:` (your paint notes only) → `Game look` (lower priority than Task and reference images; materials/palette only, flat albedo; outline/lighting clauses stripped from theme) → `Must not change:` → short bans. Textured materials list **palette** swatches as `colour (#hex) = part` when you name them in `parts`. Tool output prints the palette after prepare. `preview.png` tiles follow each view's aspect so tall props fill the tile.

## Rules (blueprint)

- Orthographic views, one height, shared baseline; soft parts in light blue on every view.
- Side is a true 90° profile — by default a separate Muse generation (`sideRegenerated` true; `sideSeparate` to opt out).
- No perspective, fire, or effects on the sheet — those come later in `texture-uv` or as engine particles.

## Blender hookup

After `texture-uv`, open `take-<n>/model.blend` or assign `color.png` yourself:

1. **Image Texture** node → `color.png`.
2. **UV Map** node → layer name from `manifest.json` → `uvLayer` (default **`ImageStudioUV`**).
3. Plug into the material's Base Color (or Principled BSDF).

For modeling on a blueprint: load `front.png` / `side.png` / … as **Empty Image** backdrops or orthographic camera backgrounds; use `views.json` `baseline` and `heightPx` for scale. Cut **soft** parts as separate meshes; parent bone chains at each soft part's `anchor`.

## Roblox hookup

- **MeshPart colour only:** `TextureID` from `color.png` (simple cases).
- **PBR:** **SurfaceAppearance** — `ColorMap` ← `color.png`, `NormalMap` / `RoughnessMap` from your bake or the roblox `texture` pipeline if needed.
- Bake **Color / Normal / Roughness** from Blender; rig bones for soft parts.
- **Fire, glow, magic:** engine **particles** and lights — not painted as permanent mesh texture unless they are static surface detail.

## Examples

**texture-uv** (MCP-style):

```json
{
  "mode": "texture-uv",
  "model": "assets/3d/fire-mop.fbx",
  "prompt": "charred cloth only at the BOTTOM end of each rag; soot on the metal band",
  "parts": { "Material.002": "cotton rags", "Material.001": "wooden handle" },
  "images": ["assets/concept/weapons/fire-mop.png"],
  "conceptNote": "stylized fire mop with layered rags and metal collar",
  "projectConcept": true,
  "conceptView": "front",
  "size": 2048,
  "variants": 2
}
```

CLI (hidden thread):

```bash
bb image-studio model generate --mode texture-uv --file assets/3d/fire-mop.fbx \
  --image assets/concept/weapons/fire-mop.png \
  --subject "fire mop" --concept-note "stylized fire mop with layered rags" \
  --project-concept false --concept-view front \
  --parts "fire-mop_baked=rag head; wood=handle" \
  --prompt "charred rag ends; warm wood grain on handle" \
  --size 2048 --variants 2 --json
```

**blueprint:**

```json
{
  "mode": "blueprint",
  "images": ["assets/concept/weapons/fire-mop.png"],
  "views": ["front", "side", "back"],
  "style": "clay+wire",
  "subject": "fire mop",
  "soft": ["rags"]
}
```

```bash
bb image-studio model generate --mode blueprint \
  --image assets/concept/weapons/fire-mop.png \
  --views front,side,back --sheet-style clay+wire --soft "rags" --subject "fire mop" --json
```

Set look on the project: `bb image-studio model project --theme "…" --tags stylized --notes "…"`; list: `bb image-studio model projects`.

## Acceptance checklist

Before you ship a textured model:

1. Open `take-<n>/preview.png` — **before/after** from **two sides**; pick the best variant.
2. No **coloured frames** along UV seams on the model.
3. **Effects** sit where you asked (bottom of rags, moss on top, etc.).
4. **Faces, eyes, patterns** match the concept where projection was used.
5. **Parts** match `parts.json` colours (wood on wood island, cloth on cloth).
6. In Blender, `color.png` on **`ImageStudioUV`** matches the in-engine unwrap.

## Item pipeline

End-to-end flow for a game prop or weapon:

1. **Concept** — `image_studio_roblox` (`items` / `props`) or `image_studio_character` equipment; get approval.
2. **Blueprint** — `image_studio_model` `blueprint` from the approved concept: front/side/back one height, soft parts in blue + `views.json` anchors.
3. **Model** — build in live Blender (MCP): rigid and soft meshes separate; soft parts get **bone chains** from anchors; views as ortho backdrops.
4. **Unwrap** — large islands, top up → **`texture-uv`**: plugin prepare builds **guide** (part colours × light; concept projected when `images[0]` + `projectConcept`) → Muse with guide + concept → `color.png`, `preview.png` → fix and re-run if needed.
5. **Engine** — bake/export Color, Normal, Roughness; import mesh + bones; **particles** for fire/glow.

Again: Muse paints the **texture atlas**, not the mesh. The blueprint grid does not define topology — it is a visual ruler. The mesh is yours in Blender; the final art is `color.png` on the finished UV.

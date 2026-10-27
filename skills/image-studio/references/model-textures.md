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
| `parts` | Optional map from baked material name → part label (`{"Material.003":"oak handle"}` or `[{"material":"…","part":"…"}]`) |
| `images` | Up to 2: `[0]` concept (design reference), `[1]` optional style sheet |
| `projectConcept` | Default **on** when `images[0]` is set: cut concept, fill background, **planar project** onto the mesh from `conceptView`, bake into `guide.png` before Muse (faces, eyes, lettering, patterns land in place) |
| `conceptView` | `front` \| `back` \| `left` \| `right` (default `front`) |
| `conceptNote` | What image 2 shows (`weathered oak handle, iron rivets`) — not the whole game style |
| `subject` | Short object name in the Muse layout line (defaults from the file name) |
| `size` | `1024` or `2048` |
| `variants` | `1`–`4` Muse takes |
| `project` | Another model project name (default: this folder's project) |

**Prepare (run folder):** `guide.png`, `mask.png`, `parts.json`, `prepare.json`, `model.blend` under `image-studio/model/<project>/<run>/`.

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
| `project` | Optional project override |

**Output:** `image-studio/model/<project>/<run>/blueprint/` — `sheet.png`, `front.png`, `side.png`, …, `views.json` with `canvas`, per-view `box`, `baseline`, `heightPx`, `parts` (`kind`: `rigid` \| `soft`, `anchor` for soft), `sideRegenerated` (true when side was redrawn alone), `warnings`.

The plugin redraws **side** in a separate Muse call when it copies front.

## Rules (texture-uv)

Proven in production tests; the plugin enforces most of this in Blender prepare:

- **No outlines** on the guide — Muse turns island edges into coloured seam frames. Ban frames in text; guide bake has no island outlines.
- **Large UV islands:** Smart UV angle ~66–72°, island margin **0.03–0.04**; bake margin 16–24 px.
- **Top of each island = top of the model:** `uv.align_rotation` (geometry, Z) then `pack_islands(rotate=False)` so Muse places effects by picture bottom (`only at the BOTTOM end of …`).
- **Flat part colours** on the guide = materials/parts; describe what to paint on each colour in `prompt` / `parts`, not in the game's global style.
- **Concept as `images[0]`** with **`projectConcept` on** (default): projection before Muse so faces, eyes, lettering and placed patterns stay aligned; Muse only cleans up.
- **Never** repaint model render views and project them back onto the UV — silhouette and scale drift.
- **Model prep:** after deleting mesh details (eye spheres, etc.) **close holes** (`bmesh.ops.holes_fill`) before texturing; prepare runs hole fill on open boundaries.
- **Muse:** image roles → `Task:` → `Must not change:` → short bans. No negative prompt, seed, or strength — text only. Describe subject, `conceptNote`, `parts`, and effects in `prompt`; the plugin adds theme/style.

## Rules (blueprint)

- Orthographic views, one height, shared baseline; soft parts in light blue on every view.
- Side is a true 90° profile — separate generation when Muse copies front (`sideRegenerated` in `views.json`).
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
  --image assets/concept/weapons/fire-mop.png --prompt "charred rag ends; warm wood grain on handle" \
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
  --views front,side,back --style clay+wire --soft "rags" --subject "fire mop" --json
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

---
name: image-studio
description: Generate or edit images for the current BB project through Image Studio (fal.ai / kie.ai, Nano Banana 2, Nano Banana Pro, Muse Image, optional GPT Image 2.5, FLUX.2 Pro, Seedream 5, Grok Imagine, people profiles). Use when the user asks to generate a picture, photo, poster, or a scene with a named person from Image Studio profiles.
---

# Image Studio

Read this skill only when the user wants an image.

## Do this

1. Run `bb image-studio models --json` if you need to know which models and keys are on.
2. If the request is about a person (“with me”, “Кирилл”, “Вика”), run `bb image-studio profiles --json` and pass that name as `profile`.
3. **Open the matching prompt file and copy its template** — do not invent a free-form paragraph:
   - Nano Banana 2 / Pro → [references/nano-banana.md](references/nano-banana.md) (Subject → Composition → Action → Location → Style; quoted `"text"`).
   - Muse Image → [references/muse.md](references/muse.md) (create = Scene / Light / Camera; edit = Change / Keep).
   - GPT Image 2.5 Flare / Sunburst → [references/gpt-image.md](references/gpt-image.md) (Purpose / Subject / Materials / Light / Camera / quoted text; Flare first).
   - FLUX.2 Pro → [references/flux-2.md](references/flux-2.md) (Subject + Action + Style + Context; no negatives; hex on named objects).
   - Seedream 5.0 Pro → [references/seedream.md](references/seedream.md) (photo brief vs layout grid; grounded one-region edit).
   - Grok Imagine → [references/grok-imagine.md](references/grok-imagine.md) (object, camera, empty regions, type largest-first; edit max 3 images).
   Use the **create** template for a new photo, the **edit** template when changing an existing picture or using attached selfies as the base. Profile identity, selfies, and manicure Image-N are injected by the plugin — [references/profiles.md](references/profiles.md). Do not copy those fields into `prompt`. Do not invent a different Image number.
4. In a **visible chat with a person who can press Send**, call `image_studio_generate`. It opens buttons (model, aspect, size). Nano Banana size defaults to 2K. The last Send choice is already selected. Do **not** run `bb image-studio generate` in that chat.

   In a **hidden Agency / script thread** there is no Send click: run
   `bb image-studio generate --prompt "…" [--gateway fal|kie] [--model …] [--aspect …] [--resolution …] [--json]`.
   Default Nano Banana gateway is kie. Muse Image always uses fal. GPT Image 2.5, FLUX.2, Seedream, and Grok follow the preferred gateway. Pass `--gateway fal` to send a dual-gateway model through fal.ai. A fal failure must show a readable HTTP status and JSON on stderr, not `[object Object]`.

Pass `prompt` and `profile` when a person was named. Pass `model` / `aspectRatio` / `resolution` **only** if the user named them this turn.

5. After a successful generate, tell the user the saved path. Do not paste API keys.

Models: `nano-banana-2`, `nano-banana-pro`, `muse-image`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, `flux-2-pro`, `seedream-5`, `grok-imagine`. Gateways: `fal`, `kie`. **Muse Image is fal.ai only.** Extra models are off until the user enables them in Image Studio settings.

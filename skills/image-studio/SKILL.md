---
name: image-studio
description: Generate or edit images for the current BB project through Image Studio (fal.ai / kie.ai, Nano Banana 2, Nano Banana Pro, Muse Image, people profiles). Use when the user asks to generate a picture, photo, poster, or a scene with a named person from Image Studio profiles.
---

# Image Studio

Read this skill only when the user wants an image.

## Do this

1. Run `bb image-studio models --json` if you need to know which models and keys are on.
2. If the request is about a person (“with me”, “Кирилл”, “Вика”), run `bb image-studio profiles --json` and pass that name as `profile`.
3. **Open the matching prompt file and copy its template** — do not invent a free-form paragraph:
   - Nano Banana 2 / Pro → [references/nano-banana.md](references/nano-banana.md) (Google order: Subject → Composition → Action → Location → Style; quoted `"text"` for type).
   - Muse Image → [references/muse.md](references/muse.md) (create = Scene / Light / Camera; edit = Change / Keep; compose names Image 1…N).
   Use the **create** template for a new photo, the **edit** template when changing an existing picture or using attached selfies as the base. Profile identity, selfies, and manicure Image-N are injected by the plugin — [references/profiles.md](references/profiles.md). Do not copy those fields into `prompt`. Do not invent a different Image number.
4. **Always** call `image_studio_generate`. It opens buttons (model, aspect, size). Nano Banana size defaults to 2K. The last Send choice is already selected. Do **not** run `bb image-studio generate` in chat.

Pass `prompt` and `profile` when a person was named. Pass `model` / `aspectRatio` / `resolution` **only** if the user named them this turn.

5. After Send, tell the user the saved path. Do not paste API keys.

Models: `nano-banana-2`, `nano-banana-pro`, `muse-image`. Gateways: `fal`, `kie`. **Muse Image is fal.ai only.**

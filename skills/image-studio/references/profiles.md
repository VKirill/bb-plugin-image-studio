# People profiles

Fill profiles in the Image Studio UI, not in chat. The agent does **not** paste height, weight, figure, bust, face, or body descriptions into `--prompt`. Pass `--profile <name>`; the plugin builds the identity block and attaches the right reference photos.

## Fields from the form

| Form field | Stored / sent to the model |
| --- | --- |
| Name | `Kirill` |
| Gender | `male` / `female` → “man” / “woman” |
| Age | years, 18+ |
| Height, Weight | cm, kg |
| Figure | `slim`, `athletic`, `average`, `curvy`, `hourglass`, `pear`, `apple`, `rectangle` |
| Bust (women) | optional `A (size 1)` … `E (size 5)` |
| Reference sheet | labeled slots, below |

## Reference slots

| Group | Slot ids | Use |
| --- | --- | --- |
| Face | `face-front`, `face-34-left`, `face-34-right`, `face-profile`, `face-smile` | identity; front and 3/4 are always sent |
| Body (full length, fitted clothing) | `body-front`, `body-side`, `body-back` | figure, proportions, skin tone |
| Details | `hands` (manicure), `chest` (black lace bra), `chest-nude`, `waist`, `legs`, `buttocks`, `buttocks-nude`, `marks` (moles, tattoos, birthmarks), `hair-back` | close-ups, matched when that part is visible |

`chest-nude` (topless bust) and `buttocks-nude` (nude from behind, waist to upper thighs) are **Qwen and Wan only**: they are attached only when the generation model is `qwen-image-2.1` (the 18+ default) or `wan-2.7` (the allowed fallback), never to any other model (`auto`, `all` and `--refs` lists alike; a list naming one for another model fails with a readable error). With Qwen or Wan and a prompt that says topless, nude, naked or explicit, `auto` sends the nude slot instead of the clothed `chest` / `buttocks`. They are built only by name (`sheet --slots chest-nude`), never by the default Build sheet, and only for 18+ profiles (all profiles are).

Old photos migrated without moving files: selfie 1/2/3 → `face-front` / `face-34-left` / `face-34-right`, manicure → `hands`. The old RPC names `selfie-0..2` and `manicure` still work. All slots exist for men and women; only the wording (manicure vs hands, bust vs chest) and the bust field differ.

`bb image-studio profiles --json` returns `slots` (filled ids), `candidates` (generated, not yet accepted), and for compatibility `selfies` (filled face slots) and `manicure` (hands filled).

## Which slots are sent (`refs`)

`refs` on `image_studio_generate` and `--refs` on the CLI:

- `auto` (default) is decided by **Jev** (TypeSafe's System One model, through OpenLux by default): one request per generate call reads the prompt, the model, the source count and the list of filled photos, and answers in parallel one yes/no per photo ("will this body part, from this view, be visible in the picture?"), the viewpoint (front / back / side / close-up / no person), whether the prompt explicitly asks for nudity, and whether a person is in the picture at all. Code keeps the policy: photos above probability 0.5 are wanted, best first; a front photo is scaled down for a back view and the other way round; the nude slots come only with explicit nudity and only for Qwen or Wan, and replace the clothed ones; `face-front` is always first when a person is in frame; no person means no references; the per-model cap and the Qwen 4-image rule apply as before. On a timeout (2.5 s), an error or a missing key, the **keyword rules** below take over. Each generation record says which one chose (`refsSelector: "jev" | "keywords"`), with the per-slot scores (`refsScores`), the endpoint and the time; `--json` prints them. `bb image-studio refs --profile <name> --prompt "…" [--model id]` previews the choice, Jev and keywords side by side, without generating anything. Settings: switch Jev off, change the endpoint, model and key variables (OpenLux `OPENLUX_API_KEY` first, TypeSafe direct `TYPESAFE_API_KEY` as the fallback). An explicit `refs` list never calls Jev.
- Keyword rules (the fallback): `face-front`, `face-34-left`, `face-34-right` when filled; `face-profile` for side/profile prompts; `face-smile` for smiling or laughing; body slots for full-body, standing, walking, from behind, side view, swimwear, lingerie, beach and similar; `hands` for hands, nails, holding, cup, phone; `legs` for legs, heels, skirt, stockings; `chest` for cleavage, neckline, bust, topless; `buttocks` for back view, booty, thong; `waist` for belly, abs, crop top; `hair-back` for ponytail, braid, hair from behind; `marks` whenever body skin is likely visible. A headshot or close-up portrait skips the body.
- `all`: every filled slot, keyword matches first.
- `face-front,body-back,hands`: exactly these, in this priority (old `selfie-0` and `manicure` accepted).

Total images (source pictures + references) are capped per model and gateway: face first, then `marks` when bare skin is likely in frame (lingerie, swimwear, tank top, nude, full body; moles and tattoos are key identity), then body, then details, then the rest. **Qwen Image 2.1 gets at most 4 images in generate mode, source pictures included**: `face-front`, one 3/4 face, the single most relevant body photo (the nude slot for a nude prompt), and `marks` if skin shows. More references made Qwen paste several copies of the person into one frame; Wan 2.7 kept clean single frames with 9. Caps: Nano Banana 2 and 2.1 10 on kie (14 on fal), Nano Banana Pro 8 on kie (14 on fal), Seedream 5 Pro 10, Muse 10, FLUX.2 Pro 8, GPT Image 2.5 16, Grok Imagine 5, Qwen Image 2.1 10, Wan 2.7 9 on kie and 4 on fal. Sources: docs.kie.ai `maxItems`, fal model pages, xAI image editing docs. If source pictures leave no room for the face, the call fails with a readable message. The result carries `refsUsed` (slot ids in Image order) and, if any were left out, `refsDropped`. Tell the user which were sent.

## Building the sheet

The owner clicks **Build sheet** in Profiles, or runs `bb image-studio sheet --profile <name> [--slots a,b] [--model id] [--accept] [--dry-run] [--json]`. It needs `face-front` and builds the empty slots, one paid generation each, never `marks`. Body slots (fitted bodysuit/underwear), `chest` and `buttocks` use Qwen Image 2.1 on kie; the others use Nano Banana Pro if on, else Nano Banana 2.1, else Nano Banana 2. Each result waits as a candidate: Accept, Regenerate, or give a custom prompt. Slots build in waves (faces, then body, then details), each wave in parallel (`--parallel N`); with `--accept` the next wave uses the accepted photos of the previous one as references. Every sheet prompt ends with the positive line "A single full-frame photograph of her alone." (no "collage" or "grid" words: they prime a model with a prompt enhancer) and, for body and detail slots, states the profile's figure in words (build, bust, plus height and weight), because some models ignore the identity line. References per sheet shot: other models get the other faces plus the front body photo; **Qwen gets face-front plus one or two matching body photos only** (kie advises four or fewer; more made Qwen paste the references into a collage). For Qwen the plugin also turns the enhancer off (`enhance_prompt: false`, otherwise kie rewrites the prompt into a scene description), replaces the per-photo reference lines with one short line ("The woman in the reference photos (face in Image 1, front body in Image 2)."), and in sheet builds leaves height and weight out of the prompt and describes the figure in words. `--seed N` on `generate` (Qwen and fal models) repeats a result; the record stores the seed. `--dry-run` shows waves and plan and costs nothing. Do not run `sheet` without being asked.

When the user says “me”, “with my face”, or a profile name, run `bb image-studio profiles --json` and pass `--profile <name>`.

## What the plugin prepends

Example: Kirill, 34, 168 cm, 90 kg, athletic, `face-front` and `face-34-left` filled. Agent prompt (Banana create template, clothes/action/place only):

```
Subject: the referenced person in a navy single-breasted wool suit, white shirt, no tie.
Composition: waist-up portrait, camera at eye level, 50mm, shallow depth of field.
Action: standing still, looking just off-camera to the left.
Location: glass office, city in the windows behind.
Style: still photograph, window light from the left, cool daylight.
```

Assembled Banana prompt (plugin + agent):

```
Subject identity: Kirill is a 34-year-old man, 168 cm tall, 90 kg, athletic build.
Images 1–2 are face references: front, 3/4 left. Keep the same face and identity. Do not invent a different person.
Subject: the referenced person in a navy single-breasted wool suit...
```

The plugin does **not** wrap Banana (or the other models) in extra “clause order” instructions. Put the template labels in `prompt` yourself.

Woman with bust `C (size 3)`, three face slots, `body-back` and `hands`, prompt "from behind, holding a cup": the plugin adds `bust C (size 3)` on the identity line, then:

```
Images 1–3 are face references: front, 3/4 left, 3/4 right. Keep the same face and identity. Do not invent a different person.
Image 4 is a reference of this person's body from behind. Keep the same body proportions, figure and skin tone.
Image 5 is a close-up of this person's manicure. When any hand is visible, put that exact nail shape, length, and polish on every visible finger and thumbnail. Do not leave some nails bare or invent a different manicure.
```

Other slots add one line each in the same form, for example `Image 6 is a close-up reference of this person's bust and décolleté. When the bust or neckline is visible, match it exactly.` Source pictures for an edit come first and shift every number. Do not invent a different number. If `hands` is in `slots`, you may mention hands in the scene (cup, table) so they appear; you do not repeat the Image-N sentence. No visible hands → do not mention nails.

## What the agent still writes

Clothes, action, place, lighting, camera — using the template for the **enabled model**: [nano-banana.md](nano-banana.md), [muse.md](muse.md), [gpt-image.md](gpt-image.md), [flux-2.md](flux-2.md), [seedream.md](seedream.md), [grok-imagine.md](grok-imagine.md), or [qwen.md](qwen.md). Do not re-describe the face, body numbers, figure type, skin, moles or tattoos. Do not invent a different person. Do not add medical or sexual detail the user did not ask for. If they asked for **18+ / adult** content, use [qwen.md](qwen.md) and pass `model: "qwen-image-2.1"`; if Qwen fails or refuses, or the user names Wan, use [wan.md](wan.md) and `model: "wan-2.7"`. Aspect and size are picker buttons, not prompt text.

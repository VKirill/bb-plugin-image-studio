# People profiles

Fill profiles in the Image Studio UI, not in chat. The agent does **not** paste height, weight, figure, bust, or selfie instructions into `--prompt`. Pass `--profile <name>`; the plugin builds the identity block and attaches photos.

## Fields from the form

| Form field | Stored / sent to the model |
| --- | --- |
| Name | `Kirill` |
| Gender | `male` / `female` → “man” / “woman” |
| Age | years, 18+ |
| Height, Weight | cm, kg |
| Figure | `slim`, `athletic`, `average`, `curvy`, `hourglass`, `pear`, `apple`, `rectangle` |
| Bust (women) | optional `A (size 1)` … `E (size 5)` |
| Selfies 1–3 | face identity, attached as Image 1…N |
| Manicure (women) | last photo, Image N+1 |

When the user says “me”, “with my face”, or a profile name, run `bb image-studio profiles --json` and pass `--profile <name>`.

## What the plugin prepends

Example: Kirill, 34, 168 cm, 90 kg, athletic, two selfies, no manicure. Agent prompt (Banana create template, clothes/action/place only):

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
Images 1–2 are selfie reference photos of this person. Keep the same face and identity. Do not invent a different person.
Subject: the referenced person in a navy single-breasted wool suit...
```

The plugin does **not** wrap Banana (or the other models) in extra “clause order” instructions. Put the template labels in `prompt` yourself.

Woman with bust `C (size 3)`, two selfies and a manicure: the plugin adds `bust C (size 3)` on the identity line, then:

```
Image 3 is a close-up of this person's manicure. When any hand is visible, put that exact nail shape, length, and polish on every visible finger and thumbnail. Do not leave some nails bare or invent a different manicure.
```

One selfie + manicure → Image 2 is the manicure. Three selfies + manicure → Image 4. Do not invent a different number. If `manicure: true` in `profiles --json`, you may mention hands in the scene (cup, table) so they appear; you do not repeat the Image-N sentence. No visible hands → do not mention nails.

## What the agent still writes

Clothes, action, place, lighting, camera — using the template for the **enabled model**: [nano-banana.md](nano-banana.md), [muse.md](muse.md), [gpt-image.md](gpt-image.md), [flux-2.md](flux-2.md), [seedream.md](seedream.md), or [grok-imagine.md](grok-imagine.md). Do not re-describe the face, body numbers, or figure type. Do not invent a different person. Do not add medical or sexual detail the user did not ask for. Aspect and size are picker buttons, not prompt text.

# Nano Banana 2 / Pro — how to write the prompt

Source: Google’s hierarchy as documented by [fal: How to Use Nano Banana 2](https://fal.ai/learn/tools/how-to-use-nano-banana-2) (Gemini 3.1 Flash Image). API: [fal-ai/nano-banana-2](https://fal.ai/models/fal-ai/nano-banana-2/api), edit `fal-ai/nano-banana-2/edit`; kie [nano-banana-2](https://docs.kie.ai/market/google/nanobanana2) / [Pro](https://docs.kie.ai/market/google/pro-image-to-image).

This model is **not** a diffusion tag-soup. No `masterpiece, 8k, trending on ArtStation`, no weighted `(word:1.3)` syntax. Natural language with a **fixed clause order**. Sweet spot for photos: 1–3 sentences, or the labeled template below. Posters/infographics: longer, with quoted text and layout.

## Clause order (always this order)

1. **Subject** — who/what, count, clothes, materials. Do **not** repeat age, height, weight, figure, bust, or “same face” if a profile is attached — the plugin already prepends that.
2. **Composition** — shot size, camera height, angle, lens (e.g. 85mm, wide-angle), depth of field.
3. **Action** — what is happening (create) **or** the single change (edit).
4. **Location** — place, time of day, surfaces, what is left / right / behind.
5. **Style** — photograph vs illustration, lighting in photographic terms, colour, grain. Not a mood-board of adjectives.

Optional sixth line only when needed:

6. **Text** — every on-image string in `"double quotes"`, each with its own type size/position. Max 3–5 text elements. Short phrases, not paragraphs.
7. **Constraints** — what must stay identical (edits); what to avoid.

One prompt = **one job**. Stacking “change clothes and background and add a sign” drops pieces. Split into turns.

## Template — create (no person / no profile)

Copy the labels. Fill every line that matters; skip empty ones, do not leave `TBD`.

```
Subject: [object or people who are not a saved profile].
Composition: [shot size, angle, lens].
Action: [what they are doing].
Location: [place, time, what sits left / center / right].
Style: [still photograph / illustration], [light source and direction], [colour / grain].
```

### Create — product photo

```
Subject: a frosted glass bottle of hot sauce on a slate slab, one dried chili pepper to the right of the bottle.
Composition: three-quarter product shot, camera at table height, 85mm, shallow depth of field on the label.
Action: still life, steam not needed.
Location: late-afternoon kitchen counter, soft neutral wall falling to charcoal behind.
Style: still photograph, raking window light from the left, long shadow, editorial food photography.
```

### Create — poster with text (prefer Pro)

```
Subject: a saxophone player, full-body silhouette.
Composition: tall poster, figure in the lower third, empty sky above for type.
Action: playing, freeze on the inhale.
Location: stage, smoke catching an amber spotlight, dark navy around the edges.
Style: concert poster, deep navy and warm gold, light film grain.
Text: "MIDNIGHT BRASS" in tall condensed serif at the top; "JUNE 14–16" in small caps under the title; "BROOKLYN ARTS CENTER" in thin sans-serif at the bottom.
```

## Template — create with a saved person

Pass `profile` on `image_studio_generate`. Write **only** clothes, action, place, camera, light. Never restate the face or body numbers.

```
Subject: the referenced person in a navy single-breasted wool suit, white shirt, no tie, hands in pockets.
Composition: waist-up portrait, camera at eye level, 50mm, shallow depth of field.
Action: standing still, looking just off-camera to the left.
Location: glass office, city in the windows behind, oak desk edge at the bottom of frame.
Style: still photograph, window light from the left, cool daylight, no flash.
```

If `profiles --json` shows `manicure: true`, you may put a hand in frame (cup, table) so nails can appear. Do not write “Image N is the manicure”.

## Template — edit (references already attached)

The plugin sends selfies as Image 1…N (manicure last). Name them that way. **One change.** Say what to change **and** what to keep.

```
Action: [the only change].
Constraints: keep [face / pose / clothes / background] identical.
Location: [only if the setting changes].
Style: [only if the light or medium changes].
```

### Edit — clothes only

```
Action: change the outfit to a black crew-neck merino sweater and a charcoal overcoat, unzipped.
Constraints: keep the face, hair, body, pose, camera, and background identical. Do not restyle the photo.
```

### Edit — background only

```
Action: place the same person in a modern office with floor-to-ceiling windows and a city skyline.
Constraints: keep pose, clothing, face, and crop identical.
```

### Edit — remove an object

```
Action: remove the coffee cup from the table.
Constraints: fill the table and background naturally. Keep the person, clothes, and lighting identical.
```

### Edit — two references (person + object)

```
Subject: the person in Image 1 driving the car in Image 2.
Composition: three-quarter view from outside the passenger window, 35mm.
Action: driving along a coastal highway.
Location: California coastline, late day, ocean on the left of the car.
Style: still photograph, hard sun from the west, windshield reflections allowed.
Constraints: keep the person's face from Image 1 and the car's body colour from Image 2.
```

## Do not write

- Tag lists, quality boosters, “cinematic masterpiece”.
- A second identity (“handsome 25-year-old model”) when a profile is on.
- A different Image number than the plugin’s selfie/manicure count.
- Several unrelated edits in one prompt.
- Aspect ratio or 1K/2K/4K inside the prompt — size is a picker button; frame shape is chosen by the model unless the user named `--aspect`.

Pro: use when the frame must contain readable type. 2: faster everyday photos.

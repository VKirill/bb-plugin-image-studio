# GPT Image 2.5 Flare / Sunburst — how to write the prompt

Sources: [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting), [fal: How to Use GPT Image 2.5](https://fal.ai/learn/tools/how-to-use-gpt-image-2-5). API: `openai/gpt-image-2.5/{flare|sunburst}/{text-to-image|edit}`; kie `gpt-image-2-5-flare-*` / `gpt-image-2-5-sunburst-*`.

Flare is the small/fast model. Sunburst is the quality model. Same prompt language for both. Start with Flare unless the user asked for Sunburst, close crops, dense type, or 4K detail.

OpenAI says the **format** (paragraph vs labels vs JSON-like) does not change quality. Labeled **blocks** win because you can re-run the same brief after changing one line. Size and quality are picker/API fields, not sentences. Camera mm is a look cue, not a guarantee of geometry.

## Block order (create)

1. **Purpose** — photo vs ad vs diagram; intended use; crop / empty zone for later type.
2. **Subject** — who/what, clothes, pose. Skip age/height/weight/face if a profile is attached.
3. **Materials** — named surfaces (patina, weave, steam), not “detailed”.
4. **Light** — source, direction, colour, what is in shadow.
5. **Camera and frame** — shot size, height, photoreal vs illustration, what stays empty.
6. **Text** — every on-image string in `"quotes"`, how many times it appears, type and position. Then “no extra text”.
7. **Exclude** — watermarks, extra logos, extra people.

Quote unusual brand names letter by letter if they keep misspelling. Small type / many fonts → prefer Sunburst and a higher size button (plugin maps 1K→medium, 2K→high, 4K→xhigh). 4K is experimental on OpenAI’s side.

## Template — create (no profile)

```
Purpose: [catalogue photo / campaign still / UI mock], [horizontal / square / portrait].
Subject: [object or unnamed people], [pose].
Materials: [named surfaces].
Light: [source and direction].
Camera and frame: photorealistic, [height, lens cue], [empty zone if needed].
Text: [quoted strings once, placement], or omit and write Exclude: no text in the frame.
```

### Create — interiors catalogue (fal’s lamp shape)

```
Purpose: a photograph for an interiors catalogue, product in the right two-thirds.
Subject: a brass desk lamp with a ribbed shade on a walnut writing desk, limewashed wall behind.
Materials: unlacquered brass with fingerprints near the switch, fabric-wrapped cord, closed notebook, glass of water.
Light: late-afternoon sun from the left, hard shadow from the lamp arm, bulb switched off.
Camera and frame: photorealistic, eye level, 50mm equivalent, left third of the wall empty and even.
Exclude: no text anywhere in the frame.
```

### Create — ad with one tagline (OpenAI Thread shape)

```
Purpose: a streetwear campaign still for a youth audience.
Subject: a small group of friends standing together, natural poses, premium fashion photography.
Light: clean daylight, strong colour direction.
Camera and frame: photorealistic, full-length, room in the lower third for type.
Text: render the tagline "Yours to Create." exactly once, clearly, in the layout. No extra text, no watermarks, no unrelated logos.
```

## Template — create with a saved person

Pass `profile`. Write clothes, pose, place, light. Do not restate the face.

```
Purpose: an editorial portrait.
Subject: the referenced person in [clothes], [pose].
Materials: [fabric / environment].
Light: [plain source].
Camera and frame: photorealistic, [shot size], [lens cue].
Exclude: no text in the frame.
```

## Template — edit (one change)

OpenAI: say **change only X** and list what stays. One instruction, one change. Name Image 1…N the way the plugin attached them (selfies first, manicure last). Up to 16 references on fal edit.

```
Change: [the only instruction].
Keep: [face / pose / clothes / background / crop / labels] unchanged.
```

### Edit — clothes

```
Change: change only the outfit to a black merino crew-neck and a charcoal overcoat, unzipped.
Keep: identity, pose, camera, lighting, and background identical. No extra text.
```

### Edit — compose person into a place

```
Compose: put the person from Image 1 into the office from Image 2.
Keep: the face from Image 1 and the windows from Image 2. Do not restyle the photo.
```

## Do not write

- Tag soup, “8k masterpiece”, weighted `(word:1.3)`.
- A second identity when a profile is on.
- Several unrelated edits in one prompt.
- Aspect or 1K/2K/4K inside the prompt — those are picker buttons.

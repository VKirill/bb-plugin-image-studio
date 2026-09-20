# FLUX.2 Pro — how to write the prompt

Sources: [Black Forest Labs prompting guide](https://docs.bfl.ai/guides/prompting_guide_flux2), [JSON structured prompting](https://docs.bfl.ml/guides/usecases_t2i_json_prompting). API: `fal-ai/flux-2-pro` and `/edit`; kie `flux-2/pro-text-to-image` and `flux-2/pro-image-to-image`.

FLUX.2 **does not support negative prompts**. Describe what should be in the frame. Instead of “no blur” write “sharp focus throughout”. Instead of “no people” write “empty scene”.

Word order matters: the model attends more to the **start**. Priority: main subject → key action → style → context → secondary details. Sweet length: **30–80 words**. Short (10–30) for a sketch; long (80+) only when the scene has many named parts.

Photorealism: name camera, lens, film stock. `"shot on Fujifilm X-T5, 35mm f/1.4"` beats `"professional photo"`. Hex colours must be tied to an object (`the car is #C41E3A`), not “use #FF0000 somewhere”. Quoted on-image text with placement and style.

## Clause order (natural language)

1. **Subject** — person or object first. Skip body numbers if a profile is attached.
2. **Action** — pose or what is happening.
3. **Style** — medium / era / camera+lens+stock.
4. **Context** — place, light, time.
5. **Text / colour** — quoted strings; `#RRGGBB` on named parts.

## Template — create (no profile)

```
Subject: [who/what].
Action: [pose or event].
Style: still photograph, shot on [camera], [lens], [film or digital look].
Context: [place], [light], [time].
```

### Create — analogue portrait (BFL photoreal recipe)

```
Subject: a woman in a wool camel coat on wet asphalt, city storefronts behind.
Action: standing still, looking past camera.
Style: still photograph, shot on Kodak Portra 400, 50mm, natural grain.
Context: overcast late afternoon, no flash, mild reflection in the pavement.
```

### Create — brand colour + type

```
Subject: a ceramic mug on a walnut table, glaze colour #1B6B6F, handle on the right.
Action: still life, thin steam.
Style: still photograph, shot on Hasselblad X2D, 80mm, f/2.8.
Context: window light from the left, empty studio wall behind.
Text: the word "NORTH" in small sans-serif on the mug, colour #F5E6D3, once. Sharp focus throughout.
```

## Template — create with a saved person

Pass `profile`. Lead with the person, then clothes and camera. Do not restate the face.

```
Subject: the referenced person in [clothes].
Action: [pose].
Style: still photograph, shot on [camera], [lens].
Context: [place and light].
```

## Template — JSON (complex / several objects)

Use JSON in the prompt when many parts need independent colours or positions. Flatten to sentences for a simple photo.

```json
{
  "scene": "studio product shot, polished concrete",
  "subjects": [
    {
      "description": "[object, material, colour #hex]",
      "position": "[where in frame]",
      "action": "[still / in use]"
    }
  ],
  "style": "commercial product photography",
  "lighting": "[setup]",
  "composition": "[framing]",
  "camera": { "angle": "eye level", "lens": "85mm", "depth_of_field": "shallow on the label" }
}
```

## Template — edit / multi-reference

Name the role of each Image: subject, clothes, style, or background. BFL: “subject from image 1, style from image 2, background from image 3”. One job per prompt.

```
Use Image 1 as the person. Use Image 2 as the location.
Action: [what they do in that place].
Keep: the same face from Image 1. Empty scene except the named person.
```

### Edit — one change

```
Change the jacket to black leather with closed silver zippers.
Keep the face, pose, crop, and background. Sharp focus on the face.
```

## Do not write

- Negative lists (“no extra fingers, no watermark, no text”).
- Quality boosters instead of a camera/stock.
- Aspect or megapixels inside the prompt — picker / API.
- A different person when a profile is on.

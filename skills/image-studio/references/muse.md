# Muse Image (Meta, fal.ai only) — how to write the prompt

Source: [fal text-to-image](https://fal.ai/models/meta/muse-image/text-to-image/llms.txt), [fal edit](https://fal.ai/models/meta/muse-image/edit/llms.txt), [Meta: Build with Muse Image](https://dev.meta.ai/resources/blog/build-with-muse-Image). Muse **plans layout before drawing** and **changes only what you name**. Vague adjectives produce a generic scene. Unmentioned details stay put — that is the contract.

Never send Muse to kie.ai.

## How Muse reads a prompt

- Plain sentences. Name **objects, materials, and on-image text exactly**.
- One main scene unless the user asked for a grid or comic page.
- Baked-in text: short, quote the exact words, pair each label with its object (`the lamp $25`). Text can vary run to run — keep it short.
- Edit = scoped instruction. Do not re-describe the whole picture.
- Several references = compose: say which Image is which, then the new arrangement.
- For a **series**, keep the same art-style words and a short “same subject” phrase in every prompt. The plugin already attaches selfies.

Aspect ratio is a picker button, not a sentence (Muse also accepts `width:height` on the API; the plugin sends the button value). Muse has no 1K/2K/4K control.

## Template — create (no profile)

```
Scene: [what is in the frame, named objects and materials].
Light: [source, direction, quality — not “cinematic”].
Camera: [distance, angle].
Text: [quoted strings and where they sit], or omit.
```

### Create — still life (fal’s own shape)

```
Scene: a latte in a ceramic cup and a croissant on linen, overhead view, crumbs on the cloth.
Light: soft natural window light from the left.
Camera: straight-down, table filling the frame.
```

### Create — editorial portrait (no saved person)

```
Scene: a woman in a wool camel coat, standing on wet asphalt, city storefronts behind her, one neon pharmacy cross on the right.
Light: overcast, no flash, mild reflection in the pavement.
Camera: full-length, camera at chest height, 35mm.
Text: a shop window with the word "OPEN" in white sans-serif, small, upper left of the glass.
```

### Create — typed sign / listing (Muse’s strength)

```
Scene: three objects on a clean neutral studio floor, evenly spaced: a desk lamp, an acoustic guitar, a stack of paperbacks.
Light: even studio, soft shadow under each object.
Camera: three-quarter, all three fully visible.
Text: a small handwritten price tag next to each item; label the lamp "$25", the guitar "$80", and the books "$15".
```

## Template — create with a saved person

Pass `profile`. Write the **new scene only**. Do not restate the face.

```
Scene: the referenced person in [clothes], [pose], [place and materials].
Light: [plain light].
Camera: [shot size and lens].
```

### Create — Kirill, office

```
Scene: the referenced person in a navy wool suit, white shirt, no tie, standing beside a glass meeting table, both hands on the table edge.
Light: window light from the left, cool daylight.
Camera: waist-up, eye level, 50mm.
```

If manicure is attached, you may show hands. Do not invent an Image number.

## Template — edit (one change)

Meta’s contract: **scoped change, rest intact**. Do not rewrite the portrait.

```
Change: [the only instruction].
Keep: [face / pose / clothes / background / crop] unchanged.
```

### Edit — add one object (Meta fox/hat shape)

```
Change: add a small red wool hat on the head.
Keep: the face, hair, clothes, pose, and background unchanged.
```

### Edit — clothes

```
Change: replace the jacket with a black leather biker jacket, silver zippers closed.
Keep: the face, hair, pose, crop, and background identical.
```

### Edit — listing revision (multi-part is allowed when each part is named)

Muse can reason over several named edits in **one** sentence if each object is explicit. Prefer this over a vague “make it nicer”.

```
Change: remove the boots, leave that spot as empty bare floor; change the book's tape tag to the old price "$12" struck through and the new price "$8" beside it.
Keep: the lamp's "$30" tag and the radio's "$45" tag as they are.
```

## Template — compose several references

Name Image 1…N the same way the plugin attached them (selfies first, manicure last). Then describe the new frame.

```
Compose: put the person from Image 1 into the street from Image 2.
Action: [what they do].
Keep: the same face and the same art style.
```

### Compose — person into a place

```
Compose: the same person from Image 1 walking down the city street in Image 2.
Action: relaxed stride, looking toward the shop on the right.
Keep: exact face, hair, and clothes from Image 1; keep the storefronts from Image 2.
```

## Do not write

- Diffusion tags or “ultra detailed 8k”.
- A full re-description of the face on an edit.
- “Also add / in addition / another panel” unless the user asked for a grid.
- kie.ai as the gateway.
- Size 1K/2K/4K — Muse ignores it.

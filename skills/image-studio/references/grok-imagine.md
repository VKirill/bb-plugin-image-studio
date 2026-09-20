# Grok Imagine Image 2.0 — how to write the prompt

Sources: [xAI image generation](https://docs.x.ai/developers/model-capabilities/images/generation), [xAI image editing](https://docs.x.ai/developers/model-capabilities/images/editing), [fal: How to Use Grok Imagine Image 2.0](https://fal.ai/learn/tools/how-to-use-grok-imagine-image-2-0). API: `xai/grok-imagine-image/v2.0/{text-to-image|edit}`; kie `grok-imagine/text-to-image` and `grok-imagine/image-to-image`.

xAI built this generation around **type and page layout**. Anything you skip still gets an answer — the model invents material, light, and background. Close those gaps in the prompt. Three or four sentences is enough. Rank requirements: keep the four that decide the picture; push the rest to a later edit. Past about eight hard constraints, some drop.

fal/xAI responses may include `revised_prompt` (the expanded brief they actually used). Treat it as a list of decisions you left open — then rewrite those into the next prompt. Do not paste quality-booster soup (`cinematic, highly detailed, 8k`); Grok will fill a generic bottle shot.

Edit: natural-language change, **up to 3 input images** on fal/xAI. If a profile has more selfies plus manicure, prefer a generate with one identity photo, or name only Image 1–2 in the prompt.

Size 1K/2K and aspect are picker buttons. Iterate 1K, then 2K for keepers.

## What to name (create)

1. **Subject as a physical object** — material, finish, wear, how light hits the surface.
2. **Camera** — where it stands, flattening vs stretching lens.
3. **Regions** — what fills the top; what stays **empty** for copy (unclaimed space gets filled).
4. **Wording** — exact spelling, largest line first, then smaller lines, line breaks as in the lockup; name the **treatment** (screen print, foil, paint) and the **surface** (cotton, carton, glass).

## Template — create (no profile)

```
[Shot type] of [object, material, wear] [on/in place].
Camera [height / angle / lens cue], light [source and hardness].
[What occupies top / left / empty copy band].
Text on [surface], [treatment]: "[LARGEST LINE]" then "[smaller line]". Nothing else in the frame.
```

### Create — product + type (fal perfume rewrite)

```
A heavy square glass perfume bottle on a slab of gray travertine, shot at bottle height from slightly off centre.
A single hard light from the back left, bright edge on the glass, hard shadow across the stone.
The liquid is deep amber. Flat dark wall in the band above the bottle.
"ORRIS ABSOLUTE" etched into the front of the glass in small serif capitals. No other text.
```

### Create — copy space held open (fal sedan)

```
A dark gray electric sedan three-quarter front on a wet salt flat at dusk, low camera, hard rim from a low sun behind, reflection on the wet ground.
The entire left third of the frame is empty flat sky with no cloud detail, held for a copy block.
No text in the image.
```

### Create — several type surfaces (fal bakery)

```
A narrow bakery storefront straight-on in flat morning light.
Painted fascia "GOLDEN HOUR" in tall serif capitals; window decal "BREAD, PASTRY, COFFEE"; chalkboard with four hand-lettered items; brass plate "NO. 14"; paper in the glass "BACK AT 2".
```

## Template — create with a saved person

Pass `profile`. Describe clothes, pose, place, light, empty regions. Do not restate the face.

```
Editorial still of the referenced person in [clothes], [pose], [place].
Camera [shot size], light [source].
[Empty band if needed]. No text in the frame.
```

## Template — edit (one change)

xAI/fal: name the change **and** the fixed parts. Two changes → two passes. Combine subject + setting with Image 1 = scene, Image 2 = object (max three images).

```
Only [named part] changes: [new state].
Keep [everything else named] fixed.
```

### Edit — type on a pack

```
Only the printed panel changes. Set it to read "NORTHBOUND", then "DECAF COLOMBIA", then "500 G" across the same three lines in the same cream ink.
```

### Edit — person into a place

```
The place, wall, and warm light in Image 1 stay fixed.
Put the person from Image 2 into that scene, matching the existing light and shadow softness.
Keep the same face.
```

## Do not write

- Empty “luxury product, cinematic, 8k”.
- More than three reference roles on an edit.
- Aspect or 1K/2K inside the prompt.
- A second identity when a profile is on.

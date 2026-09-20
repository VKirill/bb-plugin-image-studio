# Seedream 5.0 Pro — how to write the prompt

Sources: [ByteDance Seedream 5.0 Pro](https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro), [fal: How to Use Seedream 5.0 Pro](https://fal.ai/learn/tools/how-to-use-seedream-5-0-pro-v2). API: `bytedance/seedream/v5/pro/text-to-image` and `/edit`; kie `seedream/5-pro-text-to-image` and `seedream/5-pro-image-to-image`.

Seedream **plans layout before drawing**. A vague “nice photo” gets a centred, evenly lit stock frame. Spend words on **structure**: where the camera stands, where the light comes from, named materials, quoted copy and its region.

Two brief types:

- **Photograph** — subject → camera position → light → finish (photographer’s brief).
- **Layout** (poster, UI, infographic) — grid, regions, what sits in each, every string in `"quotes"` with placement.

Native type in many languages (including Russian). Quote the exact glyphs. If too many jobs are stacked, pieces drop — split into a generate, then one grounded edit.

Do not put `landscape_4_3` in the prompt; the plugin sends size separately.

## Template — create photograph (no profile)

```
Subject: [who/what, materials, pose at a real moment — not centred if you can help it].
Camera: [lens, height, what is sharp vs blurred].
Light: [source, hardness, colour; never “well lit”].
Finish: [grain / colour grade].
Text: [quoted strings and region], or “no other text in the frame”.
```

### Create — product hero (fal boot shape, shortened)

```
Subject: a pair of tan full-grain leather boots on a dark oak crate, three-quarter, off-centre to the left.
Camera: 90mm, f/5.6, tack-sharp on welt stitching, background falloff.
Light: hard low key from the left like late sun through a window, soft fill on the shadow side.
Finish: warm catalogue grade, dust in the beam.
Text: lower-right third, small type "THE DRIFTER" over "Full-grain leather, Goodyear welted". No other text in the frame.
```

## Template — create layout (infographic / UI)

Name the grid. Quote every label. One pass.

```
Format: [poster / dashboard / infographic], [regions top to bottom or left to right].
Title: "[exact title]" in [type], [position].
Regions: [what sits in each band / card], each label in "quotes".
Style: [palette, margins, rules].
```

### Create — dashboard (fal logistics shape, shortened)

```
Format: desktop web dashboard, dark theme, production UI.
Header: "Fleet Overview" with date range "1 to 30 Jun".
KPI row: "Active vehicles 214", "On-time 92.4%", "Avg delay 11m", "Cost per mile $1.38".
Charts: line chart "Deliveries per day"; donut "Fleet by region".
Table columns: "Route", "Driver", "Status", "ETA"; one row Status "Delayed".
Style: charcoal panels, one amber accent, small sans, no extra text.
```

## Template — create with a saved person

Pass `profile`. Write clothes, gesture, place, two light colours if you can. Do not restate the face.

```
Subject: the referenced person in [clothes], [off-centre pose / glance].
Camera: [shot size, lens].
Light: [key] and [rim or window], named colours.
Finish: still photograph, [grain].
Text: no other text in the frame.
```

## Template — edit (grounded, one region)

ByteDance / fal: name **the single thing that changes** and say the rest stays. Annotation boxes are not available from this plugin — use named objects instead.

```
Change only [named object / line of type] to [new value].
Keep [wordmark / pose / lighting / the rest of the frame] exactly as they are.
```

### Edit — label line

```
Change only the small line under the logo to read "85% single origin, Chuao".
Keep the "MARONNE" wordmark, the product, the burst, the gold type style, and the lighting exactly as they are.
```

### Edit — compose

```
Place the person from Image 1 into the kitchen from Image 2, standing at the island, hands on the marble.
Keep the face from Image 1 and the cabinets from Image 2. Do not restyle the room.
```

## Do not write

- “Well lit”, “cinematic masterpiece”, tag soup.
- An overloaded one-shot (five charts **and** a hero **and** a recrop).
- Aspect tokens inside the prompt.
- A second identity when a profile is on.

# Wan 2.7 — how to write the prompt

Sources: fal [text-to-image](https://fal.ai/models/fal-ai/wan/v2.7/text-to-image/api) and [edit](https://fal.ai/models/fal-ai/wan/v2.7/edit/api) schemas; kie [wan/2-7-image](https://docs.kie.ai/market/wan/2-7-image) (Pro: `wan/2-7-image-pro`, 4K). No official prompt guide was published for it, so this follows what the schemas state. API: fal `fal-ai/wan/v2.7/text-to-image` and `fal-ai/wan/v2.7/edit`; kie `wan/2-7-image` for both.

Prompts may be English or Chinese. Describe the picture you want, in plain sentences: subject, setting, style, mood. One job per prompt. Size is an aspect button (kie maps 4:5, 2:3, 3:2, 5:4 to the nearest of 1:1, 16:9, 4:3, 21:9, 3:4, 9:16, 8:1, 1:8); there is no size button. The plugin generates one image per call (kie would make 4 by default).

Edit: **1–4 reference images on fal, up to 9 on kie, and the order matters.** Source pictures are Image 1…N, profile photos follow. Name the Image number you mean, say what changes and what stays. Prompt expansion is turned off on fal edit so the prompt is used as written. There is no negative prompt in the plugin.

## Template — create

```
[Subject and action] in [place].
Style: [photograph / illustration], [light], [mood].
```

## Template — edit

```
In Image 1, change [named part] to [new state].
Keep [the rest] the same.
```

**18+ fallback.** Qwen Image 2.1 is the default for adult content; Wan 2.7 is the allowed fallback when Qwen fails or refuses, or when the user names Wan. Use this template for it. Profile references and the bare-skin slots (`chest-nude`, `buttocks-nude`) work as for Qwen; the Wan cap of 9 references stays, with the same priority (faces, marks when skin shows, the matching body or nude photo). Adults only.

Safety: the plugin sends `enable_safety_checker: false` on fal and `nsfw_checker: false` on kie. fal says disabling the checker needs account authorization, otherwise requests are still checked. kie says that with `nsfw_checker: false` no additional filtering is applied and results come straight from the model.

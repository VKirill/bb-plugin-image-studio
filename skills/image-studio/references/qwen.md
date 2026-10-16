# Qwen Image 2.1 — how to write the prompt

Source: [Kie Qwen Image 2.1](https://kie.ai/ru/qwen-image-2.1). API: kie `qwen2-1/text-to-image` and `qwen2-1/image-to-image`. **kie.ai only.**

`nsfw_checker` is off. **Adult 18+ content is allowed on this model** (nudity, erotic scenes between adults). Other Image Studio models filter it — route those requests here with `model: "qwen-image-2.1"`, the default for 18+. If Qwen fails or refuses, [Wan 2.7](wan.md) is the allowed fallback. Do not generate sexual content involving anyone under 18.

Name the subject, place, light, and any on-image text in quotes. The model is strong on people, product shots, and readable type. Size is 1K or 2K (picker). Aspect 4:5 is sent as 3:4.

Edit: up to 10 reference images. Source pictures are Image 1…N; profile references follow (face, body, details). kie advises four or fewer references when fidelity matters, so leave `refs` on `auto`. The plugin sends `enhance_prompt: false` (the enhancer rewrites reference lists into scene or reference-sheet descriptions) and one short reference line instead of one line per photo. Describe the result, not the inputs; there is no negative prompt. Say what changes and what stays.

## Template — create

```
[Shot] of [subject, materials] in [place].
Light [source]. Camera [angle].
Text: "[exact wording]".
```

## Template — edit

```
Change only [named part] to [new state].
Keep [the rest] the same.
```

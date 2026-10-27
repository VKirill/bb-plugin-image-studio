---
title: Image Studio — release lessons from the texture-by-model run
date: 2026-10-27
---

# Release lessons (0.8.5 → 0.8.10)

- **Shipping.** image-studio is a git-source plugin (`git:VKirill/bb-plugin-image-studio@>=0.2.0`): bump `package.json`, `git tag -a vX.Y.Z`, push main and the tag, `bb plugin update image-studio --yes`, then `bb plugin reload image-studio`, then check `bb plugin list` and `bb skill list`. `bb-plugin-push` is for path plugins only.
- **`configure() selected unknown skill id "image-studio"`.** Right after an update this can be a race, and `bb plugin reload` clears it. It also had real causes: a SKILL.md description over 1024 chars (0.8.6) and `: ` inside the unquoted YAML description (0.8.7). Whenever the skill is dropped, the `image_studio_*` agent tools are not registered either. `tests/skill-frontmatter.test.ts` now guards both causes.
- **Host entry.** `host.ts` must import `experimental_defineHostEntry` from bare `@get-bb/plugin-sdk`. `server.ts` imports `host.ts`, and the hub cannot build the `/host` subpath (0.8.5 was refused).
- **Contracts.** Put `bb plugin build` in every writer's verification: the app bundle cannot import `node:*`. Writers only see tracked files, so commit plan references (`.agents/plans/...`) before dispatching.
- **Blender in Lane Pilot sandbox.** Use `mkdir -p .bb/tmp && T="$PWD/$(mktemp -d .bb/tmp/x.XXXXXX)"` and `TMPDIR="$T"`: a bare `mktemp -d` hits `/var/folders` and is denied.
- **Pixel checks.** `scripts/model-checks/guide_check.py` (guide colours and brightness, preview framing and light) caught what the writers' own checks missed: the bake target overwrote the model's colour texture, and the preview was too small, then cropped.
- **Known limitation.** Muse draws the blueprint SIDE as a copy of FRONT, even in a separate side-only call with the front view as reference (fire mop, 0.8.10). front and back are reliable, side is not. Next options: depth from the concept (TZ §5) or another model for the side view.

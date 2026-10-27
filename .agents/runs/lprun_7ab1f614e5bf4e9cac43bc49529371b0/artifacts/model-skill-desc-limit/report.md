STATUS: complete

# Skill description over 1024 chars: BB drops the image-studio skill (configure failed); shorten it, version 0.8.7

After installing 0.8.6 BB reports `agent configure failed: configure() selected unknown skill id "image-studio"`: the SKILL.md frontmatter description grew to 1095 characters (v0.8.4 had 823) and skill descriptions are limited to 1024, so the skill is dropped. Rewrite the description to at most 950 characters keeping every trigger group (pictures/photos/posters, people profiles, game GUI, game characters for 3D, Roblox game art, texture a 3D model by its UV / modeling blueprint from a concept, 18+ with Qwen/Wan) — compress the model list (e.g. 'Nano Banana, Muse Image, GPT Image, FLUX.2, Seedream, Grok Imagine, Qwen, Wan') rather than dropping triggers. Add a test that parses the frontmatter of every skills/**/SKILL.md and asserts name matches the folder and description length <= 1024. Bump package.json version to 0.8.7.

Attempt 1 accepted by Lane Pilot BB writer.

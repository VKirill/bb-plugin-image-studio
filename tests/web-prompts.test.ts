import assert from "node:assert/strict";
import { test } from "node:test";
import { keyGreen, type GuiStyle } from "../src/gui.ts";
import type { Rgba } from "../src/image-io.ts";
import { withFalRetry } from "../src/providers.ts";
import { faviconSet } from "../src/web-favicon.ts";
import { paletteKey, siteLines, webJobs, webManifest, type WebMode, type WebRequest } from "../src/web.ts";

const site = (patch: Partial<GuiStyle> = {}): GuiStyle => ({
  id: "s1",
  projectId: "p1",
  origin: "",
  section: "web",
  gameId: "",
  name: "Acme Roasters & Sons",
  theme: "a coffee subscription",
  tags: [],
  palette: { background: "", button: "", outline: "", highlight: "", text: "" },
  notes: "",
  refs: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});

const request = (patch: Partial<WebRequest>): WebRequest => ({
  mode: "hero",
  prompt: "a calm workspace by a window",
  variants: 1,
  refCount: 0,
  designCount: 0,
  ...patch,
});

const promptOf = (mode: WebMode, prompt: string, project: GuiStyle | null = site()): string =>
  webJobs(request({ mode, prompt }), project)[0]!.prompt;

const px = (image: Rgba, x: number, y: number) =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

/** A green-keyed Muse picture: a red mark centred on the flat green background. */
const greenKeyPicture = (): Rgba => {
  const width = 120;
  const height = 80;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mark = x >= 40 && x < 80 && y >= 20 && y < 60;
      data.set(mark ? [200, 30, 50, 255] : [0, 255, 0, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
};

test("favicon set from a green-key picture: transparent corners, maskable filled with the palette button colour", async () => {
  const mark = keyGreen(greenKeyPicture());
  const set = await faviconSet(mark, [192, 32, 58], "Acme", [10, 10, 18]);
  const byFile = new Map(set.map((file) => [file.file, file]));
  for (const file of ["favicon-32.png", "icon-192.png"] as const) {
    const entry = byFile.get(file);
    assert.ok(entry && "image" in entry, file);
    const { width, height } = entry.image;
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ] as const) {
      assert.equal(px(entry.image, x, y)[3], 0, `${file} corner ${x},${y} is not transparent`);
    }
  }
  const maskable = byFile.get("icon-maskable-512.png");
  assert.ok(maskable && "image" in maskable);
  for (const [x, y] of [
    [0, 0],
    [511, 0],
    [0, 511],
    [511, 511],
  ] as const) {
    assert.deepEqual(px(maskable.image, x, y), [192, 32, 58, 255], `maskable corner ${x},${y} is not the button colour`);
  }
});

test("site.webmanifest carries the site's display name, a short_name of at most 12 chars and theme_color", async () => {
  const set = await faviconSet(keyGreen(greenKeyPicture()), [192, 32, 58], "Acme Roasters & Sons", [10, 10, 18]);
  const manifest = set.find((file) => file.file === "site.webmanifest");
  assert.ok(manifest && "manifest" in manifest);
  const data = manifest.manifest as { name: string; short_name: string; theme_color: string; background_color: string };
  assert.equal(data.name, "Acme Roasters & Sons");
  assert.equal(data.short_name, "Acme Roaster");
  assert.ok(data.short_name.length <= 12);
  assert.equal(data.theme_color, "#C0203A");
  assert.equal(data.background_color, "#0A0A12");
});

test("picture prompts: no interface words, each with its rule line", () => {
  for (const banned of ["button", "grid", "sans-serif"]) {
    for (const mode of ["hero", "cover", "background", "pattern"] as const) {
      const styled = site({ tags: ["minimal"], palette: { background: "#f5efe6", button: "#c0203a", outline: "", highlight: "", text: "" } });
      const prompt = promptOf(mode, `the ${mode} request`, styled);
      assert.equal(prompt.toLowerCase().includes(banned), false, `${mode} prompt contains "${banned}":\n${prompt}`);
    }
  }
  assert.match(promptOf("hero", "a kitchen"), /the left 40% of the frame is calm and even/);
  assert.match(promptOf("cover", "a post about tea"), /no text unless the request quotes it/);
  assert.match(promptOf("background", "soft texture"), /an even, low-contrast tone built from the site's background colour/);
  assert.match(promptOf("pattern", "tiny leaves"), /a plain margin of the background around the edges/);
});

test("layout prompts: edge to edge and the exact site name as the brand", () => {
  for (const mode of ["page", "mobile", "block"] as const) {
    const prompt = promptOf(mode, `the ${mode} request`);
    assert.match(prompt, /edge/, mode);
    assert.match(prompt, new RegExp(`the brand name shown is exactly "Acme Roasters & Sons"`), mode);
    assert.match(prompt, /never invent another brand name/, mode);
  }
});

test("ideas: four prompts name four different layout types", () => {
  const layouts = [/split hero with an image on the right/, /centered hero over a full-bleed photo/, /big serif headline and asymmetric columns/, /led by a product grid/];
  for (const project of [site(), site({ tags: ["dark-tech"] })]) {
    const jobs = webJobs(request({ mode: "ideas", prompt: "a coffee subscription" }), project);
    assert.equal(jobs.length, 4);
    for (const [index, layout] of layouts.entries()) {
      assert.match(jobs[index]!.prompt, layout, `idea ${index + 1} lacks its layout type`);
    }
    assert.equal(new Set(jobs.map((job) => job.prompt)).size, 4);
  }
});

test("two style presets become one blend sentence", () => {
  const styled = site({ tags: ["minimal", "editorial"] });
  const prompt = siteLines(styled, 0, 0).join("\n");
  const blends = prompt.match(/a blend of/g) ?? [];
  assert.equal(blends.length, 1);
  assert.match(prompt, /Style: a blend of clean minimal web design: [^\n]+ and editorial web design: [^\n]+; where they disagree, follow the site theme\./);
  const single = siteLines(site({ tags: ["minimal"] }), 0, 0).join("\n");
  assert.match(single, /Style: clean minimal web design/);
  assert.equal(single.includes("blend"), false);
});

test("the accent palette key is an alias of highlight", () => {
  assert.equal(paletteKey("accent"), "highlight");
  assert.equal(paletteKey("ACCENT"), "highlight");
  assert.equal(paletteKey("button"), "button");
  assert.equal(paletteKey("nope"), null);
  const styled = site({ palette: { background: "", button: "", outline: "", highlight: "", text: "", accent: "#7c5cff" } as GuiStyle["palette"] });
  assert.match(siteLines(styled, 0, 0).join("\n"), /accents #7C5CFF/);
});

test("withFalRetry retries exactly twice on transient errors, never on others", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assert.rejects(
    () =>
      withFalRetry(
        async () => {
          calls += 1;
          throw new Error("fal.ai generation failed: downstream_service_unavailable");
        },
        { sleep: async (ms) => void sleeps.push(ms) },
      ),
    /downstream_service_unavailable/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [3000, 8000]);

  calls = 0;
  await assert.rejects(
    () =>
      withFalRetry(
        async () => {
          calls += 1;
          throw new Error("fal.ai submit failed (422): content_policy_violation");
        },
        { sleep: async () => undefined },
      ),
    /content_policy_violation/,
  );
  assert.equal(calls, 1);

  calls = 0;
  const image = await withFalRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("fal.ai finished without an image URL: {}");
      return "https://img/out.png";
    },
    { sleep: async () => undefined },
  );
  assert.equal(image, "https://img/out.png");
  assert.equal(calls, 3);
});

test("concept manifests mark the files as design references with place null", () => {
  for (const [mode, file] of [
    ["ideas", "mockup.png"],
    ["page", "page.png"],
    ["mobile", "mobile.png"],
    ["block", "block.png"],
  ] as const) {
    const manifest = webManifest({ mode, site: "Acme" }, [{ file, width: 100, height: 100 }]);
    assert.equal(manifest.files[0]!.place, null, `${mode} ${file}`);
    assert.equal(manifest.files[0]!.note, "design reference, not a site asset");
  }
});

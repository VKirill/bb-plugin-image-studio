import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBlueprintPrompt } from "../src/blueprint.ts";
import { parseModelGenerateCli } from "../src/model.ts";
import { kieGenerate } from "../src/providers.ts";

test("buildBlueprintPrompt generates explicit per-view lines only for requested views", () => {
  const prompt = buildBlueprintPrompt({
    subject: "fire mop",
    viewNames: ["front", "side", "back"],
    style: "clay+wire",
    softParts: ["rags"],
  });

  // Verify structure
  assert.match(prompt, /Image 1 is the DESIGN REFERENCE: fire mop\./);
  assert.match(prompt, /FRONT: the object exactly as seen in image 1 but straight-on\./);
  assert.match(
    prompt,
    /SIDE: the object rotated 90 degrees around its vertical axis — a true profile: parts that stick out sideways in FRONT now point toward or away from the viewer, so the whole object looks much narrower than in FRONT\./,
  );
  assert.match(
    prompt,
    /BACK: the object rotated 180 degrees — mirror of FRONT; details on the front face are hidden\./,
  );
  assert.doesNotMatch(prompt, /TOP:/);
  assert.match(prompt, /light BLUE clay/);
  assert.match(prompt, /Must not change: proportions, part count and shapes of the object in image 1\./);
  assert.match(prompt, /No perspective, no shadows, no fire or effects, no text except the labels FRONT, SIDE, BACK\./);

  const topOnly = buildBlueprintPrompt({
    subject: "box",
    viewNames: ["top"],
    style: "clean line",
    softParts: [],
  });
  assert.match(topOnly, /TOP: seen from straight above\./);
  assert.doesNotMatch(topOnly, /FRONT:/);
  assert.doesNotMatch(topOnly, /SIDE:/);
  assert.doesNotMatch(topOnly, /BACK:/);
});

test("parseModelGenerateCli parses blueprint flags: --blueprint-model, --resolution, --gateway", () => {
  const parsed = parseModelGenerateCli([
    "model",
    "generate",
    "--mode",
    "blueprint",
    "--image",
    "mop.png",
    "--blueprint-model",
    "nano-banana-2-lite",
    "--resolution",
    "2K",
    "--gateway",
    "fal",
    "--prompt",
    "stylized",
  ]);

  assert.equal(parsed.mode, "blueprint");
  if (parsed.mode !== "blueprint") return;
  assert.equal(parsed.blueprintModel, "nano-banana-2-lite");
  assert.equal(parsed.resolution, "2K");
  assert.equal(parsed.gateway, "fal");
});

test("kieGenerate supports custom pollMs >= 20 min (1_200_000 ms)", async () => {
  let pollTimeoutPassed: number | undefined;

  const mockFetch: typeof fetch = (async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes("createTask")) {
      return new Response(JSON.stringify({ code: 200, data: { taskId: "task-123" } }), { status: 200 });
    }
    if (urlStr.includes("recordInfo")) {
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            state: "success",
            resultJson: JSON.stringify({ resultUrls: ["https://example.com/res.png"] }),
          },
        }),
        { status: 200 },
      );
    }
    return new Response("Not found", { status: 404 });
  }) as typeof fetch;

  const res = await kieGenerate(
    "dummy-key",
    "nano-banana-2-1",
    {
      prompt: "test",
      referenceDataUris: [],
      pollMs: 1_200_000,
    },
    mockFetch,
  );

  assert.equal(res.url, "https://example.com/res.png");
});

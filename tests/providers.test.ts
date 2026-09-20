import assert from "node:assert/strict";
import { test } from "node:test";
import { falPollUrls } from "../src/providers.ts";

test("muse queue status lives on the model root, not the text-to-image suffix", () => {
  const urls = falPollUrls("meta/muse-image/text-to-image", "req-1", {
    status_url: "https://queue.fal.run/meta/muse-image/requests/req-1/status",
    response_url: "https://queue.fal.run/meta/muse-image/requests/req-1",
  });
  assert.equal(urls.statusUrl, "https://queue.fal.run/meta/muse-image/requests/req-1/status");
  assert.equal(urls.resultUrl, "https://queue.fal.run/meta/muse-image/requests/req-1");
});

test("fal banana keeps the submitted endpoint when queue URLs are absent", () => {
  const urls = falPollUrls("fal-ai/nano-banana-2", "req-2", {});
  assert.equal(urls.statusUrl, "https://queue.fal.run/fal-ai/nano-banana-2/requests/req-2/status");
});

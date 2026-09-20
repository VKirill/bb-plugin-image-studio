import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { encodeWebp, imageSize, WEBP_FULL, WEBP_THUMB } from "../src/encode-webp.ts";

test("webp display and thumb are smaller than a PNG of the same photo", async () => {
  const png = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 210, g: 80, b: 40 } },
  })
    .png()
    .toBuffer();
  const display = await encodeWebp(png, WEBP_FULL);
  const thumb = await encodeWebp(png, WEBP_THUMB);
  assert.ok(display.length < png.length);
  assert.ok(thumb.length < display.length);
  const displayMeta = await sharp(display).metadata();
  const thumbMeta = await sharp(thumb).metadata();
  assert.equal(displayMeta.format, "webp");
  assert.equal(thumbMeta.format, "webp");
  assert.ok((thumbMeta.width ?? 0) <= 480);
  const size = await imageSize(png);
  assert.deepEqual(size, { width: 1200, height: 800 });
});

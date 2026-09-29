import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { encodeWebp, imageSize, sniffImageMime, WEBP_FULL, WEBP_THUMB } from "../src/encode-webp.ts";

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
  assert.equal(sniffImageMime(display), "image/webp");
  assert.equal(sniffImageMime(png), "image/png");
});

test("sniffImageMime reads PNG and JPEG signatures", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(sniffImageMime(png), "image/png");
  assert.equal(sniffImageMime(jpeg), "image/jpeg");
});

import { createRequire } from "node:module";

/** 8-bit RGBA pixels, row by row. */
export type Rgba = { data: Uint8Array; width: number; height: number };

type SharpFn = typeof import("sharp");
type VipsImage = {
  readonly width: number;
  readonly height: number;
  readonly bands: number;
  hasAlpha(): boolean;
  bandjoin(value: number): VipsImage;
  writeToMemory(): Uint8Array;
  pngsaveBuffer(options?: { compression?: number }): Uint8Array;
  delete(): void;
};
type Vips = {
  Image: {
    newFromBuffer(data: Uint8Array): VipsImage;
    newFromMemory(data: Uint8Array, width: number, height: number, bands: number, format: "uchar"): VipsImage;
  };
};

let sharpCached: SharpFn | null | undefined;
let vipsCached: Promise<Vips | null> | undefined;

function loadSharp(): SharpFn | null {
  if (sharpCached !== undefined) return sharpCached;
  try {
    sharpCached = createRequire(import.meta.url)(["sh", "arp"].join("")) as SharpFn;
  } catch {
    sharpCached = null;
  }
  return sharpCached;
}

/** WebAssembly libvips: BB installs git plugins with --omit=optional, which can drop sharp's native binaries. */
function loadVips(): Promise<Vips | null> {
  vipsCached ??= (async () => {
    try {
      const init = createRequire(import.meta.url)(["wasm", "vips"].join("-")) as () => Promise<Vips>;
      return await init();
    } catch {
      return null;
    }
  })();
  return vipsCached;
}

/** Any PNG / JPEG / WebP to raw RGBA. */
export async function decodeRgba(bytes: Buffer): Promise<Rgba> {
  const sharp = loadSharp();
  if (sharp) {
    try {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
    } catch {
      // fall through to libvips
    }
  }
  const vips = await loadVips();
  if (!vips) throw new Error("No image decoder: neither sharp nor wasm-vips loads on this host.");
  const image = vips.Image.newFromBuffer(new Uint8Array(bytes));
  const rgba = image.hasAlpha() ? image : image.bandjoin(255);
  try {
    if (rgba.bands !== 4) throw new Error(`Expected an RGB(A) picture, got ${rgba.bands} bands.`);
    return { data: new Uint8Array(rgba.writeToMemory()), width: rgba.width, height: rgba.height };
  } finally {
    if (rgba !== image) rgba.delete();
    image.delete();
  }
}

export async function encodePng(image: Rgba): Promise<Buffer> {
  const sharp = loadSharp();
  if (sharp) {
    try {
      return await sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      // fall through to libvips
    }
  }
  const vips = await loadVips();
  if (!vips) throw new Error("No PNG encoder: neither sharp nor wasm-vips loads on this host.");
  const vimage = vips.Image.newFromMemory(image.data, image.width, image.height, 4, "uchar");
  try {
    return Buffer.from(vimage.pngsaveBuffer({ compression: 9 }));
  } finally {
    vimage.delete();
  }
}

/**
 * PNG-in-ICO (a favicon.ico holds PNG pictures on every modern browser): a 6-byte ICONDIR (reserved 0, type 1, the
 * entry count, little-endian u16), then one 16-byte ICONDIRENTRY per picture (width and height as u8, 0 meaning 256;
 * colour count 0, reserved 0, planes 1, bit count 32, bytes in resource u32, image offset u32), then the PNG blobs in
 * the same order.
 */
export function encodeIco(pngs: Array<{ size: number; png: Buffer }>): Buffer {
  if (pngs.length === 0) throw new Error("encodeIco needs at least one PNG.");
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = header.length + entries.length;
  const blobs: Buffer[] = [];
  pngs.forEach((item, index) => {
    const entry = index * 16;
    entries.writeUInt8(item.size >= 256 ? 0 : item.size, entry);
    entries.writeUInt8(item.size >= 256 ? 0 : item.size, entry + 1);
    entries.writeUInt8(0, entry + 2);
    entries.writeUInt8(0, entry + 3);
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(item.png.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += item.png.length;
    blobs.push(item.png);
  });
  return Buffer.concat([header, entries, ...blobs]);
}

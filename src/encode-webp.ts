import { createRequire } from "node:module";

type SharpFn = typeof import("sharp");

let sharpCached: SharpFn | null | undefined;

function loadSharp(): SharpFn | null {
  if (sharpCached !== undefined) return sharpCached;
  try {
    const req = createRequire(import.meta.url);
    sharpCached = req(["sh", "arp"].join("")) as SharpFn;
  } catch {
    sharpCached = null;
  }
  return sharpCached;
}

type VipsImage = { webpsaveBuffer(options: { Q: number }): Uint8Array; delete(): void };
type Vips = {
  Image: { thumbnailBuffer(bytes: Uint8Array, width: number, options: { height: number; size: "down" }): VipsImage };
};

let vipsCached: Promise<Vips | null> | undefined;

/** WebAssembly libvips: BB installs git plugins with --omit=optional, which drops sharp's native binaries. */
function loadVips(): Promise<Vips | null> {
  vipsCached ??= (async () => {
    try {
      const req = createRequire(import.meta.url);
      const init = req(["wasm", "vips"].join("-")) as () => Promise<Vips>;
      return await init();
    } catch {
      return null;
    }
  })();
  return vipsCached;
}

export async function encodeWebpWasm(
  bytes: Buffer,
  options: { maxEdge: number; quality: number },
): Promise<Buffer> {
  const vips = await loadVips();
  if (!vips) return bytes;
  try {
    const image = vips.Image.thumbnailBuffer(bytes, options.maxEdge, { height: options.maxEdge, size: "down" });
    try {
      return Buffer.from(image.webpsaveBuffer({ Q: options.quality }));
    } finally {
      image.delete();
    }
  } catch {
    return bytes;
  }
}

export function sniffImageMime(bytes: Buffer): string {
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes.toString("ascii", 0, 3) === "GIF") {
    return "image/gif";
  }
  return "application/octet-stream";
}

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (sniffImageMime(bytes) !== "image/png" || bytes.length < 24) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

export async function encodeWebp(
  bytes: Buffer,
  options: { maxEdge: number; quality: number },
): Promise<Buffer> {
  const sharp = loadSharp();
  if (!sharp) return encodeWebpWasm(bytes, options);
  try {
    return await sharp(bytes)
      .rotate()
      .resize({
        width: options.maxEdge,
        height: options.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: options.quality, effort: 4 })
      .toBuffer();
  } catch {
    return bytes;
  }
}

export const WEBP_FULL = { maxEdge: 1600, quality: 78 } as const;
export const WEBP_THUMB = { maxEdge: 480, quality: 70 } as const;

export async function imageSize(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  const sharp = loadSharp();
  if (sharp) {
    try {
      const meta = await sharp(bytes).metadata();
      if (meta.width && meta.height) return { width: meta.width, height: meta.height };
    } catch {
      // Fall through to PNG header parse.
    }
  }
  return pngSize(bytes);
}

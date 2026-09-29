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
  if (!sharp) return bytes;
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

import sharp from "sharp";

export async function encodeWebp(
  bytes: Buffer,
  options: { maxEdge: number; quality: number },
): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({
      width: options.maxEdge,
      height: options.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: options.quality, effort: 4 })
    .toBuffer();
}

export const WEBP_FULL = { maxEdge: 1600, quality: 78 } as const;
export const WEBP_THUMB = { maxEdge: 480, quality: 70 } as const;

export async function imageSize(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) return null;
  return { width: meta.width, height: meta.height };
}

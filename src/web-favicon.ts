import { encodeIco, encodePng, type Rgba } from "./image-io.ts";
import { fitSquare, mountOnColor } from "./raster.ts";

/**
 * The favicon set builder of the Web section — server-only: it rasters through image-io (sharp/vips, node
 * builtins), so the panel's browser bundle must never import this file; it uses only the job side of web.ts.
 */

/** One finished file of the favicon set: a PNG raster, the raw ICO bytes, or the webmanifest object. */
export type FaviconFile =
  | { file: string; image: Rgba }
  | { file: string; bytes: Buffer }
  | { file: string; manifest: Record<string, unknown> };

/**
 * The favicon set from the mark cut off the green key: transparent favicon-16/32 and icon-192/512 (fitSquare, margin
 * 0.06), favicon.ico with 16/32/48 PNG entries, opaque apple-touch-icon 180 (mark at 80% of the side) and
 * icon-maskable-512 (the mark inside the central 80%, a 409 px box), both filled with the site's first palette
 * colour, and site.webmanifest pointing at the 192, 512 and maskable icons.
 */
export async function faviconSet(mark: Rgba, fill: readonly [number, number, number], siteName = ""): Promise<FaviconFile[]> {
  const square = (size: number): Rgba => fitSquare(mark, size, 0.06);
  const ico = encodeIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await encodePng(square(size)) }))),
  );
  return [
    { file: "favicon-16.png", image: square(16) },
    { file: "favicon-32.png", image: square(32) },
    { file: "icon-192.png", image: square(192) },
    { file: "icon-512.png", image: square(512) },
    { file: "favicon.ico", bytes: ico },
    { file: "apple-touch-icon.png", image: mountOnColor(mark, 180, 144, fill) },
    { file: "icon-maskable-512.png", image: mountOnColor(mark, 512, 409, fill) },
    {
      file: "site.webmanifest",
      manifest: {
        name: siteName,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    },
  ];
}

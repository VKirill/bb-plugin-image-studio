import type { Rgba } from "./image-io.ts";

/**
 * Pixel work for Roblox assets, in plain TypeScript (sharp may be missing on a host): exact-size resampling,
 * transparent squares, alpha trimming, seamless tiling, normal maps, skybox faces and glow-to-alpha.
 */

/** Per output index: the source indices it reads and their weights (area average down, bilinear up). */
function weights(src: number, dst: number): Array<{ start: number; w: Float32Array }> {
  const scale = src / dst;
  const out: Array<{ start: number; w: Float32Array }> = [];
  for (let i = 0; i < dst; i++) {
    if (scale >= 1) {
      const lo = i * scale;
      const hi = lo + scale;
      const start = Math.floor(lo);
      const end = Math.min(src, Math.ceil(hi));
      const w = new Float32Array(end - start);
      for (let j = start; j < end; j++) w[j - start] = (Math.min(hi, j + 1) - Math.max(lo, j)) / scale;
      out.push({ start, w });
    } else {
      const pos = Math.max(0, Math.min(src - 1, (i + 0.5) * scale - 0.5));
      const start = Math.min(src - 2, Math.floor(pos));
      if (src === 1) out.push({ start: 0, w: Float32Array.of(1) });
      else {
        const f = pos - start;
        out.push({ start, w: Float32Array.of(1 - f, f) });
      }
    }
  }
  return out;
}

/** Resample to exactly width×height; alpha-weighted, so transparent pixels leave no dark fringe. */
export function resize(image: Rgba, width: number, height: number): Rgba {
  if (image.width === width && image.height === height) return image;
  const { data, width: sw, height: sh } = image;
  const xs = weights(sw, width);
  const ys = weights(sh, height);
  // Horizontal pass into premultiplied floats.
  const mid = new Float32Array(width * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < width; x++) {
      const { start, w } = xs[x]!;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const p = (y * sw + start + k) * 4;
        const alpha = data[p + 3]! * w[k]!;
        r += data[p]! * alpha;
        g += data[p + 1]! * alpha;
        b += data[p + 2]! * alpha;
        a += alpha;
      }
      const q = (y * width + x) * 4;
      mid[q] = r;
      mid[q + 1] = g;
      mid[q + 2] = b;
      mid[q + 3] = a;
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const { start, w } = ys[y]!;
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const p = ((start + k) * width + x) * 4;
        r += mid[p]! * w[k]!;
        g += mid[p + 1]! * w[k]!;
        b += mid[p + 2]! * w[k]!;
        a += mid[p + 3]! * w[k]!;
      }
      const q = (y * width + x) * 4;
      if (a > 0) {
        out[q] = Math.round(Math.min(255, r / a));
        out[q + 1] = Math.round(Math.min(255, g / a));
        out[q + 2] = Math.round(Math.min(255, b / a));
      }
      out[q + 3] = Math.round(Math.min(255, a));
    }
  }
  return { data: out, width, height };
}

export function crop(image: Rgba, x0: number, y0: number, width: number, height: number): Rgba {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    out.set(image.data.subarray(((y0 + y) * image.width + x0) * 4, ((y0 + y) * image.width + x0 + width) * 4), y * width * 4);
  }
  return { data: out, width, height };
}

/** Centre crop to the target's shape, then resample: a thumbnail is exactly 1920×1080 whatever Muse returned. */
export function cover(image: Rgba, width: number, height: number): Rgba {
  const want = width / height;
  const have = image.width / image.height;
  const cw = have > want ? Math.round(image.height * want) : image.width;
  const ch = have > want ? image.height : Math.round(image.width / want);
  const cropped = cw === image.width && ch === image.height ? image : crop(image, Math.floor((image.width - cw) / 2), Math.floor((image.height - ch) / 2), cw, ch);
  return resize(cropped, width, height);
}

/** The longest edge at most `max`, shape kept (Roblox scales anything over 1024 down). */
export function limit(image: Rgba, max: number): Rgba {
  const edge = Math.max(image.width, image.height);
  if (edge <= max) return image;
  return resize(image, Math.max(1, Math.round((image.width * max) / edge)), Math.max(1, Math.round((image.height * max) / edge)));
}

/** The opaque part's box (alpha above `threshold`), or null for an empty picture. */
export function alphaBox(image: Rgba, threshold = 8): { x0: number; y0: number; x1: number; y1: number } | null {
  const { data, width, height } = image;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export function trimAlpha(image: Rgba): Rgba {
  const box = alphaBox(image);
  return box ? crop(image, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0) : image;
}

/** Trimmed and centred on a transparent size×size square with a margin (a fraction of the side on each edge). */
export function fitSquare(image: Rgba, size: number, margin = 0.04): Rgba {
  const part = trimAlpha(image);
  const inner = Math.max(1, Math.round(size * (1 - 2 * margin)));
  const scale = inner / Math.max(part.width, part.height);
  const w = Math.max(1, Math.round(part.width * scale));
  const h = Math.max(1, Math.round(part.height * scale));
  const scaled = resize(part, w, h);
  const out = new Uint8Array(size * size * 4);
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y++) out.set(scaled.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * size + ox) * 4);
  return { data: out, width: size, height: size };
}

/**
 * Tileable by a looped crossfade: the last `band` of each axis is faded into the first and cut off, so the new last
 * column sits next to the old one and the picture wraps without a seam; nothing is repeated (a shift by half would
 * show the middle twice). `axes` "x" loops only horizontally (a skybox strip). The picture loses `band` of each axis.
 */
export function seamless(image: Rgba, axes: "xy" | "x" = "xy", band = 0.08): Rgba {
  const loopX = (img: Rgba): Rgba => {
    const { data, width, height } = img;
    const b = Math.max(1, Math.round(width * band));
    const w = width - b;
    const out = new Uint8Array(w * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * width + x) * 4;
        const q = (y * w + x) * 4;
        if (x >= b) {
          out.set(data.subarray(p, p + 4), q);
          continue;
        }
        // 0 at the first column: it is exactly the column after the last one kept, so the wrap is seamless.
        const t = x / b;
        const tail = (y * width + w + x) * 4;
        for (let c = 0; c < 4; c++) out[q + c] = Math.round(data[p + c]! * t + data[tail + c]! * (1 - t));
      }
    }
    return { data: out, width: w, height };
  };
  const transpose = (img: Rgba): Rgba => {
    const out = new Uint8Array(img.data.length);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (x * img.height + y) * 4);
    }
    return { data: out, width: img.height, height: img.width };
  };
  const horizontal = loopX(image);
  return axes === "x" ? horizontal : transpose(loopX(transpose(horizontal)));
}

/** A tangent-space normal map (OpenGL, green up) from brightness as height; wraps at the edges like a tile. */
export function normalMap(image: Rgba, strength = 2): Rgba {
  const { data, width, height } = image;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) lum[i] = (0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!) / 255;
  const at = (x: number, y: number) => lum[((y + height) % height) * width + ((x + width) % width)]!;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const p = (y * width + x) * 4;
      out[p] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      out[p + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      out[p + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[p + 3] = 255;
    }
  }
  return { data: out, width, height };
}

function averageRows(image: Rgba, y0: number, y1: number): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < image.width; x++) {
      const p = (y * image.width + x) * 4;
      r += image.data[p]!;
      g += image.data[p + 1]!;
      b += image.data[p + 2]!;
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

export const SKYBOX_FACES = ["SkyboxFt", "SkyboxRt", "SkyboxBk", "SkyboxLf", "SkyboxUp", "SkyboxDn"] as const;
export type SkyboxFace = (typeof SKYBOX_FACES)[number];

/**
 * Six Sky faces from a 360° horizon strip (4:1, tiled horizontally): its quarters are the sides, turning right
 * Ft → Rt → Bk → Lf. The top and bottom of every side fade into one colour (the strip's own sky and ground), and Up
 * and Dn are that colour, so their edges match whichever way Roblox turns them.
 */
export function skyboxFaces(strip: Rgba, size: number): Record<SkyboxFace, Rgba> {
  // A narrow loop band: the quarters stay close to square (each side face is about 90° wide).
  const tiled = seamless(strip, "x", 0.05);
  const band = Math.max(1, Math.round(tiled.height * 0.04));
  const top = averageRows(tiled, 0, band);
  const bottom = averageRows(tiled, tiled.height - band, tiled.height);
  const faces = {} as Record<SkyboxFace, Rgba>;
  const quarter = tiled.width / 4;
  (["SkyboxFt", "SkyboxRt", "SkyboxBk", "SkyboxLf"] as const).forEach((name, index) => {
    const x0 = Math.round(index * quarter);
    const face = resize(crop(tiled, x0, 0, Math.round((index + 1) * quarter) - x0, tiled.height), size, size);
    const fade = size * 0.18;
    for (let y = 0; y < size; y++) {
      const tTop = y < fade ? 1 - y / fade : 0;
      const tBottom = y > size - 1 - fade ? 1 - (size - 1 - y) / fade : 0;
      const t = (s: number) => s * s * (3 - 2 * s);
      const wTop = t(tTop);
      const wBottom = t(tBottom);
      for (let x = 0; x < size; x++) {
        const p = (y * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          let v = face.data[p + c]!;
          v = v * (1 - wTop) + top[c]! * wTop;
          v = v * (1 - wBottom) + bottom[c]! * wBottom;
          face.data[p + c] = Math.round(v);
        }
        face.data[p + 3] = 255;
      }
    }
    faces[name] = face;
  });
  const flat = (rgb: [number, number, number]): Rgba => {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) data.set([Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), 255], i * 4);
    return { data, width: size, height: size };
  };
  faces.SkyboxUp = flat(top);
  faces.SkyboxDn = flat(bottom);
  return faces;
}

/**
 * Glow on black to colour with alpha (particles, beams): alpha is the brightest channel, the colour is unmultiplied
 * back to full strength, so the sprite looks the same additively blended in Roblox. Near-black noise drops out.
 */
export function glowToAlpha(image: Rgba, floor = 10): Rgba {
  const { data, width, height } = image;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const m = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
    const a = m <= floor ? 0 : Math.round(((m - floor) * 255) / (255 - floor));
    if (a > 0) {
      out[i] = Math.min(255, Math.round((data[i]! * 255) / m));
      out[i + 1] = Math.min(255, Math.round((data[i + 1]! * 255) / m));
      out[i + 2] = Math.min(255, Math.round((data[i + 2]! * 255) / m));
    }
    out[i + 3] = Math.min(a, data[i + 3]!);
  }
  return { data: out, width, height };
}

/**
 * A round icon (badge, pass, product) on an opaque square: Roblox crops these to a circle, and a transparent corner
 * shows up as black or white after the upload. The corners take the icon's own rim colour (its opaque pixels in the
 * outer ring), so the crop never shows a seam.
 */
export function flattenRound(image: Rgba): Rgba {
  const { data, width, height } = image;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
      const p = (y * width + x) * 4;
      if (d < 0.88 || data[p + 3]! < 200) continue;
      r += data[p]!;
      g += data[p + 1]!;
      b += data[p + 2]!;
      n++;
    }
  }
  const fill = n > 0 ? [r / n, g / n, b / n] : [255, 255, 255];
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(data[i + c]! * a + fill[c]! * (1 - a));
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

/** Opaque copy (alpha 255 everywhere): decals and textures that must not show through. */
export function opaque(image: Rgba): Rgba {
  const data = new Uint8Array(image.data);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width: image.width, height: image.height };
}

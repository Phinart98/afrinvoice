// Signatures that look signed on the invoice, not pasted on it. A photo of a signature on paper
// becomes ink on a transparent background (the paper's grey or cream would otherwise print as a box),
// and a drawn signature is trimmed to its strokes. Pure functions on RGBA pixels, so they're testable.

export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Trim to the pixels that aren't transparent, plus `pad` pixels around. Null when there's nothing. */
export function cropToInk(img: Pixels, pad = 4): Pixels | null {
  const { data, width: w, height: h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
  return { data: out, width: cw, height: ch };
}

/**
 * Flatten onto white paper. A signature saved as a PNG with a transparent background reads as black
 * where it's clear ([0,0,0,0]); on white, clear is paper and only the ink is ink.
 */
function onWhite(img: Pixels): Pixels {
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a === 1) continue;
    for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * a + 255 * (1 - a));
    data[i + 3] = 255;
  }
  return { data, width: img.width, height: img.height };
}

/** Ink pixels → a PNG data URL at most `maxW` px wide, so signature files stay as small as logos. Browser only. */
export function inkToPng(ink: Pixels, maxW = 600): string {
  const scale = Math.min(1, maxW / ink.width);
  const src = document.createElement('canvas');
  src.width = ink.width; src.height = ink.height;
  src.getContext('2d')!.putImageData(new ImageData(ink.data as Uint8ClampedArray<ArrayBuffer>, ink.width, ink.height), 0, 0);
  const out = document.createElement('canvas');
  out.width = Math.round(ink.width * scale); out.height = Math.round(ink.height * scale);
  out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** The paper's brightness in each patch of the photo: phone photos are rarely lit evenly. */
function paperMap(img: Pixels): { tile: number; cols: number; level: Float32Array } {
  const { data, width: w, height: h } = img;
  const tile = Math.max(12, Math.round(Math.min(w, h) / 5));
  const cols = Math.ceil(w / tile), rows = Math.ceil(h / tile);
  const level = new Float32Array(cols * rows);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const vals: number[] = [];
    for (let y = ty * tile; y < Math.min(h, (ty + 1) * tile); y++)
      for (let x = tx * tile; x < Math.min(w, (tx + 1) * tile); x++) vals.push(lum(data, (y * w + x) * 4));
    vals.sort((a, b) => a - b);
    level[ty * cols + tx] = vals[Math.floor(vals.length * 0.9)]; // ink rarely covers 10% of a patch
  }
  return { tile, cols, level };
}

/**
 * A photo of a signature → ink on transparent. The paper's brightness is read from the photo itself,
 * patch by patch (each patch's 90th-percentile pixel), so grey or cream paper and a shadowed corner
 * clear as well as white paper in good light. Pixels near the local paper level become see-through;
 * darker ones fade in to solid ink, which keeps the pen's soft edges instead of a jagged cut-out.
 */
export function cleanSignature(src: Pixels): Pixels | null {
  const img = onWhite(src);
  const { data, width: w, height: h } = img;
  const map = paperMap(img);
  const out = new Uint8ClampedArray(data);
  let ink = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const paper = map.level[Math.floor(y / map.tile) * map.cols + Math.floor(x / map.tile)];
    const clear = paper - 18;          // this close to the paper: background
    const solid = paper * 0.55;        // this dark against it: full ink
    const l = lum(data, i);
    const a = clear <= solid ? 0 : l >= clear ? 0 : l <= solid ? 1 : (clear - l) / (clear - solid);
    out[i + 3] = Math.round(a * 255);
    if (a > 0.5) ink++;
  }
  if (ink < 4) return null;            // a blank or all-paper photo
  return cropToInk({ data: out, width: w, height: h });
}

import { describe, expect, it } from 'vitest';
import { cleanSignature, cropToInk } from './signature';

/** A fake photo: `paper` everywhere, with a dark ink stroke across the middle rows. */
function photo(w: number, h: number, paper: [number, number, number], ink: [number, number, number], strokeRows: number[], strokeCols: [number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const onStroke = strokeRows.includes(y) && x >= strokeCols[0] && x <= strokeCols[1];
    const [r, g, b] = onStroke ? ink : paper;
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}
const alphaAt = (img: { data: Uint8ClampedArray; width: number }, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

describe('cleanSignature (a photo of a signature on paper)', () => {
  it('makes white paper transparent and keeps the ink solid', () => {
    const out = cleanSignature(photo(40, 20, [250, 250, 250], [20, 30, 90], [9, 10], [5, 34]));
    expect(out.width).toBeLessThan(40);                  // trimmed to the ink
    expect(alphaAt(out, 0, 0)).toBe(0);                  // corner of the crop: paper → see-through
    expect(Math.max(...Array.from({ length: out.width }, (_, x) => alphaAt(out, x, Math.floor(out.height / 2))))).toBe(255);
  });

  it('handles grey or cream paper from a phone photo, not only pure white', () => {
    const out = cleanSignature(photo(40, 20, [196, 190, 176], [35, 35, 45], [10], [8, 30]));
    let opaquePaper = 0;
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      if (out.data[i] > 150 && out.data[i + 3] > 0) opaquePaper++; // a light pixel left visible = background showing
    }
    expect(opaquePaper).toBe(0);
  });

  it('clears unevenly lit paper too: bright on one side, in shadow on the other', () => {
    const w = 120, h = 60, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const paper = Math.round(245 - (x / w) * 85);          // 245 on the left fading to 160 on the right
      const ink = y >= 28 && y <= 30 && x >= 10 && x <= 110;
      const v = ink ? 30 : paper;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
    const out = cleanSignature({ data, width: w, height: h })!;
    let shadow = 0;
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      if (out.data[i] > 100 && out.data[i + 3] > 40) shadow++;  // paper (light) still visible
    }
    expect(shadow).toBe(0);
    expect(out.height).toBeLessThan(20);                          // cropped to the stroke, not the shadowed side
  });

  it('returns null when there is no ink at all (a blank or all-paper photo)', () => {
    expect(cleanSignature(photo(20, 10, [240, 240, 240], [240, 240, 240], [], [0, 0]))).toBeNull();
  });
});

describe('cropToInk (a drawn signature on a transparent pad)', () => {
  it('trims the empty pad around the strokes, with a small margin', () => {
    const w = 100, h = 50, data = new Uint8ClampedArray(w * h * 4);
    for (let x = 30; x <= 60; x++) data.set([20, 30, 90, 255], (25 * w + x) * 4);
    const out = cropToInk({ data, width: w, height: h }, 2)!;
    expect(out.width).toBe(31 + 4);
    expect(out.height).toBe(1 + 4);
  });
  it('returns null for an empty pad', () => {
    expect(cropToInk({ data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 })).toBeNull();
  });
});

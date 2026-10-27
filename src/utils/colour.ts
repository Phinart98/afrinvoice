// Colour helpers shared by the PDF (invoicePDF.ts) and the on-screen preview (InvoicePreview.vue),
// so text on a user-picked fill is chosen the same way in both.

export type RGB = readonly [number, number, number];

export const C_INK: RGB = [27, 31, 46];
export const C_WHITE: RGB = [255, 255, 255];

export function hexToRgb(hex: string, fallback: RGB): RGB {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const rgbCss = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** A solid tint of a colour on white paper (no transparency, no gradient). */
export const tint = (c: RGB, amount: number): RGB => c.map(v => Math.round(v * amount + 255 * (1 - amount))) as unknown as RGB;

/** White or ink, whichever reads better on a fill the user picked (a yellow band needs dark text). */
export function onFill(c: RGB): RGB {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return L > 0.45 ? C_INK : C_WHITE;
}

/** Darken a colour until text in it is readable on white (a pale brand colour would vanish). */
export function readable(c: RGB): RGB {
  let out = c;
  for (let i = 0; i < 8 && onFill(out) === C_INK; i++) out = out.map(v => Math.round(v * 0.82)) as unknown as RGB;
  return out;
}

/** Muted text on a coloured fill: a pale tint of the fill when the text is white, else mid grey. */
export const mutedOn = (fill: RGB, amount = 0.2): RGB => (onFill(fill) === C_WHITE ? tint(fill, amount) : [91, 100, 117]);

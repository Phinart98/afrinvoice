// Colour helpers shared by the PDF (invoicePDF.ts) and the on-screen preview (InvoicePreview.vue),
// so text on a user-picked fill is chosen the same way in both. Every choice is measured against
// WCAG's 4.5:1 contrast for body text, so no brand colour can make an invoice hard to read.

export type RGB = readonly [number, number, number];

export const C_INK: RGB = [27, 31, 46];
export const C_WHITE: RGB = [255, 255, 255];
export const C_BLACK: RGB = [0, 0, 0];
const C_MID: RGB = [91, 100, 117];
const AA = 4.5;

export function hexToRgb(hex: string, fallback: RGB): RGB {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const rgbCss = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** A solid tint of a colour on white paper (no transparency, no gradient): `amount` is the colour's share. */
export const tint = (c: RGB, amount: number): RGB => c.map(v => Math.round(v * amount + 255 * (1 - amount))) as unknown as RGB;

function luminance(c: RGB): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text on a fill the user picked: white when it reads well (it looks best on brand colours), else our
 * ink, else pure black, which is the only thing that clears 4.5:1 on some mid reds and oranges.
 */
export function onFill(c: RGB): RGB {
  if (contrast(C_WHITE, c) >= AA) return C_WHITE;
  if (contrast(C_INK, c) >= AA) return C_INK;
  return contrast(C_BLACK, c) >= contrast(C_WHITE, c) ? C_BLACK : C_WHITE;
}

/** A preferred colour for text on a fill (an accent on a band), or plain readable text if it isn't legible there. */
export const textOn = (fill: RGB, preferred: RGB): RGB => (contrast(preferred, fill) >= AA ? preferred : onFill(fill));

/** Darken a colour until text in it is readable on white paper (a pale brand colour would vanish). */
export function readable(c: RGB): RGB {
  let out = c;
  for (let i = 0; i < 40 && contrast(out, C_WHITE) < AA; i++) out = out.map(v => Math.floor(v * 0.9)) as unknown as RGB;
  return out;
}

/**
 * Secondary text on a coloured fill (addresses, small labels): a pale tint of the fill when the main
 * text is white, as quiet as it can be while still reaching 4.5:1; mid grey or ink on light fills.
 */
export function mutedOn(fill: RGB, amount = 0.2): RGB {
  const main = onFill(fill);
  if (main !== C_WHITE) return contrast(C_MID, fill) >= AA ? C_MID : main;
  for (let a = amount; a > 0; a -= 0.02) {
    const t = tint(fill, a);
    if (contrast(t, fill) >= AA) return t;
  }
  return C_WHITE;
}

import { describe, expect, it } from 'vitest';
import { C_INK, C_WHITE, contrast, hexToRgb, mutedOn, onFill, readable, textOn, type RGB } from './colour';

// A spread of colours people actually pick: pale, mid-bright (the hard cases) and dark.
const SWATCHES = ['#FFF59D', '#FDE68A', '#F59E0B', '#F97316', '#EF4444', '#0EA5E9', '#22C55E', '#14B8A6',
  '#A855F7', '#EC4899', '#2E5BDA', '#0F766E', '#7A1F2B', '#17324D', '#0F172A', '#C2410C', '#9CA3AF', '#FFFFFF', '#000000'];
const AA = 4.5;

describe('text on a colour the user picked', () => {
  it.each(SWATCHES)('main text on %s reaches 4.5:1', hex => {
    const fill = hexToRgb(hex, C_INK);
    expect(contrast(onFill(fill), fill)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SWATCHES)('secondary text on %s reaches 4.5:1', hex => {
    const fill = hexToRgb(hex, C_INK);
    expect(contrast(mutedOn(fill), fill)).toBeGreaterThanOrEqual(AA);
  });

  it.each(SWATCHES)('%s as text on white paper reaches 4.5:1', hex => {
    expect(contrast(readable(hexToRgb(hex, C_INK)), C_WHITE)).toBeGreaterThanOrEqual(AA);
  });

  it('keeps white on colours where white reads well, even if ink would score higher', () => {
    expect(onFill(hexToRgb('#2E5BDA', C_INK))).toBe(C_WHITE);
    expect(onFill(hexToRgb('#C2410C', C_INK))).toBe(C_WHITE);
  });

  it('puts dark text on the mid-bright sky blue that used to get unreadable white', () => {
    expect(onFill(hexToRgb('#0EA5E9', C_INK))).toBe(C_INK);
  });

  it('keeps a preferred accent on a band only when it is readable there', () => {
    const navy: RGB = [15, 23, 42];
    expect(textOn(navy, hexToRgb('#0EA5E9', C_INK))).toEqual(hexToRgb('#0EA5E9', C_INK)); // sky on navy: fine
    expect(contrast(textOn(navy, hexToRgb('#1E3A8A', C_INK)), navy)).toBeGreaterThanOrEqual(AA); // dark blue on navy: swapped
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, peekNextNumber, takeNextNumber } from './invoiceStorage';

// Minimal in-memory localStorage for the node test environment.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('legacy Afrinvoice migration', () => {
  it('carries the old shared counter over so numbers are never reissued', () => {
    localStorage.setItem('afrinvoice_business', JSON.stringify({ businessName: 'Kofi Ltd', invoiceCounter: 42 }));
    expect(loadProfile().businessName).toBe('Kofi Ltd');
    expect(peekNextNumber('GH-')).toBe('GH-0043');
    expect(peekNextNumber('KE-')).toBe('KE-0043');
    expect(takeNextNumber('GH-')).toEqual({ number: 'GH-0043', saved: true });
    expect(peekNextNumber('GH-')).toBe('GH-0044');
  });

  it('leaves counters alone when there is no legacy data', () => {
    expect(loadProfile()).toEqual({});
    expect(peekNextNumber('GH-')).toBe('GH-0001');
  });
});

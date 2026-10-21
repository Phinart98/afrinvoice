import { beforeEach, describe, expect, it } from 'vitest';
import { SITE } from '../site';
import { clearPro, loadPro, loadProfile, peekNextNumber, savePro, saveProfile, takeNextNumber } from './invoiceStorage';
import { defaultInvoiceState } from '../types/invoice';

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

const PRO_KEY = `${SITE.storagePrefix}_pro`;

describe('Pro license record', () => {
  it('round-trips a saved record', () => {
    savePro({ key: 'K', instanceId: 'I', lastValidated: 123 });
    expect(loadPro()).toEqual({ key: 'K', instanceId: 'I', lastValidated: 123 });
  });

  it('reads as no license when nothing is stored, the JSON is corrupt, or fields are missing', () => {
    expect(loadPro()).toBeNull();
    localStorage.setItem(PRO_KEY, '{not json');
    expect(loadPro()).toBeNull();
    localStorage.setItem(PRO_KEY, JSON.stringify({ key: 'K', lastValidated: 'soon' }));
    expect(loadPro()).toBeNull();
  });

  it('clears the record', () => {
    savePro({ key: 'K', instanceId: 'I', lastValidated: 1 });
    clearPro();
    expect(loadPro()).toBeNull();
  });
});

describe('saving a previewed premium template', () => {
  it('without Pro, keeps the last saved template instead of the premium one', () => {
    saveProfile({ ...defaultInvoiceState(), template: 'modern' });
    saveProfile({ ...defaultInvoiceState(), template: 'executive' });
    expect(loadProfile().template).toBe('modern');
  });
  it('with nothing saved before, falls back to minimal', () => {
    saveProfile({ ...defaultInvoiceState(), template: 'ledger' });
    expect(loadProfile().template).toBe('minimal');
  });
  it('with Pro, saves the premium template', () => {
    saveProfile({ ...defaultInvoiceState(), template: 'ledger' }, undefined, { pro: true });
    expect(loadProfile().template).toBe('ledger');
  });
});

describe('old default template colours', () => {
  it('moves the untouched Classic teal to the new ink default', () => {
    saveProfile({ ...defaultInvoiceState(), classicAccent: '#115E59' });
    expect(loadProfile().classicAccent).toBe(defaultInvoiceState().classicAccent);
    expect(defaultInvoiceState().classicAccent).toBe('#1B1F2E');
  });

  it('keeps a colour the user picked', () => {
    saveProfile({ ...defaultInvoiceState(), classicAccent: '#AA3355' });
    expect(loadProfile().classicAccent).toBe('#AA3355');
  });
});

describe('old default Pro brand colour', () => {
  it('moves the untouched teal brand colour to the new default', () => {
    saveProfile({ ...defaultInvoiceState(), brandColor: '#0F766E' });
    expect(loadProfile().brandColor).toBe('#2E5BDA');
  });
});

describe('the colour swap runs once', () => {
  it('keeps the teal swatch when the user picks it after the swap', () => {
    saveProfile({ ...defaultInvoiceState(), brandColor: '#0F766E' });
    expect(loadProfile().brandColor).toBe('#2E5BDA'); // first load swaps the old default
    saveProfile({ ...defaultInvoiceState(), brandColor: '#0F766E' }); // then the user picks teal
    expect(loadProfile().brandColor).toBe('#0F766E');
  });
});

describe('a first-time visitor', () => {
  it('keeps teal picked on their very first visit', () => {
    loadProfile(); // first page load: nothing saved yet
    saveProfile({ ...defaultInvoiceState(), brandColor: '#0F766E' });
    expect(loadProfile().brandColor).toBe('#0F766E');
  });
});

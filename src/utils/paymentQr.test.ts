import { describe, expect, it } from 'vitest';
import { epcPayload, linkPayload, paymentQr, qrMatrix, upiPayload } from './paymentQr';
import { defaultInvoiceState } from '../types/invoice';

const base = { iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', accountName: 'Max Muster', invoiceNumber: 'RE-0001', currency: 'EUR' };

describe('EPC (SEPA) QR', () => {
  it('builds the EPC069-12 payload', () => {
    expect(epcPayload(base, 1234.5)).toBe('BCD\n002\n1\nSCT\nCOBADEFFXXX\nMax Muster\nDE89370400440532013000\nEUR1234.50\n\n\nInvoice RE-0001');
  });
  it('refuses non-EUR, bad IBANs, zero amounts and missing names', () => {
    expect(epcPayload({ ...base, currency: 'GBP' }, 10)).toBeNull();
    expect(epcPayload({ ...base, iban: '1234' }, 10)).toBeNull();
    expect(epcPayload(base, 0)).toBeNull();
    expect(epcPayload({ ...base, accountName: ' ' }, 10)).toBeNull();
  });
});

describe('UPI QR', () => {
  const s = { upiId: 'shop@okicici', accountName: 'Asha Rao', businessName: 'Asha Designs', invoiceNumber: 'INV-0007', currency: 'INR' };
  it('builds a upi:// link with amount and note', () => {
    const p = upiPayload(s, 11800)!;
    expect(p.startsWith('upi://pay?')).toBe(true);
    expect(p).toContain('pa=shop%40okicici');
    expect(p).toContain('am=11800.00');
    expect(p).toContain('cu=INR');
  });
  it('requires INR and a valid VPA', () => {
    expect(upiPayload({ ...s, currency: 'USD' }, 10)).toBeNull();
    expect(upiPayload({ ...s, upiId: 'not-a-vpa' }, 10)).toBeNull();
  });
});

describe('payment link + selection', () => {
  it('accepts only https links', () => {
    expect(linkPayload('https://paypal.me/me/25')).toBe('https://paypal.me/me/25');
    expect(linkPayload('http://example.com')).toBeNull();
    expect(linkPayload('javascript:alert(1)')).toBeNull();
  });
  it('prefers SEPA for IBAN invoices and falls back to the link', () => {
    const s = { ...defaultInvoiceState(), ...base, paymentRail: 'iban' as const, paymentLink: 'https://pay.example.com/x' };
    expect(paymentQr(s, 100)?.kind).toBe('sepa');
    expect(paymentQr({ ...s, currency: 'USD' }, 100)?.kind).toBe('link');
    expect(paymentQr({ ...s, visible: { ...s.visible, qr: false } }, 100)).toBeNull();
  });
  it('produces a square module matrix', () => {
    const m = qrMatrix('hello');
    expect(m.length).toBe(m[0].length);
  });
});

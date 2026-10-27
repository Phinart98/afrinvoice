import { describe, expect, it } from 'vitest';
import { computeTotals, defaultInvoiceState, effectiveTemplate, PREMIUM_TEMPLATES, type InvoiceState } from './invoice';
import { COUNTRIES, COUNTRY_BY_KEY } from '../data/countries';
import { docLocale, formatDate, formatMoney, localToday, minorDigits, roundMoney } from '../utils/money';

function inv(p: Partial<InvoiceState>): InvoiceState {
  return { ...defaultInvoiceState(), ...p };
}
const item = (unitPrice: number, quantity = 1) => ({ description: 'x', quantity, unitPrice });

describe('computeTotals', () => {
  it('adds a single VAT line', () => {
    const t = computeTotals(inv({ currency: 'GBP', items: [item(100, 2)], taxes: [{ label: 'VAT', rate: 20, kind: 'add' }] }));
    expect(t).toMatchObject({ subtotal: 200, net: 200, addedTax: 40, total: 240, balanceDue: 240 });
  });

  it('Spain: IVA 21% added, IRPF 15% withheld on the base (1000 + 210 − 150 = 1060)', () => {
    const t = computeTotals(inv({ currency: 'EUR', items: [item(1000)], taxes: [
      { label: 'IVA', rate: 21, kind: 'add' }, { label: 'IRPF', rate: 15, kind: 'withhold' },
    ] }));
    expect(t.taxes.map(x => x.amount)).toEqual([210, 150]);
    expect(t.total).toBe(1060);
  });

  it('Ghana: three levies each on the net', () => {
    const t = computeTotals(inv({ currency: 'GHS', items: [item(1000)], taxes: [
      { label: 'VAT', rate: 15, kind: 'add' }, { label: 'NHIL', rate: 2.5, kind: 'add' }, { label: 'GETFund', rate: 2.5, kind: 'add' },
    ] }));
    expect(t.addedTax).toBe(200);
    expect(t.total).toBe(1200);
  });

  it('tax-inclusive prices: net + tax equals the gross exactly', () => {
    const t = computeTotals(inv({ currency: 'AUD', pricesIncludeTax: true, items: [item(99.99)], taxes: [{ label: 'GST', rate: 10, kind: 'add' }] }));
    expect(t.total).toBe(99.99);
    expect(Math.round((t.net + t.addedTax) * 100) / 100).toBe(99.99);
    expect(t.addedTax).toBe(9.09);
  });

  it('tax-inclusive with two taxes (Quebec GST + QST)', () => {
    const t = computeTotals(inv({ currency: 'CAD', pricesIncludeTax: true, items: [item(114.98)], taxes: [
      { label: 'GST', rate: 5, kind: 'add' }, { label: 'QST', rate: 9.975, kind: 'add' },
    ] }));
    expect(t.net).toBe(100);
    expect(t.taxes.map(x => x.amount)).toEqual([5, 9.98]);
    expect(t.total).toBe(114.98);
  });

  it('percent discount then shipping, then tax', () => {
    const t = computeTotals(inv({ currency: 'USD', items: [item(200)], discountType: 'percent', discountValue: 10, shipping: 20,
      taxes: [{ label: 'Sales tax', rate: 8.25, kind: 'add' }] }));
    expect(t).toMatchObject({ subtotal: 200, discount: 20, shipping: 20, net: 200, addedTax: 16.5, total: 216.5 });
  });

  it('fixed discount cannot exceed the subtotal', () => {
    expect(computeTotals(inv({ items: [item(50)], discountType: 'amount', discountValue: 80 })).total).toBe(0);
  });

  it('amount paid gives the balance due', () => {
    const t = computeTotals(inv({ items: [item(500)], amountPaid: 200 }));
    expect(t.balanceDue).toBe(300);
  });

  it('hidden tax removes tax from the total', () => {
    const t = computeTotals(inv({ items: [item(100)], taxes: [{ label: 'VAT', rate: 20, kind: 'add' }] }), { taxVisible: false });
    expect(t.total).toBe(100);
  });

  it('zero-decimal currencies round to whole units', () => {
    const t = computeTotals(inv({ currency: 'JPY', items: [item(1234, 1)], taxes: [{ label: 'Tax', rate: 10, kind: 'add' }] }));
    expect(t.addedTax).toBe(123);
    expect(t.total).toBe(1357);
  });

  it('ignores NaN / empty inputs instead of producing NaN', () => {
    const t = computeTotals(inv({ items: [{ description: '', quantity: NaN, unitPrice: 10 }], shipping: NaN }));
    expect(t.total).toBe(0);
  });
});

describe('money helpers', () => {
  it('rounds half away from zero at the minor unit', () => {
    expect(roundMoney(1.005, 'USD')).toBe(1.01);
    expect(roundMoney(2.675, 'EUR')).toBe(2.68);
    expect(minorDigits('KWD')).toBe(3);
  });
  it('formats by locale', () => {
    expect(formatMoney(1234.5, 'EUR', 'de-DE')).toMatch(/1\.234,50\s€/);
    expect(formatMoney(123456, 'INR', 'en-IN')).toContain('1,23,456.00');
    expect(formatMoney(10, 'NGN', 'en-NG')).toContain('₦');
  });
  it('builds a document locale from label language + country region', () => {
    expect(docLocale('en-US', 'de')).toBe('de-US');
    expect(docLocale('fr-CI', 'fr')).toBe('fr-CI');
  });
  it('formats dates without timezone drift', () => {
    expect(formatDate('2026-01-31', 'en-GB')).toBe('31 Jan 2026');
  });
  it('uses the local date, not UTC', () => {
    expect(localToday(new Date(2026, 8, 27, 23, 30))).toBe('2026-09-27');
  });
});

describe('country data', () => {
  it('every country is complete and consistent', () => {
    const keys = new Set<string>();
    for (const c of COUNTRIES) {
      expect(keys.has(c.key), c.key).toBe(false);
      keys.add(c.key);
      expect(c.taxPresets.length, c.key).toBeGreaterThan(0);
      expect(c.rails.length, c.key).toBeGreaterThan(0);
      expect(/^\d{4}-\d{2}$/.test(c.lastVerified), c.key).toBe(true);
      expect(c.sources.length, `${c.key} sources`).toBeGreaterThan(0);
      expect(c.mandatoryFields.length, `${c.key} fields`).toBeGreaterThan(0);
      expect(() => new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.currency }), c.key).not.toThrow();
      if (c.rails.includes('mobile-money')) expect(c.mobileProviders?.length, c.key).toBeGreaterThan(0);
      for (const p of c.taxPresets) for (const t of p.taxes) expect(t.rate >= 0 && t.rate < 100, `${c.key} ${p.label}`).toBe(true);
    }
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(30);
  });
  it('keeps every old Afrinvoice URL slug', () => {
    for (const k of ['ghana', 'nigeria', 'kenya', 'south-africa', 'zimbabwe', 'uganda', 'tanzania', 'rwanda', 'ethiopia',
      'zambia', 'malawi', 'cameroon', 'ivory-coast', 'senegal', 'mozambique', 'botswana', 'egypt']) {
      expect(COUNTRY_BY_KEY[k], k).toBeDefined();
    }
  });
});

describe('templates', () => {
  it('lists the three premium templates', () => {
    expect(PREMIUM_TEMPLATES).toEqual(['executive', 'ledger', 'studio']);
    expect(effectiveTemplate('studio', false)).toBe('minimal');
  });
  it('renders a premium template only for Pro; free falls back to minimal', () => {
    expect(effectiveTemplate('executive', true)).toBe('executive');
    expect(effectiveTemplate('ledger', false)).toBe('minimal');
    expect(effectiveTemplate('modern', false)).toBe('modern');
  });
  it('starts new invoices on a free template with a brand colour ready', () => {
    const s = defaultInvoiceState();
    expect(PREMIUM_TEMPLATES).not.toContain(s.template);
    expect(s.brandColor).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

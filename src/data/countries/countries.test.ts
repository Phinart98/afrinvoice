import { describe, expect, it } from 'vitest';
import { COUNTRIES, COUNTRY_BY_KEY } from './index';
import { formatMoney } from '../../utils/money';

describe('country list', () => {
  it('formats every currency in Latin digits, so the PDF font can print it', () => {
    for (const c of COUNTRIES) {
      const s = formatMoney(1234.5, c.currency, c.locale);
      expect(s, c.key).toMatch(/[0-9]/);
      expect(s, c.key).not.toMatch(/[٠-٩۰-۹०-९]/); // Arabic-Indic or Devanagari digits
    }
  });

  it('has unique keys and invoice prefixes that end in a separator', () => {
    expect(new Set(COUNTRIES.map(c => c.key)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) expect(c.invoicePrefix, c.key).toMatch(/[-/]$/);
  });

  it('keeps Africa from dominating the list or the featured countries', () => {
    const african = COUNTRIES.filter(c => c.region === 'africa');
    expect(african.length / COUNTRIES.length).toBeLessThan(0.35);
    const featured = COUNTRIES.filter(c => c.featured);
    expect(featured.filter(c => c.region === 'africa').length).toBeLessThanOrEqual(2);
  });

  it('offers the EU reverse-charge setup in every EU country, and nowhere else', () => {
    const EU = ['ireland', 'germany', 'france', 'netherlands', 'spain', 'italy', 'austria', 'belgium', 'portugal',
      'poland', 'sweden', 'denmark', 'finland', 'czech-republic', 'luxembourg', 'malta', 'cyprus'];
    for (const c of COUNTRIES) {
      const rc = c.taxPresets.find(p => /reverse charge/i.test(p.label));
      if (EU.includes(c.key)) {
        expect(rc?.taxes, c.key).toEqual([]);
        expect(rc?.note, c.key).toMatch(/Reverse charge \(Article 196, Directive 2006\/112\/EC\)\.$/);
      } else {
        expect(rc, c.key).toBeUndefined();
      }
    }
  });

  it('marks countries that need government e-invoicing in their first rule', () => {
    for (const key of ['italy', 'belgium', 'poland', 'portugal', 'mexico', 'brazil', 'colombia', 'saudi-arabia']) {
      expect(COUNTRY_BY_KEY[key].rules[0], key).toMatch(/foreign clients/i);
    }
  });
});

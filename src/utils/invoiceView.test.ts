import { describe, expect, it } from 'vitest';
import { buildInvoiceView, initials } from './invoiceView';
import { defaultInvoiceState, type InvoiceState } from '../types/invoice';
import { SITE } from '../site';

const MADE_WITH = `Made with ${SITE.name}, ${SITE.domain}`;

const make = (p: Partial<InvoiceState>) => buildInvoiceView({ ...defaultInvoiceState(), ...p });

describe('the "Made with" line (free version only)', () => {
  it('prints the brand line on a free invoice', () => {
    expect(make({}).madeWith).toBe(MADE_WITH);
  });
  it('leaves it off for Pro', () => {
    expect(buildInvoiceView(defaultInvoiceState(), { pro: true }).madeWith).toBeNull();
  });
  it('is never translated or mixed into the user\'s own footer note', () => {
    const v = make({ labelsLang: 'de', footerNote: 'Vielen Dank' });
    expect(v.footer).toBe('Vielen Dank');
    expect(v.madeWith).toBe(MADE_WITH);
  });
});

describe('buildInvoiceView', () => {
  it('translates labels and formats money for a German invoice', () => {
    const v = make({ countryKey: 'germany', labelsLang: 'de', currency: 'EUR', invoiceNumber: 'RE-0001',
      items: [{ description: 'Beratung', quantity: 2, unitPrice: 500 }], taxes: [{ label: 'USt.', rate: 19, kind: 'add' }] });
    expect(v.title).toBe('RECHNUNG');
    expect(v.columns).toEqual(['Beschreibung', 'Menge', 'Einzelpreis', 'Betrag']);
    expect(v.totals.map(t => t.label)).toEqual(['Nettobetrag', 'USt. 19%', 'Gesamtbetrag']);
    expect(v.totals.at(-1)!.value).toMatch(/1\.190,00\s€/);
  });

  it('prints the real net (HT) separately when a discount or inclusive prices make it differ', () => {
    const inclusive = make({ countryKey: 'france', labelsLang: 'fr', currency: 'EUR', pricesIncludeTax: true,
      items: [{ description: 'x', quantity: 1, unitPrice: 120 }], taxes: [{ label: 'TVA', rate: 20, kind: 'add' }] });
    expect(inclusive.totals.map(t => t.label)).toEqual(['Sous-total', 'Total HT', 'Total TTC', 'dont TVA 20%']);
    expect(inclusive.totals[1].value).toMatch(/100,00/);

    const discounted = make({ countryKey: 'germany', labelsLang: 'de', currency: 'EUR', discountType: 'percent', discountValue: 10,
      items: [{ description: 'x', quantity: 1, unitPrice: 1000 }], taxes: [{ label: 'USt.', rate: 19, kind: 'add' }] });
    expect(discounted.totals.map(t => t.label)).toEqual(['Zwischensumme', 'Rabatt (10%)', 'Nettobetrag', 'USt. 19%', 'Gesamtbetrag']);
    expect(discounted.totals[2].value).toMatch(/900,00/);
  });

  it('shows withholding as a negative line (Spain)', () => {
    const v = make({ countryKey: 'spain', labelsLang: 'es', currency: 'EUR', items: [{ description: 'x', quantity: 1, unitPrice: 1000 }],
      taxes: [{ label: 'IVA', rate: 21, kind: 'add' }, { label: 'IRPF', rate: 15, kind: 'withhold' }] });
    const irpf = v.totals.find(t => t.label.startsWith('IRPF'))!;
    expect(irpf.label).toBe('IRPF −15%');
    expect(irpf.value).toContain('-150');
    expect(v.totals.find(t => t.kind === 'grand')!.value).toMatch(/1\.?060,00/); // es-ES doesn't group 4-digit numbers
  });

  it('moves tax below the total as "incl." rows when prices include tax', () => {
    const v = make({ countryKey: 'australia', currency: 'AUD', pricesIncludeTax: true,
      items: [{ description: 'x', quantity: 1, unitPrice: 110 }], taxes: [{ label: 'GST', rate: 10, kind: 'add' }] });
    const kinds = v.totals.map(t => t.kind);
    expect(kinds.indexOf('grand')).toBeLessThan(kinds.indexOf('muted'));
    expect(v.totals.find(t => t.kind === 'muted')!.label).toBe('incl. GST 10%');
  });

  it('uses "Valid until" for quotes and hides the due date on receipts', () => {
    expect(make({ docType: 'quote', dueDate: '2026-10-31' }).meta.map(m => m[0])).toContain('Valid until');
    expect(make({ docType: 'receipt', dueDate: '2026-10-31' }).meta.map(m => m[0])).not.toContain('Due');
  });

  it('prints only filled payment fields, with the country bank-code label and grouped IBAN', () => {
    const uk = make({ countryKey: 'united-kingdom', paymentRail: 'bank', bankName: 'Monzo', bankCode: '04-00-04', accountNumber: '12345678' });
    expect(uk.payment).toEqual([['Bank', 'Monzo'], ['Account number', '12345678'], ['Sort code', '04-00-04']]);
    const de = make({ countryKey: 'germany', paymentRail: 'iban', iban: 'de89370400440532013000', accountName: 'Max' });
    expect(de.payment).toContainEqual(['IBAN', 'DE89 3704 0044 0532 0130 00']);
  });

  it('adds balance due only when something was paid', () => {
    const base = { items: [{ description: 'x', quantity: 1, unitPrice: 100 }] };
    expect(make(base).totals.some(t => t.kind === 'balance')).toBe(false);
    expect(make({ ...base, amountPaid: 40 }).totals.at(-1)).toMatchObject({ label: 'Balance due', kind: 'balance' });
  });

  it('prints the tax ID with the country’s label', () => {
    const v = make({ countryKey: 'india', businessTaxId: '29ABCDE1234F1Z5' });
    expect(v.sender.lines).toContain('GSTIN: 29ABCDE1234F1Z5');
  });
});

describe('Pro extras on the view (signature, stamp, font)', () => {
  const paidUp = { items: [{ description: 'x', quantity: 1, unitPrice: 100 }], amountPaid: 100 };

  it('stamps Paid automatically once the balance is settled, and only for Pro', () => {
    expect(buildInvoiceView({ ...defaultInvoiceState(), ...paidUp }, { pro: true }).stamp?.text).toBe('Paid');
    expect(buildInvoiceView({ ...defaultInvoiceState(), ...paidUp }).stamp).toBeNull();
    expect(buildInvoiceView({ ...defaultInvoiceState(), items: [{ description: 'x', quantity: 1, unitPrice: 100 }], amountPaid: 40 }, { pro: true }).stamp).toBeNull();
  });

  it('stamps Draft on request and never stamps an empty invoice Paid', () => {
    expect(buildInvoiceView({ ...defaultInvoiceState(), stamp: 'draft', labelsLang: 'de' }, { pro: true }).stamp?.text).toBe('Entwurf');
    expect(buildInvoiceView({ ...defaultInvoiceState(), amountPaid: 0 }, { pro: true }).stamp).toBeNull();
    expect(buildInvoiceView({ ...defaultInvoiceState(), ...paidUp, stamp: 'none' }, { pro: true }).stamp).toBeNull();
  });

  it('keeps the signature and font choice for Pro, or when previewing Pro features', () => {
    const s = { ...defaultInvoiceState(), signature: 'data:image/png;base64,AAAA', signatureName: 'Ama Mensah', fontChoice: 'serif' as const };
    expect(buildInvoiceView(s).signature).toBeNull();
    expect(buildInvoiceView(s).font).toBe('auto');
    expect(buildInvoiceView(s, { pro: true }).signature).toEqual({ image: 'data:image/png;base64,AAAA', name: 'Ama Mensah', label: 'Authorised signature' });
    expect(buildInvoiceView(s, { preview: true }).font).toBe('serif');
  });

  it('gives the amount due: the balance after payments, else the total', () => {
    const base = { ...defaultInvoiceState(), currency: 'USD', items: [{ description: 'x', quantity: 2, unitPrice: 50 }] };
    expect(buildInvoiceView(base).amountDue.value).toMatch(/100\.00/);
    expect(buildInvoiceView({ ...base, amountPaid: 30 }).amountDue.value).toMatch(/70\.00/);
  });

  it('has a natural-case title for layouts that don\'t shout', () => {
    expect(make({ docType: 'proforma' }).titleText).toBe('Proforma invoice');
    expect(make({ labelsLang: 'de', docType: 'proforma' }).titleText).toBe('Proformarechnung');
    expect(make({ titleOverride: 'Statement of work' }).titleText).toBe('Statement of work');
  });
});

describe('the Paid stamp chosen by hand', () => {
  it('stamps Paid even when no payment is entered (receipts), for Pro and in the preview', () => {
    const s = { ...defaultInvoiceState(), stamp: 'paid' as const, items: [{ description: 'x', quantity: 1, unitPrice: 50 }] };
    expect(buildInvoiceView(s, { pro: true }).stamp?.kind).toBe('paid');
    expect(buildInvoiceView(s, { preview: true }).stamp?.kind).toBe('paid');
    expect(buildInvoiceView(s).stamp).toBeNull();
  });
  it('shows the total, not an amount due, in the headline once marked Paid by hand', () => {
    const s = { ...defaultInvoiceState(), stamp: 'paid' as const, items: [{ description: 'x', quantity: 1, unitPrice: 50 }] };
    expect(buildInvoiceView(s, { pro: true }).amountDue.settled).toBe(true);
    expect(buildInvoiceView(s).amountDue.settled).toBe(false);
  });
});

describe('initials for the Monogram medallion', () => {
  it('takes the first letters of the first two words, skipping company suffixes', () => {
    expect(initials('Brightside Consulting Ltd')).toBe('BC');
    expect(initials('Kaveri Digital Services')).toBe('KD');
    expect(initials('studio nordlicht GmbH')).toBe('SN');
    expect(initials('Ömer')).toBe('Ö');
    expect(initials('')).toBe('');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaultInvoiceState, type InvoiceState, type Template } from '../types/invoice';

// Every piece of text the PDF draws, with where it lands. jsPDF's text() is wrapped on each new
// document, so the tests can check what a reader would see: nothing off the page, nothing printed
// over anything else, nothing cut short.
interface Drawn { page: number; text: string; x0: number; x1: number; top: number; bottom: number; W: number; H: number }
const log = vi.hoisted(() => [] as Drawn[]);
/** The stamp's outline: it's the only thing drawn as short slanted line segments (its tilted corners). */
const slants = vi.hoisted(() => [] as { page: number; x: number; y: number }[]);

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>();
  const Real = actual.default;
  function Spy(this: unknown, ...args: ConstructorParameters<typeof Real>) {
    const d = new Real(...args);
    const text = d.text.bind(d);
    const line = d.line.bind(d);
    d.line = ((x1: number, y1: number, x2: number, y2: number, style?: string | null) => {
      if (x1 !== x2 && y1 !== y2 && Math.hypot(x2 - x1, y2 - y1) < 6) {
        const page = d.getCurrentPageInfo().pageNumber;
        slants.push({ page, x: x1, y: y1 }, { page, x: x2, y: y2 });
      }
      return line(x1, y1, x2, y2, style);
    }) as typeof d.line;
    d.text = ((t: string | string[], x: number, y: number, opts?: { align?: 'left' | 'right' | 'center' | 'justify'; angle?: number }) => {
      if (!opts?.angle) { // the rotated stamp is checked by eye; everything else must sit level and apart
        const size = d.getFontSize() * 25.4 / 72;
        const lines = Array.isArray(t) ? t : [t];
        lines.forEach((line, i) => {
          if (!line.trim()) return;
          const w = d.getTextWidth(line);
          const x0 = opts?.align === 'right' ? x - w : opts?.align === 'center' ? x - w / 2 : x;
          const base = y + i * size * d.getLineHeightFactor();
          log.push({ page: d.getCurrentPageInfo().pageNumber, text: line, x0, x1: x0 + w, top: base - size * 0.72, bottom: base + size * 0.2,
            W: d.internal.pageSize.getWidth(), H: d.internal.pageSize.getHeight() });
        });
      }
      return text(t, x, y, opts);
    }) as typeof d.text;
    return d;
  }
  return { ...actual, default: Spy, jsPDF: Spy };
});

// The real Noto fonts from public/, so widths are measured as a customer's PDF measures them
// (the built-in Helvetica fallback is narrower and would hide text that's too long).
vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(join(process.cwd(), 'public', url))));
const { invoicePdfBlob } = await import('./invoicePDF');

const TEMPLATES: Template[] = ['minimal', 'classic', 'modern', 'executive', 'ledger', 'studio', 'swiss', 'monogram'];

/** Long text everywhere a real customer might put it: German labels, a company name that wraps, a PO
 *  reference, a client address line wider than any column, every bank field and a QR code. */
const LONG: Partial<InvoiceState> = {
  countryKey: 'germany', currency: 'EUR', labelsLang: 'de', paper: 'A4', invoiceNumber: 'RE-2026-000118-BERLIN',
  invoiceDate: '2026-10-26', dueDate: '2026-11-09', reference: 'Bestellung 4500012345 vom 12.10.2026, Projekt Umbau Filiale Hamburg',
  businessName: 'Nordlicht Architektur und Innenraumgestaltung GmbH & Co. KG', businessEmail: 'buchhaltung@nordlicht-architektur.de',
  businessPhone: '+49 30 5555 01234', businessAddress: 'Kastanienallee 12, Hinterhaus, 3. Obergeschoss\n10435 Berlin', businessTaxId: 'DE 312 456 789',
  clientName: 'Fjord Media und Kommunikation Aktiengesellschaft Norwegen', clientEmail: 'accounts-payable@fjord-media.no',
  clientAddress: 'Plot 12 Independence Avenue, Ridge, Accra, Greater Accra Region, Ghana, West Africa, PMB 1234\n0159 Oslo, Norway',
  items: [{ description: 'Entwurfsplanung Leistungsphase 3 nach HOAI', quantity: 1, unitPrice: 12800 }, { description: 'Bauleitung', quantity: 14, unitPrice: 95 }],
  taxes: [{ label: 'USt', rate: 19, kind: 'add' }],
  paymentRail: 'iban', accountName: 'Nordlicht Architektur GmbH & Co. KG', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX',
  bankName: 'Commerzbank AG Filiale Berlin Prenzlauer Berg', paymentLink: 'https://pay.example.com/nordlicht/RE-2026-000118',
  notes: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.', footerNote: 'Amtsgericht Berlin-Charlottenburg HRA 12345 B. Persönlich haftende Gesellschafterin: Nordlicht Verwaltungs GmbH.',
  brandColor: '#FFD400',
};

async function draw(s: Partial<InvoiceState>, template: Template): Promise<Drawn[]> {
  log.length = 0; slants.length = 0;
  await invoicePdfBlob({ ...defaultInvoiceState(), ...s, template }, { pro: true });
  return [...log];
}

const overlaps = (a: Drawn, b: Drawn) =>
  a.page === b.page && a.x0 < b.x1 - 0.3 && b.x0 < a.x1 - 0.3 && a.top < b.bottom - 0.3 && b.top < a.bottom - 0.3;

describe.each(TEMPLATES)('%s with long German details', (template) => {
  it('keeps every line on the page', async () => {
    for (const t of await draw(LONG, template)) {
      expect(t.x0, t.text).toBeGreaterThanOrEqual(4);
      expect(t.x1, t.text).toBeLessThanOrEqual(t.W - 4);
      expect(t.bottom, t.text).toBeLessThanOrEqual(t.H - 3);
    }
  });

  it('prints nothing over anything else', async () => {
    const texts = await draw(LONG, template);
    const clashes = texts.flatMap((a, i) => texts.slice(i + 1).filter(b => overlaps(a, b)).map(b => `"${a.text}" × "${b.text}"`));
    expect(clashes).toEqual([]);
  });

  it('cuts nothing short: the whole reference and client address are there', async () => {
    const all = (await draw(LONG, template)).map(t => t.text).join(' ');
    expect(all).toContain('Hamburg');
    expect(all).toContain('PMB 1234');
  });
});

describe.each(TEMPLATES)('%s with a dated Paid stamp', (template) => {
  // Long German details, and a short paid invoice whose one date line sits right where the stamp goes
  const SHORT: Partial<InvoiceState> = { countryKey: 'india', currency: 'INR', businessName: 'Kaveri Digital Services', clientName: 'Sahyadri Foods Pvt Ltd',
    invoiceDate: '2026-10-26', dueDate: '2026-11-10', items: [{ description: 'Social media management', quantity: 1, unitPrice: 45000 }] };
  it.each([['long', LONG], ['short', SHORT]] as const)('keeps the stamp clear of every line of text (%s)', async (_, set) => {
    const texts = await draw({ ...set, stamp: 'paid', paidDate: '2026-10-28' }, template);
    expect(slants.length).toBeGreaterThan(0);
    const pages = [...new Set(slants.map(p => p.page))];
    for (const page of pages) {
      const pts = slants.filter(p => p.page === page);
      const box = { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), top: Math.min(...pts.map(p => p.y)), bottom: Math.max(...pts.map(p => p.y)) };
      const hit = texts.filter(t => t.page === page && t.x0 < box.x1 && box.x0 < t.x1 && t.top < box.bottom && box.top < t.bottom);
      expect(hit.map(t => t.text)).toEqual([]);
    }
  });
});

describe('Swiss in another language', () => {
  it('translates its row labels too', async () => {
    const texts = (await draw(LONG, 'swiss')).map(t => t.text);
    expect(texts).toContain('Von');
    expect(texts).toContain('Angaben');
    expect(texts).not.toContain('From');
    expect(texts).not.toContain('Details');
  });
});

describe('Accounts summary boxes', () => {
  it('shrink a long amount instead of cutting it to "TSh"', async () => {
    const texts = await draw({ currency: 'TZS', countryKey: 'tanzania', dueDate: '2026-11-30', items: [{ description: 'x', quantity: 1, unitPrice: 125_000_000_000 }] }, 'ledger');
    const amounts = texts.filter(t => /125,000,000,000/.test(t.text));
    expect(amounts.length).toBeGreaterThan(0);
    for (const a of amounts) expect(a.x1, a.text).toBeLessThanOrEqual(a.W - 15 + 0.5); // inside its box, not past the edge
    expect(texts.some(t => t.text.trim() === 'TSh')).toBe(false);
  });
  it('show the reference when there is no due date', async () => {
    const texts = await draw({ reference: 'PO-4471', dueDate: '' }, 'ledger');
    expect(texts.some(t => t.text.includes('PO-4471'))).toBe(true);
  });
});

describe('Monogram on a long invoice', () => {
  it('keeps the page numbers inside the frame, clear of its lines', async () => {
    const texts = await draw({ ...LONG, items: Array.from({ length: 45 }, (_, i) => ({ description: `Line ${i + 1}`, quantity: 1, unitPrice: 10 })) }, 'monogram');
    const numbers = texts.filter(t => /\d+\/\d+$/.test(t.text));
    expect(numbers.length).toBeGreaterThan(1);
    for (const n of numbers) expect(n.bottom).toBeLessThan(n.H - 8.6 - 0.5); // the inner frame line
  });
});

describe('Sidebar', () => {
  it('keeps the footer note and credit line off the coloured panel', async () => {
    log.length = 0;
    await invoicePdfBlob({ ...defaultInvoiceState(), ...LONG, template: 'executive' }, { pro: false }); // free: falls back to Minimal
    const pro = await draw(LONG, 'executive');
    const foot = pro.filter(t => t.text.startsWith('Amtsgericht') || t.text.includes('Verwaltungs'));
    expect(foot.length).toBeGreaterThan(0);
    for (const t of foot) expect(t.x0).toBeGreaterThanOrEqual(62);
  });

  it('carries a long panel onto the next page instead of off the bottom', async () => {
    const tall = { ...LONG, clientAddress: Array.from({ length: 24 }, (_, i) => `Address line ${i + 1}`).join('\n') };
    const texts = await draw(tall, 'executive');
    const pageNumber = /\d+\/\d+$/;
    for (const t of texts.filter(t => !pageNumber.test(t.text))) expect(t.bottom, t.text).toBeLessThanOrEqual(t.H - 10);
    expect(texts.some(t => t.text === 'Address line 24')).toBe(true);
  });
});

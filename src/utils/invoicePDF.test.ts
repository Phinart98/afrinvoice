import { describe, expect, it, vi } from 'vitest';
import { invoicePdfBlob } from './invoicePDF';
import { defaultInvoiceState } from '../types/invoice';
import { SITE } from '../site';

// No server in tests: the Noto font fetch fails and the PDF falls back to Helvetica, which is fine here.
vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));

const pdfText = async (pro: boolean) => {
  const blob = await invoicePdfBlob({ ...defaultInvoiceState(), businessName: 'Acme', clientName: 'Client' }, { pro });
  return Buffer.from(await blob.arrayBuffer()).toString('latin1');
};

describe('PDF "Made with" credit', () => {
  it('is printed and links to the site on a free invoice', async () => {
    const pdf = await pdfText(false);
    expect(pdf).toContain(`Made with ${SITE.name}`);
    expect(pdf).toContain(`/URI (${SITE.url}/)`);
  });

  it('is absent for Pro', async () => {
    const pdf = await pdfText(true);
    expect(pdf).not.toContain('Made with');
    expect(pdf).not.toContain(`/URI (${SITE.url}/)`);
  });
});

describe('premium templates', () => {
  // jsPDF writes shape fills at 2 decimals and text colours at 3, so compare colours numerically.
  const BRAND: [number, number, number] = [0x12, 0x34, 0x56];
  const brandUses = (pdf: string) => [...pdf.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)]
    .filter(m => [1, 2, 3].every(i => Math.abs(Number(m[i]) * 255 - BRAND[i - 1]) <= 1.5)).length;
  const render = async (template: 'executive' | 'ledger' | 'studio', pro: boolean) => {
    const s = { ...defaultInvoiceState(), template, brandColor: '#123456', businessName: 'Acme',
      items: [{ description: 'a', quantity: 1, unitPrice: 10 }, { description: 'b', quantity: 1, unitPrice: 20 }, { description: 'c', quantity: 1, unitPrice: 30 }] };
    return Buffer.from(await (await invoicePdfBlob(s, { pro })).arrayBuffer()).toString('latin1');
  };

  it.each(['executive', 'ledger', 'studio'] as const)('%s uses the brand colour for Pro', async t => {
    expect(brandUses(await render(t, true))).toBeGreaterThan(0);
  });

  it.each(['executive', 'ledger', 'studio'] as const)('%s falls back to Minimal (no brand colour) without Pro', async t => {
    expect(brandUses(await render(t, false))).toBe(0);
  });

  // (Comparing whole PDFs would always "differ": every file carries its own creation timestamp.)
  it('Sidebar fills its total strip with the brand colour; Accounts heads its summary boxes with it', async () => {
    expect(brandUses(await render('executive', true))).toBeGreaterThanOrEqual(1);
    expect(brandUses(await render('ledger', true))).toBeGreaterThanOrEqual(1);
  });
});

describe('premium fallback', () => {
  // Compare drawing operators only (content streams); whole files always differ by timestamp.
  const streams = async (template: 'executive' | 'ledger' | 'minimal') => {
    const s = { ...defaultInvoiceState(), template, businessName: 'Acme', invoiceNumber: 'INV-1',
      items: [{ description: 'a', quantity: 1, unitPrice: 10 }] };
    const pdf = Buffer.from(await (await invoicePdfBlob(s, { pro: false })).arrayBuffer()).toString('latin1');
    return [...pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(m => m[1]);
  };
  it.each(['executive', 'ledger'] as const)('a free %s PDF draws exactly like Minimal', async t => {
    expect(await streams(t)).toEqual(await streams('minimal'));
  });
});

describe('long invoices', () => {
  // A 40-line invoice with a signature and notes once put the signature over page 2's page number
  // and pushed the notes onto an extra page. The block now moves as one, so no stray pages.
  const pages = async (template: 'minimal' | 'classic' | 'modern' | 'executive' | 'ledger' | 'studio', lines = 40) => {
    const s = { ...defaultInvoiceState(), template, businessName: 'Acme', clientName: 'Client', invoiceNumber: 'INV-1',
      items: Array.from({ length: lines }, (_, i) => ({ description: `Item ${i + 1}`, quantity: 1, unitPrice: 10 })),
      paymentRail: 'bank' as const, bankName: 'Bank', accountName: 'Acme', accountNumber: '123456',
      notes: 'Payment within 14 days.', signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', signatureName: 'A. Person' };
    const pdf = Buffer.from(await (await invoicePdfBlob(s, { pro: true })).arrayBuffer()).toString('latin1');
    // Each image's lowest edge in points from the page bottom ("w 0 0 h x y cm /Im Do")
    const imageBottoms = [...pdf.matchAll(/[\d.]+ 0 0 [\d.]+ [\d.]+ ([\d.]+) cm\s*\/\S+ Do/g)].map(m => Number(m[1]));
    return { count: (pdf.match(/\/Type \/Page\b/g) ?? []).length, imageBottoms };
  };
  it.each(['minimal', 'classic', 'modern', 'executive', 'ledger'] as const)('%s fits 40 lines, payment, notes and signature on 3 pages', async t => {
    expect((await pages(t)).count).toBeLessThanOrEqual(3);
  });
  it('studio, with its roomier item list, stays within 4 pages', async () => {
    expect((await pages('studio')).count).toBeLessThanOrEqual(4);
  });
  // Sweep the line count so the page break falls at every point around the payment block
  it.each(['minimal', 'classic', 'modern', 'executive', 'ledger', 'studio'] as const)('%s never draws the signature in the bottom margin', async t => {
    for (let lines = 20; lines <= 45; lines++) {
      const { imageBottoms } = await pages(t, lines);
      expect(imageBottoms.length).toBeGreaterThan(0);
      for (const y of imageBottoms) expect(y, `${lines} lines`).toBeGreaterThan(16 * 72 / 25.4); // above the 16 mm footer zone
    }
  });
});

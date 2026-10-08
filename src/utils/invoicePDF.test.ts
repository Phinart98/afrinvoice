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
  const render = async (template: 'executive' | 'ledger', pro: boolean) => {
    const s = { ...defaultInvoiceState(), template, brandColor: '#123456', businessName: 'Acme',
      items: [{ description: 'a', quantity: 1, unitPrice: 10 }, { description: 'b', quantity: 1, unitPrice: 20 }, { description: 'c', quantity: 1, unitPrice: 30 }] };
    return Buffer.from(await (await invoicePdfBlob(s, { pro })).arrayBuffer()).toString('latin1');
  };

  it.each(['executive', 'ledger'] as const)('%s uses the brand colour for Pro', async t => {
    expect(brandUses(await render(t, true))).toBeGreaterThan(0);
  });

  it.each(['executive', 'ledger'] as const)('%s falls back to Minimal (no brand colour) without Pro', async t => {
    expect(brandUses(await render(t, false))).toBe(0);
  });

  // (Comparing whole PDFs would always "differ": every file carries its own creation timestamp.)
  it('Executive spends the brand colour on the total strip only; Ledger also on the top bar and table head', async () => {
    expect(brandUses(await render('executive', true))).toBe(1);
    expect(brandUses(await render('ledger', true))).toBeGreaterThanOrEqual(3);
  });
});

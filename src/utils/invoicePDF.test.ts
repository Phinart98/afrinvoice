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

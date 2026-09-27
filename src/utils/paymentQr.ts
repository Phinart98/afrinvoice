// Payment QR payloads. Each builder returns null when the invoice doesn't have
// what that standard needs — we never print a QR code that can't be paid.

import qrcode from 'qrcode-generator';
import type { InvoiceState } from '../types/invoice';

/**
 * EPC069-12 "SEPA credit transfer" QR (GiroCode). Scanned by virtually every
 * European banking app. EUR only, max 999,999,999.99.
 */
export function epcPayload(s: Pick<InvoiceState, 'iban' | 'bic' | 'accountName' | 'invoiceNumber' | 'currency'>, amount: number): string | null {
  const iban = s.iban.replace(/\s+/g, '').toUpperCase();
  if (s.currency !== 'EUR' || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || !s.accountName.trim()) return null;
  if (!(amount > 0) || amount > 999999999.99) return null;
  return [
    'BCD', '002', '1', 'SCT',
    s.bic.replace(/\s+/g, '').toUpperCase(),
    s.accountName.trim().slice(0, 70),
    iban,
    `EUR${amount.toFixed(2)}`,
    '', '',
    `Invoice ${s.invoiceNumber}`.slice(0, 140),
  ].join('\n');
}

/** UPI deep link (India). Any UPI app (GPay, PhonePe, Paytm, BHIM) opens it pre-filled. */
export function upiPayload(s: Pick<InvoiceState, 'upiId' | 'accountName' | 'businessName' | 'invoiceNumber' | 'currency'>, amount: number): string | null {
  const vpa = s.upiId.trim();
  if (s.currency !== 'INR' || !/^[\w.-]{2,256}@[a-zA-Z][\w]{1,64}$/.test(vpa) || !(amount > 0)) return null;
  const params = new URLSearchParams({
    pa: vpa,
    pn: (s.accountName || s.businessName || 'Payee').slice(0, 50),
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Invoice ${s.invoiceNumber}`.slice(0, 80),
  });
  return `upi://pay?${params.toString()}`;
}

/** A plain https payment link (PayPal.me, Stripe Payment Link, Wise request…). */
export function linkPayload(link: string): string | null {
  try {
    const url = new URL(link.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The QR to print for this invoice, in priority order of how directly it pays. */
export function paymentQr(s: InvoiceState, balanceDue: number): { payload: string; kind: 'sepa' | 'upi' | 'link' } | null {
  if (!s.visible.qr || !s.visible.payment) return null;
  if (s.paymentRail === 'iban') { const p = epcPayload(s, balanceDue); if (p) return { payload: p, kind: 'sepa' }; }
  if (s.paymentRail === 'upi')  { const p = upiPayload(s, balanceDue); if (p) return { payload: p, kind: 'upi' }; }
  const l = linkPayload(s.paymentLink);
  return l ? { payload: l, kind: 'link' } : null;
}

/** QR module matrix (true = dark). Error correction M suits printed invoices. */
export function qrMatrix(payload: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(payload, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Inline SVG for the live preview. */
export function qrSvg(payload: string, size = 96): string {
  const m = qrMatrix(payload);
  const n = m.length;
  const q = 2; // quiet zone (modules)
  const cells: string[] = [];
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) cells.push(`M${x + q} ${y + q}h1v1h-1z`); }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + q * 2} ${n + q * 2}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Payment QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${cells.join('')}" fill="#000"/></svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// State → exactly what gets printed. InvoicePreview.vue and invoicePDF.ts both
// render this view, so the on-screen preview and the PDF can't disagree about
// labels, totals, languages or which payment fields appear.
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRY_BY_KEY, OTHER_COUNTRY } from '../data/countries';
import { LABELS, type Labels } from '../i18n/labels';
import { computeTotals, type FontChoice, type InvoiceState, type Totals } from '../types/invoice';
import { docLocale, formatDate, formatMoney } from './money';
import { paymentQr } from './paymentQr';
import { SITE } from '../site';

export type TotalKind = 'normal' | 'grand' | 'muted' | 'balance';

export interface InvoiceView {
  L: Labels;
  locale: string;
  paper: 'A4' | 'Letter';
  /** Upper case, for layouts that print the title as a heading in capitals. */
  title: string;
  /** Natural case ("Proforma invoice", "Rechnung"): Letterhead, Sidebar and Studio. A custom title stays as typed. */
  titleText: string;
  number: string;
  meta: [string, string][];
  /** Up to two initials from the business name, for the Monogram medallion when there is no logo. */
  sender: { name: string; lines: string[]; logo: string; initials: string };
  client: { name: string; lines: string[] };
  columns: [string, string, string, string];
  items: { description: string; qty: string; unit: string; amount: string }[];
  totals: { label: string; value: string; kind: TotalKind }[];
  taxNote: string;
  payment: [string, string][];
  qr: { payload: string; kind: 'sepa' | 'upi' | 'link' } | null;
  notes: string;
  footer: string;
  /** The free version's credit line; null for Pro. Printed small, apart from the user's own footer. */
  madeWith: string | null;
  /** What the client still has to pay (balance after payments, else the total), and when. */
  amountDue: { label: string; value: string; due: string; settled: boolean };
  // Pro extras: present with Pro, or in the preview (free users can try them; the download is gated).
  signature: { image: string; name: string; label: string } | null;
  stamp: { kind: 'paid' | 'draft'; text: string; date: string } | null;
  font: FontChoice;
  raw: Totals;
}

const pct = (n: number, locale: string) =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n)}%`;

/** IBANs read far better in groups of four. */
const groupIban = (iban: string) => iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');

/** "USt-IdNr. / Steuernummer" → "USt-IdNr." — one label is enough on the page. */
const shortLabel = (label: string) => label.split(' / ')[0];

// Company-form words, dropped only from the END of a name: "SA Fuel Logistics" keeps its SA,
// "Müller AG", "Rossi S.p.A.", "Kaveri Pvt Ltd" and "Acme (Pty) Ltd" lose theirs.
const COMPANY_FORMS = new Set(['ltd', 'limited', 'llc', 'llp', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'gmbh', 'ag', 'kg', 'ug', 'ohg', 'ev', 'sarl', 'sas', 'sa', 'sasu', 'eurl', 'srl', 'spa', 'snc', 'sl', 'slu', 'bv', 'nv', 'vof',
  'lda', 'ltda', 'eireli', 'plc', 'pty', 'pvt', 'private', 'pte', 'bhd', 'sdn', 'cc', 'lp', '&', 'and', 'und', 'et']);

/** "Brightside Consulting Ltd" → "BC"; one word → its first letter. Letters only, any script. */
export function initials(name: string): string {
  // "S.A." → "SA", "(Pty)" → "Pty", so the company form is recognised however it's punctuated
  const words = name.replace(/[.()[\],]/g, '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && COMPANY_FORMS.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.filter(w => /\p{L}/u.test(w)).slice(0, 2).map(w => (w.match(/\p{L}/u) ?? [''])[0].toLocaleUpperCase()).join('');
}

/** Accounts' summary boxes: number, date, due date (only when it's the headline's), and the amount. */
export function summaryCells(v: InvoiceView): [string, string][] {
  const cells: [string, string][] = [[v.L.number, v.number || '—'], [v.L.date, v.meta[0]?.[1] ?? '']];
  if (v.amountDue.due) cells.push([v.L.due, v.amountDue.due]);
  cells.push([v.amountDue.label, v.amountDue.value]);
  return cells;
}

/** The meta lines a layout still has to print once the headline shows the due date. */
export function metaWithoutDue(v: InvoiceView): [string, string][] {
  return v.meta.filter(([l]) => !(v.amountDue.due && l === v.L.due));
}

/** Meta lines that aren't in Accounts' summary boxes: a quote's "Valid until", a reference. */
export function metaBesideSummary(v: InvoiceView): [string, string][] {
  return metaWithoutDue(v).slice(1);
}

/** "PROFORMA INVOICE" → "Proforma invoice"; German capitalises every noun, so every word. */
function naturalCase(upper: string, lang: string): string {
  const lower = upper.toLocaleLowerCase(lang);
  return lang === 'de'
    ? lower.replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase(lang))
    : lower.charAt(0).toLocaleUpperCase(lang) + lower.slice(1);
}

export function buildInvoiceView(s: InvoiceState, opts: { pro?: boolean; preview?: boolean } = {}): InvoiceView {
  const extras = !!(opts.pro || opts.preview);
  const country = COUNTRY_BY_KEY[s.countryKey] ?? OTHER_COUNTRY;
  const L = LABELS[s.labelsLang] ?? LABELS.en;
  const locale = docLocale(country.locale, s.labelsLang);
  const money = (n: number) => formatMoney(n, s.currency, locale);
  const t0 = computeTotals(s, { taxVisible: s.visible.tax });
  // A Paid stamp chosen by hand means the money is in: the whole document says so (amount paid,
  // balance 0, no "Scan to pay"), not just the stamp beside a QR code asking for the full amount.
  const paidByHand = extras && s.stamp === 'paid' && t0.total > 0 && t0.amountPaid < t0.total;
  const t: Totals = paidByHand ? { ...t0, amountPaid: t0.total, balanceDue: 0 } : t0;
  const settled = t.total > 0 && t.amountPaid >= t.total;
  // Only invoices ask for money: a receipt records a payment, a quote and a credit note owe nothing yet
  const asksForMoney = s.docType === 'invoice' || s.docType === 'tax-invoice' || s.docType === 'proforma';
  const paidOn = s.paidDate ? formatDate(s.paidDate, locale) : s.docType === 'receipt' ? formatDate(s.invoiceDate, locale) : '';

  // ── Header meta ───────────────────────────────────────────────────────────
  const meta: [string, string][] = [[L.date, formatDate(s.invoiceDate, locale)]];
  if (s.dueDate && s.visible.dueDate && s.docType !== 'receipt') {
    meta.push([s.docType === 'quote' ? L.validUntil : L.due, formatDate(s.dueDate, locale)]);
  }
  if (s.reference.trim()) meta.push([L.reference, s.reference.trim()]);

  // ── Parties ───────────────────────────────────────────────────────────────
  const taxIdLabel = shortLabel(country.taxIdLabel);
  const senderLines = [
    s.visible.bizEmail ? s.businessEmail : '',
    s.visible.bizPhone ? s.businessPhone : '',
    ...s.businessAddress.split('\n'),
    s.businessTaxId ? `${taxIdLabel}: ${s.businessTaxId}` : '',
  ].map(x => x.trim()).filter(Boolean);
  const clientLines = [
    s.visible.clientEmail ? s.clientEmail : '',
    ...(s.visible.clientAddress ? s.clientAddress.split('\n') : []),
    s.clientTaxId ? `${taxIdLabel}: ${s.clientTaxId}` : '',
  ].map(x => x.trim()).filter(Boolean);

  // ── Items ─────────────────────────────────────────────────────────────────
  const qtyFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const items = s.items.map(i => ({
    description: i.description.trim() || '—',
    qty: qtyFmt.format(Number.isFinite(i.quantity) ? i.quantity : 0),
    unit: money(Number.isFinite(i.unitPrice) ? i.unitPrice : 0),
    amount: money((Number.isFinite(i.quantity) ? i.quantity : 0) * (Number.isFinite(i.unitPrice) ? i.unitPrice : 0)),
  }));

  // ── Totals ────────────────────────────────────────────────────────────────
  // When nothing sits between subtotal and tax, the subtotal IS the taxable base, and
  // fr/de/es/it/pt/nl invoices conventionally label it as such ("Total HT", "Nettobetrag").
  // English keeps the familiar "Subtotal".
  const netDiffers = t.net !== t.subtotal;
  const firstLabel = t.taxes.length > 0 && !netDiffers && s.labelsLang !== 'en' ? L.net : L.subtotal;
  const totals: InvoiceView['totals'] = [{ label: firstLabel, value: money(t.subtotal), kind: 'normal' }];
  if (t.discount > 0) {
    const d = s.discountType === 'percent' ? ` (${pct(s.discountValue, locale)})` : '';
    totals.push({ label: `${L.discount}${d}`, value: money(-t.discount), kind: 'normal' });
  }
  if (t.shipping > 0) totals.push({ label: L.shipping, value: money(t.shipping), kind: 'normal' });
  // Taxable base: only printed when it differs from the subtotal (discount, shipping
  // or tax-inclusive prices), so the legally meaningful net figure is always visible.
  if (t.taxes.length > 0 && netDiffers) totals.push({ label: L.net, value: money(t.net), kind: 'normal' });

  const added = t.taxes.filter(x => x.kind === 'add');
  const withheld = t.taxes.filter(x => x.kind === 'withhold');
  if (!s.pricesIncludeTax) {
    for (const x of added) totals.push({ label: `${x.label} ${pct(x.rate, locale)}`, value: money(x.amount), kind: 'normal' });
  }
  for (const x of withheld) totals.push({ label: `${x.label} −${pct(x.rate, locale)}`, value: money(-x.amount), kind: 'normal' });
  totals.push({ label: L.total, value: money(t.total), kind: 'grand' });
  if (s.pricesIncludeTax) {
    for (const x of added) totals.push({ label: `${L.ofWhichTax} ${x.label} ${pct(x.rate, locale)}`, value: money(x.amount), kind: 'muted' });
  }
  if (t.amountPaid > 0) {
    totals.push({ label: L.amountPaid, value: money(-t.amountPaid), kind: 'normal' });
    totals.push({ label: L.balanceDue, value: money(t.balanceDue), kind: 'balance' });
  }

  // ── Payment ───────────────────────────────────────────────────────────────
  const payment: [string, string][] = [];
  if (s.visible.payment) {
    if (s.paymentRail === 'bank') {
      payment.push([L.bank, s.bankName], [L.accountName, s.accountName], [L.accountNumber, s.accountNumber],
        [country.bankCodeLabel ?? 'Bank code', s.bankCode], [L.bic, s.swiftCode]);
    } else if (s.paymentRail === 'iban') {
      payment.push([L.accountName, s.accountName], [L.iban, s.iban ? groupIban(s.iban) : ''], [L.bic, s.bic], [L.bank, s.bankName]);
    } else if (s.paymentRail === 'mobile-money') {
      payment.push([L.provider, s.momoProvider], [L.accountName, s.momoName], [L.mobileNumber, s.momoNumber]);
    } else if (s.paymentRail === 'upi') {
      payment.push([L.upiId, s.upiId], [L.accountName, s.accountName], [L.accountNumber, s.accountNumber], [country.bankCodeLabel ?? 'IFSC', s.bankCode]);
    }
    if (s.paymentLink.trim()) payment.push([L.payOnline, s.paymentLink.trim()]);
  }

  return {
    L, locale, paper: s.paper,
    title: (s.titleOverride.trim() || L.docTitle[s.docType]).toUpperCase(),
    titleText: s.titleOverride.trim() || naturalCase(L.docTitle[s.docType], s.labelsLang),
    number: s.invoiceNumber,
    meta,
    sender: { name: s.businessName.trim(), lines: senderLines, logo: s.businessLogo, initials: initials(s.businessName) },
    client: { name: s.clientName.trim(), lines: clientLines },
    columns: [s.itemLabel.trim() || L.description, L.qty, L.unitPrice, L.amount],
    items,
    totals,
    taxNote: s.taxNote.trim(),
    payment: payment.filter(([, v]) => v && v.trim()),
    qr: (asksForMoney || s.docType === 'quote') && t.balanceDue > 0 ? paymentQr(s, t.balanceDue) : null,
    notes: s.notes.trim(),
    footer: s.footerNote.trim(),
    madeWith: opts.pro ? null : `Made with ${SITE.name}, ${SITE.domain}`,
    // Once fully paid, the headline shows the total (the Paid stamp says the rest), not "Amount due 0.00".
    // Receipts, quotes and credit notes headline their total too: none of them is a request to pay by a date.
    amountDue: settled || !asksForMoney
      ? { label: L.total, value: money(t.total), due: '', settled: settled || s.docType === 'receipt' }
      : {
        label: L.amountDue,
        value: money(t.amountPaid > 0 ? t.balanceDue : t.total),
        due: s.dueDate && s.visible.dueDate ? formatDate(s.dueDate, locale) : '',
        settled: false,
      },
    signature: extras && s.signature ? { image: s.signature, name: s.signatureName.trim(), label: L.signature } : null,
    stamp: !extras || s.stamp === 'none' ? null
      : s.stamp === 'draft' ? { kind: 'draft', text: L.draft, date: '' }
      // Dated with the day it was paid (the issue date would misstate it); no date rather than a wrong one
      : s.stamp === 'paid' ? { kind: 'paid', text: L.paid, date: paidOn }
      // The automatic Paid stamp is Pro-only even in the preview: a free user's paid receipt shouldn't look Pro.
      : opts.pro && settled ? { kind: 'paid', text: L.paid, date: paidOn }
      : null,
    font: extras ? s.fontChoice : 'auto',
    raw: t,
  };
}

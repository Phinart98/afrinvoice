// ─────────────────────────────────────────────────────────────────────────────
// State → exactly what gets printed. InvoicePreview.vue and invoicePDF.ts both
// render this view, so the on-screen preview and the PDF can't disagree about
// labels, totals, languages or which payment fields appear.
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRY_BY_KEY, OTHER_COUNTRY } from '../data/countries';
import { LABELS, type Labels } from '../i18n/labels';
import { computeTotals, type InvoiceState, type Totals } from '../types/invoice';
import { docLocale, formatDate, formatMoney } from './money';
import { paymentQr } from './paymentQr';

export type TotalKind = 'normal' | 'grand' | 'muted' | 'balance';

export interface InvoiceView {
  L: Labels;
  locale: string;
  paper: 'A4' | 'Letter';
  title: string;
  number: string;
  meta: [string, string][];
  sender: { name: string; lines: string[]; logo: string };
  client: { name: string; lines: string[] };
  columns: [string, string, string, string];
  items: { description: string; qty: string; unit: string; amount: string }[];
  totals: { label: string; value: string; kind: TotalKind }[];
  taxNote: string;
  payment: [string, string][];
  qr: { payload: string; kind: 'sepa' | 'upi' | 'link' } | null;
  notes: string;
  footer: string;
  raw: Totals;
}

const pct = (n: number, locale: string) =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(n)}%`;

/** IBANs read far better in groups of four. */
const groupIban = (iban: string) => iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');

/** "USt-IdNr. / Steuernummer" → "USt-IdNr." — one label is enough on the page. */
const shortLabel = (label: string) => label.split(' / ')[0];

export function buildInvoiceView(s: InvoiceState): InvoiceView {
  const country = COUNTRY_BY_KEY[s.countryKey] ?? OTHER_COUNTRY;
  const L = LABELS[s.labelsLang] ?? LABELS.en;
  const locale = docLocale(country.locale, s.labelsLang);
  const money = (n: number) => formatMoney(n, s.currency, locale);
  const t = computeTotals(s, { taxVisible: s.visible.tax });

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
  const totals: InvoiceView['totals'] = [{ label: L.subtotal, value: money(t.subtotal), kind: 'normal' }];
  if (t.discount > 0) {
    const d = s.discountType === 'percent' ? ` (${pct(s.discountValue, locale)})` : '';
    totals.push({ label: `${L.discount}${d}`, value: money(-t.discount), kind: 'normal' });
  }
  if (t.shipping > 0) totals.push({ label: L.shipping, value: money(t.shipping), kind: 'normal' });

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
    number: s.invoiceNumber,
    meta,
    sender: { name: s.businessName.trim(), lines: senderLines, logo: s.businessLogo },
    client: { name: s.clientName.trim(), lines: clientLines },
    columns: [s.itemLabel.trim() || L.description, L.qty, L.unitPrice, L.amount],
    items,
    totals,
    taxNote: s.taxNote.trim(),
    payment: payment.filter(([, v]) => v && v.trim()),
    qr: paymentQr(s, t.balanceDue),
    notes: s.notes.trim(),
    footer: s.footerNote.trim(),
    raw: t,
  };
}

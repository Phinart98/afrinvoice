// ─────────────────────────────────────────────────────────────────────────────
// Invoice state — shared by InvoiceGenerator.vue, InvoicePreview.vue and
// invoicePDF.ts. The single source of truth for invoice shape and totals.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocType, LabelLang } from '../i18n/labels';
import type { PaymentRail, TaxKind } from '../data/countries';
import { localToday, roundMoney } from '../utils/money';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface TaxLine {
  label: string;
  rate: number;     // percent
  kind: TaxKind;    // 'add' (VAT/GST) or 'withhold' (IRPF/WHT — subtracted)
}

// Which optional fields appear on the invoice output (preview + PDF). Not persisted.
export interface InvoiceVisible {
  dueDate:       boolean;
  bizPhone:      boolean;
  bizEmail:      boolean;
  clientEmail:   boolean;
  clientAddress: boolean;
  tax:           boolean;
  payment:       boolean;
  qr:            boolean;   // payment QR code (SEPA / UPI / payment link)
}

export type Template = 'classic' | 'modern' | 'minimal' | 'executive' | 'ledger';

/** Pro-only PDF templates. Free users can preview them; downloads fall back to Minimal. */
export const PREMIUM_TEMPLATES: readonly Template[] = ['executive', 'ledger'];

export const effectiveTemplate = (t: Template, pro: boolean): Template =>
  !pro && PREMIUM_TEMPLATES.includes(t) ? 'minimal' : t;

export interface InvoiceState {
  // ── Template, country, document ─────────────────────────────────────────
  template: Template;
  countryKey: string;
  docType: DocType;
  titleOverride: string;       // '' = use the translated title for docType
  labelsLang: LabelLang;
  paper: 'A4' | 'Letter';

  // ── Meta ────────────────────────────────────────────────────────────────
  invoiceNumber: string;
  invoiceDate: string;         // YYYY-MM-DD
  dueDate: string;             // YYYY-MM-DD (also "valid until" for quotes)
  reference: string;           // PO number / project reference

  // ── Money ───────────────────────────────────────────────────────────────
  currency: string;            // ISO 4217
  taxes: TaxLine[];
  pricesIncludeTax: boolean;
  taxNote: string;             // exemption wording, e.g. "TVA non applicable, art. 293 B du CGI"
  discountType: 'percent' | 'amount';
  discountValue: number;
  shipping: number;
  amountPaid: number;

  // ── Business / sender ──────────────────────────────────────────────────
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  businessTaxId: string;
  businessLogo: string;        // base64 data URL, or ''

  // ── Client ─────────────────────────────────────────────────────────────
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  clientTaxId: string;

  // ── Line items ─────────────────────────────────────────────────────────
  itemLabel: string;           // '' = translated "Description"
  items: InvoiceItem[];

  // ── Payment ────────────────────────────────────────────────────────────
  paymentRail: PaymentRail;
  bankName: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;            // sort code / BSB / routing / IFSC / branch code
  swiftCode: string;
  iban: string;
  bic: string;
  momoProvider: string;
  momoNumber: string;
  momoName: string;
  upiId: string;
  paymentLink: string;         // PayPal.me / Stripe / Wise link (any rail)

  // ── Template colours ───────────────────────────────────────────────────
  classicAccent: string;
  modernHeader: string;
  modernAccent: string;
  brandColor: string;          // premium templates (Executive, Ledger)

  notes: string;
  footerNote: string;
  visible: InvoiceVisible;
}

export function defaultInvoiceState(): InvoiceState {
  return {
    template: 'minimal',
    countryKey: 'united-states',
    docType: 'invoice',
    titleOverride: '',
    labelsLang: 'en',
    paper: 'Letter',

    invoiceNumber: '',
    invoiceDate: localToday(),
    dueDate: '',
    reference: '',

    currency: 'USD',
    taxes: [],
    pricesIncludeTax: false,
    taxNote: '',
    discountType: 'percent',
    discountValue: 0,
    shipping: 0,
    amountPaid: 0,

    businessName: '', businessEmail: '', businessPhone: '', businessAddress: '', businessTaxId: '', businessLogo: '',
    clientName: '', clientEmail: '', clientAddress: '', clientTaxId: '',

    itemLabel: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }],

    paymentRail: 'bank',
    bankName: '', accountName: '', accountNumber: '', bankCode: '', swiftCode: '',
    iban: '', bic: '',
    momoProvider: '', momoNumber: '', momoName: '',
    upiId: '', paymentLink: '',

    classicAccent: '#1B1F2E',
    modernHeader: '#0F172A',
    modernAccent: '#0EA5E9',
    brandColor: '#2E5BDA',

    notes: '',
    footerNote: '',
    visible: { dueDate: true, bizPhone: true, bizEmail: true, clientEmail: true, clientAddress: true, tax: true, payment: true, qr: true },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals — pure, no PDF/DOM dependency.
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxAmount extends TaxLine { amount: number }

export interface Totals {
  subtotal: number;      // sum of line amounts (net, or gross when prices include tax)
  discount: number;      // positive number subtracted
  shipping: number;
  net: number;           // taxable base after discount + shipping, excluding tax
  taxes: TaxAmount[];    // one entry per non-zero tax line
  addedTax: number;      // sum of 'add' taxes
  withheld: number;      // sum of 'withhold' taxes
  total: number;         // what the client owes before payments
  amountPaid: number;
  balanceDue: number;
}

type TotalsInput = Pick<InvoiceState, 'items' | 'taxes' | 'pricesIncludeTax' | 'discountType' | 'discountValue' | 'shipping' | 'amountPaid' | 'currency'>;

/**
 * Tax is computed per tax line on the invoice total (not per item line), then rounded
 * to the currency's minor units — the method EU, UK and GST systems all accept.
 * With tax-inclusive prices, the net is backed out and any rounding cent stays in the
 * net, so net + tax always equals the gross the customer saw.
 */
export function computeTotals(s: TotalsInput, opts: { taxVisible?: boolean } = {}): Totals {
  const cur = s.currency;
  const r = (n: number) => roundMoney(n, cur);
  const num = (n: number) => (Number.isFinite(n) ? n : 0);

  const subtotal = r(s.items.reduce((sum, i) => sum + r(num(i.quantity) * num(i.unitPrice)), 0));
  const rawDiscount = s.discountType === 'percent'
    ? subtotal * Math.min(Math.max(num(s.discountValue), 0), 100) / 100
    : Math.min(Math.max(num(s.discountValue), 0), subtotal);
  const discount = r(rawDiscount);
  const shipping = r(Math.max(num(s.shipping), 0));
  const afterDiscount = r(subtotal - discount + shipping);

  const lines = opts.taxVisible === false ? [] : s.taxes.filter(t => num(t.rate) !== 0);
  const addRate = lines.filter(t => t.kind === 'add').reduce((sum, t) => sum + num(t.rate), 0);

  let net: number;
  let taxes: TaxAmount[];
  if (s.pricesIncludeTax && addRate > 0) {
    const approxNet = afterDiscount / (1 + addRate / 100);
    const addAmounts = lines.map(t => (t.kind === 'add' ? r(approxNet * num(t.rate) / 100) : 0));
    net = r(afterDiscount - addAmounts.reduce((sum, a) => sum + a, 0));
    taxes = lines.map((t, i) => ({ ...t, amount: t.kind === 'add' ? addAmounts[i] : r(net * num(t.rate) / 100) }));
  } else {
    net = afterDiscount;
    taxes = lines.map(t => ({ ...t, amount: r(net * num(t.rate) / 100) }));
  }

  const addedTax = r(taxes.filter(t => t.kind === 'add').reduce((sum, t) => sum + t.amount, 0));
  const withheld = r(taxes.filter(t => t.kind === 'withhold').reduce((sum, t) => sum + t.amount, 0));
  const total = r(net + addedTax - withheld);
  const amountPaid = r(Math.max(num(s.amountPaid), 0));
  return { subtotal, discount, shipping, net, taxes, addedTax, withheld, total, amountPaid, balanceDue: r(total - amountPaid) };
}

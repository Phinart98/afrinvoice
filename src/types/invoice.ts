// ─────────────────────────────────────────────────────────────────────────────
// Invoice state — shared type used by InvoiceGenerator.vue, InvoicePreview.vue,
// and invoicePDF.ts. Keep this the single source of truth for invoice shape.
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

// Which optional fields appear on the invoice output (preview + PDF).
// Not persisted to localStorage — resets to all-visible on each session.
export interface InvoiceVisible {
  dueDate:       boolean;  // due date row in header
  bizPhone:      boolean;  // business phone in sender block
  bizEmail:      boolean;  // business email in sender block
  clientEmail:   boolean;  // client email in bill-to block
  clientAddress: boolean;  // client address in bill-to block
  tax:           boolean;  // tax row in totals (independent of taxRate value)
  payment:       boolean;  // entire payment details section
}

export interface InvoiceState {
  // ── Template & country ────────────────────────────────────────────────────
  template: 'classic' | 'modern' | 'minimal';
  countryKey: string;          // key into COUNTRY_CONFIGS, e.g. 'ghana' | 'other'

  // ── Invoice meta ─────────────────────────────────────────────────────────
  invoiceTitle: string;        // "INVOICE" | "TAX INVOICE" | "RECEIPT" | custom
  invoiceNumber: string;       // e.g. "GH-0001"
  invoiceDate: string;         // YYYY-MM-DD
  dueDate: string;             // YYYY-MM-DD

  // ── Currency & tax ────────────────────────────────────────────────────────
  currency: string;            // ISO code: GHS, NGN, KES, USD …
  currencySymbol: string;      // GH₵, ₦, KSh, $ …
  taxLabel: string;            // "GRA VAT" | "VAT" | "TVA" | "GST"
  taxRate: number;             // percentage, e.g. 15 (0 = no tax row shown)

  // ── Business / sender ────────────────────────────────────────────────────
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  businessLogo: string;        // base64 data URL from FileReader, or ''

  // ── Client / recipient ───────────────────────────────────────────────────
  clientName: string;
  clientEmail: string;
  clientAddress: string;

  // ── Line items ────────────────────────────────────────────────────────────
  itemLabel: string;           // Column header — "Description" | "Service" | "Hours" etc.
  items: InvoiceItem[];

  // ── Payment ───────────────────────────────────────────────────────────────
  paymentType: 'mobile-money' | 'bank';
  // Bank transfer fields
  bankName: string;
  accountNumber: string;
  accountName: string;
  swiftCode: string;           // optional — for international wires
  // Mobile money fields
  momoProvider: string;        // provider name (dropdown value or free text for 'other' country)
  momoNumber: string;
  momoName: string;

  // ── Template colours (hex, user-customisable) ────────────────────────────
  classicAccent: string;   // Classic: total amount colour, default amber #F59E0B
  modernHeader: string;    // Modern: header band colour, default navy #0F172A
  modernAccent: string;    // Modern: accent / highlight colour, default amber #F59E0B

  // ── Notes ─────────────────────────────────────────────────────────────────
  notes: string;

  // ── Footer note — printed at the bottom of the invoice (optional) ─────────
  footerNote: string;

  // ── Visibility — per-invoice, not persisted ───────────────────────────────
  visible: InvoiceVisible;
}

// ── Default / blank state — used to initialise InvoiceGenerator ──────────────
export const DEFAULT_INVOICE_STATE: InvoiceState = {
  template: 'minimal',
  countryKey: 'ghana',

  invoiceTitle: 'INVOICE',
  invoiceNumber: '',
  invoiceDate: today(),
  dueDate: '',

  currency: 'GHS',
  currencySymbol: 'GH₵',
  taxLabel: 'GRA VAT + Levies',
  taxRate: 20,

  businessName: '',
  businessEmail: '',
  businessPhone: '',
  businessAddress: '',
  businessLogo: '',

  clientName: '',
  clientEmail: '',
  clientAddress: '',

  itemLabel: 'Description',
  items: [{ description: '', quantity: 1, unitPrice: 0 }],

  paymentType: 'mobile-money',
  bankName: '',
  accountNumber: '',
  accountName: '',
  swiftCode: '',
  momoProvider: '',
  momoNumber: '',
  momoName: '',

  classicAccent: '#F59E0B',
  modernHeader:  '#0F172A',
  modernAccent:  '#F59E0B',

  notes: '',
  footerNote: '',

  visible: {
    dueDate:       true,
    bizPhone:      true,
    bizEmail:      true,
    clientEmail:   true,
    clientAddress: true,
    tax:           true,
    payment:       true,
  },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Pure computation — no PDF dependency, safe to import in any context ───────
export function computeTotals(items: InvoiceItem[], taxRate: number) {
  const subtotal  = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = subtotal * taxRate / 100;
  const total     = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

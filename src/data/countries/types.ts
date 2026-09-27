// ─────────────────────────────────────────────────────────────────────────────
// Country configuration — the moat. Every field here is shown to users as fact,
// so each country file cites sources and a lastVerified month.
// ─────────────────────────────────────────────────────────────────────────────

import type { LabelLang } from '../../i18n/labels';

/** How a tax line affects the total: `add` (VAT, GST, sales tax) or `withhold` (IRPF, ritenuta, WHT — subtracted). */
export type TaxKind = 'add' | 'withhold';

export interface TaxLineDef {
  label: string;   // printed on the invoice, e.g. "VAT", "CGST", "IRPF"
  rate: number;    // percent
  kind?: TaxKind;  // default 'add'
}

/** A named, one-click tax setup (e.g. "Ontario — HST 13%", "Intra-state — CGST 9% + SGST 9%"). */
export interface TaxPreset {
  label: string;
  taxes: TaxLineDef[];
  /** Optional line printed on the invoice when this preset is used (e.g. §19 UStG exemption note). */
  note?: string;
}

/** Payment methods ("rails") a country commonly uses. The first one is the default. */
export type PaymentRail = 'bank' | 'iban' | 'mobile-money' | 'upi';

export interface MobileProvider {
  name: string;          // "MTN MoMo" | "M-Pesa" | "EcoCash"
  accountLabel: string;  // "MoMo Number"
  accountFormat: string; // "024XXXXXXX"
  ussd?: string;         // "*170#"
}

export type Region = 'africa' | 'europe' | 'americas' | 'asia-pacific' | 'middle-east';

export interface CountryConfig {
  key: string;             // URL slug + storage key, e.g. 'united-kingdom'
  name: string;            // "United Kingdom"
  flag: string;            // emoji flag for UI lists
  region: Region;
  currency: string;        // ISO 4217
  currencySymbol: string;  // fallback symbol when Intl can't format the currency
  locale: string;          // BCP 47 — drives number/date formatting
  paper: 'A4' | 'Letter';
  labelsLang: LabelLang;   // default printed-label language (user can change)

  taxName: string;         // "VAT" | "GST" | "Sales tax" — used in copy
  taxAuthority: string;    // "HMRC" | "IRS" | "GRA"
  taxAuthorityFull: string;
  taxPresets: TaxPreset[]; // first = default. UI always adds "No tax"
  taxIdLabel: string;      // "VAT number" | "GSTIN" | "ABN" | "TIN"
  documentTitle: string;   // default title key: 'invoice' or 'tax-invoice'

  rails: PaymentRail[];    // first = default
  bankCodeLabel?: string;  // "Sort code" | "BSB" | "Routing number (ABA)" | "IFSC"
  mobileProviders?: MobileProvider[];
  invoicePrefix: string;   // "UK-" → UK-0001

  featured?: boolean;      // shown in the top group of the country picker + nav
  /** Legal particulars an invoice must show here — rendered as a checklist on the country page. */
  mandatoryFields: string[];
  /** Short, practical rules (thresholds, e-invoicing mandates, withholding). Plain text. */
  rules: string[];
  sources: { label: string; url: string }[];
  lastVerified: string;    // 'YYYY-MM'
}

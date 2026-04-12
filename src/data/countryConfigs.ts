// ─────────────────────────────────────────────────────────────────────────────
// Afrinvoice Country Configurations — Africa only
// Research-backed data: tax authorities, VAT rates, mobile money providers
// Sources documented in docs/research-sources.md
//
// KEY FACTS that differentiate Afrinvoice from every competitor:
// - Nigeria: Bank transfer preferred for B2B (NOT mobile money); VAT = 7.5% (FIRS)
// - Zimbabwe: EcoCash dominates (~95%) — NOT MTN MoMo
// - Tanzania: M-Pesa (Vodacom) is #1 — Tigo rebranded to Mixx by Yas
// - West Africa CFA: Orange Money + Wave — NOT MTN primarily
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentType = 'mobile-money' | 'bank';

export interface MobileProvider {
  name: string;          // "MTN MoMo" | "M-Pesa" | "EcoCash" | "GCash" etc.
  accountLabel: string;  // "Phone Number" | "UPI ID" | "Wallet Number"
  accountFormat: string; // "024XXXXXXX" | "name@bank" | "+639XXXXXXXXX"
  ussd?: string;         // "*170#" — Africa only
}

export interface CountryConfig {
  name: string;
  currency: string;            // ISO code: GHS, NGN, KES…
  currencySymbol: string;      // GH₵, ₦, KSh…
  taxAuthority: string;        // Short: "GRA", "KRA", "SARS"
  taxAuthorityFull: string;    // Full name for tooltips
  vatLabel: string;            // "GRA VAT", "VAT", "GST", "TVA"
  vatRate: number;             // Percentage
  whtLabel?: string;           // "WHT", "TDS" — optional withholding tax
  whtRate?: number;            // For informational display only
  defaultPaymentType: PaymentType;
  mobileProviders: MobileProvider[];
  bankTransferPrimary: boolean;
  invoicePrefix: string;       // "GH-", "NG-", "KE-"
  tier: 1 | 2 | 3;            // 1 = launch, 2 = wave 2, 3 = wave 3
  region?: 'west-africa' | 'east-africa' | 'southern-africa' | 'north-africa';
  // isCustom: true means the user chose "Other / Custom" — all fields are editable,
  // no provider dropdown (mobileProviders is empty), no tax/currency pre-fills enforced
  isCustom?: boolean;
}

// ── TIER 1: Launch countries (dedicated SEO pages) ────────────────────────────
export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {

  // ── WEST AFRICA ──────────────────────────────────────────────────────────
  // Ghana VAT Act 2025 (Act 1151, effective Jan 2026): statutory VAT 15% + NHIL 2.5% + GETFund 2.5% = 20% total
  // VAT registration threshold raised to GH₵ 750,000 (was GH₵ 200,000)
  // Vodafone Ghana → Telecel Cash (Feb 2024); AirtelTigo → AT Money (Jun 2023)
  ghana: {
    name: 'Ghana',
    currency: 'GHS',
    currencySymbol: 'GH₵',
    taxAuthority: 'GRA',
    taxAuthorityFull: 'Ghana Revenue Authority',
    vatLabel: 'GRA VAT + Levies',
    vatRate: 20,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'MTN MoMo',        accountLabel: 'MoMo Number',        accountFormat: '024XXXXXXX', ussd: '*170#' },
      { name: 'Telecel Cash',    accountLabel: 'Telecel Cash Number', accountFormat: '020XXXXXXX', ussd: '*110#' },
      { name: 'AT Money',         accountLabel: 'AT Money Number',     accountFormat: '027XXXXXXX', ussd: '*110#' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'GH-',
    tier: 1,
    region: 'west-africa',
  },

  // Nigeria: Bank transfer is the B2B standard (OPay/PalmPay are consumer P2P)
  nigeria: {
    name: 'Nigeria',
    currency: 'NGN',
    currencySymbol: '₦',
    taxAuthority: 'FIRS',
    taxAuthorityFull: 'Federal Inland Revenue Service (FIRS)',
    vatLabel: 'VAT',
    vatRate: 7.5,
    whtLabel: 'WHT',
    whtRate: 5,
    defaultPaymentType: 'bank',   // ← B2B prefers bank transfer, not mobile money
    mobileProviders: [
      { name: 'OPay',             accountLabel: 'OPay Number',    accountFormat: '07XXXXXXXXX',  ussd: '*955#' },
      { name: 'PalmPay',          accountLabel: 'PalmPay Number', accountFormat: '09XXXXXXXXX',  ussd: '*861#' },
      { name: 'MTN MoMo (PSB)',   accountLabel: 'MoMo Number',    accountFormat: '0803XXXXXXX',  ussd: '*671#' },
      { name: 'Kuda',             accountLabel: 'Kuda Number',    accountFormat: '07XXXXXXXXX' },
    ],
    bankTransferPrimary: true,
    invoicePrefix: 'NG-',
    tier: 1,
    region: 'west-africa',
  },

  // ── EAST AFRICA ───────────────────────────────────────────────────────────
  kenya: {
    name: 'Kenya',
    currency: 'KES',
    currencySymbol: 'KSh',
    taxAuthority: 'KRA',
    taxAuthorityFull: 'Kenya Revenue Authority',
    vatLabel: 'KRA VAT',
    vatRate: 16,
    whtLabel: 'WHT',
    whtRate: 5,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'M-Pesa',        accountLabel: 'M-Pesa Number',        accountFormat: '07XXXXXXXX', ussd: '*334#' },
      { name: 'Airtel Money',  accountLabel: 'Airtel Money Number',   accountFormat: '073XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'KE-',
    tier: 1,
    region: 'east-africa',
  },

  // ── SOUTHERN AFRICA ───────────────────────────────────────────────────────
  'south-africa': {
    name: 'South Africa',
    currency: 'ZAR',
    currencySymbol: 'R',
    taxAuthority: 'SARS',
    taxAuthorityFull: 'South African Revenue Service',
    vatLabel: 'VAT',
    vatRate: 15,
    defaultPaymentType: 'bank',   // ← EFT bank transfer standard for all B2B
    mobileProviders: [
      { name: 'MTN MoMo SA',  accountLabel: 'MoMo Number',   accountFormat: '0XX XXX XXXX' },
      { name: 'SnapScan',     accountLabel: 'SnapScan ID',   accountFormat: 'SnapCode or QR' },
    ],
    bankTransferPrimary: true,
    invoicePrefix: 'ZA-',
    tier: 1,
    region: 'southern-africa',
  },

  // Zimbabwe: EcoCash is dominant — NOT MTN MoMo. VAT raised to 15.5% from 1 Jan 2026 (2026 National Budget).
  zimbabwe: {
    name: 'Zimbabwe',
    currency: 'ZWG',
    currencySymbol: 'ZWG',
    taxAuthority: 'ZIMRA',
    taxAuthorityFull: 'Zimbabwe Revenue Authority',
    vatLabel: 'VAT',
    vatRate: 15.5,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'EcoCash',   accountLabel: 'EcoCash Number',   accountFormat: '077XXXXXXX', ussd: '*151#' },
      { name: 'OneMoney',  accountLabel: 'OneMoney Number',  accountFormat: '078XXXXXXX', ussd: '*111#' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'ZW-',
    tier: 1,
    region: 'southern-africa',
  },

  // ── TIER 2: Wave 2 countries (config ready, pages ~30min each) ───────────

  uganda: {
    name: 'Uganda',
    currency: 'UGX',
    currencySymbol: 'USh',
    taxAuthority: 'URA',
    taxAuthorityFull: 'Uganda Revenue Authority',
    vatLabel: 'VAT',
    vatRate: 18,
    whtLabel: 'WHT',
    whtRate: 6,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'MTN MoMo',     accountLabel: 'MoMo Number',         accountFormat: '077/076/079XXXXXXX', ussd: '*165#' },
      { name: 'Airtel Money', accountLabel: 'Airtel Money Number',  accountFormat: '070XXXXXXX', ussd: '*185#' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'UG-',
    tier: 2,
    region: 'east-africa',
  },

  // Tanzania: M-Pesa (Vodacom) is #1 (~32% share). Tigo rebranded to Mixx by Yas (formerly Tigo Pesa).
  tanzania: {
    name: 'Tanzania',
    currency: 'TZS',
    currencySymbol: 'TSh',
    taxAuthority: 'TRA',
    taxAuthorityFull: 'Tanzania Revenue Authority',
    vatLabel: 'VAT',
    vatRate: 18,
    whtLabel: 'WHT',
    whtRate: 5,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'M-Pesa (Vodacom)',      accountLabel: 'M-Pesa Number',       accountFormat: '075XXXXXXX', ussd: '*150*00#' },
      { name: 'Mixx by Yas (ex-Tigo)', accountLabel: 'Mixx by Yas Number',  accountFormat: '071XXXXXXX', ussd: '*150*00#' },
      { name: 'Airtel Money',          accountLabel: 'Airtel Money Number',  accountFormat: '068XXXXXXX' },
      { name: 'Halopesa',              accountLabel: 'Halopesa Number',      accountFormat: '062XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'TZ-',
    tier: 2,
    region: 'east-africa',
  },

  rwanda: {
    name: 'Rwanda',
    currency: 'RWF',
    currencySymbol: 'FRw',
    taxAuthority: 'RRA',
    taxAuthorityFull: 'Rwanda Revenue Authority',
    vatLabel: 'VAT',
    vatRate: 18,
    whtLabel: 'WHT',
    whtRate: 15,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'MTN MoMo',     accountLabel: 'MoMo Number',         accountFormat: '078XXXXXXX', ussd: '*182#' },
      { name: 'Airtel Money', accountLabel: 'Airtel Money Number',  accountFormat: '073XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'RW-',
    tier: 2,
    region: 'east-africa',
  },

  ethiopia: {
    name: 'Ethiopia',
    currency: 'ETB',
    currencySymbol: 'Br',
    taxAuthority: 'ERCA',
    taxAuthorityFull: 'Ethiopian Revenues and Customs Authority',
    vatLabel: 'VAT',
    vatRate: 15,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'Telebirr',            accountLabel: 'Telebirr Number', accountFormat: '09XXXXXXXX', ussd: '*127#' },
      { name: 'M-Pesa (Safaricom)', accountLabel: 'M-Pesa Number',   accountFormat: '07XXXXXXXX' },
      { name: 'CBE Birr',           accountLabel: 'CBE Birr Number', accountFormat: '09XXXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'ET-',
    tier: 2,
    region: 'east-africa',
  },

  zambia: {
    name: 'Zambia',
    currency: 'ZMW',
    currencySymbol: 'K',
    taxAuthority: 'ZRA',
    taxAuthorityFull: 'Zambia Revenue Authority',
    vatLabel: 'VAT',
    vatRate: 16,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'Airtel Money', accountLabel: 'Airtel Money Number', accountFormat: '097XXXXXXX' },
      { name: 'MTN MoMo',     accountLabel: 'MoMo Number',         accountFormat: '076XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'ZM-',
    tier: 2,
    region: 'southern-africa',
  },

  malawi: {
    name: 'Malawi',
    currency: 'MWK',
    currencySymbol: 'MK',
    taxAuthority: 'MRA',
    taxAuthorityFull: 'Malawi Revenue Authority',
    vatLabel: 'VAT',
    vatRate: 17.5,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'Airtel Money', accountLabel: 'Airtel Money Number', accountFormat: '099XXXXXXX' },
      { name: 'TNM Mpamba',   accountLabel: 'Mpamba Number',       accountFormat: '088XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'MW-',
    tier: 2,
    region: 'southern-africa',
  },

  // Cameroon: CEMAC zone — uses XAF/FCFA, TVA label (French)
  cameroon: {
    name: 'Cameroon',
    currency: 'XAF',
    currencySymbol: 'FCFA',
    taxAuthority: 'DGI',
    taxAuthorityFull: 'Directorate General of Taxation (Cameroon)',
    vatLabel: 'TVA',
    vatRate: 19.25,
    whtLabel: 'Retenue à la source',
    whtRate: 5,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'MTN MoMo',      accountLabel: 'MoMo Number',         accountFormat: '67XXXXXXX', ussd: '*126#' },
      { name: 'Orange Money',  accountLabel: 'Orange Money Number',  accountFormat: '69XXXXXXX', ussd: '#150#' },
      { name: 'Express Union', accountLabel: 'Express Union Number', accountFormat: '62XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'CM-',
    tier: 2,
    region: 'west-africa',
  },

  // Côte d'Ivoire: Wave is growing fast; Orange Money is still dominant
  'ivory-coast': {
    name: "Côte d'Ivoire",
    currency: 'XOF',
    currencySymbol: 'FCFA',
    taxAuthority: 'DGI',
    taxAuthorityFull: "Direction Générale des Impôts (Côte d'Ivoire)",
    vatLabel: 'TVA',
    vatRate: 18,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'Orange Money', accountLabel: 'Orange Money Number', accountFormat: '07XXXXXXXX', ussd: '#144#' },
      { name: 'MTN MoMo',     accountLabel: 'MoMo Number',         accountFormat: '05XXXXXXXX', ussd: '*133#' },
      { name: 'Wave',         accountLabel: 'Wave Number',          accountFormat: '07XXXXXXXX' },
      { name: 'Moov Money',   accountLabel: 'Moov Money Number',   accountFormat: '01XXXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'CI-',
    tier: 2,
    region: 'west-africa',
  },

  // Senegal: Wave growing fast alongside Orange Money
  senegal: {
    name: 'Senegal',
    currency: 'XOF',
    currencySymbol: 'FCFA',
    taxAuthority: 'DGI',
    taxAuthorityFull: 'Direction Générale des Impôts (Sénégal)',
    vatLabel: 'TVA',
    vatRate: 18,
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'Orange Money', accountLabel: 'Orange Money Number', accountFormat: '77XXXXXXX', ussd: '#144#' },
      { name: 'Wave',         accountLabel: 'Wave Number',          accountFormat: '70XXXXXXX' },
      { name: 'Free Money',   accountLabel: 'Free Money Number',   accountFormat: '76XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'SN-',
    tier: 2,
    region: 'west-africa',
  },

  mozambique: {
    name: 'Mozambique',
    currency: 'MZN',
    currencySymbol: 'MT',
    taxAuthority: 'AT',
    taxAuthorityFull: 'Autoridade Tributária de Moçambique',
    vatLabel: 'IVA',
    vatRate: 16,   // Cut from 17% → 16% effective 1 Jan 2023 (VAT Act amendment)
    defaultPaymentType: 'mobile-money',
    mobileProviders: [
      { name: 'M-Pesa (Vodacom)', accountLabel: 'M-Pesa Number', accountFormat: '84XXXXXXX', ussd: '*150#' },
      { name: 'e-Mola',          accountLabel: 'e-Mola Number',  accountFormat: '86XXXXXXX' },
      { name: 'm-Kesh',          accountLabel: 'm-Kesh Number',  accountFormat: '82XXXXXXX' },
    ],
    bankTransferPrimary: false,
    invoicePrefix: 'MZ-',
    tier: 2,
    region: 'southern-africa',
  },

  botswana: {
    name: 'Botswana',
    currency: 'BWP',
    currencySymbol: 'P',
    taxAuthority: 'BURS',
    taxAuthorityFull: 'Botswana Unified Revenue Service',
    vatLabel: 'VAT',
    vatRate: 14,   // Raised from 12% → 14% effective 1 Apr 2021; unchanged through 2025
    defaultPaymentType: 'bank',
    mobileProviders: [
      { name: 'Orange Money',  accountLabel: 'Orange Money Number', accountFormat: '75XXXXXXX' },
      { name: 'Mascom MyZaka', accountLabel: 'MyZaka Number',       accountFormat: '74XXXXXXX' },
    ],
    bankTransferPrimary: true,
    invoicePrefix: 'BW-',
    tier: 2,
    region: 'southern-africa',
  },

  // ── NORTH AFRICA ──────────────────────────────────────────────────────────
  egypt: {
    name: 'Egypt',
    currency: 'EGP',
    currencySymbol: 'E£',
    taxAuthority: 'ETA',
    taxAuthorityFull: 'Egyptian Tax Authority',
    vatLabel: 'VAT',
    vatRate: 14,
    defaultPaymentType: 'bank',   // InstaPay for modern B2B transfers
    mobileProviders: [
      { name: 'Fawry',         accountLabel: 'Fawry Number',         accountFormat: '01XXXXXXXXX' },
      { name: 'e& money', accountLabel: 'e& money Number', accountFormat: '010XXXXXXXX' }, // formerly Vodafone Cash (Vodafone Egypt rebranded to e& in 2023)
      { name: 'Orange Money',  accountLabel: 'Orange Money Number',  accountFormat: '012XXXXXXXX' },
      { name: 'InstaPay',      accountLabel: 'InstaPay ID',          accountFormat: 'Phone or wallet ID' },
    ],
    bankTransferPrimary: true,
    invoicePrefix: 'EG-',
    tier: 2,
    region: 'north-africa',
  },

  // ── OTHER / CUSTOM ────────────────────────────────────────────────────────
  // For users from countries not yet in our list (Wave 3, or non-African).
  // isCustom = true → InvoiceGenerator.vue shows editable currency + tax fields,
  // plain-text provider name input instead of dropdown.
  // Default to USD because many African freelancers bill international clients in USD.
  other: {
    name: 'Other / Custom',
    currency: 'USD',
    currencySymbol: '$',
    taxAuthority: '',
    taxAuthorityFull: '',
    vatLabel: 'VAT',
    vatRate: 0,
    defaultPaymentType: 'bank',
    mobileProviders: [],   // empty → shows free-text provider input, not dropdown
    bankTransferPrimary: true,
    invoicePrefix: 'INV-',
    tier: 3,
    isCustom: true,
  },

};

// ── Currency symbol lookup ────────────────────────────────────────────────────
export const CURRENCY_SYMBOLS: Record<string, string> = {
  // Africa
  GHS: 'GH₵',  NGN: '₦',    KES: 'KSh',  ZAR: 'R',    ZWG: 'ZWG',
  UGX: 'USh',  TZS: 'TSh',  RWF: 'FRw',  ETB: 'Br',   ZMW: 'K',
  MWK: 'MK',   XAF: 'FCFA', XOF: 'FCFA', MZN: 'MT',   BWP: 'P',
  EGP: 'E£',   MAD: 'د.م.', NAD: 'N$',
  // International (for billing foreign clients)
  USD: '$',    GBP: '£',    EUR: '€',    AUD: 'A$',   CAD: 'C$',
};

// ── Tier 1 countries (dedicated SEO pages at launch) ─────────────────────────
export const TIER_1_KEYS = ['ghana', 'nigeria', 'kenya', 'south-africa', 'zimbabwe'] as const;

// ── Tier 2 countries (config ready — pages ~30 min each) ─────────────────────
export const TIER_2_KEYS = [
  'uganda', 'tanzania', 'rwanda', 'ethiopia', 'zambia', 'malawi',
  'cameroon', 'ivory-coast', 'senegal', 'mozambique', 'botswana', 'egypt',
] as const;

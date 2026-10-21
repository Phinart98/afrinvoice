import type { CountryConfig, Region } from './types';
import { AFRICA } from './africa';
import { EUROPE } from './europe';
import { EUROPE_MORE } from './europe-more';
import { AMERICAS } from './americas';
import { ASIA_PACIFIC } from './asia-pacific';
import { ASIA_PACIFIC_MORE } from './asia-pacific-more';
import { AMERICAS_MORE } from './americas-more';
import { MIDDLE_EAST } from './middle-east';

export type { CountryConfig, TaxPreset, TaxLineDef, TaxKind, PaymentRail, MobileProvider, Region } from './types';

/** "Other" — free currency, free tax. Used when a user's country isn't listed. */
export const OTHER_COUNTRY: CountryConfig = {
  key: 'other', name: 'Other country', flag: '🌍', region: 'americas',
  currency: 'USD', currencySymbol: '$', locale: 'en-US', paper: 'A4', labelsLang: 'en',
  taxName: 'Tax', taxAuthority: '', taxAuthorityFull: '',
  taxPresets: [{ label: 'Tax (set your rate)', taxes: [{ label: 'Tax', rate: 0 }] }],
  taxIdLabel: 'Tax ID', documentTitle: 'invoice',
  rails: ['bank', 'iban', 'mobile-money'],
  mobileProviders: [],
  invoicePrefix: 'INV-',
  mandatoryFields: [], rules: [], sources: [], lastVerified: '2026-09',
};

export const COUNTRIES: CountryConfig[] = [
  ...AMERICAS, ...AMERICAS_MORE, ...EUROPE, ...EUROPE_MORE, ...ASIA_PACIFIC, ...ASIA_PACIFIC_MORE, ...MIDDLE_EAST, ...AFRICA,
]
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_BY_KEY: Record<string, CountryConfig> = Object.fromEntries(
  [...COUNTRIES, OTHER_COUNTRY].map(c => [c.key, c]),
);

export const FEATURED_COUNTRIES = COUNTRIES.filter(c => c.featured);

export const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas', europe: 'Europe', 'asia-pacific': 'Asia-Pacific', 'middle-east': 'Middle East', africa: 'Africa',
};

export function countriesByRegion(): [Region, CountryConfig[]][] {
  const order: Region[] = ['americas', 'europe', 'asia-pacific', 'middle-east', 'africa'];
  return order.map(r => [r, COUNTRIES.filter(c => c.region === r)] as [Region, CountryConfig[]]).filter(([, l]) => l.length);
}

/** Currencies offered in the currency picker: every country currency plus common billing currencies. */
export const CURRENCIES: string[] = [...new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'SGD', 'INR', 'AED', 'ZAR', 'NGN', 'GHS', 'KES',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HKD', 'CNY', 'BRL', 'MXN', 'PHP',
  ...COUNTRIES.map(c => c.currency),
])];

/** URL of the country landing page. Existing Afrinvoice slugs are preserved. */
export const countryPath = (c: CountryConfig) => `/${c.key}-invoice-generator/`;

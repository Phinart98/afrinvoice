import type { CountryConfig } from './types';

export const AMERICAS: CountryConfig[] = [
  {
    key: 'united-states', name: 'United States', flag: '🇺🇸', region: 'americas', featured: true,
    currency: 'USD', currencySymbol: '$', locale: 'en-US', paper: 'Letter', labelsLang: 'en',
    taxName: 'Sales tax', taxAuthority: 'State', taxAuthorityFull: 'State and local tax authorities (no federal VAT)',
    taxPresets: [
      { label: 'No sales tax (most services)', taxes: [] },
      { label: 'Sales tax — set your state + local rate', taxes: [{ label: 'Sales tax', rate: 0 }] },
    ],
    taxIdLabel: 'EIN', documentTitle: 'invoice',
    rails: ['bank', 'mobile-money'], bankCodeLabel: 'Routing number (ABA)',
    mobileProviders: [
      { name: 'Zelle',    accountLabel: 'Zelle email or phone', accountFormat: 'you@example.com' },
      { name: 'Venmo',    accountLabel: 'Venmo username',       accountFormat: '@yourname' },
      { name: 'PayPal',   accountLabel: 'PayPal email',         accountFormat: 'you@example.com' },
      { name: 'Cash App', accountLabel: '$Cashtag',             accountFormat: '$yourname' },
    ],
    invoicePrefix: 'INV-',
    mandatoryFields: [
      'Your business name and contact details',
      'Client name and address',
      'Invoice number and date, plus a due date or payment terms (e.g. Net 30)',
      'Itemised description, quantities, rates and total',
      'Sales tax as a separate line when you collect it',
      'Accepted payment methods',
    ],
    rules: [
      'There is no federal VAT and no federal invoice law — but a clear, numbered invoice is your evidence for income and for any 1099 your client files.',
      'Sales tax is set by state and city (from 0% to over 10% combined). Many states do not tax most services; check your state’s rules before adding a tax line.',
      'US clients often ask freelancers for a W-9 before paying.',
    ],
    sources: [{ label: 'IRS — Recordkeeping for small businesses', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/recordkeeping' }],
    lastVerified: '2026-09',
  },
  {
    key: 'canada', name: 'Canada', flag: '🇨🇦', region: 'americas', featured: true,
    currency: 'CAD', currencySymbol: '$', locale: 'en-CA', paper: 'Letter', labelsLang: 'en',
    taxName: 'GST/HST', taxAuthority: 'CRA', taxAuthorityFull: 'Canada Revenue Agency',
    taxPresets: [
      { label: 'Ontario — HST 13%',             taxes: [{ label: 'HST', rate: 13 }] },
      { label: 'Nova Scotia — HST 14%',         taxes: [{ label: 'HST', rate: 14 }] },
      { label: 'NB, NL, PEI — HST 15%',         taxes: [{ label: 'HST', rate: 15 }] },
      { label: 'Quebec — GST 5% + QST 9.975%',  taxes: [{ label: 'GST', rate: 5 }, { label: 'QST', rate: 9.975 }] },
      { label: 'British Columbia — GST 5% + PST 7%', taxes: [{ label: 'GST', rate: 5 }, { label: 'PST', rate: 7 }] },
      { label: 'Manitoba — GST 5% + RST 7%',    taxes: [{ label: 'GST', rate: 5 }, { label: 'RST', rate: 7 }] },
      { label: 'Saskatchewan — GST 5% + PST 6%', taxes: [{ label: 'GST', rate: 5 }, { label: 'PST', rate: 6 }] },
      { label: 'Alberta & territories — GST 5%', taxes: [{ label: 'GST', rate: 5 }] },
      { label: 'Small supplier (not registered)', taxes: [] },
    ],
    taxIdLabel: 'GST/HST number', documentTitle: 'invoice',
    rails: ['mobile-money', 'bank'], bankCodeLabel: 'Transit / institution no.',
    mobileProviders: [
      { name: 'Interac e-Transfer', accountLabel: 'e-Transfer email', accountFormat: 'you@example.com' },
      { name: 'PayPal',             accountLabel: 'PayPal email',     accountFormat: 'you@example.com' },
    ],
    invoicePrefix: 'INV-',
    mandatoryFields: [
      'Your business name and invoice date',
      'Total amount paid or payable',
      '$30 or more: your GST/HST registration number and the GST/HST charged (or the rate for each item)',
      '$100 or more: the buyer’s name, the terms of payment and a description of each supply',
    ],
    rules: [
      'You must register for GST/HST once taxable revenue passes $30,000 in four consecutive quarters (small supplier threshold).',
      'The rate follows the place of supply — usually where your client is — not where you are.',
      'Nova Scotia’s HST fell from 15% to 14% on 1 April 2025.',
    ],
    sources: [{ label: 'CRA — Input tax credit information requirements', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html' }],
    lastVerified: '2026-09',
  },
];

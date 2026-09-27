import { SITE } from '../site';

const OG_IMAGE = `${SITE.url}/og.png`;
const ORG = { '@type': 'Organization', name: SITE.name, url: SITE.url };

/** WebApplication JSON-LD for tool pages. */
export function webAppSchema(name: string, url: string, description?: string, areaServed?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    url,
    ...(description ? { description } : {}),
    ...(areaServed ? { areaServed: { '@type': 'Country', name: areaServed } } : {}),
    inLanguage: 'en',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    screenshot: OG_IMAGE,
    browserRequirements: 'Requires JavaScript',
    featureList: 'PDF invoices, quotes and receipts; country tax presets (VAT, GST, sales tax, withholding); multi-currency; SEPA and UPI payment QR codes; 7 invoice languages; no sign-up',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** FAQPage JSON-LD from question/answer pairs (HTML stripped). */
export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q.replace(/<[^>]*>/g, ''),
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]*>/g, '') },
    })),
  };
}

/** Article JSON-LD for guide pages. */
export function articleSchema(title: string, url: string, description: string, dateModified = '2026-09-27') {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    url,
    description,
    inLanguage: 'en',
    image: OG_IMAGE,
    author: ORG,
    publisher: ORG,
    datePublished: '2026-04-01',
    dateModified,
  };
}

/** BreadcrumbList JSON-LD. */
export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url })),
  };
}

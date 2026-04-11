/** Generates a WebApplication JSON-LD schema object. */
export function webAppSchema(name: string, url: string, description?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    url,
    ...(description ? { description } : {}),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    isAccessibleForFree: true,
    browserRequirements: 'Requires JavaScript',
    featureList: 'PDF invoice generation, VAT auto-fill, Mobile money payment fields, Bank transfer fields',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** Generates a FAQPage JSON-LD schema from an array of question/answer pairs. */
export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a.replace(/<[^>]*>/g, ''),
      },
    })),
  };
}

/** Generates an Article JSON-LD schema for guide/how-to pages. */
export function articleSchema(title: string, url: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    url,
    description,
    author: { '@type': 'Organization', name: 'Afrinvoice', url: 'https://afrinvoice.app' },
    publisher: { '@type': 'Organization', name: 'Afrinvoice', url: 'https://afrinvoice.app' },
    datePublished: '2026-04-01',
  };
}

/** Generates a BreadcrumbList JSON-LD schema for nested pages. */
export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand + domain in ONE place. Renaming the site (or moving domains) should
// only ever require editing this file and astro.config.mjs `site`.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE = {
  name: 'Invoice Passport',
  domain: 'invoicepassport.com',
  url: 'https://invoicepassport.com',
  email: 'hello@invoicepassport.com',
  tagline: 'The free invoice generator that knows your country\'s rules',
  gaId: 'G-36BE3M8J6V',
  gscVerification: 'BmpMIWd7m9AgoWxqSC4UBoQZLtQvPa9CxQAFcrSYqVY',
  // Storage keys are namespaced so an old afrinvoice.app key can be migrated once. The prefix is
  // an invisible localStorage key: it stays 'invoicekit' after the rename so saved data isn't orphaned.
  storagePrefix: 'invoicekit',
  // One-time Pro unlock (removes the "Made with" line, adds the Executive and Ledger templates).
  // Off until the Lemon Squeezy product exists: then paste its checkout URL and product id here and
  // set enabled: true. A test refuses `enabled` without both.
  pro: {
    enabled: false as boolean,
    price: '$9',
    checkoutUrl: '',
    productId: 0,
  },
} as const;

export const abs = (path: string) => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

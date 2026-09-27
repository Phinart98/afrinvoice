// ─────────────────────────────────────────────────────────────────────────────
// Brand + domain in ONE place. Renaming the site (or moving domains) should
// only ever require editing this file and astro.config.mjs `site`.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE = {
  name: 'InvoiceKit',
  domain: 'invoicekit.app',
  url: 'https://invoicekit.app',
  email: 'hello@invoicekit.app',
  tagline: 'The free invoice generator that knows your country\'s rules',
  gaId: 'G-36BE3M8J6V',
  gscVerification: 'BmpMIWd7m9AgoWxqSC4UBoQZLtQvPa9CxQAFcrSYqVY',
  // Storage keys are namespaced so an old afrinvoice.app key can be migrated once
  storagePrefix: 'invoicekit',
} as const;

export const abs = (path: string) => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

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
  gscVerification: '', // Search Console uses a Domain property verified by DNS; set a token here only for a URL-prefix property
  // Storage keys are namespaced so an old afrinvoice.app key can be migrated once. The prefix is
  // an invisible localStorage key: it stays 'invoicekit' after the rename so saved data isn't orphaned.
  storagePrefix: 'invoicekit',
  // One-time Pro unlock: removes the "Made with" line; adds the Sidebar, Accounts and Studio templates,
  // the signature block, the Paid/Draft stamp and the font choice.
  // Live since 26 Oct 2026 (Lemon Squeezy live product 1475814). Checklist used to switch it on:
  //   1. paste the LIVE checkout URL and LIVE product id (test-mode ids differ from live ones);
  //   2. set enabled: true (a test refuses it without both);
  //   3. bump "Last updated" on the privacy page (its Pro paragraph appears now);
  //   4. in Lemon Squeezy, set the purchase redirect to ${url}/#pro (opens the key form).
  // NEVER remove an old product id: buyers of it would lose Pro at their next weekly check.
  pro: {
    enabled: true as boolean,
    price: '$9',
    checkoutUrl: 'https://invoicepassport.lemonsqueezy.com/checkout/buy/b8c9f2db-f41c-4d70-9294-953eba6791d6',
    productIds: [1475814] as number[],
    allowTestKeys: false as boolean, // true only while testing with Lemon Squeezy test-mode keys
  },
} as const;

export const abs = (path: string) => `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;

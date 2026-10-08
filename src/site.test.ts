import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from './site';

// The brand has changed twice (Afrinvoice → InvoiceKit → Invoice Passport). A rename must only
// ever touch src/site.ts, astro.config.mjs and public/robots.txt — so no page may hardcode it.
const OLD_BRANDS = /invoicekit|invoice\s?atlas/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('brand lives in one place', () => {
  it('no source file outside site.ts names an old brand', () => {
    const leaks = files('src')
      .filter(f => /\.(astro|vue|ts|css)$/.test(f) && !/site(\.test)?\.ts$/.test(f))
      .flatMap(f => readFileSync(f, 'utf8').split('\n').map((line, i) => [f, i + 1, line] as const))
      // Strip tags first: a wordmark like Invoice<span>Kit</span> must not hide the old name.
      .filter(([, , line]) => OLD_BRANDS.test(line) || OLD_BRANDS.test(line.replace(/<[^>]*>/g, '')))
      .map(([f, n]) => `${f}:${n}`);
    expect(leaks).toEqual([]);
  });

  it('no source file outside site.ts hardcodes the current domain', () => {
    const leaks = files('src')
      .filter(f => /\.(astro|vue|ts)$/.test(f) && !/site(\.test)?\.ts$/.test(f))
      .filter(f => readFileSync(f, 'utf8').includes(SITE.domain));
    expect(leaks).toEqual([]);
  });

  it('astro.config.mjs and robots.txt point at the domain in site.ts', () => {
    expect(readFileSync('astro.config.mjs', 'utf8')).toContain(`site: '${SITE.url}'`);
    expect(readFileSync('public/robots.txt', 'utf8')).toContain(`${SITE.url}/sitemap-index.xml`);
  });

  it('Pro can only be switched on with a real checkout URL and product id', () => {
    if (!SITE.pro.enabled) return;
    expect(SITE.pro.checkoutUrl).toMatch(/^https:\/\/[\w.-]+\.lemonsqueezy\.com\//);
    expect(SITE.pro.productIds.length).toBeGreaterThan(0);
    expect(SITE.pro.productIds.every(id => Number.isInteger(id) && id > 0)).toBe(true);
    expect(SITE.pro.allowTestKeys).toBe(false); // never ship with test keys accepted
  });

  it('is Invoice Passport', () => {
    expect(SITE.name).toBe('Invoice Passport');
    expect(SITE.url).toBe('https://invoicepassport.com');
    expect(SITE.email).toBe('hello@invoicepassport.com');
  });
});

// Makes real PDFs from the local preview (npx astro preview --port 4329) so they can be checked by eye:
// each country × each free template, plus one setup per country (e.g. the EU reverse charge).
//   node scripts/pdf-check.mjs [outDir]
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:4329';
const out = process.argv[2] ?? 'pdf-check-out';
mkdirSync(out, { recursive: true });

const CASES = [
  { country: 'switzerland', setup: /^MWST 8\.1%/ },
  { country: 'japan', setup: null },
  { country: 'poland', setup: /reverse charge/i },
  { country: 'czech-republic', setup: /reverse charge/i },
  { country: 'germany', setup: /Kleinunternehmer/ },
];
const TEMPLATES = ['Minimal', 'Letterhead', 'Band']; // the free designs; Pro ones need a key

function findChromium() {
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const builds = existsSync(base) ? readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort() : [];
  const exe = builds.length && join(base, builds.at(-1), 'chrome-win64', 'chrome.exe');
  if (!exe || !existsSync(exe)) throw new Error('No Chromium found');
  return exe;
}

const browser = await chromium.launch({ executablePath: findChromium() });
for (const { country, setup } of CASES) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${country}-invoice-generator/`);
  await page.waitForSelector('#biz-name');
  await page.fill('#biz-name', 'Łódź Żółć Studio Ærø');
  await page.fill('[aria-label="Item 1 description"]', 'Design – Überarbeitung, frais, příprava');
  await page.fill('[aria-label="Item 1 quantity"]', '3');
  await page.fill('[aria-label="Item 1 price"]', '1234.5');
  if (setup) {
    const value = await page.$eval('#tax-preset', (s, src) => {
      const re = new RegExp(src.source, src.flags);
      return [...s.options].find(o => re.test(o.text))?.value ?? null;
    }, { source: setup.source, flags: setup.flags });
    if (value === null) throw new Error(`${country}: no setup matching ${setup}`);
    await page.selectOption('#tax-preset', value);
  }
  for (const tpl of TEMPLATES) {
    await page.getByRole('button', { name: tpl, exact: true }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PDF' }).click(),
    ]);
    const file = join(out, `${country}-${tpl.toLowerCase()}.pdf`);
    await dl.saveAs(file);
    console.log('saved', file);
  }
  await ctx.close();
}
await browser.close();

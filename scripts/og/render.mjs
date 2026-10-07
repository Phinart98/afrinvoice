// Renders scripts/og/og.html to public/og.png (1200x630), filling {{NAME}} from src/site.ts.
// Uses playwright-core (no bundled browser) with an installed Chromium: set CHROMIUM_PATH, or it uses
// the newest Playwright Chromium under %LOCALAPPDATA%\ms-playwright.   node scripts/og/render.mjs
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const builds = existsSync(base) ? readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort() : [];
  const exe = builds.length && join(base, builds.at(-1), 'chrome-win64', 'chrome.exe');
  if (!exe || !existsSync(exe)) throw new Error('No Chromium found: set CHROMIUM_PATH');
  return exe;
}

const root = new URL('../../', import.meta.url);
const site = readFileSync(new URL('src/site.ts', root), 'utf8');
const name = site.match(/name:\s*'([^']+)'/)?.[1];
if (!name) throw new Error('Could not read SITE.name from src/site.ts');

const html = readFileSync(new URL('scripts/og/og.html', root), 'utf8').replaceAll('{{NAME}}', name);
const tmp = join(mkdtempSync(join(tmpdir(), 'og-')), 'og.html');
writeFileSync(tmp, html);

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file:///' + tmp.replace(/\\/g, '/'));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL('public/og.png', root)) });
await browser.close();
console.log(`public/og.png rendered for "${name}"`);

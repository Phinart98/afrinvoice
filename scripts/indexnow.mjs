// Submit every URL in the built sitemap to IndexNow (Bing, Yandex, Seznam…).
// Run after a deploy has gone live:  npm run build && node scripts/indexnow.mjs
import { readFileSync, readdirSync } from 'node:fs'

const HOST = 'invoicepassport.com'
const key = readFileSync(new URL('../.indexnow-key', import.meta.url), 'utf8').trim()

const dist = new URL('../dist/', import.meta.url)
const urls = readdirSync(dist)
  .filter(f => /^sitemap-\d+\.xml$/.test(f))
  .flatMap(f => [...readFileSync(new URL(f, dist), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]))

if (!urls.length) throw new Error('No URLs found — run `npm run build` first')

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: urls }),
})
// 200 = accepted, 202 = accepted (key validation pending); anything else is a real failure
console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URLs`)
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text())
  process.exit(1)
}

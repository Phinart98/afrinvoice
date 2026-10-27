<script setup lang="ts">
import { computed } from 'vue';
import { PREMIUM_TEMPLATES, effectiveTemplate, type InvoiceState } from '../types/invoice';
import { SITE } from '../site';
import { buildInvoiceView } from '../utils/invoiceView';
import { qrSvg } from '../utils/paymentQr';
import { C_INK, hexToRgb, mutedOn, onFill, readable, rgbCss, tint } from '../utils/colour';

const props = defineProps<{ state: InvoiceState; pro?: boolean }>();

// While Pro is on sale, free users may PREVIEW Pro templates and options (try before buying); the download is
// what's gated. Before Pro exists, a stored premium template simply shows as Minimal, like the PDF.
const onSale = SITE.pro.enabled;
const tpl = computed(() => effectiveTemplate(props.state.template, onSale || !!props.pro));
const proPreview = computed(() => !props.pro && (PREMIUM_TEMPLATES.includes(tpl.value)
  || props.state.fontChoice !== 'auto' || !!props.state.signature || props.state.stamp === 'draft'));

// Same view model the PDF renders, so the preview can't drift from the download.
const v = computed(() => buildInvoiceView(props.state, { pro: props.pro, preview: onSale }));
const qr = computed(() => (v.value.qr ? qrSvg(v.value.qr.payload, 92) : ''));

// Type: the template's own families unless the Pro font option overrides them (mirrors familiesFor in invoicePDF.ts)
const fontClass = computed(() => {
  if (v.value.font === 'sans') return 'f-sans';
  if (v.value.font === 'serif') return 'f-serif';
  if (tpl.value === 'classic') return 'f-serif';
  if (tpl.value === 'studio') return 'f-head-serif';
  return 'f-sans';
});

// Colours from the pickers, with readable text chosen the same way as the PDF
const themeStyle = computed(() => {
  const s = props.state;
  const brand = hexToRgb(s.brandColor, [46, 91, 218]);
  const band = hexToRgb(s.modernHeader, [15, 23, 42]);
  const bandAccent = hexToRgb(s.modernAccent, [14, 165, 233]);
  return {
    '--accent': rgbCss(readable(hexToRgb(s.classicAccent, [27, 31, 46]))),
    '--band': rgbCss(band),
    '--on-band': rgbCss(onFill(band)),
    '--band-muted': rgbCss(onFill(band) === C_INK ? [91, 100, 117] : tint(band, 0.25)),
    '--band-hi': rgbCss(onFill(band) === C_INK ? readable(bandAccent) : bandAccent),
    '--band-accent': rgbCss(bandAccent),
    '--on-band-accent': rgbCss(onFill(bandAccent)),
    '--band-accent-text': rgbCss(readable(bandAccent)),
    '--brand': rgbCss(brand),
    '--on-brand': rgbCss(onFill(brand)),
    '--brand-muted': rgbCss(mutedOn(brand, 0.22)),
    '--brand-text': rgbCss(readable(brand)),
    '--min-accent': rgbCss(props.pro || (onSale && s.brandColor.toLowerCase() !== '#2e5bda') ? readable(brand) : C_INK),
  };
});

const exec = computed(() => tpl.value === 'executive');
const metaNoDue = computed(() => v.value.meta.filter(([l]) => !(v.value.amountDue.due && (l === v.value.L.due || l === v.value.L.validUntil))));
const accountsCells = computed(() => {
  const x = v.value;
  const cells: [string, string][] = [[x.L.number, x.number || '—'], [x.L.date, x.meta[0]?.[1] ?? '']];
  if (x.amountDue.due) cells.push([x.L.due, x.amountDue.due]);
  cells.push([x.amountDue.label, x.amountDue.value]);
  return cells;
});
// The emphasised money row is the one the client acts on: the balance when payments exist, else the total.
const keyRow = computed(() => {
  const kinds = v.value.totals.map(r => r.kind);
  return kinds.lastIndexOf(kinds.includes('balance') ? 'balance' : 'grand');
});
</script>

<template>
  <div class="preview-wrap">
    <div :class="['inv', 'tpl-' + tpl, fontClass, 'paper-' + v.paper]" :style="themeStyle" :lang="v.locale" aria-label="Invoice preview">
      <p v-if="proPreview" class="inv-pro-badge">Pro preview</p>

      <div class="inv-body">
        <!-- ── Sidebar's panel: who it's from, who it's for, how to pay ── -->
        <aside v-if="exec" class="sb-panel">
          <img v-if="v.sender.logo" :src="v.sender.logo" class="sb-logo" alt="" />
          <p class="inv-biz-name">{{ v.sender.name || 'Your Business Name' }}</p>
          <p v-for="(line, i) in v.sender.lines" :key="i" class="inv-dim">{{ line }}</p>
          <section class="sb-block">
            <p class="inv-section-label">{{ v.L.billTo }}</p>
            <p class="inv-client-name">{{ v.client.name || 'Client Name' }}</p>
            <p v-for="(line, i) in v.client.lines" :key="i" class="inv-dim">{{ line }}</p>
          </section>
          <section v-if="v.payment.length || v.qr" class="sb-block">
            <p class="inv-section-label">{{ v.L.paymentDetails }}</p>
            <div v-for="[label, value] in v.payment" :key="label" class="sb-pay">
              <span class="inv-dim">{{ label }}</span><span class="sb-pay-val">{{ value }}</span>
            </div>
            <figure v-if="qr" class="inv-qr sb-qr"><span v-html="qr" /><figcaption>{{ v.L.scanToPay }}</figcaption></figure>
          </section>
        </aside>

        <div class="inv-main">
          <!-- ── Headers: one per template ─────────────────────────── -->
          <header v-if="tpl === 'minimal'" class="hd hd-minimal">
            <div class="inv-sender">
              <img v-if="v.sender.logo" :src="v.sender.logo" class="inv-logo" alt="" />
              <div>
                <p class="inv-biz-name">{{ v.sender.name || 'Your Business Name' }}</p>
                <p v-for="(line, i) in v.sender.lines" :key="i" class="inv-dim">{{ line }}</p>
              </div>
            </div>
            <div class="hd-right">
              <p class="inv-dim">{{ v.titleText }}</p>
              <p class="min-number">{{ v.number || '—' }}</p>
              <p v-for="[label, value] in v.meta" :key="label" class="inv-dim">{{ label }}: {{ value }}</p>
            </div>
          </header>

          <header v-else-if="tpl === 'classic'" class="hd hd-letter">
            <img v-if="v.sender.logo" :src="v.sender.logo" class="lh-logo" alt="" />
            <p class="lh-name">{{ v.sender.name || 'Your Business Name' }}</p>
            <p class="inv-dim lh-contact"><span v-for="(line, i) in v.sender.lines" :key="i">{{ line }}</span></p>
            <div class="lh-rule" />
            <div class="lh-title-row">
              <div>
                <p class="lh-title">{{ v.titleText }}</p>
                <p class="inv-dim">{{ v.L.number }} {{ v.number || '—' }}</p>
              </div>
              <dl class="lh-meta">
                <template v-for="[label, value] in v.meta" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></template>
              </dl>
            </div>
          </header>

          <header v-else-if="tpl === 'modern'" class="hd hd-band">
            <div class="inv-sender">
              <img v-if="v.sender.logo" :src="v.sender.logo" class="inv-logo" alt="" />
              <div>
                <p class="inv-biz-name">{{ v.sender.name || 'Your Business Name' }}</p>
                <p v-for="(line, i) in v.sender.lines" :key="i" class="inv-dim">{{ line }}</p>
              </div>
            </div>
            <div class="hd-right">
              <p class="band-title">{{ v.title }}&nbsp; {{ v.number }}</p>
              <p class="inv-dim">{{ v.amountDue.label }}</p>
              <p class="band-amount">{{ v.amountDue.value }}</p>
              <p v-if="v.amountDue.due" class="band-due">{{ v.L.due }}: {{ v.amountDue.due }}</p>
            </div>
          </header>

          <header v-else-if="exec" class="hd hd-sidebar">
            <div v-if="v.stamp" :class="['inv-stamp', 'stamp-' + v.stamp.kind, 'sb-stamp']" aria-hidden="true">
              <b>{{ v.stamp.text }}</b><span v-if="v.stamp.date">{{ v.stamp.date }}</span>
            </div>
            <p class="sb-title">{{ v.titleText }}</p>
            <p class="inv-dim">{{ v.L.number }} {{ v.number || '—' }}</p>
            <div class="sb-meta">
              <div v-for="[label, value] in v.meta.slice(0, 3)" :key="label"><span class="inv-dim">{{ label }}</span><b>{{ value }}</b></div>
            </div>
          </header>

          <header v-else-if="tpl === 'ledger'" class="hd hd-accounts">
            <div class="hd-row">
              <div class="inv-sender">
                <img v-if="v.sender.logo" :src="v.sender.logo" class="inv-logo" alt="" />
                <div>
                  <p class="inv-biz-name">{{ v.sender.name || 'Your Business Name' }}</p>
                  <p v-for="(line, i) in v.sender.lines" :key="i" class="inv-dim">{{ line }}</p>
                </div>
              </div>
              <p class="acc-title">{{ v.title }}</p>
            </div>
            <table class="acc-summary">
              <thead><tr><th v-for="[label] in accountsCells" :key="label">{{ label }}</th></tr></thead>
              <tbody><tr><td v-for="[label, value] in accountsCells" :key="label">{{ value }}</td></tr></tbody>
            </table>
          </header>

          <header v-else class="hd hd-studio">
            <div class="hd-row">
              <div class="inv-sender">
                <img v-if="v.sender.logo" :src="v.sender.logo" class="inv-logo" alt="" />
                <div>
                  <p class="inv-biz-name">{{ v.sender.name || 'Your Business Name' }}</p>
                  <p v-for="(line, i) in v.sender.lines" :key="i" class="inv-dim">{{ line }}</p>
                </div>
              </div>
              <div class="hd-right">
                <p class="inv-dim">{{ v.titleText }} {{ v.number }}</p>
                <p v-for="[label, value] in metaNoDue" :key="label" class="inv-dim">{{ label }}: {{ value }}</p>
              </div>
            </div>
            <p class="inv-dim st-label">{{ v.amountDue.label }}</p>
            <p class="st-amount">{{ v.amountDue.value }}</p>
            <p v-if="v.amountDue.due" class="st-due">{{ v.L.due }} {{ v.amountDue.due }}</p>
          </header>

          <!-- ── Bill to (in the panel on Sidebar) ─────────────────── -->
          <section v-if="!exec" class="inv-bill-to">
            <div>
              <p class="inv-section-label">{{ v.L.billTo }}</p>
              <p class="inv-client-name">{{ v.client.name || 'Client Name' }}</p>
              <p v-for="(line, i) in v.client.lines" :key="i" class="inv-dim">{{ line }}</p>
            </div>
            <div class="hd-right bt-right">
              <template v-if="tpl === 'modern'">
                <p v-for="[label, value] in metaNoDue" :key="label" class="inv-dim">{{ label }}: {{ value }}</p>
              </template>
              <template v-else-if="tpl === 'ledger'">
                <p v-for="[label, value] in v.meta.slice(2)" :key="label" class="inv-dim">{{ label }}: {{ value }}</p>
              </template>
              <!-- Beside the client, as on the PDF -->
              <div v-if="v.stamp" :class="['inv-stamp', 'stamp-' + v.stamp.kind]" aria-hidden="true">
                <b>{{ v.stamp.text }}</b><span v-if="v.stamp.date">{{ v.stamp.date }}</span>
              </div>
            </div>
          </section>

          <!-- ── Items: a list on Studio, a table elsewhere ────────── -->
          <ul v-if="tpl === 'studio'" class="st-items">
            <li v-for="(item, i) in v.items" :key="i">
              <span class="inv-pre st-desc">{{ item.description }}<small>{{ item.qty }} × {{ item.unit }}</small></span>
              <b class="inv-mono">{{ item.amount }}</b>
            </li>
          </ul>
          <table v-else class="inv-table">
            <thead>
              <tr>
                <th v-if="tpl === 'ledger'" class="inv-th inv-th-no">#</th>
                <th class="inv-th inv-th-desc">{{ v.columns[0] }}</th>
                <th class="inv-th inv-th-qty">{{ v.columns[1] }}</th>
                <th class="inv-th inv-th-right">{{ v.columns[2] }}</th>
                <th class="inv-th inv-th-right">{{ v.columns[3] }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in v.items" :key="i" :class="['inv-tr', { 'inv-tr-alt': i % 2 === 1 }]">
                <td v-if="tpl === 'ledger'" class="inv-td inv-td-no">{{ i + 1 }}</td>
                <td class="inv-td inv-td-desc inv-pre">{{ item.description }}</td>
                <td class="inv-td inv-td-qty inv-mono">{{ item.qty }}</td>
                <td class="inv-td inv-td-right inv-mono">{{ item.unit }}</td>
                <td class="inv-td inv-td-right inv-mono inv-amt">{{ item.amount }}</td>
              </tr>
            </tbody>
          </table>

          <!-- ── Totals ────────────────────────────────────────────── -->
          <div class="inv-totals">
            <div v-for="(row, i) in v.totals" :key="i"
              :class="['inv-total-row', { 'inv-grand': row.kind === 'grand', 'inv-balance': row.kind === 'balance', 'inv-key': i === keyRow, 'inv-muted-row': row.kind === 'muted' }]">
              <span class="inv-total-label">{{ row.label }}</span>
              <span class="inv-mono inv-total-val">{{ row.value }}</span>
            </div>
          </div>
          <p v-if="v.taxNote" class="inv-taxnote">{{ v.taxNote }}</p>

          <!-- ── Payment (in the panel on Sidebar), signature beside it when there's no QR ── -->
          <section v-if="!exec && (v.payment.length || v.qr)" :class="['inv-payment', { 'with-sig': v.signature && !v.qr }]">
            <div class="inv-payment-fields">
              <p class="inv-section-label">{{ v.L.paymentDetails }}</p>
              <div v-for="[label, value] in v.payment" :key="label" class="inv-payment-row">
                <span class="inv-dim inv-payment-key">{{ label }}</span>
                <span class="inv-payment-val">{{ value }}</span>
              </div>
            </div>
            <figure v-if="qr" class="inv-qr"><span v-html="qr" /><figcaption>{{ v.L.scanToPay }}</figcaption></figure>
            <div v-else-if="v.signature" class="inv-sig">
              <img :src="v.signature.image" alt="" /><p v-if="v.signature.name" class="inv-sig-name">{{ v.signature.name }}</p><p class="inv-dim">{{ v.signature.label }}</p>
            </div>
          </section>

          <section v-if="v.notes" class="inv-notes-section">
            <p class="inv-section-label">{{ v.L.notes }}</p>
            <p class="inv-dim inv-pre">{{ v.notes }}</p>
          </section>

          <div v-if="v.signature && (exec || v.qr || !v.payment.length)" class="inv-sig inv-sig-end">
            <img :src="v.signature.image" alt="" /><p v-if="v.signature.name" class="inv-sig-name">{{ v.signature.name }}</p><p class="inv-dim">{{ v.signature.label }}</p>
          </div>
        </div>
      </div>

      <footer v-if="v.footer" class="inv-footer"><p class="inv-footer-note inv-pre">{{ v.footer }}</p></footer>
      <p v-if="v.madeWith" class="inv-made-with">{{ v.madeWith }}</p>
    </div>
  </div>
</template>

<style scoped>
/* The PDF's serif, loaded only when a serif design is on screen */
@font-face { font-family: 'Noto Serif'; src: url('/fonts/NotoSerif-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Noto Serif'; src: url('/fonts/NotoSerif-Bold.ttf') format('truetype'); font-weight: 700; font-display: swap; }

.preview-wrap {
  height: 100%;
  overflow-y: auto;
  background: var(--desk);
  padding: 1.25rem;
  display: flex;
  justify-content: center;
}

/* ── The page ─────────────────────────────────────────────────────────── */
.inv {
  --ink: #1B1F2E; --mid: #5B6475; --light: #949CAA; --rule: #DDE1E8; --alt: #F6F7FA;
  position: relative;
  background: #ffffff;
  width: 100%;
  max-width: 560px;
  min-height: 720px;
  padding: 2rem 2rem 1.5rem;
  border-radius: 4px;
  font-family: var(--font);
  font-size: 0.8125rem;
  color: var(--ink);
  align-self: flex-start;
  overflow: hidden;
}
.f-serif, .f-serif .inv-biz-name, .f-serif .lh-title { font-family: 'Noto Serif', Georgia, serif; }
.f-head-serif .st-amount, .f-head-serif .inv-biz-name, .f-head-serif .inv-client-name,
.f-head-serif .inv-key .inv-total-label { font-family: 'Noto Serif', Georgia, serif; }

.inv p { margin: 0; }
.inv-dim   { color: var(--mid); font-size: 0.75rem; line-height: 1.55; }
.inv-mono  { font-variant-numeric: tabular-nums; }
.inv-pre   { white-space: pre-wrap; }
.inv-section-label { font-size: 0.6875rem; font-weight: 700; color: var(--mid); margin: 0 0 0.3rem !important; }

.inv-biz-name { font-size: 0.9375rem; font-weight: 700; color: var(--ink); margin-bottom: 0.2rem !important; }
.inv-client-name { font-size: 0.875rem; font-weight: 700; color: var(--ink); margin-bottom: 0.1rem !important; }
.inv-sender { display: flex; align-items: flex-start; gap: 0.75rem; min-width: 0; }
.inv-logo { width: 44px; height: 44px; object-fit: contain; flex-shrink: 0; }
.hd { margin-bottom: 1.25rem; }
.hd-row, .hd-minimal, .hd-band { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.hd-right { text-align: right; flex-shrink: 0; }

.inv-bill-to { display: flex; justify-content: space-between; gap: 1rem; margin: 0 0 1.25rem; }

/* ── Items table (default: ruled, as Minimal) ─────────────────────────── */
.inv-table { width: 100%; border-collapse: collapse; margin-bottom: 0.75rem; font-size: 0.75rem; }
.inv-th { font-size: 0.6875rem; font-weight: 700; color: var(--mid); text-align: left; padding: 0.5rem 0.5rem;
  border-top: 1.5px solid var(--ink); border-bottom: 1.5px solid var(--ink); }
.inv-th-desc { width: 50%; }
.inv-th-qty, .inv-td-qty { text-align: center; }
.inv-th-right, .inv-td-right { text-align: right; }
.inv-td { padding: 0.45rem 0.5rem; vertical-align: top; color: var(--mid); }
.inv-td-desc, .inv-amt { color: var(--ink); }
.inv-tr { border-bottom: 1px solid var(--rule); }
.inv-tr:last-child { border-bottom: 1.5px solid var(--ink); }

/* ── Totals ───────────────────────────────────────────────────────────── */
.inv-totals { margin-left: auto; width: 56%; display: flex; flex-direction: column; gap: 0.3rem; padding-bottom: 0.75rem; }
.inv-total-row { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: var(--mid); }
.inv-total-val { color: var(--ink); }
.inv-muted-row, .inv-muted-row .inv-total-val { color: var(--light); }
.inv-grand, .inv-balance { border-top: 1.5px solid var(--ink); padding-top: 0.45rem; margin-top: 0.2rem; }
.inv-grand .inv-total-label, .inv-balance .inv-total-label { font-weight: 700; color: var(--ink); font-size: 0.875rem; }
.inv-grand .inv-total-val, .inv-balance .inv-total-val { font-weight: 700; font-size: 0.875rem; }
.inv-taxnote { font-size: 0.6875rem; color: var(--mid); margin: -0.25rem 0 0.75rem !important; }

/* ── Payment, notes, signature, footer ─────────────────────────────────── */
.inv-payment { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;
  border-top: 1px solid var(--rule); padding-top: 0.75rem; margin-bottom: 0.75rem; }
.inv-payment-fields { min-width: 0; flex: 1; }
.inv-payment-row { display: flex; gap: 0.75rem; font-size: 0.75rem; margin-bottom: 0.2rem; }
.inv-payment-key { min-width: 96px; flex-shrink: 0; }
.inv-payment-val { color: var(--ink); word-break: break-all; }
.inv-qr { margin: 0; flex-shrink: 0; text-align: center; font-size: 0.625rem; color: var(--mid); }
.inv-qr :deep(svg) { display: block; }
.inv-notes-section { border-top: 1px solid var(--rule); padding-top: 0.75rem; margin-bottom: 0.75rem; }
.inv-sig { width: 40%; flex-shrink: 0; }
.inv-sig img { display: block; max-width: 100%; max-height: 46px; margin-bottom: 0.25rem; }
.inv-sig-name { font-weight: 700; font-size: 0.75rem; border-top: 1px solid var(--ink); padding-top: 0.3rem; }
.inv-sig:not(:has(.inv-sig-name)) .inv-dim { border-top: 1px solid var(--ink); padding-top: 0.3rem; }
.inv-sig-end { margin: 1rem 0 0 auto; }
.inv-footer { margin-top: 1.5rem; text-align: center; }
.inv-footer-note { font-size: 0.75rem; color: var(--light); }
.inv-made-with { margin-top: 1rem !important; font-size: 0.625rem; color: var(--light); }

/* ── Stamp (Pro): a tilted double outline in stamp ink ─────────────────── */
.inv-stamp { transform: rotate(-8deg); margin: 0.6rem 0.3rem 0 auto; width: max-content;
  display: flex; flex-direction: column; align-items: center; padding: 0.35rem 1.1rem;
  border: 2.5px solid currentColor; border-radius: 7px; box-shadow: inset 0 0 0 2px #fff, inset 0 0 0 3px currentColor; }
.inv-stamp b { font-size: 1.35rem; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.1; }
.inv-stamp span { font-size: 0.625rem; font-weight: 700; }
.stamp-paid { color: #1F7A4D; }
.stamp-draft { color: #5B6475; }
.hd-sidebar { position: relative; }
.sb-stamp { position: absolute; top: -0.4rem; right: 0; margin: 0; }
.bt-right { display: flex; flex-direction: column; align-items: flex-end; }

.inv-pro-badge { position: absolute; top: 0.6rem; left: 50%; transform: translateX(-50%); z-index: 3;
  padding: 0.125rem 0.6rem; border-radius: 999px; background: var(--ink); color: #fff; font-size: 0.625rem; font-weight: 600; }

/* ══ Minimal: quiet; the number and the amount due are the big figures ══ */
.min-number { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; margin: 0.1rem 0 0.3rem !important; }
.tpl-minimal .hd-minimal { border-bottom: 1.5px solid var(--ink); padding-bottom: 1rem; }
.tpl-minimal .inv-key .inv-total-label { font-weight: 400; color: var(--mid); font-size: 0.75rem; align-self: center; }
.tpl-minimal .inv-key .inv-total-val { font-size: 1.25rem; font-weight: 800; color: var(--min-accent); }

/* ══ Letterhead: centred serif letterhead, double rule, ruled rows ═══════ */
.hd-letter { text-align: center; }
.lh-logo { height: 40px; max-width: 120px; object-fit: contain; margin: 0 auto 0.4rem; display: block; }
.lh-name { font-size: 1.2rem; font-weight: 700; }
.lh-contact { margin-top: 0.2rem !important; display: flex; flex-wrap: wrap; justify-content: center; gap: 0 1.1rem; }
.lh-rule { height: 5px; margin: 0.8rem 0 1.1rem; border-top: 2.5px solid var(--accent); border-bottom: 1px solid var(--accent); }
.lh-title-row { display: flex; justify-content: space-between; align-items: flex-start; text-align: left; }
.lh-title { font-size: 1.5rem; font-weight: 700; line-height: 1.1; }
.lh-meta { display: grid; grid-template-columns: auto auto; gap: 0.15rem 1.5rem; margin: 0; font-size: 0.75rem; }
.lh-meta dt { color: var(--mid); }
.lh-meta dd { margin: 0; text-align: right; }
.tpl-classic .inv-th, .tpl-classic .inv-tr:last-child { border-color: var(--accent); }
.tpl-classic .inv-grand { border-top-color: var(--accent); }
.tpl-classic .inv-grand .inv-total-val { color: var(--accent); }

/* ══ Band: the colour band carries the amount due and when it's due ═════ */
.tpl-modern { padding-top: 0; }
.hd-band { background: var(--band); margin: 0 -2rem 1.25rem; padding: 1.75rem 2rem 1.5rem; }
.hd-band .inv-biz-name { color: var(--on-band); }
.hd-band .inv-dim { color: var(--band-muted); }
.band-title { font-size: 0.6875rem; font-weight: 700; color: var(--band-muted); margin-bottom: 0.6rem !important; }
.band-amount { font-size: 1.6rem; font-weight: 800; color: var(--band-hi); line-height: 1.15; }
.band-due { font-size: 0.75rem; color: var(--on-band); }
.tpl-modern .inv-section-label { color: var(--band-accent-text); }
.tpl-modern .inv-th { background: var(--band); color: var(--on-band); border: none; }
.tpl-modern .inv-tr { border-bottom: none; }
.tpl-modern .inv-tr-alt { background: var(--alt); }
.tpl-modern .inv-tr:last-child { border-bottom: 1px solid var(--rule); }
.tpl-modern .inv-grand { background: var(--band-accent); border: none; padding: 0.45rem 0.5rem; margin: 0.25rem 0 0 -0.5rem; }
.tpl-modern .inv-grand .inv-total-label, .tpl-modern .inv-grand .inv-total-val { color: var(--on-band-accent); }

/* ══ Sidebar (Pro): a solid brand panel for who, and how to pay ═════════ */
.tpl-executive { padding: 0; }
.tpl-executive .inv-body { display: grid; grid-template-columns: 30% 1fr; min-height: 720px; }
.sb-panel { background: var(--brand); color: var(--on-brand); padding: 2rem 1.1rem; overflow-wrap: anywhere; }
.sb-panel .inv-biz-name, .sb-panel .inv-client-name, .sb-pay-val { color: var(--on-brand); }
.sb-panel .inv-dim, .sb-panel .inv-qr { color: var(--brand-muted); }
.sb-panel .inv-section-label { color: var(--brand-muted); }
.sb-logo { max-width: 100%; max-height: 44px; object-fit: contain; display: block; margin-bottom: 0.6rem; }
.sb-block { margin-top: 1.4rem; }
.sb-pay { display: flex; flex-direction: column; margin-bottom: 0.45rem; font-size: 0.75rem; }
.sb-pay-val { word-break: break-all; }
.sb-qr { display: inline-block; margin-top: 0.4rem; }
.sb-qr :deep(svg) { background: #fff; padding: 6px; border-radius: 4px; box-sizing: content-box; }
.tpl-executive .inv-main { padding: 2rem 1.5rem 1.5rem; min-width: 0; }
.sb-title { font-size: 1.75rem; font-weight: 800; line-height: 1.1; }
.sb-meta { display: flex; gap: 1.5rem; margin-top: 0.9rem; }
.sb-meta div { display: flex; flex-direction: column; font-size: 0.75rem; }
.tpl-executive .inv-th, .tpl-executive .inv-tr:last-child { border-color: var(--brand-text); }
.tpl-executive .inv-totals { width: 70%; }
.tpl-executive .inv-grand { background: var(--brand); border: none; padding: 0.45rem 0.5rem; margin: 0.25rem 0 0 -0.5rem; }
.tpl-executive .inv-grand .inv-total-label, .tpl-executive .inv-grand .inv-total-val { color: var(--on-brand); }
.tpl-executive .inv-made-with, .tpl-executive .inv-footer { padding: 0 1.5rem 1rem 32%; }

/* ══ Accounts (Pro): summary boxes, numbered grid, double-ruled total ═══ */
.acc-title { font-size: 1.3rem; font-weight: 800; color: var(--brand-text); }
.acc-summary { width: 100%; border-collapse: collapse; margin-top: 1.1rem; border: 1px solid var(--ink); }
.acc-summary th { background: var(--brand); color: var(--on-brand); font-size: 0.5625rem; font-weight: 700; text-transform: uppercase; text-align: left; padding: 0.35rem 0.5rem; }
.acc-summary td { font-weight: 700; font-size: 0.8125rem; padding: 0.5rem; border-left: 1px solid var(--rule); }
.acc-summary td:first-child { border-left: none; }
.tpl-ledger .inv-th { background: var(--alt); border-top: none; font-size: 0.5625rem; text-transform: uppercase; }
.tpl-ledger .inv-th, .tpl-ledger .inv-td { border-left: 1px solid var(--rule); }
.tpl-ledger .inv-th:first-child, .tpl-ledger .inv-td:first-child { border-left: none; }
.tpl-ledger .inv-table { border-left: 1px solid var(--rule); border-right: 1px solid var(--rule); }
.inv-th-no, .inv-td-no { width: 1.5rem; text-align: center; color: var(--light); }
.tpl-ledger .inv-grand .inv-total-val { border-bottom: 3px double var(--ink); padding-bottom: 0.1rem; }

/* ══ Studio (Pro): the amount due as a headline on a brand block ════════ */
.tpl-studio { padding-top: 0; }
.hd-studio { background: var(--brand); color: var(--on-brand); margin: 0 -2rem 1.4rem; padding: 1.6rem 2rem 1.6rem; }
.hd-studio .inv-biz-name { color: var(--on-brand); font-size: 0.8125rem; }
.hd-studio .inv-dim { color: var(--brand-muted); }
.st-label { margin-top: 2.6rem !important; }
.st-amount { font-size: 2.6rem; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; color: var(--on-brand); }
.st-due { font-size: 0.8125rem; margin-top: 0.3rem !important; color: var(--on-brand); }
.st-items { list-style: none; margin: 0 0 0.75rem; padding: 0.5rem 0 0; border-top: 1.5px solid var(--ink); border-bottom: 1.5px solid var(--ink); }
.st-items li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--rule); font-size: 0.8125rem; }
.st-items li:last-child { border-bottom: none; }
.st-desc small { display: block; font-size: 0.6875rem; color: var(--mid); }
</style>

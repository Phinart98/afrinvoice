<script setup lang="ts">
import { computed } from 'vue';
import { PREMIUM_TEMPLATES, effectiveTemplate, type InvoiceState } from '../types/invoice';
import { SITE } from '../site';
import { buildInvoiceView } from '../utils/invoiceView';
import { qrSvg } from '../utils/paymentQr';

const props = defineProps<{ state: InvoiceState; pro?: boolean }>();

// While Pro is on sale, free users may PREVIEW a premium template (try before buying); the download is
// what's gated. Before Pro exists, a stored premium template simply shows as Minimal, like the PDF.
const tpl = computed(() => (SITE.pro.enabled ? props.state.template : effectiveTemplate(props.state.template, !!props.pro)));
const proPreview = computed(() => !props.pro && PREMIUM_TEMPLATES.includes(tpl.value));

// Same view model the PDF renders — the preview can't drift from the download.
const v = computed(() => buildInvoiceView(props.state, { pro: props.pro }));
const qr = computed(() => (v.value.qr ? qrSvg(v.value.qr.payload, 92) : ''));

// CSS custom properties driven by the colour pickers
const themeStyle = computed(() => {
  const s = props.state;
  if (tpl.value === 'classic') return { '--c-accent': s.classicAccent || '#115E59' };
  if (tpl.value === 'modern') return { '--m-header': s.modernHeader || '#0F172A', '--m-accent': s.modernAccent || '#0EA5E9' };
  if (tpl.value === 'executive' || tpl.value === 'ledger') return { '--brand': s.brandColor || '#0F766E' };
  return {};
});
</script>

<template>
  <div class="preview-wrap">
    <div
      :class="['inv', 'tpl-' + tpl, 'paper-' + v.paper]"
      :style="themeStyle"
      :lang="v.locale"
      aria-label="Invoice preview"
    >
      <p v-if="proPreview" class="inv-pro-badge">Pro template preview</p>
      <!-- ── Header ──────────────────────────────────────────────────── -->
      <header class="inv-header">
        <div class="inv-sender">
          <img v-if="v.sender.logo" :src="v.sender.logo" class="inv-logo" alt="" />
          <div>
            <p class="inv-biz-name">{{ v.sender.name || 'Your Business Name' }}</p>
            <p v-for="(line, i) in v.sender.lines" :key="i" class="inv-dim">{{ line }}</p>
          </div>
        </div>

        <div v-if="tpl !== 'minimal'" class="inv-label-block">
          <p class="inv-title">{{ v.title }}</p>
          <p class="inv-dim">{{ v.L.number }}&nbsp;<span class="inv-mono">{{ v.number || '—' }}</span></p>
          <p v-for="[label, value] in v.meta" :key="label" class="inv-dim">{{ label }}: {{ value }}</p>
        </div>
        <div v-else class="inv-label-block inv-minimal-hero">
          <p class="inv-minimal-label">{{ v.title }}</p>
          <p class="inv-minimal-number">{{ v.number || '—' }}</p>
          <p v-for="[label, value] in v.meta" :key="label" class="inv-dim">{{ label }}: {{ value }}</p>
        </div>
      </header>

      <hr v-if="tpl !== 'modern' && tpl !== 'executive'" class="inv-rule" />

      <!-- ── Bill to ─────────────────────────────────────────────────── -->
      <section class="inv-bill-to">
        <p class="inv-section-label">{{ v.L.billTo }}</p>
        <p class="inv-client-name">{{ v.client.name || 'Client Name' }}</p>
        <p v-for="(line, i) in v.client.lines" :key="i" class="inv-dim">{{ line }}</p>
      </section>

      <!-- ── Items ───────────────────────────────────────────────────── -->
      <table class="inv-table">
        <thead>
          <tr>
            <th class="inv-th inv-th-desc">{{ v.columns[0] }}</th>
            <th class="inv-th inv-th-right">{{ v.columns[1] }}</th>
            <th class="inv-th inv-th-right">{{ v.columns[2] }}</th>
            <th class="inv-th inv-th-right">{{ v.columns[3] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in v.items" :key="i" :class="['inv-tr', { 'inv-tr-alt': i % 2 === 1 }]">
            <td class="inv-td inv-td-desc inv-pre">{{ item.description }}</td>
            <td class="inv-td inv-td-right inv-mono">{{ item.qty }}</td>
            <td class="inv-td inv-td-right inv-mono">{{ item.unit }}</td>
            <td class="inv-td inv-td-right inv-mono">{{ item.amount }}</td>
          </tr>
        </tbody>
      </table>

      <!-- ── Totals ──────────────────────────────────────────────────── -->
      <div class="inv-totals">
        <div
          v-for="(row, i) in v.totals"
          :key="i"
          :class="['inv-total-row', { 'inv-grand': row.kind === 'grand', 'inv-balance': row.kind === 'balance', 'inv-muted-row': row.kind === 'muted' }]"
        >
          <span :class="row.kind === 'grand' || row.kind === 'balance' ? 'inv-grand-label' : 'inv-dim'">{{ row.label }}</span>
          <span :class="row.kind === 'grand' ? 'inv-grand-val inv-mono' : row.kind === 'balance' ? 'inv-balance-val inv-mono' : 'inv-mono'">{{ row.value }}</span>
        </div>
      </div>
      <p v-if="v.taxNote" class="inv-taxnote">{{ v.taxNote }}</p>

      <!-- ── Payment ─────────────────────────────────────────────────── -->
      <template v-if="v.payment.length || v.qr">
        <hr class="inv-rule" />
        <section class="inv-payment">
          <div class="inv-payment-fields">
            <p class="inv-section-label">{{ v.L.paymentDetails }}</p>
            <div v-for="[label, value] in v.payment" :key="label" class="inv-payment-row">
              <span class="inv-dim inv-payment-key">{{ label }}</span>
              <span class="inv-payment-val">{{ value }}</span>
            </div>
          </div>
          <figure v-if="qr" class="inv-qr">
            <span v-html="qr" />
            <figcaption>{{ v.L.scanToPay }}</figcaption>
          </figure>
        </section>
      </template>

      <!-- ── Notes ───────────────────────────────────────────────────── -->
      <template v-if="v.notes">
        <hr class="inv-rule" />
        <section class="inv-notes-section">
          <p class="inv-section-label">{{ v.L.notes }}</p>
          <p class="inv-dim inv-pre">{{ v.notes }}</p>
        </section>
      </template>

      <footer v-if="v.footer" class="inv-footer">
        <p class="inv-footer-note inv-pre">{{ v.footer }}</p>
      </footer>
      <p v-if="v.madeWith" class="inv-made-with">{{ v.madeWith }}</p>
    </div>
  </div>
</template>

<style scoped>
/* ── Wrapper — allows scrolling when invoice is taller than the pane ──── */
.preview-wrap {
  height: 100%;
  overflow-y: auto;
  background: var(--desk);
  padding: 1.25rem;
  display: flex;
  justify-content: center;
}

/* ── Invoice document card ───────────────────────────────────────────── */
.inv {
  background: #ffffff;
  width: 100%;
  max-width: 560px;
  padding: 2rem 2rem 1.5rem;
  border-radius: 6px;
  font-family: var(--font);
  font-size: 0.8125rem;
  color: #0F172A;
  align-self: flex-start;
}

/* ── Typography utilities ────────────────────────────────────────────── */
.inv-dim   { color: #475569; font-size: 0.75rem; margin: 0; line-height: 1.6; }
.inv-mono  { font-family: var(--font); font-variant-numeric: tabular-nums; font-size: 0.75rem; }
.inv-pre   { white-space: pre-wrap; }

/* ── Section label (BILL TO, PAYMENT DETAILS, NOTES) ────────────────── */
.inv-section-label {
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #94A3B8;
  margin: 0 0 0.375rem;
}

/* ── Header ──────────────────────────────────────────────────────────── */
.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.inv-sender {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
}

.inv-logo {
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
}

.inv-biz-name {
  font-family: var(--font);
  font-size: 0.9375rem;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
  margin: 0 0 0.25rem;
}

.inv-label-block {
  text-align: right;
  flex-shrink: 0;
}

.inv-title {
  font-family: var(--font);
  font-size: 1.375rem;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: -0.02em;
  line-height: 1;
  margin: 0 0 0.5rem;
}

/* ── Rule ────────────────────────────────────────────────────────────── */
.inv-rule {
  border: none;
  border-top: 1px solid #E2E8F0;
  margin: 0.875rem 0;
}

/* ── Bill To ─────────────────────────────────────────────────────────── */
.inv-bill-to { margin-bottom: 1rem; }

.inv-client-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #0F172A;
  margin: 0 0 0.125rem;
}

/* ── Table ───────────────────────────────────────────────────────────── */
.inv-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
}

.inv-th {
  background: #0F172A;
  color: #ffffff;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.5rem 0.5rem;
  text-align: left;
}

.inv-th-desc { width: 48%; padding-left: 0.625rem; }
.inv-th-right { text-align: right; padding-right: 0.625rem; }

.inv-tr { border-bottom: 1px solid #F1F5F9; }
.inv-tr-alt { background: #F8FAFC; }

.inv-td {
  padding: 0.4375rem 0.5rem;
  color: #0F172A;
  vertical-align: middle;
}
.inv-td-desc  { padding-left: 0.625rem; color: #1E293B; }
.inv-td-right { text-align: right; padding-right: 0.625rem; color: #475569; }

/* ── Totals ──────────────────────────────────────────────────────────── */
.inv-totals {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.3125rem;
  padding: 0.25rem 0 0.875rem;
  border-top: 1px solid #E2E8F0;
}

.inv-total-row {
  display: flex;
  gap: 1.5rem;
  font-size: 0.75rem;
  color: #475569;
}

.inv-grand {
  margin-top: 0.25rem;
  padding-top: 0.375rem;
  border-top: 1.5px solid #0F172A;
  gap: 1.5rem;
}

.inv-grand-label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #0F172A;
}

.inv-grand-val {
  font-size: 0.875rem;
  font-weight: 700;
  color: #0F766E;                        /* Classic default */
}

/* Classic: user-customisable total colour */
.tpl-classic .inv-grand-val { color: var(--c-accent, #0F766E); }

/* ── Payment ─────────────────────────────────────────────────────────── */
.inv-payment { margin-bottom: 0.25rem; }

.inv-payment-row {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

.inv-payment-key {
  min-width: 100px;
  flex-shrink: 0;
}

.inv-payment-val {
  color: #0F172A;
  font-weight: 500;
  word-break: break-all;
}

/* ── Notes ───────────────────────────────────────────────────────────── */
.inv-notes-section { margin-bottom: 0.25rem; }

/* ── Footer ──────────────────────────────────────────────────────────── */
.inv-footer {
  margin-top: 1.5rem;
  text-align: center;
  border-top: 1px solid #F1F5F9;
  padding-top: 0.875rem;
}

.inv-made-with {
  margin: 1rem 0 0;
  font-size: 0.625rem;
  color: #94A3B8;
}

.inv-footer-note {
  font-style: italic;
  font-size: 0.75rem;
  color: #94A3B8;
  margin: 0;
}

/* ══════════════════════════════════════════════════════════════════════
   MODERN TEMPLATE OVERRIDES
   Navy header band · Amber labels · Amber total strip
   ══════════════════════════════════════════════════════════════════════ */
.tpl-modern {
  padding-top: 0;
}

.tpl-modern .inv-header {
  background: var(--m-header, #0F172A);
  margin: 0 -2rem;
  padding: 1.5rem 2rem;
  margin-bottom: 1.25rem;
  border-radius: 6px 6px 0 0;
}

.tpl-modern .inv-biz-name { color: #ffffff; }
.tpl-modern .inv-sender .inv-dim { color: rgba(255,255,255,0.55); }

.tpl-modern .inv-title { color: var(--m-accent, #0F766E); }

.tpl-modern .inv-label-block .inv-dim  { color: rgba(255,255,255,0.55); }
.tpl-modern .inv-label-block .inv-mono { color: #ffffff; }

.tpl-modern .inv-logo { border-color: rgba(255,255,255,0.15); }

/* Accent section labels */
.tpl-modern .inv-section-label { color: var(--m-accent, #0F766E); }

/* Accent left-bar on table header */
.tpl-modern .inv-th:first-child {
  border-left: 3px solid var(--m-accent, #0F766E);
  padding-left: calc(0.625rem - 3px);
}

/* Accent total strip */
.tpl-modern .inv-grand {
  background: var(--m-accent, #0F766E);
  margin: 0.25rem -0.5rem -0.25rem;
  padding: 0.5rem 0.5rem;
  border-radius: 4px;
  border-top: none;
}
.tpl-modern .inv-grand-label { color: #ffffff; font-size: 0.8125rem; }
.tpl-modern .inv-grand-val   { color: #ffffff; font-size: 0.9375rem; }

/* ══════════════════════════════════════════════════════════════════════
   EXECUTIVE (Pro) — dark header band · ruled table · brand total strip
   ══════════════════════════════════════════════════════════════════════ */
.tpl-executive { padding-top: 0; }
.tpl-executive .inv-header {
  background: #0F172A;
  margin: 0 -2rem 1.25rem;
  padding: 1.5rem 2rem;
  border-radius: 6px 6px 0 0;
}
.tpl-executive .inv-biz-name,
.tpl-executive .inv-title,
.tpl-executive .inv-label-block .inv-mono { color: #ffffff; }
.tpl-executive .inv-sender .inv-dim,
.tpl-executive .inv-label-block .inv-dim { color: rgba(255,255,255,0.6); }
.tpl-executive .inv-section-label { color: #475569; }
.tpl-executive .inv-th {
  background: transparent;
  color: #475569;
  border-top: 1.5px solid #0F172A;
  border-bottom: 1.5px solid #0F172A;
}
.tpl-executive .inv-grand,
.tpl-ledger .inv-grand {
  margin: 0.25rem -0.5rem -0.25rem;
  padding: 0.5rem;
  border-radius: 4px;
  border-top: none;
}
.tpl-executive .inv-grand { background: var(--brand, #0F766E); }
.tpl-executive .inv-grand-label, .tpl-executive .inv-grand-val,
.tpl-ledger .inv-grand-label, .tpl-ledger .inv-grand-val { color: #ffffff; }

/* ══════════════════════════════════════════════════════════════════════
   LEDGER (Pro) — brand top bar · brand title and table head · dark total
   ══════════════════════════════════════════════════════════════════════ */
.tpl-ledger { border-top: 6px solid var(--brand, #0F766E); }
.tpl-ledger .inv-title { color: var(--brand, #0F766E); }
.tpl-ledger .inv-section-label { color: #475569; }
.tpl-ledger .inv-th { background: var(--brand, #0F766E); }
.tpl-ledger .inv-grand { background: #0F172A; }

.inv-pro-badge {
  display: inline-block;
  margin: 0 0 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #0F172A;
  color: #ffffff;
  font-size: 0.625rem;
  font-weight: 600;
}
.tpl-executive .inv-pro-badge { margin-top: 0.75rem; }

/* ══════════════════════════════════════════════════════════════════════
   MINIMAL TEMPLATE OVERRIDES
   No fills · Hairlines only · Invoice number as hero
   ══════════════════════════════════════════════════════════════════════ */

/* Table header: no dark fill — muted text, bold hairline top */
.tpl-minimal .inv-th {
  background: transparent;
  color: #475569;
  border-top: 1.5px solid #0F172A;
  border-bottom: 1.5px solid #0F172A;
  font-size: 0.625rem;
  letter-spacing: 0.06em;
}

/* Row hairlines */
.tpl-minimal .inv-tr { border-bottom: 1px solid #E2E8F0; }
.tpl-minimal .inv-tr-alt { background: transparent; }

/* Grand total: no amber fill, just bold text */
.tpl-minimal .inv-grand {
  border-top: 1.5px solid #0F172A;
  margin-top: 0.25rem;
  padding-top: 0.5rem;
}
.tpl-minimal .inv-grand-label { color: #0F172A; }
.tpl-minimal .inv-grand-val   { color: #0F172A; font-size: 0.9375rem; }

/* Invoice number hero */
.inv-minimal-hero { text-align: right; flex-shrink: 0; }

.inv-minimal-label {
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94A3B8;
  margin: 0 0 0.125rem;
}

/* ── Rows added in v2: "incl." tax, balance due, tax note, QR ─────────── */
.inv-muted-row,
.inv-muted-row .inv-dim { color: #94A3B8; }

.inv-balance {
  margin-top: 0.125rem;
  padding-top: 0.3125rem;
  border-top: 1px dashed #CBD5E1;
}
.inv-balance-val { font-size: 0.875rem; font-weight: 700; color: #0F172A; }

.inv-taxnote {
  font-size: 0.6875rem;
  color: #475569;
  margin: -0.375rem 0 0.75rem;
  text-align: right;
}

.inv-payment {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.inv-payment-fields { min-width: 0; flex: 1; }

.inv-qr {
  margin: 0;
  flex-shrink: 0;
  text-align: center;
  font-size: 0.625rem;
  color: #64748B;
}
.inv-qr :deep(svg) { display: block; }
.inv-qr figcaption { margin-top: 0.125rem; }

.inv-minimal-number {
  font-family: var(--font); font-variant-numeric: tabular-nums;
  font-size: 1.375rem;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
  margin: 0 0 0.375rem;
}
</style>

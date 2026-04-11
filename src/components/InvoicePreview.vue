<script setup lang="ts">
import { computed } from 'vue';
import type { InvoiceState } from '../types/invoice';
import { computeTotals } from '../types/invoice';

const props = defineProps<{ state: InvoiceState }>();

// When tax is hidden, treat effective rate as 0 so the total equals the subtotal.
// The stored taxRate is preserved — toggling visible.tax back on restores it.
const effectiveTaxRate = computed(() =>
  props.state.visible.tax ? props.state.taxRate : 0
);
const totals = computed(() => computeTotals(props.state.items, effectiveTaxRate.value));

function fmtCurrency(amount: number): string {
  const sym = props.state.currencySymbol;
  return `${sym} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Payment fields — filter out empty values, same logic as PDF renderer
const paymentFields = computed((): [string, string][] => {
  const s = props.state;
  const rows: [string, string][] =
    s.paymentType === 'bank'
      ? [
          ['Bank',           s.bankName],
          ['Account Name',   s.accountName],
          ['Account Number', s.accountNumber],
          ['SWIFT / BIC',    s.swiftCode],
        ]
      : [
          ['Provider',     s.momoProvider],
          ['Account Name', s.momoName],
          ['Number',       s.momoNumber],
        ];
  return rows.filter(([, v]) => v.trim() !== '');
});

const hasPayment    = computed(() => props.state.visible.payment && paymentFields.value.length > 0);
const hasNotes      = computed(() => props.state.notes.trim() !== '');
const hasFooterNote = computed(() => props.state.footerNote.trim() !== '');

// CSS custom properties driven by user colour pickers
const modernStyle = computed(() => {
  const t = props.state.template;
  if (t === 'classic') {
    return { '--c-accent': props.state.classicAccent || '#F59E0B' };
  }
  if (t === 'modern') {
    return {
      '--m-header': props.state.modernHeader || '#0F172A',
      '--m-accent': props.state.modernAccent || '#F59E0B',
    };
  }
  return {};
});
</script>

<template>
  <div class="preview-wrap">
    <div :class="['inv', 'tpl-' + state.template]" :style="modernStyle">

      <!-- ── Header ──────────────────────────────────────────────────── -->
      <header class="inv-header">
        <div class="inv-sender">
          <img
            v-if="state.businessLogo"
            :src="state.businessLogo"
            class="inv-logo"
            alt="Business logo"
          />
          <div>
            <p class="inv-biz-name">{{ state.businessName || 'Your Business Name' }}</p>
            <p v-if="state.businessEmail   && state.visible.bizEmail"   class="inv-dim">{{ state.businessEmail }}</p>
            <p v-if="state.businessPhone   && state.visible.bizPhone"   class="inv-dim">{{ state.businessPhone }}</p>
            <p v-if="state.businessAddress" class="inv-dim inv-pre">{{ state.businessAddress }}</p>
          </div>
        </div>

        <!-- Classic & Modern: title + meta stacked right -->
        <div v-if="state.template !== 'minimal'" class="inv-label-block">
          <p class="inv-title">{{ state.invoiceTitle || 'INVOICE' }}</p>
          <p class="inv-dim">No.&nbsp;<span class="inv-mono">{{ state.invoiceNumber || '—' }}</span></p>
          <p class="inv-dim">Date:&nbsp;{{ fmtDate(state.invoiceDate) }}</p>
          <p v-if="state.dueDate && state.visible.dueDate" class="inv-dim">Due:&nbsp;&nbsp;{{ fmtDate(state.dueDate) }}</p>
        </div>

        <!-- Minimal: invoice number as typographic hero -->
        <div v-else class="inv-label-block inv-minimal-hero">
          <p class="inv-minimal-label">{{ state.invoiceTitle || 'INVOICE' }}</p>
          <p class="inv-minimal-number">{{ state.invoiceNumber || '—' }}</p>
          <p class="inv-dim" style="text-align:right">{{ fmtDate(state.invoiceDate) }}</p>
          <p v-if="state.dueDate && state.visible.dueDate" class="inv-dim" style="text-align:right; color:#94A3B8">Due {{ fmtDate(state.dueDate) }}</p>
        </div>
      </header>

      <hr class="inv-rule" />

      <!-- ── Bill To ─────────────────────────────────────────────────── -->
      <section class="inv-bill-to">
        <p class="inv-section-label">BILL TO</p>
        <p class="inv-client-name">{{ state.clientName || 'Client Name' }}</p>
        <p v-if="state.clientEmail   && state.visible.clientEmail"   class="inv-dim">{{ state.clientEmail }}</p>
        <p v-if="state.clientAddress && state.visible.clientAddress" class="inv-dim inv-pre">{{ state.clientAddress }}</p>
      </section>

      <!-- ── Line Items ──────────────────────────────────────────────── -->
      <table class="inv-table">
        <thead>
          <tr>
            <th class="inv-th inv-th-desc">{{ state.itemLabel || 'Description' }}</th>
            <th class="inv-th inv-th-right">Qty</th>
            <th class="inv-th inv-th-right">Unit Price</th>
            <th class="inv-th inv-th-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, i) in state.items"
            :key="i"
            :class="['inv-tr', { 'inv-tr-alt': i % 2 === 1 }]"
          >
            <td class="inv-td inv-td-desc">{{ item.description || '—' }}</td>
            <td class="inv-td inv-td-right inv-mono">{{ item.quantity }}</td>
            <td class="inv-td inv-td-right inv-mono">{{ fmtCurrency(item.unitPrice) }}</td>
            <td class="inv-td inv-td-right inv-mono">{{ fmtCurrency(item.quantity * item.unitPrice) }}</td>
          </tr>
        </tbody>
      </table>

      <!-- ── Totals ──────────────────────────────────────────────────── -->
      <div class="inv-totals">
        <div class="inv-total-row">
          <span class="inv-dim">Subtotal</span>
          <span class="inv-mono">{{ fmtCurrency(totals.subtotal) }}</span>
        </div>
        <div v-if="state.taxRate > 0 && state.visible.tax" class="inv-total-row">
          <span class="inv-dim">{{ state.taxLabel }} ({{ state.taxRate }}%)</span>
          <span class="inv-mono">{{ fmtCurrency(totals.taxAmount) }}</span>
        </div>
        <div class="inv-total-row inv-grand">
          <span class="inv-grand-label">TOTAL</span>
          <span class="inv-grand-val inv-mono">{{ fmtCurrency(totals.total) }}</span>
        </div>
      </div>

      <!-- ── Payment Details ─────────────────────────────────────────── -->
      <template v-if="hasPayment">
        <hr class="inv-rule" />
        <section class="inv-payment">
          <p class="inv-section-label">PAYMENT DETAILS</p>
          <div
            v-for="([label, value]) in paymentFields"
            :key="label"
            class="inv-payment-row"
          >
            <span class="inv-dim inv-payment-key">{{ label }}</span>
            <span class="inv-payment-val">{{ value }}</span>
          </div>
        </section>
      </template>

      <!-- ── Notes ──────────────────────────────────────────────────── -->
      <template v-if="hasNotes">
        <hr class="inv-rule" />
        <section class="inv-notes-section">
          <p class="inv-section-label">NOTES</p>
          <p class="inv-dim inv-pre">{{ state.notes }}</p>
        </section>
      </template>

      <!-- ── Footer (only shown when footerNote is set) ───────────── -->
      <footer v-if="hasFooterNote" class="inv-footer">
        <p class="inv-footer-note inv-pre">{{ state.footerNote }}</p>
      </footer>

    </div>
  </div>
</template>

<style scoped>
/* ── Wrapper — allows scrolling when invoice is taller than the pane ──── */
.preview-wrap {
  height: 100%;
  overflow-y: auto;
  background: #F1F5F9;
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
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8125rem;
  color: #0F172A;
  align-self: flex-start;
}

/* ── Typography utilities ────────────────────────────────────────────── */
.inv-dim   { color: #475569; font-size: 0.75rem; margin: 0; line-height: 1.6; }
.inv-mono  { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
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
  font-family: 'Sora', sans-serif;
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
  font-family: 'Sora', sans-serif;
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
  color: #F59E0B;                        /* Classic default */
}

/* Classic: user-customisable total colour */
.tpl-classic .inv-grand-val { color: var(--c-accent, #F59E0B); }

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

.tpl-modern .inv-title { color: var(--m-accent, #F59E0B); }

.tpl-modern .inv-label-block .inv-dim  { color: rgba(255,255,255,0.55); }
.tpl-modern .inv-label-block .inv-mono { color: #ffffff; }

.tpl-modern .inv-logo { border-color: rgba(255,255,255,0.15); }

/* Accent section labels */
.tpl-modern .inv-section-label { color: var(--m-accent, #F59E0B); }

/* Accent left-bar on table header */
.tpl-modern .inv-th:first-child {
  border-left: 3px solid var(--m-accent, #F59E0B);
  padding-left: calc(0.625rem - 3px);
}

/* Accent total strip */
.tpl-modern .inv-grand {
  background: var(--m-accent, #F59E0B);
  margin: 0.25rem -0.5rem -0.25rem;
  padding: 0.5rem 0.5rem;
  border-radius: 4px;
  border-top: none;
}
.tpl-modern .inv-grand-label { color: #ffffff; font-size: 0.8125rem; }
.tpl-modern .inv-grand-val   { color: #ffffff; font-size: 0.9375rem; }

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

.inv-minimal-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.375rem;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: -0.02em;
  margin: 0 0 0.375rem;
}
</style>

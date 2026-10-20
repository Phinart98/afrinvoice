<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { defaultInvoiceState, computeTotals, PREMIUM_TEMPLATES, type InvoiceState, type TaxLine } from '../types/invoice';
import { COUNTRY_BY_KEY, OTHER_COUNTRY, CURRENCIES, countriesByRegion, REGION_NAMES, countryPath, COUNTRIES,
  type CountryConfig, type PaymentRail, type TaxPreset } from '../data/countries';
import { LABEL_LANGS, type DocType } from '../i18n/labels';
import {
  loadProfile, saveProfile, peekNextNumber, takeNextNumber, loadClients, saveClient, deleteClient,
  loadHistory, addToHistory, deleteHistory, exportAll, importAll, type SavedClient, type HistoryEntry, type Profile,
} from '../utils/invoiceStorage';
import { generateInvoicePDF, printInvoicePDF } from '../utils/invoicePDF';
import { paymentQr } from '../utils/paymentQr';
import { formatMoney, localToday, addDays } from '../utils/money';
import { SITE } from '../site';
import { checkedMonth } from '../utils/stamp';
import InvoicePreview from './InvoicePreview.vue';
import ProPanel from './ProPanel.vue';
import { useProStatus } from '../utils/useProStatus';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ countryPreset?: string; docPreset?: DocType }>();

// ── Core state ────────────────────────────────────────────────────────────────
const state = ref<InvoiceState>(defaultInvoiceState());
const activeTab = ref<'form' | 'preview'>('form');
const activeColorPicker = ref<'classicAccent' | 'modernHeader' | 'modernAccent' | 'brandColor' | null>(null);
const { pro } = useProStatus();
// Templates on offer: premium ones only once Pro is on sale (SITE.pro.enabled).
const templateChoices = computed(() => (['minimal', 'modern', 'classic', ...(SITE.pro.enabled || pro.value ? PREMIUM_TEMPLATES : [])] as InvoiceState['template'][]));
const isPremium = (t: InvoiceState['template']) => PREMIUM_TEMPLATES.includes(t);
const savedAt = ref(0);
const notice = ref('');          // inline message instead of alert()
const busy = ref(false);         // PDF being generated
const ready = ref(false);        // profile applied — don't auto-save defaults over it
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function flash(msg: string) {
  notice.value = msg;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ''; }, 4000);
}

// ── Country ───────────────────────────────────────────────────────────────────
const country = computed<CountryConfig>(() => COUNTRY_BY_KEY[state.value.countryKey] ?? OTHER_COUNTRY);
const regions = countriesByRegion();
const isOther = computed(() => country.value.key === 'other');

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'tax-invoice', label: 'Tax invoice' },
  { value: 'quote', label: 'Quote / estimate' },
  { value: 'proforma', label: 'Proforma invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'credit-note', label: 'Credit note' },
];

function prefixFor(docType: DocType, c: CountryConfig): string {
  if (docType === 'quote') return 'Q-';
  if (docType === 'receipt') return 'R-';
  if (docType === 'credit-note') return 'CN-';
  if (docType === 'proforma') return 'PF-';
  return c.invoicePrefix;
}
const numberPrefix = computed(() => prefixFor(state.value.docType, country.value));

function applyPreset(preset: TaxPreset | null) {
  state.value.taxes = preset ? preset.taxes.map(t => ({ label: t.label, rate: t.rate, kind: t.kind ?? 'add' })) : [];
  state.value.taxNote = preset?.note ?? '';
}

/** Switch country: tax presets, currency, paper, label language, payment rail, number prefix. */
function applyCountry(key: string) {
  const c = COUNTRY_BY_KEY[key] ?? OTHER_COUNTRY;
  const s = state.value;
  s.countryKey = c.key;
  s.currency = c.currency;
  s.paper = c.paper;
  s.labelsLang = c.labelsLang;
  applyPreset(c.taxPresets[0] ?? null);
  if (s.docType === 'invoice' || s.docType === 'tax-invoice') {
    s.docType = c.documentTitle === 'tax-invoice' && s.taxes.length ? 'tax-invoice' : 'invoice';
  }
  s.paymentRail = c.rails[0]; // each country's usual way to get paid; a saved profile overrides it on load
  if (c.mobileProviders?.length && !c.mobileProviders.some(p => p.name === s.momoProvider)) s.momoProvider = c.mobileProviders[0].name;
  refreshNumber();
}

// Tax preset picker: index into country presets, 'none', or 'custom' (edited lines)
const presetChoice = computed<string>({
  get() {
    const s = state.value;
    if (!s.taxes.length && !s.taxNote) return 'none';
    const i = country.value.taxPresets.findIndex(p =>
      p.taxes.length === s.taxes.length &&
      p.taxes.every((t, j) => t.label === s.taxes[j].label && t.rate === s.taxes[j].rate && (t.kind ?? 'add') === s.taxes[j].kind) &&
      (p.note ?? '') === s.taxNote);
    return i >= 0 ? String(i) : 'custom';
  },
  set(v: string) {
    if (v === 'none') applyPreset(null);
    else if (v !== 'custom') applyPreset(country.value.taxPresets[Number(v)]);
  },
});

function addTaxLine() { state.value.taxes.push({ label: country.value.taxName.split(' ')[0] || 'Tax', rate: 0, kind: 'add' }); }
function removeTaxLine(i: number) { state.value.taxes.splice(i, 1); }

// ── Payment rails ─────────────────────────────────────────────────────────────
const RAIL_NAMES: Record<PaymentRail, string> = { bank: 'Bank transfer', iban: 'IBAN / SEPA', 'mobile-money': 'Mobile money', upi: 'UPI' };
const availableRails = computed<PaymentRail[]>(() => {
  const c = country.value;
  const list: PaymentRail[] = [...c.rails];
  for (const r of ['bank', 'iban'] as PaymentRail[]) if (!list.includes(r)) list.push(r);
  if (isOther.value && !list.includes('mobile-money')) list.push('mobile-money');
  return list;
});
const railName = (r: PaymentRail) =>
  r === 'mobile-money' && country.value.region !== 'africa' && !isOther.value ? 'Payment app' : RAIL_NAMES[r];
const providers = computed(() => country.value.mobileProviders ?? []);
const selectedProvider = computed(() => providers.value.find(p => p.name === state.value.momoProvider));

const qrStatus = computed(() => {
  const s = state.value;
  const q = paymentQr({ ...s, visible: { ...s.visible, qr: true, payment: true } }, totals.value.balanceDue);
  if (q?.kind === 'sepa') return 'SEPA QR — any European banking app can pay it with the amount filled in.';
  if (q?.kind === 'upi') return 'UPI QR — GPay, PhonePe, Paytm and BHIM open it pre-filled.';
  if (q?.kind === 'link') return 'QR of your payment link.';
  if (s.paymentRail === 'iban') return 'Add an IBAN, account name and a EUR total to print a SEPA QR — or add a payment link.';
  if (s.paymentRail === 'upi') return 'Add your UPI ID with an INR total to print a UPI QR — or add a payment link.';
  return 'Add a payment link (PayPal.me, Stripe, Wise) to print a QR code.';
});

// ── Totals (for the form summary) ─────────────────────────────────────────────
const totals = computed(() => computeTotals(state.value, { taxVisible: state.value.visible.tax }));
const money = (n: number) => formatMoney(n, state.value.currency, country.value.locale);
function itemAmount(i: number) {
  const it = state.value.items[i];
  return money((Number.isFinite(it.quantity) ? it.quantity : 0) * (Number.isFinite(it.unitPrice) ? it.unitPrice : 0));
}
function addItem() { state.value.items.push({ description: '', quantity: 1, unitPrice: 0 }); }
function removeItem(i: number) { if (state.value.items.length > 1) state.value.items.splice(i, 1); }

// ── Template + colours ────────────────────────────────────────────────────────
function selectTemplate(name: InvoiceState['template']) { state.value.template = name; activeColorPicker.value = null; }
function toggleColorPicker(name: typeof activeColorPicker.value) { activeColorPicker.value = activeColorPicker.value === name ? null : name; }
function handleDocClick(e: MouseEvent) { if (!(e.target as HTMLElement).closest('.color-picker-wrap')) activeColorPicker.value = null; }

const ACCENT_GRID = [
  ['#92400E','#9A3412','#991B1B','#9F1239','#5B21B6','#1E3A8A','#134E4A','#14532D'],
  ['#B45309','#C2410C','#B91C1C','#BE123C','#6D28D9','#1D4ED8','#0F766E','#15803D'],
  ['#F59E0B','#F97316','#EF4444','#F43F5E','#8B5CF6','#3B82F6','#14B8A6','#22C55E'],
  ['#0EA5E9','#06B6D4','#10B981','#84CC16','#A855F7','#EC4899','#64748B','#0F172A'],
] as const;
const HEADER_GRID = [
  ['#0F172A','#111827','#1E1B4B','#0C4A6E','#052E16','#1C1917','#4A044E','#18181B'],
  ['#1E293B','#1F2937','#312E81','#075985','#14532D','#292524','#701A75','#27272A'],
  ['#334155','#374151','#3730A3','#0369A1','#166534','#44403C','#86198F','#3F3F46'],
] as const;

// ── Invoice numbers ───────────────────────────────────────────────────────────
// The counter only advances when a document is actually downloaded/printed.
// "Locked" = this invoice already consumed its number; re-downloading reuses it.
const locked = ref(false);
let lockedNumber = '';
let autoNumber = '';

function refreshNumber() {
  if (locked.value) return;
  const s = state.value;
  const next = peekNextNumber(prefixFor(s.docType, country.value));
  // Only replace numbers we generated ourselves — never a number the user typed
  if (!s.invoiceNumber || s.invoiceNumber === autoNumber) s.invoiceNumber = next;
  autoNumber = next;
}
// Receipts have no due date. Remember whether we hid it so switching back restores it.
let dueHiddenByReceipt = false;
watch(() => state.value.docType, (t, prev) => {
  const s = state.value;
  const v = s.visible;
  if (t === 'receipt') { dueHiddenByReceipt = v.dueDate; v.dueDate = false; }
  else if (prev === 'receipt' && dueHiddenByReceipt) { v.dueDate = true; dueHiddenByReceipt = false; }
  // A locked INV-0003 switched to a credit note is a NEW document and needs its own CN- number.
  // (Opening a history entry also changes docType, but then the number won't carry the old prefix.)
  const oldPrefix = prev ? prefixFor(prev, country.value) : '';
  if (locked.value && oldPrefix !== prefixFor(t, country.value) && s.invoiceNumber.startsWith(oldPrefix)) {
    locked.value = false;
    s.invoiceNumber = '';
    autoNumber = '';
  }
  refreshNumber();
});
watch(() => state.value.invoiceNumber, (val) => { if (locked.value && val !== lockedNumber) locked.value = false; });

function assignNumber() {
  if (locked.value) return;
  const s = state.value;
  if (!s.invoiceNumber || s.invoiceNumber === autoNumber) {
    const taken = takeNextNumber(numberPrefix.value);
    s.invoiceNumber = taken.number;
    if (!taken.saved) flash('This browser blocked saving your invoice counter, so the next number may repeat. Check it before sending.');
  }
  lockedNumber = s.invoiceNumber;
  locked.value = true;
}

// ── Due date shortcuts ────────────────────────────────────────────────────────
function setTerms(days: number) { state.value.dueDate = addDays(state.value.invoiceDate || localToday(), days); }

// ── Clients ───────────────────────────────────────────────────────────────────
const clients = ref<SavedClient[]>([]);
const clientPick = ref('');
function pickClient(name: string) {
  const c = clients.value.find(x => x.name === name);
  if (!c) return;
  Object.assign(state.value, { clientName: c.name, clientEmail: c.email, clientAddress: c.address, clientTaxId: c.taxId });
  clientPick.value = '';
}
function rememberClient() {
  const s = state.value;
  if (!s.clientName.trim()) return flash('Add a client name first.');
  clients.value = saveClient({ name: s.clientName.trim(), email: s.clientEmail, address: s.clientAddress, taxId: s.clientTaxId });
  flash(`Saved ${s.clientName.trim()} to your clients.`);
}
function forgetClient(name: string) { clients.value = deleteClient(name); }

// ── History ───────────────────────────────────────────────────────────────────
const history = ref<HistoryEntry[]>([]);
const showHistory = ref(false);
function openEntry(h: HistoryEntry, duplicate: boolean) {
  const logo = state.value.businessLogo;
  state.value = { ...defaultInvoiceState(), ...JSON.parse(JSON.stringify(h.state)), businessLogo: logo };
  // The snapshot holds the business/bank details of the day it was issued. A duplicate is a new
  // document, so it takes today's saved details; an opened entry keeps its originals and is
  // never auto-saved back over the profile.
  profileSync = duplicate;
  if (duplicate) {
    applyProfile(businessOnly(loadProfile()));
    locked.value = false;
    state.value.invoiceDate = localToday();
    state.value.dueDate = '';
    state.value.amountPaid = 0;
    state.value.invoiceNumber = '';
    autoNumber = '';
    refreshNumber();
    flash(`Copied ${h.number} into a new ${state.value.docType === 'quote' ? 'quote' : 'invoice'}.`);
  } else {
    lockedNumber = h.number;
    locked.value = true;
    flash(`Opened ${h.number}. Downloading again keeps the same number.`);
  }
  showHistory.value = false;
  activeTab.value = 'form';
}
function removeEntry(id: string) { history.value = deleteHistory(id); }

/** Quote → invoice in one click (keeps items and client). */
function convertToInvoice() {
  profileSync = true;
  locked.value = false;
  state.value.docType = country.value.documentTitle === 'tax-invoice' && state.value.taxes.length ? 'tax-invoice' : 'invoice';
  state.value.invoiceDate = localToday();
  state.value.dueDate = addDays(localToday(), 14);
  state.value.invoiceNumber = '';
  autoNumber = '';
  refreshNumber();
}

function newDocument() {
  const s = state.value;
  locked.value = false;
  Object.assign(s, {
    invoiceNumber: '', invoiceDate: localToday(), dueDate: '', reference: '',
    clientName: '', clientEmail: '', clientAddress: '', clientTaxId: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }], discountValue: 0, shipping: 0, amountPaid: 0, notes: '',
  });
  autoNumber = '';
  refreshNumber();
}

// ── Backup ────────────────────────────────────────────────────────────────────
function downloadBackup() {
  const blob = new Blob([exportAll()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${SITE.storagePrefix}-backup-${localToday()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function restoreBackup(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const res = importAll(await file.text());
  if (!res.ok) return flash(res.error);
  applyProfile(loadProfile());
  clients.value = loadClients();
  history.value = loadHistory();
  refreshNumber();
  flash('Backup restored.');
}

// ── Logo: any image → PNG, max 600px, so PDFs stay small and every format works
function handleLogoUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) return flash('That file isn’t an image.');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    state.value.businessLogo = canvas.toDataURL('image/png');
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); flash('Could not read that image.'); };
  img.src = url;
}
function removeLogo() { state.value.businessLogo = ''; }

// ── Auto-save business profile ───────────────────────────────────────────────
// profileSync: off while viewing an old document from history (its details are historical).
// pageKeep: a country page shows its own country/tax setup without replacing the saved one.
let profileSync = true;
let pageKeep: Profile | null = null;
watch(state, () => {
  if (!ready.value || !profileSync) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const keep = pageKeep && state.value.countryKey === props.countryPreset ? pageKeep : undefined;
    if (saveProfile(state.value, keep, { pro: pro.value })) savedAt.value = Date.now();
    else flash('Couldn’t save to this browser (private mode or storage full). Your invoice still works.');
  }, 700);
}, { deep: true });
const showSaved = computed(() => savedAt.value > 0 && Date.now() - savedAt.value < 2500);

const COUNTRY_FIELDS = ['countryKey', 'currency', 'labelsLang', 'paper', 'taxes', 'taxNote', 'pricesIncludeTax', 'paymentRail'] as const;
function businessOnly(p: Profile): Profile {
  const out: Profile = { ...p };
  for (const k of COUNTRY_FIELDS) delete out[k];
  return out;
}
function countryOnly(p: Profile): Profile {
  const out: Record<string, unknown> = {};
  for (const k of COUNTRY_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  return out as Profile;
}

function applyProfile(p: Profile) {
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && k in state.value) (state.value as unknown as Record<string, unknown>)[k] = v;
  }
}

// ── Download / print ─────────────────────────────────────────────────────────
function track(action: 'download' | 'print') {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.('event', 'generate_invoice', {
    action, country: state.value.countryKey, doc_type: state.value.docType,
    template: state.value.template, currency: state.value.currency,
  });
}

async function output(action: 'download' | 'print') {
  if (busy.value) return;
  // A premium template is previewable for free, but downloading it needs Pro: say so, don't silently swap.
  if (SITE.pro.enabled && isPremium(state.value.template) && !pro.value) {
    flash('Executive and Ledger are Pro templates. Unlock Pro below, or pick Minimal, Modern or Classic.');
    document.getElementById('pro')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  busy.value = true;
  try {
    assignNumber();
    await nextTick();
    if (action === 'download') await generateInvoicePDF(state.value, { pro: pro.value });
    else await printInvoicePDF(state.value, { pro: pro.value });
    history.value = addToHistory(state.value, totals.value.total);
    if (state.value.clientName.trim() && !clients.value.some(c => c.name === state.value.clientName.trim())) {
      clients.value = saveClient({ name: state.value.clientName.trim(), email: state.value.clientEmail, address: state.value.clientAddress, taxId: state.value.clientTaxId });
    }
    track(action);
  } catch (err) {
    console.error(err);
    flash('Something went wrong creating the PDF. Please try again.');
  } finally {
    busy.value = false;
  }
}

// ── Country guess for first-time visitors (no page preset, nothing saved) ──
// A bare language tag ("de") is as strong a signal as "de-DE" -- don't skip it for a later "en-US"
const LANG_COUNTRY: Record<string, string> = { de: 'germany', fr: 'france', es: 'spain', it: 'italy', nl: 'netherlands' };
function guessCountry(): string {
  const byRegion = new Map(COUNTRIES.map(c => [c.locale.split('-')[1], c.key]));
  for (const lang of navigator.languages ?? [navigator.language]) {
    const [base, regionRaw] = lang.split('-');
    const region = regionRaw?.toUpperCase();
    if (region && byRegion.has(region)) return byRegion.get(region)!;
    if (!region && LANG_COUNTRY[base.toLowerCase()]) return LANG_COUNTRY[base.toLowerCase()];
  }
  return 'united-states';
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('click', handleDocClick);
  const profile = loadProfile();
  const preset = props.countryPreset && COUNTRY_BY_KEY[props.countryPreset] ? props.countryPreset : null;
  const target = preset ?? profile.countryKey ?? guessCountry();

  applyCountry(target);
  // Saved settings win — except when a country page asks for a different country
  const sameCountry = !preset || preset === profile.countryKey;
  applyProfile(businessOnly(profile));
  if (sameCountry) applyProfile(countryOnly(profile));
  else if (profile.countryKey) pageKeep = countryOnly(profile); // auto-save keeps the saved country
  if (!availableRails.value.includes(state.value.paymentRail)) state.value.paymentRail = country.value.rails[0];

  if (props.docPreset) state.value.docType = props.docPreset;
  if (props.docPreset === 'receipt') state.value.visible.dueDate = false;
  const urlTemplate = new URLSearchParams(window.location.search).get('template');
  if (urlTemplate === 'classic' || urlTemplate === 'modern' || urlTemplate === 'minimal') state.value.template = urlTemplate;

  clients.value = loadClients();
  history.value = loadHistory();
  refreshNumber();
  nextTick(() => { ready.value = true; });
});

onUnmounted(() => {
  clearTimeout(saveTimer);
  clearTimeout(noticeTimer);
  document.removeEventListener('click', handleDocClick);
});

const correctionHref = computed(() =>
  `mailto:${SITE.email}?subject=${encodeURIComponent(`Correction: ${country.value.name} invoice data`)}`);
</script>

<template>
  <div class="gen-wrap">

    <!-- ── Mobile tab bar ─────────────────────────────────────────────── -->
    <div class="tab-bar" role="tablist" aria-label="Invoice generator views">
      <button id="tab-form" role="tab" aria-controls="panel-form" :aria-selected="activeTab === 'form'"
        :class="['tab-btn', { active: activeTab === 'form' }]" @click="activeTab = 'form'">Form</button>
      <button id="tab-preview" role="tab" aria-controls="panel-preview" :aria-selected="activeTab === 'preview'"
        :class="['tab-btn', { active: activeTab === 'preview' }]" @click="activeTab = 'preview'">Preview</button>
    </div>

    <!-- ══════════════════════════ FORM PANE ══════════════════════════ -->
    <div id="panel-form" :class="['form-pane', { 'pane-active': activeTab === 'form' }]" role="tabpanel" aria-labelledby="tab-form">
      <div class="form-scroll">

        <p v-if="notice" class="notice" role="status">{{ notice }}</p>

        <!-- ── Country + template ─────────────────────────────────── -->
        <div class="top-bar">
          <div class="field field-grow">
            <label class="field-label" for="country-select">Your country</label>
            <select id="country-select" :value="state.countryKey" class="form-select"
              @change="applyCountry(($event.target as HTMLSelectElement).value)">
              <optgroup v-for="[region, list] in regions" :key="region" :label="REGION_NAMES[region]">
                <option v-for="c in list" :key="c.key" :value="c.key">{{ c.name }}</option>
              </optgroup>
              <option value="other">🌍 Other country (set tax yourself)</option>
            </select>
          </div>
          <div class="field">
            <span class="field-label" id="tpl-label">Template</span>
            <div class="template-pills" role="group" aria-labelledby="tpl-label">
              <button v-for="t in templateChoices" :key="t" type="button"
                :class="['tpl-pill', { active: state.template === t }]" :aria-pressed="state.template === t"
                @click="selectTemplate(t)">{{ t[0].toUpperCase() + t.slice(1) }}<span v-if="isPremium(t) && !pro" class="tpl-pro"> Pro</span></button>
            </div>
          </div>
        </div>

        <!-- ── Template colours ───────────────────────────────────── -->
        <div v-if="state.template !== 'minimal'" class="form-card modern-colors-card">
          <h3 class="card-title">Template colours</h3>
          <div v-for="key in (state.template === 'classic' ? ['classicAccent'] : isPremium(state.template) ? ['brandColor'] : ['modernHeader', 'modernAccent']) as ('classicAccent' | 'modernHeader' | 'modernAccent' | 'brandColor')[]"
            :key="key" class="color-row">
            <span class="field-label">{{ key === 'modernHeader' ? 'Header' : key === 'modernAccent' ? 'Accent' : key === 'brandColor' ? 'Brand colour' : 'Total amount' }}</span>
            <div class="color-picker-wrap" @click.stop>
              <button type="button" class="color-trigger" :aria-expanded="activeColorPicker === key" @click="toggleColorPicker(key)">
                <span class="color-preview" :style="{ background: state[key] }"></span>
                <span class="color-hex">{{ state[key] }}</span>
                <span class="color-caret" :class="{ open: activeColorPicker === key }">▾</span>
              </button>
              <div v-if="activeColorPicker === key" class="color-popover">
                <div class="color-grid">
                  <div v-for="(row, ri) in (key === 'modernHeader' ? HEADER_GRID : ACCENT_GRID)" :key="ri" class="color-grid-row">
                    <button v-for="c in row" :key="c" type="button" class="color-cell" :class="{ active: state[key] === c }"
                      :style="{ background: c }" :aria-label="`Colour ${c}`" @click="state[key] = c; activeColorPicker = null" />
                  </div>
                </div>
                <div class="color-popover-footer">
                  <input type="color" v-model="state[key]" class="color-swatch" aria-label="Custom colour" />
                  <span class="color-hex">{{ state[key] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Document ───────────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Document</h3>
            <button v-if="state.docType === 'quote'" type="button" class="link-btn" @click="convertToInvoice">Turn this quote into an invoice</button>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="doc-type">Type</label>
              <select id="doc-type" v-model="state.docType" class="form-select">
                <option v-for="d in DOC_TYPES" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </div>
            <div class="field field-grow">
              <label class="field-label" for="inv-number">Number</label>
              <input id="inv-number" v-model="state.invoiceNumber" class="form-input mono" :placeholder="`${numberPrefix}0001`" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="inv-date">{{ state.docType === 'receipt' ? 'Payment date' : 'Date' }}</label>
              <input id="inv-date" v-model="state.invoiceDate" type="date" class="form-input" />
            </div>
            <div v-if="state.docType !== 'receipt'" class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="inv-due">{{ state.docType === 'quote' ? 'Valid until' : 'Due date' }}</label>
                <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.dueDate }]" :aria-pressed="state.visible.dueDate"
                  @click="state.visible.dueDate = !state.visible.dueDate">{{ state.visible.dueDate ? 'printed' : 'hidden' }}</button>
              </div>
              <input id="inv-due" v-model="state.dueDate" type="date" class="form-input" />
              <div class="chips">
                <button v-for="d in [7, 14, 30]" :key="d" type="button" class="chip" @click="setTerms(d)">{{ d }} days</button>
              </div>
            </div>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="inv-ref">Reference / PO <span class="field-optional">(optional)</span></label>
              <input id="inv-ref" v-model="state.reference" class="form-input" placeholder="PO-4471 or project name" />
            </div>
            <div class="field">
              <label class="field-label" for="inv-currency">Currency</label>
              <select id="inv-currency" v-model="state.currency" class="form-select">
                <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="inv-lang">Invoice language</label>
              <select id="inv-lang" v-model="state.labelsLang" class="form-select">
                <option v-for="l in LABEL_LANGS" :key="l.code" :value="l.code">{{ l.name }}</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="inv-paper">Paper</label>
              <select id="inv-paper" v-model="state.paper" class="form-select">
                <option value="A4">A4</option>
                <option value="Letter">US Letter</option>
              </select>
            </div>
            <div class="field field-grow">
              <label class="field-label" for="inv-title">Custom title <span class="field-optional">(optional)</span></label>
              <input id="inv-title" v-model="state.titleOverride" class="form-input" placeholder="e.g. Statement" maxlength="30" />
            </div>
          </div>
        </div>

        <!-- ── Your business ──────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Your business</h3>
            <span v-if="showSaved" class="saved-badge" role="status">✓ Saved</span>
          </div>
          <p class="card-hint">Saved in this browser only — nothing is uploaded.</p>
          <div class="logo-row">
            <img v-if="state.businessLogo" :src="state.businessLogo" class="logo-thumb" alt="Your logo" />
            <label class="logo-btn">
              {{ state.businessLogo ? 'Change logo' : 'Upload logo' }}
              <input type="file" accept="image/*" hidden @change="handleLogoUpload" />
            </label>
            <button v-if="state.businessLogo" type="button" class="logo-remove-btn" @click="removeLogo">Remove</button>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="biz-name">Business or your name</label>
              <input id="biz-name" v-model="state.businessName" class="form-input" placeholder="Acme Studio Ltd" autocomplete="organization" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="biz-taxid">{{ country.taxIdLabel }} <span class="field-optional">(if registered)</span></label>
              <input id="biz-taxid" v-model="state.businessTaxId" class="form-input mono" />
            </div>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="biz-email">Email</label>
                <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.bizEmail }]" :aria-pressed="state.visible.bizEmail"
                  @click="state.visible.bizEmail = !state.visible.bizEmail">{{ state.visible.bizEmail ? 'printed' : 'hidden' }}</button>
              </div>
              <input id="biz-email" v-model="state.businessEmail" type="email" class="form-input" placeholder="hello@yourco.com" autocomplete="email" />
            </div>
            <div class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="biz-phone">Phone</label>
                <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.bizPhone }]" :aria-pressed="state.visible.bizPhone"
                  @click="state.visible.bizPhone = !state.visible.bizPhone">{{ state.visible.bizPhone ? 'printed' : 'hidden' }}</button>
              </div>
              <input id="biz-phone" v-model="state.businessPhone" class="form-input" autocomplete="tel" />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="biz-address">Address</label>
            <textarea id="biz-address" v-model="state.businessAddress" class="form-input form-textarea" rows="2" placeholder="Street, City, Postcode" />
          </div>
        </div>

        <!-- ── Bill to ────────────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Bill to</h3>
            <select v-if="clients.length" v-model="clientPick" class="form-select client-pick" aria-label="Choose a saved client"
              @change="pickClient(clientPick)">
              <option value="">Saved clients…</option>
              <option v-for="c in clients" :key="c.name" :value="c.name">{{ c.name }}</option>
            </select>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="client-name">Client name</label>
              <input id="client-name" v-model="state.clientName" class="form-input" placeholder="Client or company name" />
            </div>
            <div class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="client-email">Email</label>
                <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.clientEmail }]" :aria-pressed="state.visible.clientEmail"
                  @click="state.visible.clientEmail = !state.visible.clientEmail">{{ state.visible.clientEmail ? 'printed' : 'hidden' }}</button>
              </div>
              <input id="client-email" v-model="state.clientEmail" type="email" class="form-input" placeholder="client@example.com" />
            </div>
          </div>
          <div class="field-row">
            <div class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="client-address">Address</label>
                <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.clientAddress }]" :aria-pressed="state.visible.clientAddress"
                  @click="state.visible.clientAddress = !state.visible.clientAddress">{{ state.visible.clientAddress ? 'printed' : 'hidden' }}</button>
              </div>
              <textarea id="client-address" v-model="state.clientAddress" class="form-input form-textarea" rows="2" />
            </div>
            <div class="field">
              <label class="field-label" for="client-taxid">Client {{ country.taxIdLabel }}</label>
              <input id="client-taxid" v-model="state.clientTaxId" class="form-input mono" />
            </div>
          </div>
          <div class="row-actions">
            <button type="button" class="link-btn" @click="rememberClient">Save this client</button>
            <button v-if="clients.some(c => c.name === state.clientName.trim())" type="button" class="link-btn link-danger"
              @click="forgetClient(state.clientName.trim())">Forget</button>
          </div>
        </div>

        <!-- ── Line items ─────────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Items</h3>
            <div class="item-label-row">
              <label class="field-label" for="item-label" style="white-space:nowrap">Column name:</label>
              <input id="item-label" v-model="state.itemLabel" class="form-input item-label-input" placeholder="Description" maxlength="24" />
            </div>
          </div>
          <div class="items-header" aria-hidden="true">
            <span class="ih-desc">{{ state.itemLabel || 'Description' }}</span>
            <span class="ih-num">Qty</span>
            <span class="ih-num">Price</span>
            <span class="ih-num">Amount</span>
            <span class="ih-del"></span>
          </div>
          <div v-for="(item, i) in state.items" :key="i" class="item-row">
            <input v-model="item.description" class="form-input item-desc" :placeholder="state.itemLabel || 'Description'" :aria-label="`Item ${i + 1} description`" />
            <input v-model.number="item.quantity" type="number" min="0" step="any" inputmode="decimal" class="form-input item-num" :aria-label="`Item ${i + 1} quantity`" />
            <input v-model.number="item.unitPrice" type="number" min="0" step="any" inputmode="decimal" class="form-input item-num mono" :aria-label="`Item ${i + 1} price`" />
            <span class="item-amount mono">{{ itemAmount(i) }}</span>
            <button type="button" class="item-del-btn" :disabled="state.items.length <= 1" :aria-label="`Remove item ${i + 1}`" @click="removeItem(i)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
          <button type="button" class="add-row-btn" @click="addItem">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            Add item
          </button>
        </div>

        <!-- ── Tax & totals ───────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">{{ country.taxName === 'Tax' ? 'Tax' : country.taxName }} &amp; totals</h3>
            <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.tax }]" :aria-pressed="state.visible.tax"
              @click="state.visible.tax = !state.visible.tax">{{ state.visible.tax ? 'printed' : 'hidden' }}</button>
          </div>
          <div class="field">
            <label class="field-label" for="tax-preset">Tax setup for {{ country.name }}</label>
            <select id="tax-preset" v-model="presetChoice" class="form-select">
              <option v-for="(p, i) in country.taxPresets" :key="i" :value="String(i)">{{ p.label }}</option>
              <option value="none">No tax</option>
              <option value="custom" disabled>Custom (edited below)</option>
            </select>
          </div>
          <div v-for="(t, i) in state.taxes" :key="i" class="tax-row">
            <input v-model="t.label" class="form-input" :aria-label="`Tax ${i + 1} name`" maxlength="24" />
            <div class="rate-wrap">
              <input v-model.number="t.rate" type="number" min="0" max="99" step="any" class="form-input" :aria-label="`Tax ${i + 1} rate`" />
              <span>%</span>
            </div>
            <select v-model="t.kind" class="form-select" :aria-label="`Tax ${i + 1} type`">
              <option value="add">added</option>
              <option value="withhold">withheld (−)</option>
            </select>
            <button type="button" class="item-del-btn" :aria-label="`Remove tax ${i + 1}`" @click="removeTaxLine(i)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="row-actions">
            <button type="button" class="link-btn" @click="addTaxLine">+ Add tax line</button>
            <label class="check"><input v-model="state.pricesIncludeTax" type="checkbox" /> Prices already include tax</label>
          </div>
          <p v-if="!state.visible.tax && state.taxes.some(t => t.rate > 0)" class="vis-tax-warn">
            Tax hidden — the client sees a lower total. Only do this if you are not registered.
          </p>
          <div class="field">
            <label class="field-label" for="tax-note">Tax note printed on the invoice <span class="field-optional">(exemptions, reverse charge)</span></label>
            <input id="tax-note" v-model="state.taxNote" class="form-input" placeholder="e.g. Reverse charge — Article 196, Directive 2006/112/EC" />
          </div>

          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="discount">Discount</label>
              <div class="combo">
                <input id="discount" v-model.number="state.discountValue" type="number" min="0" step="any" class="form-input" />
                <select v-model="state.discountType" class="form-select" aria-label="Discount type">
                  <option value="percent">%</option>
                  <option value="amount">{{ state.currency }}</option>
                </select>
              </div>
            </div>
            <div class="field field-grow">
              <label class="field-label" for="shipping">Shipping</label>
              <input id="shipping" v-model.number="state.shipping" type="number" min="0" step="any" class="form-input" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="paid">Amount paid</label>
              <input id="paid" v-model.number="state.amountPaid" type="number" min="0" step="any" class="form-input" />
            </div>
          </div>

          <dl class="summary">
            <div v-if="totals.addedTax"><dt>Tax</dt><dd class="mono">{{ money(totals.addedTax) }}</dd></div>
            <div v-if="totals.withheld"><dt>Withheld</dt><dd class="mono">−{{ money(totals.withheld) }}</dd></div>
            <div class="summary-total"><dt>{{ totals.amountPaid ? 'Balance due' : 'Total' }}</dt><dd class="mono">{{ money(totals.balanceDue) }}</dd></div>
          </dl>
          <div class="data-note">
            <p v-if="country.key !== 'other'" class="stamp stamp-sm">
              <span class="stamp-top">{{ country.name }} rules</span>
              <span class="stamp-main">Checked {{ checkedMonth(country.lastVerified) }}</span>
            </p>
            <p>
              <a v-if="country.key !== 'other'" :href="countryPath(country)">Invoice rules for {{ country.name }}</a><template v-if="country.key !== 'other'">. </template>
              <a :href="correctionHref">Something wrong? Tell us</a>.
            </p>
          </div>
        </div>

        <!-- ── Payment ────────────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">How to pay you</h3>
            <button type="button" :class="['vis-toggle', { 'vis-off': !state.visible.payment }]" :aria-pressed="state.visible.payment"
              @click="state.visible.payment = !state.visible.payment">{{ state.visible.payment ? 'printed' : 'hidden' }}</button>
          </div>
          <div class="payment-toggle" role="group" aria-label="Payment method">
            <button v-for="r in availableRails" :key="r" type="button" :class="['pay-btn', { active: state.paymentRail === r }]"
              :aria-pressed="state.paymentRail === r" @click="state.paymentRail = r">{{ railName(r) }}</button>
          </div>

          <template v-if="state.paymentRail === 'bank'">
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="bank-name">Bank name</label>
                <input id="bank-name" v-model="state.bankName" class="form-input" /></div>
              <div class="field field-grow"><label class="field-label" for="acct-name">Account name</label>
                <input id="acct-name" v-model="state.accountName" class="form-input" /></div>
            </div>
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="acct-number">Account number</label>
                <input id="acct-number" v-model="state.accountNumber" class="form-input mono" /></div>
              <div class="field"><label class="field-label" for="bank-code">{{ country.bankCodeLabel ?? 'Bank / branch code' }}</label>
                <input id="bank-code" v-model="state.bankCode" class="form-input mono" /></div>
              <div class="field"><label class="field-label" for="swift">SWIFT / BIC <span class="field-optional">(international)</span></label>
                <input id="swift" v-model="state.swiftCode" class="form-input mono" /></div>
            </div>
          </template>

          <template v-if="state.paymentRail === 'iban'">
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="iban-name">Account holder</label>
                <input id="iban-name" v-model="state.accountName" class="form-input" /></div>
              <div class="field field-grow"><label class="field-label" for="iban-bank">Bank <span class="field-optional">(optional)</span></label>
                <input id="iban-bank" v-model="state.bankName" class="form-input" /></div>
            </div>
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="iban">IBAN</label>
                <input id="iban" v-model="state.iban" class="form-input mono" placeholder="DE89 3704 0044 0532 0130 00" /></div>
              <div class="field"><label class="field-label" for="bic">BIC</label>
                <input id="bic" v-model="state.bic" class="form-input mono" /></div>
            </div>
          </template>

          <template v-if="state.paymentRail === 'mobile-money'">
            <div class="field">
              <label class="field-label" for="momo-provider">Provider</label>
              <select v-if="providers.length" id="momo-provider" v-model="state.momoProvider" class="form-select">
                <option v-for="p in providers" :key="p.name" :value="p.name">{{ p.name }}</option>
              </select>
              <input v-else id="momo-provider" v-model="state.momoProvider" class="form-input" placeholder="e.g. M-Pesa, GCash, Venmo" />
            </div>
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="momo-name">Account name</label>
                <input id="momo-name" v-model="state.momoName" class="form-input" /></div>
              <div class="field field-grow"><label class="field-label" for="momo-number">{{ selectedProvider?.accountLabel ?? 'Number / handle' }}</label>
                <input id="momo-number" v-model="state.momoNumber" class="form-input mono" :placeholder="selectedProvider?.accountFormat ?? ''" /></div>
            </div>
          </template>

          <template v-if="state.paymentRail === 'upi'">
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="upi">UPI ID</label>
                <input id="upi" v-model="state.upiId" class="form-input mono" placeholder="name@okicici" /></div>
              <div class="field field-grow"><label class="field-label" for="upi-name">Payee name</label>
                <input id="upi-name" v-model="state.accountName" class="form-input" /></div>
            </div>
            <div class="field-row">
              <div class="field field-grow"><label class="field-label" for="upi-acct">Account number <span class="field-optional">(for NEFT/RTGS)</span></label>
                <input id="upi-acct" v-model="state.accountNumber" class="form-input mono" /></div>
              <div class="field"><label class="field-label" for="upi-ifsc">IFSC</label>
                <input id="upi-ifsc" v-model="state.bankCode" class="form-input mono" /></div>
            </div>
          </template>

          <div class="field">
            <label class="field-label" for="pay-link">Online payment link <span class="field-optional">(PayPal.me, Stripe, Wise…)</span></label>
            <input id="pay-link" v-model="state.paymentLink" type="url" class="form-input" placeholder="https://paypal.me/yourname" />
          </div>
          <label class="check"><input v-model="state.visible.qr" type="checkbox" /> Print a payment QR code</label>
          <p v-if="state.visible.qr" class="card-hint">{{ qrStatus }}</p>
        </div>

        <!-- ── Notes + footer ─────────────────────────────────────── -->
        <div class="form-card">
          <h3 class="card-title"><label for="notes">Notes <span class="field-optional">(optional)</span></label></h3>
          <textarea id="notes" v-model="state.notes" class="form-input form-textarea" rows="3" placeholder="Payment terms, thank-you note, late-fee policy…" />
          <label class="field-label" for="footer-note">Footer line <span class="field-optional">(optional)</span></label>
          <input id="footer-note" v-model="state.footerNote" class="form-input" placeholder="e.g. Registered in England No. 01234567" />
        </div>

        <!-- ── Actions ────────────────────────────────────────────── -->
        <div class="form-card download-card">
          <div class="dl-row">
            <button type="button" class="download-btn" :disabled="busy" @click="output('download')">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2v9m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
              {{ busy ? 'Creating PDF…' : 'Download PDF' }}
            </button>
            <button type="button" class="print-btn" :disabled="busy" @click="output('print')">Print</button>
          </div>
          <p class="download-hint">Free, and nothing you type leaves this browser.</p>
          <div class="row-actions row-actions-center">
            <button type="button" class="link-btn" @click="newDocument">New document</button>
            <button type="button" class="link-btn" :aria-expanded="showHistory" @click="showHistory = !showHistory">
              History ({{ history.length }})
            </button>
          </div>
          <ProPanel v-if="SITE.pro.enabled" />
          <div v-if="showHistory" class="history">
            <p v-if="!history.length" class="card-hint">Documents you download appear here, saved in this browser.</p>
            <ul v-else>
              <li v-for="h in history" :key="h.id">
                <span class="history-main"><strong class="mono">{{ h.number }}</strong> {{ h.clientName || '—' }}</span>
                <span class="history-meta mono">{{ formatMoney(h.total, h.currency, country.locale) }}, {{ h.savedAt.slice(0, 10) }}</span>
                <span class="history-actions">
                  <button type="button" class="link-btn" @click="openEntry(h, false)">Open</button>
                  <button type="button" class="link-btn" @click="openEntry(h, true)">Duplicate</button>
                  <button type="button" class="link-btn link-danger" :aria-label="`Delete ${h.number}`" @click="removeEntry(h.id)">×</button>
                </span>
              </li>
            </ul>
            <div class="row-actions">
              <button type="button" class="link-btn" @click="downloadBackup">Export backup</button>
              <label class="link-btn">Import backup<input type="file" accept="application/json,.json" hidden @change="restoreBackup" /></label>
            </div>
            <p class="card-hint">Everything is stored in this browser only. Export a backup to move it to another device.</p>
          </div>
        </div>

      </div>
    </div>

    <!-- ═════════════════════════ PREVIEW PANE ═════════════════════════ -->
    <div id="panel-preview" :class="['preview-pane', { 'pane-active': activeTab === 'preview' }]" role="tabpanel" aria-labelledby="tab-preview">
      <InvoicePreview :state="state" :pro="pro" />
    </div>

  </div>
</template>

<style scoped>
/* ── Outer shell ─────────────────────────────────────────────────────────── */
.gen-wrap {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 640px;
}

/* ── Tab bar (mobile only) ───────────────────────────────────────────────── */
.tab-bar {
  display: none;
  width: 100%;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: var(--font);
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 150ms;
}
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-btn:hover:not(.active) { color: var(--text); background: var(--surface-2); }

/* ── Panes ───────────────────────────────────────────────────────────────── */
.form-pane {
  width: 55%;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.preview-pane {
  width: 45%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Mobile: hide both panes, show only active */
@media (max-width: 720px) {
  .gen-wrap    { flex-direction: column; }
  .tab-bar     { display: flex; }
  .form-pane,
  .preview-pane {
    display: none;
    width: 100%;
    flex: 1;
  }
  .pane-active { display: flex; }

  /* Prevent any horizontal bleed */
  .form-scroll { overflow-x: hidden; padding: 1rem 0.875rem 2rem; }

  /* Stack ALL field-row pairs on mobile */
  .field-row > .field,
  .field-row > .field-grow { flex: 1 1 100%; }

  /* Exception: tight tax row keeps rate narrow beside label */
  .field-row-tight > .field-grow { flex: 1; }
  .field-row-tight > .field-xs   { flex: 0 0 72px; }

  /* Line items: drop the Amount column (visible in Preview tab) */
  .items-header,
  .item-row {
    grid-template-columns: 1fr 44px 80px 26px;
  }
  /* Hide Amount header (4th child) and amount display */
  .ih-num:nth-child(4),
  .item-amount { display: none; }

  /* Payment toggle: stretch full width, prevent "Mobile Money" wrapping */
  .payment-toggle { align-self: stretch; }
  .pay-btn        { flex: 1; white-space: nowrap; }

  /* Template pills: ensure they wrap rather than overflow */
  .template-pills { flex-wrap: wrap; }
  .top-bar        { gap: 0.5rem; }
  .top-bar > .field-grow { flex: 1 1 100%; }
}

/* ── Form scroll area ────────────────────────────────────────────────────── */
.form-scroll {
  padding: 1.25rem 1.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

/* ── Top bar (country + template) ────────────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ── Form card ───────────────────────────────────────────────────────────── */
.form-card {
  background: var(--card-fill);
  border: none;
  border-radius: var(--radius);
  padding: 1rem 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
  margin: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-hint {
  font-size: 0.75rem;
  color: var(--text-4);
  margin: -0.375rem 0 0;
}

/* ── Fields ──────────────────────────────────────────────────────────────── */
.field {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  min-width: 0;   /* allow flex children to shrink below content size */
}
.field-grow { flex: 1; }
.field-xs   { flex: 0 0 72px; }

.field-row {
  display: flex;
  gap: 0.625rem;
  flex-wrap: wrap;
}
.field-row-tight { gap: 0.5rem; }

.field-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-2);
}
.field-optional {
  font-weight: 400;
  color: var(--text-4);
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */
.form-input {
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8125rem;
  font-family: var(--font);
  color: var(--text);
  background: var(--surface);
  transition: border-color 150ms, box-shadow 150ms;
  outline: none;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.form-select {
  width: 100%;
  padding: 0.4375rem 1.75rem 0.4375rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8125rem;
  font-family: var(--font);
  color: var(--text);
  background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 0.625rem center;
  appearance: none;
  outline: none;
  cursor: pointer;
  transition: border-color 150ms;
}
.form-select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.form-textarea { resize: vertical; min-height: 56px; }
.mono { font-family: var(--font); font-variant-numeric: tabular-nums; font-size: 0.75rem; }

/* ── Template pills ──────────────────────────────────────────────────────── */
.template-pills {
  display: flex;
  gap: 0.375rem;
}
.tpl-pill {
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  transition: all 150ms;
}
.tpl-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.tpl-pill.tpl-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Saved badge ─────────────────────────────────────────────────────────── */
.saved-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--success);
  animation: fadeInOut 1.8s ease forwards;
}
@keyframes fadeInOut {
  0%   { opacity: 0; transform: translateY(2px); }
  15%  { opacity: 1; transform: translateY(0); }
  70%  { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Logo upload ─────────────────────────────────────────────────────────── */
.logo-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.logo-thumb {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.logo-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  border: 1px dashed var(--border);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
  background: var(--surface-2);
  cursor: pointer;
  transition: all 150ms;
  font-family: var(--font);
}
.logo-btn:hover { border-color: var(--accent); color: var(--accent); }
.logo-remove-btn {
  font-size: 0.75rem;
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0.25rem;
  font-family: var(--font);
  transition: color 150ms;
}
.logo-remove-btn:hover { color: var(--error); }

/* ── Line items ──────────────────────────────────────────────────────────── */
.item-label-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.item-label-input {
  width: 120px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.items-header {
  display: grid;
  grid-template-columns: 1fr 52px 88px 80px 28px;
  gap: 0.375rem;
  padding: 0 0 0.375rem;
  border-bottom: 1px solid var(--border);
}
.ih-desc { font-size: 0.8125rem; font-weight: 600; color: var(--text-2); }
.ih-num  { font-size: 0.8125rem; font-weight: 600; color: var(--text-2); text-align: right; }
.ih-del  { /* spacer for delete col */ }

.item-row {
  display: grid;
  grid-template-columns: 1fr 52px 88px 80px 28px;
  gap: 0.375rem;
  align-items: center;
}
.item-desc { /* flex-grow handled by grid */ }
.item-num  { text-align: right; min-width: 0; }
.item-amount {
  text-align: right;
  font-size: 0.75rem;
  color: var(--text-2);
  white-space: nowrap;
  padding-right: 0.25rem;
}

.item-del-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  border: none;
  background: none;
  color: var(--text-4);
  cursor: pointer;
  transition: all 150ms;
  flex-shrink: 0;
}
.item-del-btn:hover:not(:disabled) { background: var(--error-dim); color: var(--error); }
.item-del-btn:disabled { opacity: 0.25; cursor: not-allowed; }

.add-row-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  background: none;
  border: 1px dashed var(--accent);
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font);
  transition: all 150ms;
  align-self: flex-start;
  margin-top: 0.25rem;
}
.add-row-btn:hover { background: var(--accent-subtle); }

/* ── Payment toggle ──────────────────────────────────────────────────────── */
.payment-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  align-self: flex-start;
}
.pay-btn {
  padding: 0.4375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 600;
  font-family: var(--font);
  background: var(--surface-2);
  color: var(--text-3);
  border: none;
  cursor: pointer;
  transition: all 150ms;
}
.pay-btn:first-child { border-right: 1px solid var(--border); }
.pay-btn.active { background: var(--accent); color: var(--on-accent); }
.pay-btn:not(.active):hover { background: var(--surface-3); color: var(--text); }

/* ── Visibility toggle — "on invoice" / "hidden" pill ───────────────────── */
.label-with-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.vis-toggle {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-family: var(--font);
  line-height: 1.4;
  flex-shrink: 0;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.vis-toggle:hover { text-decoration-style: solid; }
.vis-toggle.vis-off { color: var(--text-4); }

/* ── Tax hidden warning ──────────────────────────────────────────────────── */
.vis-tax-warn {
  font-size: 0.6875rem;
  color: var(--text);
  background: var(--accent-subtle);
  border: 1px solid var(--accent-dim);
  border-radius: 5px;
  padding: 0.375rem 0.625rem;
  margin: 0;
  line-height: 1.5;
}

/* ── Correction link ─────────────────────────────────────────────────────── */
.correction-link {
  font-size: 0.6875rem;
  color: var(--text-4);
  text-decoration: none;
  transition: color 150ms;
  align-self: flex-start;
}
.correction-link:hover { color: var(--accent); }

/* ── Download card ───────────────────────────────────────────────────────── */
.download-card {
  align-items: center;
  background: transparent;
  border: none;
  padding: 0.5rem 0;
  gap: 0.5rem;
}

.dl-row {
  display: flex;
  gap: 0.625rem;
  width: 100%;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: var(--font);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms, transform 100ms;
  flex: 1;
  justify-content: center;
  letter-spacing: -0.01em;
}
.download-btn:hover  { background: var(--accent-hover); }
.download-btn:active { transform: scale(0.99); }

.print-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.875rem 1.25rem;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: var(--font);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms, color 150ms, transform 100ms;
  white-space: nowrap;
}
.print-btn:hover  { background: var(--surface-3); color: var(--text); }
.print-btn:active { transform: scale(0.99); }

.download-hint {
  font-size: 0.6875rem;
  color: var(--text-4);
  text-align: center;
  margin: 0;
}

/* ── Colour pickers ──────────────────────────────────────────────────────── */
.modern-colors-card { gap: 0.625rem; }

/* Column: label above, trigger below — left-aligned like all other fields */
.color-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
}

/* Trigger button — shows current colour + hex + caret */
.color-picker-wrap { position: relative; }

.color-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3125rem 0.625rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font);
  transition: border-color 150ms;
  outline: none;
  align-self: flex-start;
}
.color-trigger:hover { border-color: var(--accent); }

.color-preview {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.15);
  flex-shrink: 0;
}

.color-hex {
  font-family: var(--font); font-variant-numeric: tabular-nums;
  font-size: 0.6875rem;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.color-caret {
  font-size: 0.625rem;
  color: var(--text-4);
  transition: transform 150ms;
  line-height: 1;
}
.color-caret.open { transform: rotate(180deg); }

/* Floating popover */
.color-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.625rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

/* Grid inside the popover */
.color-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.color-grid-row {
  display: flex;
  gap: 3px;
}

.color-cell {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: transform 80ms ease, box-shadow 80ms ease;
  outline: none;
}
.color-cell:hover {
  transform: scale(1.3);
  z-index: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.color-cell.active {
  box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--text);
  transform: scale(1.1);
  z-index: 1;
}

/* Footer: native colour picker + hex + optional reset */
.color-popover-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.375rem;
  border-top: 1px solid var(--border);
}

.color-swatch {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  padding: 0;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
}
.color-swatch::-webkit-color-swatch-wrapper { padding: 0; border-radius: 3px; }
.color-swatch::-webkit-color-swatch { border: none; border-radius: 3px; }

.color-reset-btn {
  margin-left: auto;
  padding: 0.25rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: var(--font);
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  transition: all 150ms;
  white-space: nowrap;
}
.color-reset-btn:hover { color: var(--accent); border-color: var(--accent); }

/* ── v2 controls ─────────────────────────────────────────────────────────── */
.notice {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--text);
  color: var(--bg);
  font-size: 0.8125rem;
  padding: 0.625rem 0.875rem;
  border-radius: var(--radius-sm);
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
  transition: text-decoration-color var(--ease);
}
.link-btn:hover { text-decoration-color: currentColor; }
.link-danger { color: var(--text-3); }
.link-danger:hover { color: var(--error); }

.row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.25rem; }
.row-actions-center { justify-content: center; margin-top: 0.75rem; }

.chips { display: flex; gap: 0.375rem; margin-top: 0.375rem; }
.chip {
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
}
.chip:hover { border-color: var(--accent); color: var(--accent); }

.check { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8125rem; color: var(--text-2); cursor: pointer; }
.check input { accent-color: var(--accent); width: 15px; height: 15px; }

.client-pick { max-width: 12rem; padding-top: 0.3rem; padding-bottom: 0.3rem; font-size: 0.8125rem; }

.tax-row {
  display: grid;
  grid-template-columns: 1fr 86px 128px 28px;
  gap: 0.5rem;
  align-items: center;
}
.rate-wrap { position: relative; }
.rate-wrap input { padding-right: 1.5rem; }
.rate-wrap span { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); font-size: 0.8125rem; color: var(--text-3); pointer-events: none; }

.combo { display: grid; grid-template-columns: 1fr 76px; gap: 0.375rem; }

.summary {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 0.875rem;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
}
.summary div { display: flex; justify-content: space-between; color: var(--text-2); }
.summary .summary-total { color: var(--text); font-weight: 700; font-size: 0.9375rem; }
.summary dd { margin: 0; }

.data-note { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; font-size: 0.75rem; color: var(--text-3); line-height: 1.5; }
.data-note p { color: var(--text-3); font-size: 0.75rem; line-height: 1.5; }
.data-note .stamp { margin: 0.25rem 0 0.25rem 0.125rem; }
.data-note a { color: var(--accent); }

.history ul { list-style: none; display: flex; flex-direction: column; gap: 0.25rem; margin: 0.5rem 0 0.75rem; max-height: 260px; overflow-y: auto; }
.history li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.125rem 0.75rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
}
.history-main { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-meta { color: var(--text-3); grid-column: 1; }
.history-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: 0.625rem; align-items: center; }

.download-btn:disabled, .print-btn:disabled { opacity: 0.6; cursor: progress; }

@media (max-width: 520px) {
  .tax-row { grid-template-columns: 1fr 72px 28px; }
  .tax-row select { grid-column: 1 / span 2; }
}

.tpl-pro {
  font-size: 0.625rem;
  font-weight: 700;
  vertical-align: 1px;
  opacity: 0.75;
}
</style>

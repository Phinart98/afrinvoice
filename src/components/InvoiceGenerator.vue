<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { DEFAULT_INVOICE_STATE } from '../types/invoice';
import type { InvoiceState } from '../types/invoice';
import { COUNTRY_CONFIGS, TIER_1_KEYS, TIER_2_KEYS } from '../data/countryConfigs';
import { loadBusiness, saveBusiness } from '../utils/invoiceStorage';
import { generateInvoicePDF } from '../utils/invoicePDF';
import InvoicePreview from './InvoicePreview.vue';

// ── Props ─────────────────────────────────────────────────────────────────────
const props = defineProps<{ countryPreset?: string }>();

// ── Core state ────────────────────────────────────────────────────────────────
const state = ref<InvoiceState>({
  ...DEFAULT_INVOICE_STATE,
  items:   [{ description: '', quantity: 1, unitPrice: 0 }],
  visible: { ...DEFAULT_INVOICE_STATE.visible },   // deep-copy to avoid mutating the module-level default
});
const activeTab          = ref<'form' | 'preview'>('form');
const showSaved          = ref(false);
const activeColorPicker  = ref<'classicAccent' | 'modernHeader' | 'modernAccent' | null>(null);
let   saveTimer: ReturnType<typeof setTimeout>;

function selectTemplate(name: InvoiceState['template']) {
  state.value.template = name;
  activeColorPicker.value = null;
}
function toggleColorPicker(name: typeof activeColorPicker.value) {
  activeColorPicker.value = activeColorPicker.value === name ? null : name;
}
function handleDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.color-picker-wrap')) {
    activeColorPicker.value = null;
  }
}

// ── Country ───────────────────────────────────────────────────────────────────
const currentConfig = computed(() => COUNTRY_CONFIGS[state.value.countryKey] ?? COUNTRY_CONFIGS['ghana']);

function applyCountry(key: string) {
  const cfg = COUNTRY_CONFIGS[key];
  if (!cfg) return;

  state.value.countryKey     = key;
  state.value.currency       = cfg.currency;
  state.value.currencySymbol = cfg.currencySymbol;
  state.value.taxLabel       = cfg.vatLabel;
  state.value.taxRate        = cfg.vatRate;
  state.value.paymentType    = cfg.defaultPaymentType;
  state.value.momoProvider   = cfg.mobileProviders[0]?.name ?? '';

  // Refresh invoice number prefix (no counter increment — preview only)
  const stored = loadBusiness();
  const next   = (stored.invoiceCounter ?? 0) + 1;
  state.value.invoiceNumber = `${cfg.invoicePrefix}${String(next).padStart(4, '0')}`;
}

// ── Mobile provider meta (for label / placeholder) ────────────────────────────
const selectedProvider = computed(() =>
  currentConfig.value.mobileProviders.find(p => p.name === state.value.momoProvider)
);
const momoAccountLabel  = computed(() => selectedProvider.value?.accountLabel  ?? 'Account Number');
const momoAccountFormat = computed(() => selectedProvider.value?.accountFormat ?? '');
const phonePlaceholder  = computed(() => currentConfig.value.mobileProviders[0]?.accountFormat ?? 'Phone number');
const invoiceNumPlaceholder = computed(() => `${currentConfig.value.invoicePrefix}0001`);

// ── Colour grids — columns = hue families, rows = dark→light ─────────────────
// Accent grid: warm/vibrant tones for total-amount highlight & modern accent
const ACCENT_GRID = [
  ['#92400E','#9A3412','#991B1B','#9F1239','#5B21B6','#1E3A8A','#134E4A','#14532D'],
  ['#B45309','#C2410C','#B91C1C','#BE123C','#6D28D9','#1D4ED8','#0F766E','#15803D'],
  ['#F59E0B','#F97316','#EF4444','#F43F5E','#8B5CF6','#3B82F6','#14B8A6','#22C55E'],
  ['#FCD34D','#FB923C','#FCA5A5','#FDA4AF','#C4B5FD','#93C5FD','#99F6E4','#86EFAC'],
  ['#FEF3C7','#FFEDD5','#FEE2E2','#FFE4E6','#EDE9FE','#DBEAFE','#CCFBF1','#DCFCE7'],
] as const;

// Header grid: dark professional tones for the Modern header band
const HEADER_GRID = [
  ['#0F172A','#111827','#1E1B4B','#0C4A6E','#052E16','#1C1917','#4A044E','#18181B'],
  ['#1E293B','#1F2937','#312E81','#075985','#14532D','#292524','#701A75','#27272A'],
  ['#334155','#374151','#3730A3','#0369A1','#166534','#44403C','#86198F','#3F3F46'],
  ['#475569','#4B5563','#4F46E5','#0284C7','#15803D','#78716C','#A21CAF','#52525B'],
  ['#64748B','#6B7280','#6366F1','#0EA5E9','#16A34A','#A8A29E','#C026D3','#71717A'],
] as const;

// ── Line items ────────────────────────────────────────────────────────────────
function addItem() {
  state.value.items.push({ description: '', quantity: 1, unitPrice: 0 });
}
function removeItem(i: number) {
  if (state.value.items.length <= 1) return;
  state.value.items.splice(i, 1);
}
function itemAmount(i: number): string {
  const item = state.value.items[i];
  const amt  = item.quantity * item.unitPrice;
  return `${state.value.currencySymbol} ${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Business persistence ──────────────────────────────────────────────────────
function saveBusinessFields() {
  saveBusiness({
    businessName:    state.value.businessName,
    businessEmail:   state.value.businessEmail,
    businessPhone:   state.value.businessPhone,
    businessAddress: state.value.businessAddress,
    businessLogo:    state.value.businessLogo,
    bankName:        state.value.bankName,
    accountNumber:   state.value.accountNumber,
    accountName:     state.value.accountName,
    swiftCode:       state.value.swiftCode,
    momoNumber:      state.value.momoNumber,
    momoName:        state.value.momoName,
  });
  showSaved.value = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { showSaved.value = false; }, 1800);
}

// ── Logo upload ───────────────────────────────────────────────────────────────
function handleLogoUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.value.businessLogo = reader.result as string;
    saveBusiness({ businessLogo: state.value.businessLogo });
  };
  reader.readAsDataURL(file);
}
function removeLogo() {
  state.value.businessLogo = '';
  saveBusiness({ businessLogo: '' });
}

// ── Download ──────────────────────────────────────────────────────────────────
function handleDownload() {
  // Assign real invoice number (increments counter)
  const stored  = loadBusiness();
  const counter = (stored.invoiceCounter ?? 0) + 1;
  saveBusiness({ invoiceCounter: counter });
  const prefix  = currentConfig.value.invoicePrefix;
  state.value.invoiceNumber = `${prefix}${String(counter).padStart(4, '0')}`;

  generateInvoicePDF({ ...state.value });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('click', handleDocClick);
  const s = loadBusiness();

  if (s.businessName)    state.value.businessName    = s.businessName;
  if (s.businessEmail)   state.value.businessEmail   = s.businessEmail;
  if (s.businessPhone)   state.value.businessPhone   = s.businessPhone;
  if (s.businessAddress) state.value.businessAddress = s.businessAddress;
  if (s.businessLogo)    state.value.businessLogo    = s.businessLogo;
  if (s.bankName)        state.value.bankName        = s.bankName;
  if (s.accountNumber)   state.value.accountNumber   = s.accountNumber;
  if (s.accountName)     state.value.accountName     = s.accountName;
  if (s.swiftCode)       state.value.swiftCode       = s.swiftCode;
  if (s.momoNumber)      state.value.momoNumber      = s.momoNumber;
  if (s.momoName)        state.value.momoName        = s.momoName;

  // Apply ?template= URL param (used by the /invoice-templates/ gallery links)
  const urlTemplate = new URLSearchParams(window.location.search).get('template');
  if (urlTemplate === 'classic' || urlTemplate === 'modern' || urlTemplate === 'minimal') {
    state.value.template = urlTemplate;
  }

  // Always sync tax/currency/payment to the live countryConfig (catches any
  // rate changes in countryConfigs.ts that the hardcoded DEFAULT_INVOICE_STATE
  // might not yet reflect). Page-level countryPreset takes precedence.
  const countryToApply = (props.countryPreset && COUNTRY_CONFIGS[props.countryPreset])
    ? props.countryPreset
    : state.value.countryKey;
  applyCountry(countryToApply);

  // Set preview invoice number (no counter increment)
  const next = (s.invoiceCounter ?? 0) + 1;
  state.value.invoiceNumber = `${currentConfig.value.invoicePrefix}${String(next).padStart(4, '0')}`;
});

onUnmounted(() => { clearTimeout(saveTimer); document.removeEventListener('click', handleDocClick); });
</script>

<template>
  <div class="gen-wrap">

    <!-- ── Mobile tab bar ───────────────────────────────────────────────── -->
    <div class="tab-bar" role="tablist" aria-label="Invoice generator views">
      <button
        id="tab-form"
        role="tab"
        aria-controls="panel-form"
        :aria-selected="activeTab === 'form'"
        :class="['tab-btn', { active: activeTab === 'form' }]"
        @click="activeTab = 'form'"
      >Form</button>
      <button
        id="tab-preview"
        role="tab"
        aria-controls="panel-preview"
        :aria-selected="activeTab === 'preview'"
        :class="['tab-btn', { active: activeTab === 'preview' }]"
        @click="activeTab = 'preview'"
      >Preview</button>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════ -->
    <!-- FORM PANE                                                         -->
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <div id="panel-form" :class="['form-pane', { 'pane-active': activeTab === 'form' }]" role="tabpanel" aria-labelledby="tab-form">
      <div class="form-scroll">

        <!-- ── Country + Template ────────────────────────────────────── -->
        <div class="top-bar">
          <div class="field field-grow">
            <label class="field-label" for="country-select">Country</label>
            <select
              id="country-select"
              :value="state.countryKey"
              class="form-select"
              @change="applyCountry(($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="Featured countries">
                <option v-for="k in TIER_1_KEYS" :key="k" :value="k">
                  {{ COUNTRY_CONFIGS[k].name }}
                </option>
              </optgroup>
              <optgroup label="More African countries">
                <option v-for="k in TIER_2_KEYS" :key="k" :value="k">
                  {{ COUNTRY_CONFIGS[k].name }}
                </option>
              </optgroup>
              <option value="other">Other / Custom</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label">Template</label>
            <div class="template-pills">
              <button
                :class="['tpl-pill', { active: state.template === 'minimal' }]"
                @click="selectTemplate('minimal')"
              >Minimal</button>
              <button
                :class="['tpl-pill', { active: state.template === 'modern' }]"
                @click="selectTemplate('modern')"
              >Modern</button>
              <button
                :class="['tpl-pill', { active: state.template === 'classic' }]"
                @click="selectTemplate('classic')"
              >Classic</button>
            </div>
          </div>
        </div>

        <!-- ── Classic colour picker ─────────────────────────────────── -->
        <div v-if="state.template === 'classic'" class="form-card modern-colors-card">
          <h3 class="card-title">Template colour</h3>
          <div class="color-row">
            <label class="field-label">Total amount</label>
            <div class="color-picker-wrap" @click.stop>
              <button class="color-trigger" @click="toggleColorPicker('classicAccent')">
                <span class="color-preview" :style="{ background: state.classicAccent }"></span>
                <span class="color-hex">{{ state.classicAccent }}</span>
                <span class="color-caret" :class="{ open: activeColorPicker === 'classicAccent' }">▾</span>
              </button>
              <div v-if="activeColorPicker === 'classicAccent'" class="color-popover">
                <div class="color-grid">
                  <div v-for="(row, ri) in ACCENT_GRID" :key="ri" class="color-grid-row">
                    <button
                      v-for="c in row" :key="c"
                      class="color-cell"
                      :class="{ active: state.classicAccent === c }"
                      :style="{ background: c }"
                      :title="c"
                      @click="state.classicAccent = c; activeColorPicker = null"
                    />
                  </div>
                </div>
                <div class="color-popover-footer">
                  <input type="color" v-model="state.classicAccent" class="color-swatch" title="Custom colour" />
                  <span class="color-hex">{{ state.classicAccent }}</span>
                  <button class="color-reset-btn" @click="state.classicAccent = '#F59E0B'">Reset</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Modern colour pickers ─────────────────────────────────── -->
        <div v-if="state.template === 'modern'" class="form-card modern-colors-card">
          <h3 class="card-title">Template colours</h3>
          <div class="color-row">
            <label class="field-label">Header</label>
            <div class="color-picker-wrap" @click.stop>
              <button class="color-trigger" @click="toggleColorPicker('modernHeader')">
                <span class="color-preview" :style="{ background: state.modernHeader }"></span>
                <span class="color-hex">{{ state.modernHeader }}</span>
                <span class="color-caret" :class="{ open: activeColorPicker === 'modernHeader' }">▾</span>
              </button>
              <div v-if="activeColorPicker === 'modernHeader'" class="color-popover">
                <div class="color-grid">
                  <div v-for="(row, ri) in HEADER_GRID" :key="ri" class="color-grid-row">
                    <button
                      v-for="c in row" :key="c"
                      class="color-cell"
                      :class="{ active: state.modernHeader === c }"
                      :style="{ background: c }"
                      :title="c"
                      @click="state.modernHeader = c; activeColorPicker = null"
                    />
                  </div>
                </div>
                <div class="color-popover-footer">
                  <input type="color" v-model="state.modernHeader" class="color-swatch" title="Custom colour" />
                  <span class="color-hex">{{ state.modernHeader }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="color-row">
            <label class="field-label">Accent</label>
            <div class="color-picker-wrap" @click.stop>
              <button class="color-trigger" @click="toggleColorPicker('modernAccent')">
                <span class="color-preview" :style="{ background: state.modernAccent }"></span>
                <span class="color-hex">{{ state.modernAccent }}</span>
                <span class="color-caret" :class="{ open: activeColorPicker === 'modernAccent' }">▾</span>
              </button>
              <div v-if="activeColorPicker === 'modernAccent'" class="color-popover">
                <div class="color-grid">
                  <div v-for="(row, ri) in ACCENT_GRID" :key="ri" class="color-grid-row">
                    <button
                      v-for="c in row" :key="c"
                      class="color-cell"
                      :class="{ active: state.modernAccent === c }"
                      :style="{ background: c }"
                      :title="c"
                      @click="state.modernAccent = c; activeColorPicker = null"
                    />
                  </div>
                </div>
                <div class="color-popover-footer">
                  <input type="color" v-model="state.modernAccent" class="color-swatch" title="Custom colour" />
                  <span class="color-hex">{{ state.modernAccent }}</span>
                </div>
              </div>
            </div>
          </div>
          <button
            class="color-reset-btn"
            style="align-self: flex-start; margin-top: 0.25rem"
            @click="state.modernHeader = '#0F172A'; state.modernAccent = '#F59E0B'; activeColorPicker = null"
          >Reset defaults</button>
        </div>

        <!-- ── Custom currency (only for Other / Custom country) ──────── -->
        <div v-if="currentConfig.isCustom" class="form-card">
          <h3 class="card-title">Currency &amp; Tax</h3>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="custom-symbol">Currency symbol</label>
              <input id="custom-symbol" v-model="state.currencySymbol" class="form-input" placeholder="$" maxlength="6" />
            </div>
            <div class="field">
              <label class="field-label" for="custom-code">Currency code</label>
              <input id="custom-code" v-model="state.currency" class="form-input" placeholder="USD" maxlength="6" />
            </div>
            <div class="field">
              <label class="field-label" for="custom-tax-label">Tax label</label>
              <input id="custom-tax-label" v-model="state.taxLabel" class="form-input" placeholder="VAT" />
            </div>
            <div class="field field-xs">
              <label class="field-label" for="custom-tax-rate">Rate %</label>
              <input id="custom-tax-rate" v-model.number="state.taxRate" type="number" min="0" max="100" step="0.5" class="form-input" />
            </div>
          </div>
        </div>

        <!-- ── Invoice Meta ───────────────────────────────────────────── -->
        <div class="form-card">
          <h3 class="card-title">Invoice Details</h3>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="inv-title">Document type</label>
              <select id="inv-title" v-model="state.invoiceTitle" class="form-select">
                <option>INVOICE</option>
                <option>TAX INVOICE</option>
                <option>PROFORMA INVOICE</option>
                <option>RECEIPT</option>
                <option>CREDIT NOTE</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="inv-number">Invoice number</label>
              <input id="inv-number" v-model="state.invoiceNumber" class="form-input mono" :placeholder="invoiceNumPlaceholder" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label" for="inv-date">Date</label>
              <input id="inv-date" v-model="state.invoiceDate" type="date" class="form-input" />
            </div>
            <div class="field">
              <div class="label-with-toggle">
                <label class="field-label" for="inv-due">Due date</label>
                <button
                  type="button"
                  :class="['vis-toggle', { 'vis-off': !state.visible.dueDate }]"
                  :title="state.visible.dueDate ? 'Hide from invoice' : 'Show on invoice'"
                  @click="state.visible.dueDate = !state.visible.dueDate"
                >{{ state.visible.dueDate ? 'on invoice' : 'hidden' }}</button>
              </div>
              <input id="inv-due" v-model="state.dueDate" type="date" class="form-input" />
            </div>
          </div>
        </div>

        <!-- ── Business / Sender ─────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Your Business</h3>
            <span v-if="showSaved" class="saved-badge">✓ Saved</span>
          </div>
          <p class="card-hint">Saved to your browser automatically.</p>

          <!-- Logo -->
          <div class="logo-row">
            <img v-if="state.businessLogo" :src="state.businessLogo" class="logo-thumb" alt="Business logo" />
            <label class="logo-btn">
              {{ state.businessLogo ? 'Change logo' : 'Upload logo' }}
              <input type="file" accept="image/png,image/jpeg" @change="handleLogoUpload" hidden />
            </label>
            <button v-if="state.businessLogo" class="logo-remove-btn" @click="removeLogo">Remove</button>
          </div>

          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="biz-name">Business name</label>
              <input id="biz-name" v-model="state.businessName" class="form-input" placeholder="Acme Ltd." @blur="saveBusinessFields" />
            </div>
            <div class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="biz-email">Email</label>
                <button
                  type="button"
                  :class="['vis-toggle', { 'vis-off': !state.visible.bizEmail }]"
                  :title="state.visible.bizEmail ? 'Hide from invoice' : 'Show on invoice'"
                  @click="state.visible.bizEmail = !state.visible.bizEmail"
                >{{ state.visible.bizEmail ? 'on invoice' : 'hidden' }}</button>
              </div>
              <input id="biz-email" v-model="state.businessEmail" type="email" class="form-input" placeholder="hello@yourco.com" @blur="saveBusinessFields" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <div class="label-with-toggle">
                <label class="field-label" for="biz-phone">Phone</label>
                <button
                  type="button"
                  :class="['vis-toggle', { 'vis-off': !state.visible.bizPhone }]"
                  :title="state.visible.bizPhone ? 'Hide from invoice' : 'Show on invoice'"
                  @click="state.visible.bizPhone = !state.visible.bizPhone"
                >{{ state.visible.bizPhone ? 'on invoice' : 'hidden' }}</button>
              </div>
              <input id="biz-phone" v-model="state.businessPhone" class="form-input" :placeholder="phonePlaceholder" @blur="saveBusinessFields" />
            </div>
            <div class="field field-grow">
              <label class="field-label" for="biz-address">Address</label>
              <textarea id="biz-address" v-model="state.businessAddress" class="form-input form-textarea" rows="2" placeholder="Street, City, Region" @blur="saveBusinessFields" />
            </div>
          </div>
        </div>

        <!-- ── Client / Bill To ──────────────────────────────────────── -->
        <div class="form-card">
          <h3 class="card-title">Bill To</h3>
          <div class="field-row">
            <div class="field field-grow">
              <label class="field-label" for="client-name">Client name</label>
              <input id="client-name" v-model="state.clientName" class="form-input" placeholder="Client or company name" />
            </div>
            <div class="field field-grow">
              <div class="label-with-toggle">
                <label class="field-label" for="client-email">Email</label>
                <button
                  type="button"
                  :class="['vis-toggle', { 'vis-off': !state.visible.clientEmail }]"
                  :title="state.visible.clientEmail ? 'Hide from invoice' : 'Show on invoice'"
                  @click="state.visible.clientEmail = !state.visible.clientEmail"
                >{{ state.visible.clientEmail ? 'on invoice' : 'hidden' }}</button>
              </div>
              <input id="client-email" v-model="state.clientEmail" type="email" class="form-input" placeholder="client@example.com" />
            </div>
          </div>
          <div class="field">
            <div class="label-with-toggle">
              <label class="field-label" for="client-address">Address</label>
              <button
                type="button"
                :class="['vis-toggle', { 'vis-off': !state.visible.clientAddress }]"
                :title="state.visible.clientAddress ? 'Hide from invoice' : 'Show on invoice'"
                @click="state.visible.clientAddress = !state.visible.clientAddress"
              >{{ state.visible.clientAddress ? 'on invoice' : 'hidden' }}</button>
            </div>
            <textarea id="client-address" v-model="state.clientAddress" class="form-input form-textarea" rows="2" placeholder="Client address" />
          </div>
        </div>

        <!-- ── Line Items ─────────────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Line Items</h3>
            <div class="item-label-row">
              <span class="field-label" style="white-space:nowrap">Column header:</span>
              <input
                v-model="state.itemLabel"
                class="form-input item-label-input"
                placeholder="Description"
                maxlength="24"
                title="Rename the description column (e.g. Service, Task, Hours)"
              />
            </div>
          </div>

          <!-- Table header -->
          <div class="items-header">
            <span class="ih-desc">{{ state.itemLabel || 'Description' }}</span>
            <span class="ih-num">Qty</span>
            <span class="ih-num">Unit Price</span>
            <span class="ih-num">Amount</span>
            <span class="ih-del"></span>
          </div>

          <!-- Item rows -->
          <div
            v-for="(item, i) in state.items"
            :key="i"
            class="item-row"
          >
            <input
              v-model="item.description"
              class="form-input item-desc"
              :placeholder="state.itemLabel || 'Description'"
            />
            <input
              v-model.number="item.quantity"
              type="number"
              min="0"
              step="1"
              class="form-input item-num"
            />
            <input
              v-model.number="item.unitPrice"
              type="number"
              min="0"
              step="0.01"
              class="form-input item-num mono"
            />
            <span class="item-amount mono">{{ itemAmount(i) }}</span>
            <button
              class="item-del-btn"
              :disabled="state.items.length <= 1"
              @click="removeItem(i)"
              aria-label="Remove row"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <button class="add-row-btn" @click="addItem">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Add row
          </button>
        </div>

        <!-- ── Tax ───────────────────────────────────────────────────── -->
        <div v-if="!currentConfig.isCustom" class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Tax</h3>
            <button
              type="button"
              :class="['vis-toggle', { 'vis-off': !state.visible.tax }]"
              :title="state.visible.tax ? 'Hide tax from invoice' : 'Show tax on invoice'"
              @click="state.visible.tax = !state.visible.tax"
            >{{ state.visible.tax ? 'on invoice' : 'hidden' }}</button>
          </div>
          <div class="field-row field-row-tight">
            <div class="field field-grow">
              <label class="field-label" for="tax-label">Tax label</label>
              <input id="tax-label" v-model="state.taxLabel" class="form-input" placeholder="VAT" />
            </div>
            <div class="field field-xs">
              <label class="field-label" for="tax-rate">Rate %</label>
              <input id="tax-rate" v-model.number="state.taxRate" type="number" min="0" max="100" step="0.5" class="form-input" />
            </div>
          </div>
          <p v-if="!state.visible.tax && state.taxRate > 0" class="vis-tax-warn">
            Tax hidden — client sees a lower total. Only hide if you are not VAT-registered.
          </p>
          <a href="#correction-placeholder" class="correction-link" @click.prevent>
            Incorrect tax data? Let us know →
          </a>
        </div>

        <!-- ── Payment ────────────────────────────────────────────────── -->
        <div class="form-card">
          <div class="card-title-row">
            <h3 class="card-title">Payment Details</h3>
            <button
              type="button"
              :class="['vis-toggle', { 'vis-off': !state.visible.payment }]"
              :title="state.visible.payment ? 'Hide payment from invoice' : 'Show payment on invoice'"
              @click="state.visible.payment = !state.visible.payment"
            >{{ state.visible.payment ? 'on invoice' : 'hidden' }}</button>
          </div>

          <!-- Payment type toggle -->
          <div class="payment-toggle" role="group" aria-label="Payment type">
            <button
              :class="['pay-btn', { active: state.paymentType === 'bank' }]"
              @click="state.paymentType = 'bank'"
            >Bank Transfer</button>
            <button
              :class="['pay-btn', { active: state.paymentType === 'mobile-money' }]"
              @click="state.paymentType = 'mobile-money'"
            >Mobile Money</button>
          </div>

          <!-- Bank fields -->
          <template v-if="state.paymentType === 'bank'">
            <div class="field-row">
              <div class="field field-grow">
                <label class="field-label" for="bank-name">Bank name</label>
                <input id="bank-name" v-model="state.bankName" class="form-input" placeholder="Bank name" @blur="saveBusinessFields" />
              </div>
              <div class="field field-grow">
                <label class="field-label" for="acct-name">Account name</label>
                <input id="acct-name" v-model="state.accountName" class="form-input" placeholder="Name on account" @blur="saveBusinessFields" />
              </div>
            </div>
            <div class="field-row">
              <div class="field field-grow">
                <label class="field-label" for="acct-number">Account number</label>
                <input id="acct-number" v-model="state.accountNumber" class="form-input mono" placeholder="0123456789" @blur="saveBusinessFields" />
              </div>
              <div class="field">
                <label class="field-label" for="swift">
                  SWIFT / BIC <span class="field-optional">(international)</span>
                </label>
                <input id="swift" v-model="state.swiftCode" class="form-input mono" placeholder="XXXXXXXX" @blur="saveBusinessFields" />
              </div>
            </div>
          </template>

          <!-- Mobile money fields -->
          <template v-if="state.paymentType === 'mobile-money'">
            <div class="field">
              <label class="field-label" for="momo-provider">Provider</label>
              <!-- Dropdown: country has a known provider list -->
              <select
                v-if="currentConfig.mobileProviders.length > 0"
                id="momo-provider"
                v-model="state.momoProvider"
                class="form-select"
              >
                <option v-for="p in currentConfig.mobileProviders" :key="p.name" :value="p.name">
                  {{ p.name }}
                </option>
              </select>
              <!-- Free text: Other / Custom country -->
              <input
                v-else
                id="momo-provider"
                v-model="state.momoProvider"
                class="form-input"
                placeholder="Provider name (e.g. M-Pesa)"
                @blur="saveBusinessFields"
              />
            </div>
            <div class="field-row">
              <div class="field field-grow">
                <label class="field-label" for="momo-name">Account name</label>
                <input id="momo-name" v-model="state.momoName" class="form-input" placeholder="Name on account" @blur="saveBusinessFields" />
              </div>
              <div class="field field-grow">
                <label class="field-label" for="momo-number">{{ momoAccountLabel }}</label>
                <input
                  id="momo-number"
                  v-model="state.momoNumber"
                  class="form-input mono"
                  :placeholder="momoAccountFormat || 'Mobile number'"
                  @blur="saveBusinessFields"
                />
              </div>
            </div>
          </template>

          <a
            v-if="!currentConfig.isCustom"
            href="#correction-placeholder"
            class="correction-link"
            @click.prevent
          >
            Incorrect provider data? Let us know →
          </a>
        </div>

        <!-- ── Notes ─────────────────────────────────────────────────── -->
        <div class="form-card">
          <h3 class="card-title">Notes <span class="field-optional">(optional)</span></h3>
          <textarea
            v-model="state.notes"
            class="form-input form-textarea"
            rows="3"
            placeholder="Payment terms, any conditions, or additional information..."
          />
        </div>

        <!-- ── Footer note ────────────────────────────────────────────── -->
        <div class="form-card">
          <h3 class="card-title">Invoice footer <span class="field-optional">(optional)</span></h3>
          <textarea
            v-model="state.footerNote"
            class="form-input form-textarea"
            rows="2"
            placeholder="e.g. Thank you for your business! or leave blank for no footer"
          />
        </div>

        <!-- ── Download ───────────────────────────────────────────────── -->
        <div class="form-card download-card">
          <button class="download-btn" @click="handleDownload">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 2v9m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 13v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
            Download Invoice PDF
          </button>
          <p class="download-hint">{{ state.template.charAt(0).toUpperCase() + state.template.slice(1) }} template · No watermark · No sign-up</p>
        </div>

      </div><!-- /form-scroll -->
    </div><!-- /form-pane -->

    <!-- ══════════════════════════════════════════════════════════════════ -->
    <!-- PREVIEW PANE                                                      -->
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <div id="panel-preview" :class="['preview-pane', { 'pane-active': activeTab === 'preview' }]" role="tabpanel" aria-labelledby="tab-preview">
      <InvoicePreview :state="state" />
    </div>

  </div><!-- /gen-wrap -->
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
  font-family: 'DM Sans', sans-serif;
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
  border-right: 1px solid var(--border);
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
  background: var(--surface);
  border: 1px solid var(--border);
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
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}
.field-optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-4);
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */
.form-input {
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8125rem;
  font-family: 'DM Sans', sans-serif;
  color: var(--text);
  background: #ffffff;
  transition: border-color 150ms, box-shadow 150ms;
  outline: none;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: #F59E0B;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
}
.form-select {
  width: 100%;
  padding: 0.4375rem 1.75rem 0.4375rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8125rem;
  font-family: 'DM Sans', sans-serif;
  color: var(--text);
  background: #ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 0.625rem center;
  appearance: none;
  outline: none;
  cursor: pointer;
  transition: border-color 150ms;
}
.form-select:focus { border-color: #F59E0B; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12); }
.form-textarea { resize: vertical; min-height: 56px; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }

/* ── Template pills ──────────────────────────────────────────────────────── */
.template-pills {
  display: flex;
  gap: 0.375rem;
}
.tpl-pill {
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: 'DM Sans', sans-serif;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  transition: all 150ms;
}
.tpl-pill.active {
  background: #F59E0B;
  border-color: #F59E0B;
  color: #ffffff;
}
.tpl-pill.tpl-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Saved badge ─────────────────────────────────────────────────────────── */
.saved-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #16A34A;
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
  font-family: 'DM Sans', sans-serif;
}
.logo-btn:hover { border-color: #F59E0B; color: var(--accent); }
.logo-remove-btn {
  font-size: 0.75rem;
  color: var(--text-4);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0.25rem;
  font-family: 'DM Sans', sans-serif;
  transition: color 150ms;
}
.logo-remove-btn:hover { color: #EF4444; }

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
.ih-desc { font-size: 0.6875rem; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.ih-num  { font-size: 0.6875rem; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; text-align: right; }
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
.item-del-btn:hover:not(:disabled) { background: #FEE2E2; color: #EF4444; }
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
  border: 1px dashed rgba(245, 158, 11, 0.4);
  border-radius: 6px;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  transition: all 150ms;
  align-self: flex-start;
  margin-top: 0.25rem;
}
.add-row-btn:hover { background: rgba(245, 158, 11, 0.06); border-color: #F59E0B; }

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
  font-family: 'DM Sans', sans-serif;
  background: var(--surface-2);
  color: var(--text-3);
  border: none;
  cursor: pointer;
  transition: all 150ms;
}
.pay-btn:first-child { border-right: 1px solid var(--border); }
.pay-btn.active { background: #F59E0B; color: #ffffff; }
.pay-btn:not(.active):hover { background: var(--surface-3); color: var(--text); }

/* ── Visibility toggle — "on invoice" / "hidden" pill ───────────────────── */
.label-with-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.vis-toggle {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.1rem 0.375rem;
  border-radius: 9999px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.07);
  color: #059669;
  cursor: pointer;
  transition: all 150ms;
  font-family: 'DM Sans', sans-serif;
  line-height: 1.6;
  flex-shrink: 0;
}
.vis-toggle:hover { background: rgba(16, 185, 129, 0.14); }
.vis-toggle.vis-off {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-4);
}
.vis-toggle.vis-off:hover { background: rgba(148, 163, 184, 0.15); }

/* ── Tax hidden warning ──────────────────────────────────────────────────── */
.vis-tax-warn {
  font-size: 0.6875rem;
  color: #D97706;
  background: rgba(245, 158, 11, 0.07);
  border: 1px solid rgba(245, 158, 11, 0.2);
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

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 2rem;
  background: #F59E0B;
  color: #ffffff;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: 'DM Sans', sans-serif;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms, transform 100ms;
  width: 100%;
  justify-content: center;
  letter-spacing: -0.01em;
}
.download-btn:hover  { background: #D97706; }
.download-btn:active { transform: scale(0.99); }

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
  font-family: 'DM Sans', sans-serif;
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
  font-family: 'JetBrains Mono', monospace;
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
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 3.5px rgba(0, 0, 0, 0.6);
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
  font-family: 'DM Sans', sans-serif;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  transition: all 150ms;
  white-space: nowrap;
}
.color-reset-btn:hover { color: var(--accent); border-color: var(--accent); }
</style>

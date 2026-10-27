// ─────────────────────────────────────────────────────────────────────────────
// Browser-only persistence. Nothing leaves the device.
//   profile  — your business + payment details (auto-saved)
//   clients  — saved "bill to" contacts
//   history  — last 30 issued documents (reopen / duplicate)
//   counters — next invoice number per prefix ("INV-", "GH-" …)
// ─────────────────────────────────────────────────────────────────────────────

import { SITE } from '../site';
import { PREMIUM_TEMPLATES, defaultInvoiceState, isTemplate, type InvoiceState } from '../types/invoice';
import type { ProRecord } from './proLicense';

const KEY = {
  profile:  `${SITE.storagePrefix}_profile`,
  clients:  `${SITE.storagePrefix}_clients`,
  history:  `${SITE.storagePrefix}_history`,
  counters: `${SITE.storagePrefix}_counters`,
  pro:      `${SITE.storagePrefix}_pro`,
  colours:  `${SITE.storagePrefix}_colours_v2`, // set once the old default colours have been replaced
};
const LEGACY_KEY = 'afrinvoice_business'; // Afrinvoice v1 (same origin only)
const HISTORY_LIMIT = 30;
const LEGACY_PREFIXES = ['GH-', 'NG-', 'KE-', 'ZA-', 'ZW-', 'UG-', 'TZ-', 'RW-', 'ET-', 'ZM-', 'MW-', 'CM-', 'CI-', 'SN-', 'MZ-', 'BW-', 'EG-', 'INV-'];

export const PROFILE_FIELDS = [
  'businessName', 'businessEmail', 'businessPhone', 'businessAddress', 'businessTaxId', 'businessLogo',
  'countryKey', 'currency', 'labelsLang', 'paper', 'template', 'taxes', 'taxNote', 'pricesIncludeTax',
  'paymentRail', 'bankName', 'accountName', 'accountNumber', 'bankCode', 'swiftCode', 'iban', 'bic',
  'momoProvider', 'momoNumber', 'momoName', 'upiId', 'paymentLink',
  'classicAccent', 'modernHeader', 'modernAccent', 'brandColor', 'footerNote',
  'fontChoice', 'signature', 'signatureName',
] as const satisfies readonly (keyof InvoiceState)[];

export type Profile = Partial<Pick<InvoiceState, typeof PROFILE_FIELDS[number]>>;

export interface SavedClient { name: string; email: string; address: string; taxId: string }

export interface HistoryEntry {
  id: string;             // invoice number + timestamp
  savedAt: string;        // ISO timestamp
  number: string;
  docType: InvoiceState['docType'];
  clientName: string;
  total: number;
  currency: string;
  state: InvoiceState;    // full snapshot (logo stripped to save space)
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode or quota exceeded (large logos)
  }
}

// ── Profile ──────────────────────────────────────────────────────────────────
// Default colours replaced in Oct 2026. Swapped once per browser, so a user who later picks the
// same colour from the swatches keeps it.
const OLD_DEFAULTS: Partial<Record<keyof Profile, string>> = { classicAccent: '#115E59', brandColor: '#0F766E' };

export function loadProfile(): Profile {
  const profile = read<Profile | null>(KEY.profile, null);
  if (!profile) {
    write(KEY.colours, true); // nothing saved yet, so there are no old defaults to swap
    return migrateLegacy();
  }
  // The stamp used to be saved here: one Paid or Draft then carried over to every later invoice.
  // It's per document now, and a damaged or hand-edited template id must not reach the generator.
  const p = profile as Record<string, unknown>;
  if ('stamp' in p) { delete p.stamp; write(KEY.profile, profile); }
  if (p.template !== undefined && !isTemplate(p.template)) delete p.template;
  if (!read<boolean>(KEY.colours, false)) {
    const fresh = defaultInvoiceState();
    for (const [k, old] of Object.entries(OLD_DEFAULTS) as [keyof Profile, string][]) {
      if (profile[k] === old) (profile as Record<string, unknown>)[k] = fresh[k];
    }
    write(KEY.profile, profile);
    write(KEY.colours, true);
  }
  return profile;
}

/** `keep` overrides fields that must not be saved from this state (e.g. a country page's preset). */
export function saveProfile(state: InvoiceState, keep?: Profile, opts: { pro?: boolean } = {}): boolean {
  const profile: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) profile[f] = state[f];
  // A free user previewing a Pro template shouldn't reopen on a template they can't download.
  if (!opts.pro && PREMIUM_TEMPLATES.includes(state.template)) {
    const saved = read<Profile>(KEY.profile, {}).template;
    profile.template = saved && !PREMIUM_TEMPLATES.includes(saved) ? saved : 'minimal';
  }
  return write(KEY.profile, { ...profile, ...keep });
}

/** One-time import of Afrinvoice v1 business details (only reachable on the same origin). */
function migrateLegacy(): Profile {
  const old = read<Record<string, string> | null>(LEGACY_KEY, null);
  if (!old) return {};
  const profile: Profile = {
    businessName: old.businessName ?? '', businessEmail: old.businessEmail ?? '',
    businessPhone: old.businessPhone ?? '', businessAddress: old.businessAddress ?? '',
    businessLogo: old.businessLogo ?? '',
    bankName: old.bankName ?? '', accountName: old.accountName ?? '', accountNumber: old.accountNumber ?? '',
    swiftCode: old.swiftCode ?? '', momoProvider: old.momoProvider ?? '', momoNumber: old.momoNumber ?? '', momoName: old.momoName ?? '',
  };
  write(KEY.profile, profile);
  // v1 kept ONE counter shared by every country, so we can't tell which prefix it
  // belonged to. Seed all v1 prefixes with it: a gap in numbering is harmless,
  // reissuing an already-used invoice number is not.
  const n = Number(old.invoiceCounter) || 0;
  if (n > 0) {
    const counters = read<Record<string, number>>(KEY.counters, {});
    for (const prefix of LEGACY_PREFIXES) counters[prefix] = Math.max(counters[prefix] ?? 0, n);
    write(KEY.counters, counters);
  }
  return profile;
}

// ── Counters ─────────────────────────────────────────────────────────────────
export function peekNextNumber(prefix: string): string {
  const counters = read<Record<string, number>>(KEY.counters, {});
  return formatNumber(prefix, (counters[prefix] ?? 0) + 1);
}

/** Consumes the next number. `saved: false` means the counter couldn't be stored (blocked or full storage). */
export function takeNextNumber(prefix: string): { number: string; saved: boolean } {
  const counters = read<Record<string, number>>(KEY.counters, {});
  const next = (counters[prefix] ?? 0) + 1;
  const saved = write(KEY.counters, { ...counters, [prefix]: next });
  return { number: formatNumber(prefix, next), saved };
}

export function formatNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, '0')}`;
}

// ── Clients ──────────────────────────────────────────────────────────────────
export function loadClients(): SavedClient[] {
  return read<SavedClient[]>(KEY.clients, []);
}

export function saveClient(c: SavedClient): SavedClient[] {
  if (!c.name.trim()) return loadClients();
  const others = loadClients().filter(x => x.name.trim().toLowerCase() !== c.name.trim().toLowerCase());
  const list = [c, ...others].slice(0, 100);
  write(KEY.clients, list);
  return list;
}

export function deleteClient(name: string): SavedClient[] {
  const list = loadClients().filter(x => x.name !== name);
  write(KEY.clients, list);
  return list;
}

// ── History ──────────────────────────────────────────────────────────────────
export function loadHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(KEY.history, []);
}

export function addToHistory(state: InvoiceState, total: number): HistoryEntry[] {
  const snapshot: InvoiceState = JSON.parse(JSON.stringify({ ...state, businessLogo: '', signature: '' })); // images live in the profile
  const entry: HistoryEntry = {
    id: `${state.invoiceNumber}-${Date.now()}`,
    savedAt: new Date().toISOString(),
    number: state.invoiceNumber,
    docType: state.docType,
    clientName: state.clientName,
    total,
    currency: state.currency,
    state: snapshot,
  };
  // Re-issuing the same document replaces its older entry (same number on another doc type is a different document)
  const list = [entry, ...loadHistory().filter(h => !(h.number === state.invoiceNumber && h.docType === state.docType))]
    .slice(0, HISTORY_LIMIT);
  write(KEY.history, list);
  return list;
}

export function deleteHistory(id: string): HistoryEntry[] {
  const list = loadHistory().filter(h => h.id !== id);
  write(KEY.history, list);
  return list;
}

// ── Backup (the only way to move data to another browser or domain) ─────────
export function exportAll(): string {
  return JSON.stringify({
    app: SITE.name, version: 2, exportedAt: new Date().toISOString(),
    profile: loadProfile(), clients: loadClients(), history: loadHistory(),
    counters: read<Record<string, number>>(KEY.counters, {}),
  }, null, 2);
}

export function importAll(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || !('profile' in data))
      return { ok: false, error: 'This file is not an invoice backup.' };
    if (data.profile) write(KEY.profile, data.profile);
    if (Array.isArray(data.clients)) write(KEY.clients, data.clients);
    if (Array.isArray(data.history)) write(KEY.history, data.history);
    if (data.counters && typeof data.counters === 'object') {
      // Never move a counter backwards — that would reissue invoice numbers
      const current = read<Record<string, number>>(KEY.counters, {});
      const merged = { ...current };
      for (const [k, v] of Object.entries(data.counters as Record<string, number>)) merged[k] = Math.max(current[k] ?? 0, Number(v) || 0);
      write(KEY.counters, merged);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not read that file — is it a JSON backup?' };
  }
}

// ── Pro license (see proLicense.ts) ──────────────────────────────────────────
/** The stored license, or null when absent, corrupt or tampered into the wrong shape. */
export function loadPro(): ProRecord | null {
  const r = read<Partial<ProRecord> | null>(KEY.pro, null);
  return r && typeof r.key === 'string' && typeof r.instanceId === 'string' && typeof r.lastValidated === 'number'
    ? { key: r.key, instanceId: r.instanceId, lastValidated: r.lastValidated }
    : null;
}
export const savePro = (rec: ProRecord) => write(KEY.pro, rec);
export function clearPro(): void {
  try { localStorage.removeItem(KEY.pro); } catch { /* private mode */ }
}

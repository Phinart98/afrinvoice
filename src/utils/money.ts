// Money + date formatting driven by Intl, so every country gets its own
// conventions (1,234.56 $ vs 1.234,56 € vs ₹1,23,456.00) without hand-written rules.

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (JPY 0, USD 2, KWD 3). */
export function minorDigits(currency: string): number {
  if (!digitsCache.has(currency)) {
    let d = 2;
    try { d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { /* unknown code */ }
    digitsCache.set(currency, d);
  }
  return digitsCache.get(currency)!;
}

/** Round to the currency's minor units, half away from zero (avoids 1.005 → 1.00 float traps). */
export function roundMoney(amount: number, currency: string): number {
  const f = 10 ** minorDigits(currency);
  return Math.sign(amount) * Math.round(Math.abs(amount) * f + Number.EPSILON * f) / f;
}

/** "1.234,56 €", "$1,234.56", "₹1,23,456.00". Falls back to "CODE 1234.56" for codes Intl doesn't know. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(minorDigits(currency))}`;
  }
}

/** Locale for the printed document: label language + the country's region ("de" + "en-US" → "de-US"). */
export function docLocale(countryLocale: string, lang: string): string {
  const region = countryLocale.split('-')[1];
  const candidate = region ? `${lang}-${region}` : lang;
  try { return Intl.getCanonicalLocales(candidate)[0]; } catch { return lang; }
}

/** "27 Sept 2026" / "27. Sept. 2026" / "Sep 27, 2026" — from a YYYY-MM-DD string, no timezone shift. */
export function formatDate(iso: string, locale: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return iso;
  }
}

/** Today's date in the user's LOCAL timezone as YYYY-MM-DD (toISOString() would use UTC). */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

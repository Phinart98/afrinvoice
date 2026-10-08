// ─────────────────────────────────────────────────────────────────────────────
// Pro unlock: a one-time Lemon Squeezy license key, checked from the browser.
// The License API needs no secret key and allows cross-origin calls, so there is
// no backend. Every check also confirms the key belongs to one of OUR products:
// any Lemon Squeezy key from any store would otherwise pass a bare "valid".
// A determined person can bypass a browser-side check; that's accepted. The hard
// rule is the other way round: a paying user is never locked out by an outage,
// a rate limit or a proxy. Only a definitive answer from Lemon Squeezy removes Pro.
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://api.lemonsqueezy.com/v1/licenses';
const DAY = 86_400_000;
/** Re-check the key with Lemon Squeezy about once a week. */
export const REVALIDATE_MS = 7 * DAY;
/** Stay Pro this long without a successful check (offline, or an outage). */
export const GRACE_MS = 30 * DAY;

export interface ProRecord {
  key: string;
  instanceId: string;
  lastValidated: number;
}

export type ProStatus = { pro: boolean; reason: 'none' | 'active' | 'expired' };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface LSResponse {
  activated?: boolean;
  valid?: boolean;
  deactivated?: boolean;
  error?: string | null;
  instance?: { id: string } | null;
  license_key?: { status?: string; test_mode?: boolean } | null;
  meta?: { product_id?: number };
}

const OFFLINE = 'Could not reach the license server. Check your connection and try again.';
const WRONG_PRODUCT = 'This key is for a different product.';
const TEST_KEY = 'This is a test-mode key.';

/** `body` is null when the response wasn't JSON (a proxy or WAF page): never treat that as an answer. */
async function post(fetchFn: FetchFn, path: string, fields: Record<string, string>): Promise<{ status: number; body: LSResponse | null }> {
  const res = await fetchFn(`${API}/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: body && typeof body === 'object' ? (body as LSResponse) : null };
}

const ours = (body: LSResponse, productIds: readonly number[]) =>
  typeof body.meta?.product_id === 'number' && productIds.includes(body.meta.product_id);

export async function activate(
  rawKey: string,
  opts: { productIds: readonly number[]; instanceName: string; now: number; fetchFn: FetchFn; allowTestMode?: boolean },
): Promise<{ ok: true; record: ProRecord } | { ok: false; error: string }> {
  const key = rawKey.trim();
  if (!key) return { ok: false, error: 'Paste your license key first.' };
  let reply;
  try {
    reply = await post(opts.fetchFn, 'activate', { license_key: key, instance_name: opts.instanceName });
  } catch {
    return { ok: false, error: OFFLINE };
  }
  const { body } = reply;
  if (!body) return { ok: false, error: OFFLINE };
  if (!body.activated || !body.instance?.id) {
    return { ok: false, error: body.error || 'That license key could not be activated.' };
  }
  const refuse = !ours(body, opts.productIds) ? WRONG_PRODUCT
    : body.license_key?.test_mode && !opts.allowTestMode ? TEST_KEY : null;
  if (refuse) {
    // Activation just used up a slot on that key: give it back (best effort).
    await deactivate({ key, instanceId: body.instance.id, lastValidated: opts.now }, { fetchFn: opts.fetchFn });
    return { ok: false, error: refuse };
  }
  return { ok: true, record: { key, instanceId: body.instance.id, lastValidated: opts.now } };
}

/** Pure: is this browser Pro right now, judged only from the stored record and the clock? */
export function proStatus(rec: ProRecord | null, now: number): ProStatus {
  if (!rec) return { pro: false, reason: 'none' };
  // A clock set earlier than the last check counts as fresh, not expired.
  return now - rec.lastValidated > GRACE_MS ? { pro: false, reason: 'expired' } : { pro: true, reason: 'active' };
}

/** Weekly, and at once if the last check is stamped more than a day in the future (a clock that was ahead). */
export const needsRevalidation = (rec: ProRecord, now: number) =>
  now - rec.lastValidated > REVALIDATE_MS || rec.lastValidated - now > DAY;

/**
 * Re-check a stored key. Returns:
 * - the refreshed record when Lemon Squeezy confirms it for one of our products;
 * - null ONLY on a definitive answer: a JSON reply saying `valid: false` (refunded, disabled, deleted)
 *   or a valid key for someone else's product;
 * - the SAME record for anything else (offline, 5xx, 429, a proxy's HTML page): grace applies.
 */
export async function revalidate(
  rec: ProRecord,
  opts: { productIds: readonly number[]; now: number; fetchFn: FetchFn },
): Promise<ProRecord | null> {
  let reply;
  try {
    reply = await post(opts.fetchFn, 'validate', { license_key: rec.key, instance_id: rec.instanceId });
  } catch {
    return rec;
  }
  const { body } = reply;
  if (!body || typeof body.valid !== 'boolean') return rec;
  if (body.valid === false) return null;
  if (!ours(body, opts.productIds)) return null;
  return { ...rec, lastValidated: opts.now };
}

/** Free this device's activation slot (3 per key). Best effort: false when it couldn't be released. */
export async function deactivate(rec: ProRecord, opts: { fetchFn: FetchFn }): Promise<boolean> {
  try {
    const { body } = await post(opts.fetchFn, 'deactivate', { license_key: rec.key, instance_id: rec.instanceId });
    return body?.deactivated === true;
  } catch {
    return false;
  }
}

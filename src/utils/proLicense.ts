// ─────────────────────────────────────────────────────────────────────────────
// Pro unlock: a one-time Lemon Squeezy license key, checked from the browser.
// The License API needs no secret key and allows cross-origin calls, so there is
// no backend. Every check also confirms the key belongs to OUR product: any
// Lemon Squeezy key from any store would otherwise pass a bare "valid".
// A determined person can bypass a browser-side check; that's accepted. This
// keeps honest people honest and never locks out a paying user over an outage.
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
  error?: string | null;
  instance?: { id: string } | null;
  meta?: { product_id?: number };
}

const OFFLINE = 'Could not reach the license server. Check your connection and try again.';
const WRONG_PRODUCT = 'This key is for a different product.';

async function post(fetchFn: FetchFn, path: string, fields: Record<string, string>): Promise<{ status: number; body: LSResponse }> {
  const res = await fetchFn(`${API}/${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  let body: LSResponse = {};
  try { body = await res.json(); } catch { /* non-JSON error page: treat as an empty body */ }
  return { status: res.status, body };
}

export async function activate(
  rawKey: string,
  opts: { productId: number; instanceName: string; now: number; fetchFn: FetchFn },
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
  if (!body.activated || !body.instance?.id) {
    return { ok: false, error: body.error || 'That license key could not be activated.' };
  }
  if (body.meta?.product_id !== opts.productId) return { ok: false, error: WRONG_PRODUCT };
  return { ok: true, record: { key, instanceId: body.instance.id, lastValidated: opts.now } };
}

/** Pure: is this browser Pro right now, judged only from the stored record and the clock? */
export function proStatus(rec: ProRecord | null, now: number): ProStatus {
  if (!rec) return { pro: false, reason: 'none' };
  // A clock set earlier than the last check counts as fresh, not expired.
  return now - rec.lastValidated > GRACE_MS ? { pro: false, reason: 'expired' } : { pro: true, reason: 'active' };
}

export const needsRevalidation = (rec: ProRecord, now: number) => now - rec.lastValidated > REVALIDATE_MS;

/**
 * Re-check a stored key. Returns the refreshed record, the SAME record when the check could not be
 * made (offline or a server error: grace applies), or null when Lemon Squeezy says the key is no
 * longer good for our product (refunded, disabled, or another product's key).
 */
export async function revalidate(
  rec: ProRecord,
  opts: { productId: number; now: number; fetchFn: FetchFn },
): Promise<ProRecord | null> {
  let reply;
  try {
    reply = await post(opts.fetchFn, 'validate', { license_key: rec.key, instance_id: rec.instanceId });
  } catch {
    return rec;
  }
  if (reply.status >= 500) return rec;
  const { body } = reply;
  if (!body.valid || body.meta?.product_id !== opts.productId) return null;
  return { ...rec, lastValidated: opts.now };
}

/** Free this device's activation slot (3 per key). Best effort: false when it couldn't be reached. */
export async function deactivate(rec: ProRecord, opts: { fetchFn: FetchFn }): Promise<boolean> {
  try {
    const { body } = await post(opts.fetchFn, 'deactivate', { license_key: rec.key, instance_id: rec.instanceId });
    return (body as { deactivated?: boolean }).deactivated === true;
  } catch {
    return false;
  }
}

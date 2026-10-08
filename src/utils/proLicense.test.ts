import { describe, expect, it } from 'vitest';
import { activate, deactivate, revalidate, proStatus, needsRevalidation, GRACE_MS, REVALIDATE_MS, type ProRecord } from './proLicense';

const PRODUCT = 424242;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 7);

/** A fake Lemon Squeezy License API: records calls, answers with a fixed JSON body (or throws). */
function fakeLS(body: unknown, { status = 200, fail = false } = {}) {
  const calls: { url: string; form: URLSearchParams }[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init?.body ?? '')) });
    if (fail) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchFn, calls };
}

const record: ProRecord = { key: 'KEY-1', instanceId: 'inst-1', lastValidated: T0 };

describe('activate', () => {
  it('activates a key for our product and returns a record', async () => {
    const ls = fakeLS({ activated: true, instance: { id: 'inst-9' }, license_key: { status: 'active' }, meta: { product_id: PRODUCT } });
    const r = await activate(' KEY-9 ', { productIds: [PRODUCT], instanceName: 'Chrome on Windows', now: T0, fetchFn: ls.fetchFn });
    expect(r).toEqual({ ok: true, record: { key: 'KEY-9', instanceId: 'inst-9', lastValidated: T0 } });
    expect(ls.calls[0].url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate');
    expect(ls.calls[0].form.get('license_key')).toBe('KEY-9');
    expect(ls.calls[0].form.get('instance_name')).toBe('Chrome on Windows');
  });

  it('refuses a valid key that belongs to a different product', async () => {
    const ls = fakeLS({ activated: true, instance: { id: 'x' }, license_key: { status: 'active' }, meta: { product_id: 999 } });
    const r = await activate('KEY', { productIds: [PRODUCT], instanceName: 'x', now: T0, fetchFn: ls.fetchFn });
    expect(r).toEqual({ ok: false, error: 'This key is for a different product.' });
    // ...and the activation it just used up on that key is released again.
    expect(ls.calls[1].url).toBe('https://api.lemonsqueezy.com/v1/licenses/deactivate');
    expect(ls.calls[1].form.get('instance_id')).toBe('x');
  });

  it('accepts a key for any of our listed products (e.g. after a price change)', async () => {
    const ls = fakeLS({ activated: true, instance: { id: 'i' }, license_key: { status: 'active' }, meta: { product_id: 555 } });
    const r = await activate('KEY', { productIds: [PRODUCT, 555], instanceName: 'x', now: T0, fetchFn: ls.fetchFn });
    expect(r.ok).toBe(true);
  });

  it('refuses a Lemon Squeezy test-mode key unless test keys are allowed', async () => {
    const body = { activated: true, instance: { id: 'i' }, license_key: { status: 'active', test_mode: true }, meta: { product_id: PRODUCT } };
    const live = await activate('KEY', { productIds: [PRODUCT], instanceName: 'x', now: T0, fetchFn: fakeLS(body).fetchFn });
    expect(live).toEqual({ ok: false, error: 'This is a test-mode key.' });
    const test = await activate('KEY', { productIds: [PRODUCT], instanceName: 'x', now: T0, fetchFn: fakeLS(body).fetchFn, allowTestMode: true });
    expect(test.ok).toBe(true);
  });

  it('passes on Lemon Squeezy\'s own error, e.g. the activation limit', async () => {
    const ls = fakeLS({ activated: false, error: 'This license key has reached the activation limit.' }, { status: 400 });
    const r = await activate('KEY', { productIds: [PRODUCT], instanceName: 'x', now: T0, fetchFn: ls.fetchFn });
    expect(r).toEqual({ ok: false, error: 'This license key has reached the activation limit.' });
  });

  it('says so plainly when there is no connection', async () => {
    const ls = fakeLS({}, { fail: true });
    const r = await activate('KEY', { productIds: [PRODUCT], instanceName: 'x', now: T0, fetchFn: ls.fetchFn });
    expect(r).toEqual({ ok: false, error: 'Could not reach the license server. Check your connection and try again.' });
  });

  it('rejects an empty key without calling the server', async () => {
    const ls = fakeLS({});
    const r = await activate('   ', { productIds: [PRODUCT], instanceName: 'x', now: T0, fetchFn: ls.fetchFn });
    expect(r).toEqual({ ok: false, error: 'Paste your license key first.' });
    expect(ls.calls).toHaveLength(0);
  });
});

describe('proStatus (pure, no network)', () => {
  it('is free with no record', () => {
    expect(proStatus(null, T0)).toEqual({ pro: false, reason: 'none' });
  });
  it('is pro right after validation', () => {
    expect(proStatus(record, T0 + DAY)).toEqual({ pro: true, reason: 'active' });
  });
  it('stays pro offline until the grace window ends', () => {
    expect(proStatus(record, T0 + GRACE_MS - 1)).toEqual({ pro: true, reason: 'active' });
    expect(proStatus(record, T0 + GRACE_MS + 1)).toEqual({ pro: false, reason: 'expired' });
  });
  it('treats a clock set before the last validation as active, not expired', () => {
    expect(proStatus(record, T0 - DAY)).toEqual({ pro: true, reason: 'active' });
  });
});

describe('revalidation', () => {
  it('is due weekly', () => {
    expect(needsRevalidation(record, T0 + REVALIDATE_MS - 1)).toBe(false);
    expect(needsRevalidation(record, T0 + REVALIDATE_MS + 1)).toBe(true);
  });

  it('is due at once when the last check is stamped in the future (a clock that was ahead)', () => {
    expect(needsRevalidation({ ...record, lastValidated: T0 + 2 * DAY }, T0)).toBe(true);
    expect(needsRevalidation({ ...record, lastValidated: T0 + DAY / 2 }, T0)).toBe(false);
  });

  it('keeps the record on a rate limit (429): only a definitive answer may remove Pro', async () => {
    const ls = fakeLS({ error: 'Too Many Attempts.' }, { status: 429 });
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn })).toEqual(record);
  });

  it('keeps the record when a proxy returns an HTML error page', async () => {
    const fetchFn = async () => new Response('<html>blocked</html>', { status: 403 });
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn })).toEqual(record);
  });

  it('drops the record when Lemon Squeezy answers that the key no longer exists (404, valid:false)', async () => {
    const ls = fakeLS({ valid: false, error: 'license_key not found.' }, { status: 404 });
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn })).toBeNull();
  });

  it('refreshes the timestamp when the key is still valid for our product', async () => {
    const ls = fakeLS({ valid: true, license_key: { status: 'active' }, meta: { product_id: PRODUCT } });
    const r = await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn });
    expect(r).toEqual({ ...record, lastValidated: T0 + 8 * DAY });
    expect(ls.calls[0].url).toBe('https://api.lemonsqueezy.com/v1/licenses/validate');
    expect(ls.calls[0].form.get('instance_id')).toBe('inst-1');
  });

  it('drops the record when the key was refunded or disabled', async () => {
    const ls = fakeLS({ valid: false, error: 'license_key is disabled', license_key: { status: 'disabled' }, meta: { product_id: PRODUCT } }); // our product, refunded
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn })).toBeNull();
  });

  it('drops the record when the key turns out to belong to another product', async () => {
    const ls = fakeLS({ valid: true, license_key: { status: 'active' }, meta: { product_id: 1 } });
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn })).toBeNull();
  });

  it('keeps the old record unchanged when offline (grace applies)', async () => {
    const ls = fakeLS({}, { fail: true });
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn })).toEqual(record);
  });

  it('keeps the old record on a server error (5xx), so an outage never locks a paying user out', async () => {
    const ls = fakeLS({ error: 'oops' }, { status: 503 });
    expect(await revalidate(record, { productIds: [PRODUCT], now: T0 + 8 * DAY, fetchFn: ls.fetchFn })).toEqual(record);
  });
});

describe('deactivate', () => {
  it('frees this device\'s activation slot at Lemon Squeezy', async () => {
    const ls = fakeLS({ deactivated: true });
    expect(await deactivate(record, { fetchFn: ls.fetchFn })).toBe(true);
    expect(ls.calls[0].url).toBe('https://api.lemonsqueezy.com/v1/licenses/deactivate');
    expect(ls.calls[0].form.get('license_key')).toBe('KEY-1');
    expect(ls.calls[0].form.get('instance_id')).toBe('inst-1');
  });
  it('reports false (never throws) when offline, so removing locally still works', async () => {
    const ls = fakeLS({}, { fail: true });
    expect(await deactivate(record, { fetchFn: ls.fetchFn })).toBe(false);
  });
});

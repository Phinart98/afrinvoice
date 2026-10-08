// Shared, reactive Pro state for the generator, the preview and the Pro panel. Thin glue over the
// tested pieces: proLicense.ts (Lemon Squeezy calls, grace rules) and invoiceStorage.ts (the record).
import { computed, onMounted, ref } from 'vue';
import { SITE } from '../site';
import { activate, deactivate, needsRevalidation, proStatus, revalidate, type ProRecord } from './proLicense';
import { clearPro, loadPro, savePro } from './invoiceStorage';

const record = ref<ProRecord | null>(null);
let started = false;

const fetchFn = (url: string, init?: RequestInit) => fetch(url, init);

function gtagEvent(name: string, params: Record<string, unknown> = {}) {
  (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', name, params);
}

export function useProStatus() {
  // Buyers keep Pro even if the shop is ever switched off: the record alone decides.
  const pro = computed(() => proStatus(record.value, Date.now()).pro);

  onMounted(async () => {
    if (started) return;
    started = true;
    record.value = loadPro();
    // While the shop is off there may be no product ids to check against: never revalidate then,
    // or every buyer would be dropped as "another product".
    if (record.value && SITE.pro.enabled && SITE.pro.productIds.length && needsRevalidation(record.value, Date.now())) {
      const fresh = await revalidate(record.value, { productIds: SITE.pro.productIds, now: Date.now(), fetchFn });
      if (fresh) savePro(fresh); else clearPro();
      record.value = fresh;
    }
  });

  async function unlock(key: string): Promise<string | null> {
    const instanceName = `${SITE.name} on ${navigator.platform || 'the web'}`;
    const r = await activate(key, { productIds: SITE.pro.productIds, instanceName, now: Date.now(), fetchFn, allowTestMode: SITE.pro.allowTestKeys });
    if (!r.ok) return r.error;
    savePro(r.record);
    record.value = r.record;
    gtagEvent('pro_activated');
    return null;
  }

  /** Returns false when Lemon Squeezy couldn't release this device's activation (it's removed locally anyway). */
  async function removeFromDevice(): Promise<boolean> {
    const released = record.value ? await deactivate(record.value, { fetchFn }) : true;
    clearPro();
    record.value = null;
    return released;
  }

  return { pro, unlock, removeFromDevice, track: gtagEvent };
}

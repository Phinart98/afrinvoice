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
    if (record.value && needsRevalidation(record.value, Date.now())) {
      const fresh = await revalidate(record.value, { productId: SITE.pro.productId, now: Date.now(), fetchFn });
      if (fresh) savePro(fresh); else clearPro();
      record.value = fresh;
    }
  });

  async function unlock(key: string): Promise<string | null> {
    const instanceName = `${SITE.name} on ${navigator.platform || 'the web'}`;
    const r = await activate(key, { productId: SITE.pro.productId, instanceName, now: Date.now(), fetchFn });
    if (!r.ok) return r.error;
    savePro(r.record);
    record.value = r.record;
    gtagEvent('pro_activated');
    return null;
  }

  async function removeFromDevice(): Promise<void> {
    if (record.value) await deactivate(record.value, { fetchFn });
    clearPro();
    record.value = null;
  }

  return { pro, unlock, removeFromDevice, track: gtagEvent };
}

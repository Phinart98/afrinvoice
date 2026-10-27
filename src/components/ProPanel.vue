<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { SITE } from '../site';
import { useProStatus } from '../utils/useProStatus';

const { pro, unlock, removeFromDevice, track } = useProStatus();
const key = ref('');
const error = ref('');
const working = ref(false);
const showKey = ref(false);
const confirmRemove = ref(false);
const removeNote = ref('');

onMounted(() => {
  track('pro_view');
  // Lemon Squeezy redirects buyers to /#pro: open the key form for them (also when already on the page).
  openOnHash();
  window.addEventListener('hashchange', openOnHash);
});
onUnmounted(() => window.removeEventListener('hashchange', openOnHash));

function openOnHash() {
  if (location.hash === '#pro' && !pro.value) showKey.value = true;
}

async function submit() {
  working.value = true;
  error.value = (await unlock(key.value)) ?? '';
  working.value = false;
  if (!error.value) key.value = '';
}

async function remove() {
  working.value = true;
  const released = await removeFromDevice();
  working.value = false;
  confirmRemove.value = false;
  removeNote.value = released ? '' : `Pro is off in this browser, but its activation couldn't be released (no connection?). If your key stops working elsewhere, email ${SITE.email}.`;
}
</script>

<template>
  <section id="pro" class="pro" aria-labelledby="pro-title">
    <template v-if="pro">
      <h3 id="pro-title" class="pro-title">Pro is on in this browser</h3>
      <p class="pro-text">No "Made with" line, plus the Pro templates, signature, stamp and font. Thank you for supporting {{ SITE.name }}.</p>
      <button v-if="!confirmRemove" type="button" class="pro-link" @click="confirmRemove = true">Remove Pro from this browser</button>
      <p v-else class="pro-confirm">
        Remove Pro here? You can activate your key again in any browser.
        <button type="button" class="pro-link" :disabled="working" @click="remove">Yes, remove it</button>
        <button type="button" class="pro-link" @click="confirmRemove = false">Keep Pro</button>
      </p>
    </template>

    <template v-else>
      <h3 id="pro-title" class="pro-title">{{ SITE.name }} Pro, {{ SITE.pro.price }} once</h3>
      <p class="pro-text">Adds three more designs, your signature and a Paid stamp, and removes the small "Made with {{ SITE.name }}" line. One payment, no subscription, and the key works in every browser you use.</p>
      <div class="pro-actions">
        <a :href="SITE.pro.checkoutUrl" class="pro-buy" target="_blank" rel="noopener" @click="track('pro_checkout_click')">Buy Pro, {{ SITE.pro.price }}</a>
        <button type="button" class="pro-link" :aria-expanded="showKey" @click="showKey = !showKey">I have a license key</button>
      </div>
      <form v-if="showKey" class="pro-key" @submit.prevent="submit">
        <label class="pro-key-label" for="pro-key">License key (from your purchase email)</label>
        <div class="pro-key-row">
          <input id="pro-key" v-model="key" class="pro-key-input" autocomplete="off" spellcheck="false" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" />
          <button type="submit" class="pro-key-btn" :disabled="working">{{ working ? 'Checking…' : 'Activate' }}</button>
        </div>
        <p v-if="error" class="pro-error" role="alert">{{ error }}</p>
      </form>
      <p v-if="removeNote" class="pro-error" role="status">{{ removeNote }}</p>
      <p class="pro-soon"><a href="/pro/">What Pro includes</a>, the <a href="/terms/">terms</a> and the <a href="/refund-policy/">14-day refund policy</a>.</p>
    </template>
  </section>
</template>

<style scoped>
.pro {
  /* It sits in a centred flex column: stretch to the card's width instead of sizing to the key row. */
  align-self: stretch;
  box-sizing: border-box;
  margin-top: 1rem;
  padding: 1rem 1.125rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
}
.pro-title { font: 800 1.0625rem/1.3 var(--font-display); color: var(--text); }
.pro-text { margin-top: 0.375rem; font-size: 0.875rem; color: var(--text-2); }
.pro-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1rem; margin-top: 0.875rem; }
.pro-buy {
  display: inline-block;
  padding: 0.625rem 1rem;
  border-radius: var(--radius-sm, 6px);
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
}
.pro-buy:hover { background: var(--accent-hover); }
.pro-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  font: inherit;
  font-size: 0.875rem;
  text-decoration: underline;
  cursor: pointer;
}
.pro-key { margin-top: 0.875rem; }
.pro-key-label { display: block; font-size: 0.8125rem; color: var(--text-2); margin-bottom: 0.375rem; }
.pro-key-row { display: flex; gap: 0.5rem; }
.pro-key-input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  font: 0.8125rem var(--font); font-variant-numeric: tabular-nums;
}
.pro-key-btn {
  padding: 0.5rem 0.875rem;
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: var(--text);
  color: var(--bg);
  font-weight: 600;
  cursor: pointer;
}
.pro-key-btn:disabled, .pro-link:disabled { opacity: 0.5; cursor: wait; }
.pro-error { margin-top: 0.5rem; font-size: 0.8125rem; color: var(--error); }
.pro-confirm { margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-2); display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; }
.pro-soon { margin-top: 0.875rem; font-size: 0.75rem; color: var(--text-3); }
.pro-buy:focus-visible, .pro-link:focus-visible, .pro-key-btn:focus-visible, .pro-key-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>

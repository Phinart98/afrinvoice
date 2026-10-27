<script setup lang="ts">
// Type your name or initials and pick a hand: rendered to transparent ink, so the PDF only ever needs
// the image. The two handwriting fonts load when this panel opens, never on a normal page view.
import { computed, ref } from 'vue';
import { cropToInk } from '../utils/signature';

const props = defineProps<{ initial?: string }>();
const emit = defineEmits<{ save: [dataUrl: string]; cancel: [] }>();

const STYLES = [
  { id: 'casual', label: 'Handwritten', family: 'Sig Caveat', size: 76 },
  { id: 'formal', label: 'Formal script', family: 'Sig Great Vibes', size: 84 },
] as const;
const text = ref(props.initial ?? '');
const style = ref<(typeof STYLES)[number]['id']>('casual');
const chosen = computed(() => STYLES.find(s => s.id === style.value)!);
const INK = '#1B2A6B';

async function save() {
  const t = text.value.trim();
  if (!t) return;
  const s = chosen.value;
  await document.fonts.load(`${s.size}px "${s.family}"`, t);
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = `${s.size}px "${s.family}"`;
  c.width = Math.ceil(g.measureText(t).width + s.size);
  c.height = Math.ceil(s.size * 1.9);
  g.font = `${s.size}px "${s.family}"`;   // resizing a canvas resets its state
  g.fillStyle = INK;
  g.textBaseline = 'middle';
  g.fillText(t, s.size / 2, c.height / 2);
  const img = g.getImageData(0, 0, c.width, c.height);
  const crop = cropToInk({ data: img.data, width: img.width, height: img.height }, 6);
  if (!crop) return;
  const scale = Math.min(1, 600 / crop.width);
  const src = document.createElement('canvas');
  src.width = crop.width; src.height = crop.height;
  src.getContext('2d')!.putImageData(new ImageData(crop.data, crop.width, crop.height), 0, 0);
  const out = document.createElement('canvas');
  out.width = Math.round(crop.width * scale); out.height = Math.round(crop.height * scale);
  out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
  emit('save', out.toDataURL('image/png'));
}
</script>

<template>
  <div class="sig-type">
    <label class="sig-label" for="sig-text">Your name or initials</label>
    <input id="sig-text" v-model="text" class="sig-input" maxlength="40" placeholder="Ama Mensah" autocomplete="name" />
    <div class="sig-styles" role="radiogroup" aria-label="Handwriting style">
      <button v-for="s in STYLES" :key="s.id" type="button" role="radio" :aria-checked="style === s.id"
        :class="['sig-style', { active: style === s.id }]" @click="style = s.id">
        <span class="sig-sample" :style="{ fontFamily: `'${s.family}'` }">{{ text.trim() || 'Ama Mensah' }}</span>
        <span class="sig-style-name">{{ s.label }}</span>
      </button>
    </div>
    <div class="sig-actions">
      <button type="button" class="pad-btn pad-btn--main" :disabled="!text.trim()" @click="save">Use this signature</button>
      <button type="button" class="pad-btn" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
@font-face { font-family: 'Sig Caveat'; src: url('/fonts/Caveat-SemiBold.ttf') format('truetype'); font-display: swap; }
@font-face { font-family: 'Sig Great Vibes'; src: url('/fonts/GreatVibes-Regular.ttf') format('truetype'); font-display: swap; }
.sig-type { display: flex; flex-direction: column; gap: 0.5rem; }
.sig-label { font: 600 0.75rem var(--font); color: var(--text-2); }
.sig-input { font: 0.875rem var(--font); padding: 0.5rem 0.625rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--text); }
.sig-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sig-styles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.sig-style { display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; padding: 0.5rem 0.75rem;
  background: #fff; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; min-width: 0; }
.sig-style.active { border: 2px solid var(--accent); padding: calc(0.5rem - 1px) calc(0.75rem - 1px); }
.sig-style:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sig-sample { font-size: 1.75rem; color: #1B2A6B; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.sig-style-name { font: 600 0.6875rem var(--font); color: #5B6475; }
.sig-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.pad-btn { font: 600 0.75rem var(--font); padding: 0.375rem 0.75rem; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); }
.pad-btn--main { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.pad-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pad-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>

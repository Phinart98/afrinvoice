<script setup lang="ts">
// Sign with a mouse, finger or stylus. The canvas is transparent, so the saved PNG is ink only and
// sits on any invoice like a real signature; it's trimmed to the strokes before it's handed back.
import { onMounted, ref } from 'vue';
import { cropToInk } from '../utils/signature';

const emit = defineEmits<{ save: [dataUrl: string]; cancel: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const drawn = ref(false);
let ctx: CanvasRenderingContext2D | null = null;
let last: { x: number; y: number } | null = null;
let mid: { x: number; y: number } | null = null;
const INK = '#1B2A6B';

onMounted(() => {
  const c = canvas.value!;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = c.getBoundingClientRect();
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  ctx = c.getContext('2d');
  ctx!.scale(dpr, dpr);
  ctx!.lineCap = 'round';
  ctx!.lineJoin = 'round';
  ctx!.strokeStyle = INK;
});

function point(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function down(e: PointerEvent) {
  canvas.value!.setPointerCapture(e.pointerId);
  last = mid = point(e);
  // A tap is a dot, as with a pen
  ctx!.beginPath(); ctx!.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx!.fillStyle = INK; ctx!.fill();
  drawn.value = true;
}
function move(e: PointerEvent) {
  if (!last || !ctx) return;
  const p = point(e);
  const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
  // Pen pressure when the device reports it; a steady line otherwise
  ctx.lineWidth = e.pressure > 0 && e.pointerType === 'pen' ? 1.2 + e.pressure * 2.6 : 2.4;
  ctx.beginPath(); ctx.moveTo(mid!.x, mid!.y); ctx.quadraticCurveTo(last.x, last.y, m.x, m.y); ctx.stroke();
  last = p; mid = m;
}
function up() { last = mid = null; }

function clear() {
  const c = canvas.value!;
  ctx!.save(); ctx!.setTransform(1, 0, 0, 1, 0, 0); ctx!.clearRect(0, 0, c.width, c.height); ctx!.restore();
  drawn.value = false;
}

function save() {
  const c = canvas.value!;
  const img = ctx!.getImageData(0, 0, c.width, c.height);
  const crop = cropToInk({ data: img.data, width: img.width, height: img.height }, 6);
  if (!crop) return;
  // Keep files small: at most 600px wide, like logos
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
  <div class="sig-pad">
    <div class="sig-area">
      <canvas ref="canvas" class="sig-canvas" aria-label="Signature pad: sign with your mouse, finger or stylus"
        @pointerdown.prevent="down" @pointermove.prevent="move" @pointerup="up" @pointercancel="up" @pointerleave="up" />
      <span class="sig-line" aria-hidden="true">Sign above the line</span>
    </div>
    <div class="sig-actions">
      <button type="button" class="pad-btn pad-btn--main" :disabled="!drawn" @click="save">Use this signature</button>
      <button type="button" class="pad-btn" :disabled="!drawn" @click="clear">Clear</button>
      <button type="button" class="pad-btn" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.sig-pad { display: flex; flex-direction: column; gap: 0.5rem; }
.sig-area { position: relative; background: #fff; border: 1px solid var(--border); border-radius: 6px; }
.sig-canvas { display: block; width: 100%; height: 150px; touch-action: none; cursor: crosshair; }
.sig-line { position: absolute; left: 1rem; right: 1rem; bottom: 2rem; border-top: 1px solid #C9CED9;
  padding-top: 0.2rem; font-size: 0.6875rem; color: #6E7584; pointer-events: none; }
.sig-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.pad-btn { font: 600 0.75rem var(--font); padding: 0.375rem 0.75rem; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); }
.pad-btn--main { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.pad-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pad-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>

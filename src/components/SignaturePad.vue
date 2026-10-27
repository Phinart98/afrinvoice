<script setup lang="ts">
// Sign with a mouse, finger or stylus. The canvas is transparent, so the saved PNG is ink only and
// sits on any invoice like a real signature; it's trimmed to the strokes before it's handed back.
// Strokes are kept as points, so when the pad changes size (a phone rotates) the canvas is resized to
// match and the signature redrawn: ink stays under the finger instead of drifting or being cut off.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { cropToInk, inkToPng } from '../utils/signature';

const emit = defineEmits<{ save: [dataUrl: string]; cancel: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const drawn = ref(false);
let ctx: CanvasRenderingContext2D | null = null;
let observer: ResizeObserver | null = null;
type Pt = { x: number; y: number; w: number };
const strokes: Pt[][] = [];
let current: Pt[] | null = null;
const INK = '#1B2A6B';

function fit() {
  const c = canvas.value!;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = c.getBoundingClientRect();
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (!w || !h || (c.width === w && c.height === h)) return;
  c.width = w; c.height = h;               // resizing clears the canvas and resets its state
  ctx = c.getContext('2d');
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.lineCap = 'round';
  ctx!.lineJoin = 'round';
  ctx!.strokeStyle = INK;
  ctx!.fillStyle = INK;
  for (const s of strokes) drawStroke(s);
}

/** A dot for a tap, as with a pen; otherwise smooth curves through the midpoints. */
function drawStroke(s: Pt[], from = 1) {
  if (!ctx) return;
  if (from === 1) { ctx.beginPath(); ctx.arc(s[0].x, s[0].y, 1.2, 0, Math.PI * 2); ctx.fill(); }
  for (let i = Math.max(1, from); i < s.length; i++) {
    const a = s[i - 2] ?? s[i - 1], b = s[i - 1], p = s[i];
    const m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m1 = { x: (b.x + p.x) / 2, y: (b.y + p.y) / 2 };
    ctx.lineWidth = p.w;
    ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.quadraticCurveTo(b.x, b.y, m1.x, m1.y); ctx.stroke();
  }
}

onMounted(() => {
  fit();
  observer = new ResizeObserver(fit);
  observer.observe(canvas.value!);
});
onBeforeUnmount(() => observer?.disconnect());

function point(e: PointerEvent): Pt {
  const r = canvas.value!.getBoundingClientRect();
  // Pen pressure when the device reports it; a steady line otherwise
  const w = e.pressure > 0 && e.pointerType === 'pen' ? 1.2 + e.pressure * 2.6 : 2.4;
  return { x: e.clientX - r.left, y: e.clientY - r.top, w };
}
function down(e: PointerEvent) {
  canvas.value!.setPointerCapture(e.pointerId);
  current = [point(e)];
  strokes.push(current);
  drawStroke(current);
  drawn.value = true;
}
function move(e: PointerEvent) {
  if (!current) return;
  current.push(point(e));
  drawStroke(current, current.length - 1);
}
function up() { current = null; }

function clear() {
  const c = canvas.value!;
  strokes.length = 0;
  ctx!.save(); ctx!.setTransform(1, 0, 0, 1, 0, 0); ctx!.clearRect(0, 0, c.width, c.height); ctx!.restore();
  drawn.value = false;
}

function save() {
  const c = canvas.value!;
  const img = ctx!.getImageData(0, 0, c.width, c.height);
  const crop = cropToInk({ data: img.data, width: img.width, height: img.height }, 6);
  if (crop) emit('save', inkToPng(crop));
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

// ─────────────────────────────────────────────────────────────────────────────
// Invoice PDF — jsPDF, fully client-side.
//
// Renders an InvoiceView (see invoiceView.ts), so it prints exactly what the
// preview shows. Six templates, each a different document rather than a recolour:
//   minimal   — quiet; the amount due is the largest figure on the page
//   classic   — "Letterhead": centred serif letterhead, double rule, ruled rows
//   modern    — "Band": a colour band that carries the amount due and due date
//   executive — "Sidebar" (Pro): a tinted panel for who, and how to pay
//   ledger    — "Accounts" (Pro): summary boxes, numbered rows, double-ruled total
//   studio    — "Studio" (Pro): the amount due as the headline, items as a list
// They share the blocks below (bill-to, items, totals, payment, notes, signature,
// stamp, footer); each layout only decides what goes where and how it looks.
// Text uses embedded Noto Sans / Noto Serif subsets (fetched on first use) so every
// currency symbol (₵ ₦ ₹ ₱ ₩ ₺ ₽ …) and accented name renders correctly.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf';
import { effectiveTemplate, type InvoiceState, type Template } from '../types/invoice';
import { buildInvoiceView, type InvoiceView } from './invoiceView';
import { qrMatrix } from './paymentQr';
import { SITE } from '../site';
import { C_INK, C_WHITE, hexToRgb, mutedOn, onFill, readable, tint, type RGB } from './colour';

const C_MID:   RGB = [91, 100, 117];
const C_LIGHT: RGB = [148, 156, 170];
const C_ALT:   RGB = [246, 247, 250];
const C_RULE:  RGB = [221, 225, 232];
const C_PAID:  RGB = [31, 122, 77];

const PAPER = { A4: [210, 297], Letter: [215.9, 279.4] } as const;
const M = 15;                  // page margin
const LINE = 4.3;              // body line height (mm) at 8.5pt

// ── Fonts ────────────────────────────────────────────────────────────────────
type Family = 'sans' | 'serif';
const fontCache: Partial<Record<Family, Promise<{ regular: string; bold: string } | null>>> = {};

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font ${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A TrueType file starts with 00 01 00 00; anything else (an HTML error page) is not a font.
  if (bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) throw new Error(`Font ${url}: not a TTF`);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function loadFamily(f: Family) {
  const file = f === 'serif' ? 'NotoSerif' : 'NotoSans';
  fontCache[f] ??= Promise.all([fetchBase64(`/fonts/${file}-Regular.ttf`), fetchBase64(`/fonts/${file}-Bold.ttf`)])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch(() => { delete fontCache[f]; return null; }); // retry next time; fall back to a built-in font now
  return fontCache[f]!;
}

async function newDoc(paper: InvoiceView['paper'], families: Family[]): Promise<{ doc: jsPDF; fonts: Record<Family, string> }> {
  const doc = new jsPDF({ unit: 'mm', format: paper === 'Letter' ? 'letter' : 'a4' });
  const fonts: Record<Family, string> = { sans: 'helvetica', serif: 'times' };
  for (const f of families) {
    const data = await loadFamily(f);
    if (!data) continue;
    const name = f === 'serif' ? 'NotoSerif' : 'NotoSans';
    doc.addFileToVFS(`${name}-Regular.ttf`, data.regular);
    doc.addFileToVFS(`${name}-Bold.ttf`, data.bold);
    doc.addFont(`${name}-Regular.ttf`, name, 'normal');
    doc.addFont(`${name}-Bold.ttf`, name, 'bold');
    fonts[f] = name;
  }
  return { doc, fonts };
}

// ── Small helpers ────────────────────────────────────────────────────────────
function logoFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg')) return 'JPEG';
  return null;
}

const BRAND_FALLBACK: RGB = [46, 91, 218];

/** Which type families a template needs, so only those font files are fetched. */
function familiesFor(tpl: Template, v: InvoiceView): { head: Family; body: Family } {
  if (v.font === 'sans') return { head: 'sans', body: 'sans' };
  if (v.font === 'serif') return { head: 'serif', body: 'serif' };
  if (tpl === 'classic') return { head: 'serif', body: 'serif' };
  if (tpl === 'studio') return { head: 'serif', body: 'sans' };
  return { head: 'sans', body: 'sans' };
}

// ── Drawing context shared by every layout ───────────────────────────────────
interface Ctx {
  doc: jsPDF;
  v: InvoiceView;
  W: number; H: number;
  y: number;
  bottom: number;
  set: (size: number, weight?: 'normal' | 'bold', c?: RGB, role?: 'head' | 'body') => void;
  rule: (y: number, x1: number, x2: number, w?: number, c?: RGB) => void;
  fill: (c: RGB) => void;
  wrap: (text: string, width: number) => string[];
  /** Start a new page when `needed` mm won't fit; layouts redraw their page furniture in onNewPage. */
  ensure: (needed: number) => boolean;
  onNewPage: () => void;
  /** Top of the content area on a continuation page. */
  topY: number;
  /** The signature is drawn once, wherever it first fits. */
  signed: boolean;
}

function makeCtx(doc: jsPDF, v: InvoiceView, fonts: Record<Family, string>, fam: { head: Family; body: Family }): Ctx {
  const [W, H] = PAPER[v.paper];
  const ctx: Ctx = {
    doc, v, W, H, y: 0, bottom: H - 16, topY: 18, signed: false,
    set(size, weight = 'normal', c = C_INK, role = 'body') {
      doc.setFont(fonts[role === 'head' ? fam.head : fam.body], weight); doc.setFontSize(size); doc.setTextColor(...c);
    },
    rule(y, x1, x2, w = 0.25, c = C_RULE) { doc.setLineWidth(w); doc.setDrawColor(...c); doc.line(x1, y, x2, y); },
    fill(c) { doc.setFillColor(...c); },
    wrap: (text, width) => doc.splitTextToSize(text, width) as string[],
    ensure(needed) {
      if (ctx.y + needed <= ctx.bottom) return false;
      doc.addPage(); ctx.y = ctx.topY; ctx.onNewPage();
      return true;
    },
    onNewPage: () => {},
  };
  // Reserve room for a footer that wraps: it grows upward from H-11, so the body must stop above it.
  ctx.set(8);
  const footerExtra = v.footer ? (ctx.wrap(v.footer, W - 2 * M).length - 1) * 3.4 : 0;
  ctx.bottom = H - 16 - footerExtra;
  return ctx;
}

// ── Shared blocks ────────────────────────────────────────────────────────────
interface Box { x: number; w: number }

function logoBox(c: Ctx, maxW: number, maxH: number): { fmt: string; w: number; h: number } | null {
  const fmt = c.v.sender.logo ? logoFormat(c.v.sender.logo) : null;
  if (!fmt) return null;
  try {
    const p = c.doc.getImageProperties(c.v.sender.logo);
    const s = Math.min(maxW / p.width, maxH / p.height);
    return { fmt, w: p.width * s, h: p.height * s };
  } catch { return null; } // unreadable logo: text-only header
}

/** A small section label in sentence case ("Bill to", "Payment details"). */
function label(c: Ctx, text: string, x: number, y: number, col: RGB = C_MID, align: 'left' | 'right' | 'center' = 'left') {
  c.set(7.5, 'bold', col);
  c.doc.text(text, x, y, { align });
}

function billTo(c: Ctx, b: Box, col: RGB = C_MID, ink: RGB = C_INK, muted: RGB = C_MID) {
  label(c, c.v.L.billTo, b.x, c.y, col); c.y += 5;
  c.set(10, 'bold', ink, 'head');
  const name = c.wrap(c.v.client.name || '—', b.w);
  c.doc.text(name, b.x, c.y); c.y += name.length * 4.9;
  c.set(8.5, 'normal', muted);
  for (const line of c.v.client.lines) { const l = c.wrap(line, b.w); c.doc.text(l, b.x, c.y); c.y += l.length * LINE; }
}

interface ItemsOpts {
  head: 'fill' | 'rule' | 'caps';  // filled band, ruled labels, or small capitals over a rule (Accounts)
  headFill?: RGB;
  headText?: RGB;
  ruleColor?: RGB;
  zebra?: boolean;
  rows?: 'none' | 'hair';          // hairlines between rows
  numbered?: boolean;              // a leading line-number column (Accounts)
  grid?: boolean;                  // light vertical column rules and an outer frame (Accounts)
}

function itemsTable(c: Ctx, b: Box, o: ItemsOpts) {
  const { v, doc } = c;
  const narrow = b.w < 150;
  const COL_NO = o.numbered ? 8 : 0;
  const COL_QTY = narrow ? 13 : 16, COL_UNIT = narrow ? 28 : 36, COL_AMT = narrow ? 30 : 38;
  const COL_DESC = b.w - COL_NO - COL_QTY - COL_UNIT - COL_AMT;
  const R = b.x + b.w;
  const xNo = b.x + COL_NO / 2;
  const xDesc = b.x + COL_NO + 2.5;
  const xQty = b.x + COL_NO + COL_DESC + COL_QTY / 2;
  const xUnit = b.x + COL_NO + COL_DESC + COL_QTY + COL_UNIT - 2;
  const xAmt = R - 2;
  const colEdges = [b.x + COL_NO, b.x + COL_NO + COL_DESC, b.x + COL_NO + COL_DESC + COL_QTY, b.x + COL_NO + COL_DESC + COL_QTY + COL_UNIT]
    .filter(x => x > b.x);
  const ruleCol = o.ruleColor ?? C_INK;
  let tableTop = c.y;

  const drawHead = () => {
    const h = 8;
    tableTop = c.y;
    if (o.head === 'fill') {
      c.fill(o.headFill ?? C_INK); doc.rect(b.x, c.y, b.w, h, 'F');
      c.set(7.5, 'bold', o.headText ?? onFill(o.headFill ?? C_INK));
    } else if (o.head === 'caps') {
      c.fill(C_ALT); doc.rect(b.x, c.y, b.w, h, 'F');
      c.set(6.6, 'bold', C_MID);
    } else {
      c.rule(c.y, b.x, R, 0.4, ruleCol);
      c.set(7.5, 'bold', C_MID);
    }
    const ty = c.y + 5.3;
    const cols = o.head === 'caps' ? v.columns.map(t => t.toLocaleUpperCase(v.locale)) : v.columns;
    if (o.numbered) doc.text('#', xNo, ty, { align: 'center' });
    doc.text(cols[0], xDesc, ty);
    doc.text(cols[1], xQty, ty, { align: 'center' });
    doc.text(cols[2], xUnit, ty, { align: 'right' });
    doc.text(cols[3], xAmt, ty, { align: 'right' });
    c.y += h;
    if (o.head !== 'fill') c.rule(c.y, b.x, R, 0.4, ruleCol);
  };
  const closeGrid = (bottomY: number) => {
    if (!o.grid) return;
    doc.setLineWidth(0.2); doc.setDrawColor(...C_RULE);
    for (const x of colEdges) doc.line(x, tableTop, x, bottomY);
    doc.line(b.x, tableTop, b.x, bottomY); doc.line(R, tableTop, R, bottomY);
  };

  c.ensure(20);
  drawHead();
  v.items.forEach((it, i) => {
    c.set(8.5, 'normal', C_INK);
    const desc = c.wrap(it.description, COL_DESC - 5);
    const rowH = Math.max(8, desc.length * LINE + 3.7);
    if (c.y + rowH > c.bottom) { closeGrid(c.y); c.ensure(c.bottom); drawHead(); c.set(8.5, 'normal', C_INK); }
    if (o.zebra && i % 2 === 1) { c.fill(C_ALT); doc.rect(b.x, c.y, b.w, rowH, 'F'); }
    const ty = c.y + 5.3;
    if (o.numbered) { c.set(7.5, 'normal', C_LIGHT); doc.text(String(i + 1), xNo, ty, { align: 'center' }); c.set(8.5, 'normal', C_INK); }
    doc.text(desc, xDesc, ty);
    doc.setTextColor(...C_MID);
    doc.text(it.qty, xQty, ty, { align: 'center' });
    doc.text(it.unit, xUnit, ty, { align: 'right' });
    doc.setTextColor(...C_INK);
    doc.text(it.amount, xAmt, ty, { align: 'right' });
    c.y += rowH;
    if (o.rows === 'hair' && i < v.items.length - 1) c.rule(c.y, b.x, R, 0.15);
  });
  closeGrid(c.y);
  c.rule(c.y, b.x, R, o.head === 'fill' ? 0.25 : 0.4, o.head === 'fill' ? C_RULE : ruleCol);
  c.y += 6;
}

/** Studio's items: an airy list — description, then "2 × £850.00" beneath, the amount on the right. */
function itemsList(c: Ctx, b: Box) {
  const { v, doc } = c;
  const R = b.x + b.w;
  c.rule(c.y, b.x, R, 0.4, C_INK); c.y += 7;
  v.items.forEach((it, i) => {
    c.set(10, 'normal', C_INK);
    const desc = c.wrap(it.description, b.w - 50);
    const h = desc.length * 4.9 + 6.5;
    c.ensure(h + 2);
    doc.text(desc, b.x, c.y);
    c.set(10, 'bold', C_INK);
    doc.text(it.amount, R, c.y, { align: 'right' });
    c.set(8, 'normal', C_MID);
    doc.text(`${it.qty} × ${it.unit}`, b.x, c.y + desc.length * 4.9);
    c.y += h;
    if (i < v.items.length - 1) { c.rule(c.y - 3, b.x, R, 0.15); c.y += 3; }
  });
  c.rule(c.y, b.x, R, 0.4, C_INK);
  c.y += 7;
}

type GrandStyle = 'strip' | 'text' | 'plain' | 'double' | 'big';

function totals(c: Ctx, b: Box, grand: GrandStyle, accent: RGB) {
  const { v, doc } = c;
  const R = b.x + b.w;
  const valueW = 38;
  // Keep the totals block together: measure wrapped labels instead of guessing a row height
  c.set(8.5);
  c.ensure(v.totals.reduce((sum, row) => sum + (row.kind === 'grand' || row.kind === 'balance'
    ? (grand === 'big' ? 16 : 12) : Math.max(1, c.wrap(row.label, b.w - valueW).length) * LINE + 1.2), 4));
  // The emphasised row is the one the client acts on: the balance when payments exist, else the total.
  const lastMoney = v.totals.map(r => r.kind).lastIndexOf(v.totals.some(r => r.kind === 'balance') ? 'balance' : 'grand');
  for (const [idx, row] of v.totals.entries()) {
    if (row.kind === 'grand' || row.kind === 'balance') {
      const isGrand = row.kind === 'grand';
      const isKey = idx === lastMoney;
      if (grand === 'strip' && isGrand) {
        c.fill(accent); doc.rect(b.x - 3, c.y - 1.5, b.w + 3, 9, 'F');
        c.set(10, 'bold', onFill(accent));
        doc.text(row.label, b.x, c.y + 4.5);
        doc.text(row.value, R - 2, c.y + 4.5, { align: 'right' });
        c.y += 11;
        continue;
      }
      if (grand === 'big' && isKey) {
        c.rule(c.y - 1, b.x, R, 0.4, C_INK);
        c.set(8.5, 'normal', C_MID); doc.text(row.label, b.x, c.y + 6.5);
        c.set(17, 'bold', accent, 'head'); doc.text(row.value, R - 2, c.y + 7.5, { align: 'right' });
        c.y += 14;
        continue;
      }
      c.rule(c.y - 1, b.x, R, 0.4, grand === 'text' ? accent : C_INK);
      c.y += 4.5;
      c.set(10.5, 'bold', C_INK, 'head');
      doc.text(row.label, b.x, c.y);
      if ((grand === 'text' || grand === 'double') && isGrand) doc.setTextColor(...accent);
      doc.text(row.value, R - 2, c.y, { align: 'right' });
      if (grand === 'double' && isGrand) {
        // The accountant's double underline under the grand total
        c.rule(c.y + 2.2, R - 38, R, 0.3, C_INK); c.rule(c.y + 3.2, R - 38, R, 0.3, C_INK);
        c.y += 2;
      }
      c.y += 7;
      continue;
    }
    c.set(8.5, 'normal', row.kind === 'muted' ? C_LIGHT : C_MID);
    const lbl = c.wrap(row.label, b.w - valueW);
    doc.text(lbl, b.x, c.y);
    doc.setTextColor(...(row.kind === 'muted' ? C_LIGHT : C_INK));
    doc.text(row.value, R - 2, c.y, { align: 'right' });
    c.y += Math.max(1, lbl.length) * LINE + 1.2;
  }
}

function taxNote(c: Ctx, b: Box) {
  if (!c.v.taxNote) return;
  c.set(8, 'normal', C_MID);
  const l = c.wrap(c.v.taxNote, b.w);
  c.ensure(l.length * LINE + 2);
  c.doc.text(l, b.x, c.y + 1); c.y += l.length * LINE + 2;
}

function drawQr(c: Ctx, x: number, y: number, size: number, caption: RGB = C_MID, onColour = false) {
  const m = qrMatrix(c.v.qr!.payload);
  const cell = size / m.length;
  // On a coloured panel a scanner needs a white quiet zone around the code
  if (onColour) { c.fill(C_WHITE); c.doc.roundedRect(x - 2.5, y - 2.5, size + 5, size + 5, 1.5, 1.5, 'F'); }
  c.fill([0, 0, 0]);
  m.forEach((row, r) => row.forEach((dark, k) => { if (dark) c.doc.rect(x + k * cell, y + r * cell, cell + 0.01, cell + 0.01, 'F'); }));
  c.set(6.8, 'normal', caption);
  c.doc.text(c.v.L.scanToPay, x + size / 2, y + size + (onColour ? 6 : 3.5), { align: 'center' });
}

/**
 * Payment details beside an optional QR code, below a rule. Without a QR code the signature (Pro)
 * sits on the right of the same block, so a signed invoice doesn't spill onto a second page.
 */
function payment(c: Ctx, b: Box, labelCol: RGB = C_MID) {
  const { v } = c;
  if (!v.payment.length && !v.qr) return;
  if (v.signature && !v.qr) {
    const half = { x: b.x, w: b.w * 0.55 };
    const top = c.y;
    paymentRows(c, half, labelCol, 0);
    const end = c.y;
    c.y = top + 6;
    signature(c, { x: b.x + b.w * 0.6, w: b.w * 0.4 }, true);
    c.y = Math.max(end, c.y);
    return;
  }
  paymentRows(c, b, labelCol, v.qr ? 27 : 0); // the signature then follows the notes, at the layout's end
}

function paymentRows(c: Ctx, b: Box, labelCol: RGB, qrSize: number) {
  const { v, doc } = c;
  const labelW = 34;
  c.set(8.5);
  const rowsH = v.payment.reduce((sum, [, value]) => sum + c.wrap(value, b.w - labelW - qrSize - 8).length * LINE + 0.7, 0);
  c.ensure(Math.max(rowsH + 12, qrSize + 12));
  c.rule(c.y, b.x, b.x + b.w); c.y += 6;
  const top = c.y;
  label(c, v.L.paymentDetails, b.x, c.y, labelCol); c.y += 5.5;
  for (const [lbl, value] of v.payment) {
    c.set(8.5, 'normal', C_MID); doc.text(lbl, b.x, c.y);
    c.set(8.5, 'normal', C_INK);
    const val = c.wrap(value, b.w - labelW - qrSize - 8);
    doc.text(val, b.x + labelW, c.y);
    c.y += val.length * LINE + 0.7;
  }
  if (v.qr && qrSize) {
    drawQr(c, b.x + b.w - qrSize, top - 2, qrSize);
    c.y = Math.max(c.y, top - 2 + qrSize + 6);
  }
  c.y += 3;
}

/** Payment stacked label-over-value for a narrow column (the Sidebar panel). */
function paymentStacked(c: Ctx, b: Box, labelCol: RGB, ink: RGB = C_INK, muted: RGB = C_MID, onColour = false) {
  const { v, doc } = c;
  if (!v.payment.length && !v.qr) return;
  label(c, v.L.paymentDetails, b.x, c.y, labelCol); c.y += 5.5;
  for (const [lbl, value] of v.payment) {
    c.set(7, 'normal', muted); doc.text(lbl, b.x, c.y); c.y += 3.6;
    c.set(8.5, 'normal', ink);
    const val = c.wrap(value, b.w);
    doc.text(val, b.x, c.y); c.y += val.length * LINE + 1.6;
  }
  if (v.qr) { c.y += 4; drawQr(c, b.x + 2.5, c.y, 28, muted, onColour); c.y += 38; }
}

function notes(c: Ctx, b: Box, labelCol: RGB = C_MID) {
  if (!c.v.notes) return;
  const l = c.wrap(c.v.notes, b.w);
  c.ensure(Math.min(l.length * LINE + 12, 60));
  c.rule(c.y, b.x, b.x + b.w); c.y += 6;
  label(c, c.v.L.notes, b.x, c.y, labelCol); c.y += 5.5;
  c.set(8.5, 'normal', C_MID);
  for (const line of l) { c.ensure(LINE); c.doc.text(line, b.x, c.y); c.y += LINE; }
}

/** Pro: an uploaded signature above a line, the signer's name, and "Authorised signature". */
function signature(c: Ctx, b: Box, inline = false) {
  const sig = c.v.signature;
  if (!sig || c.signed) return;
  c.signed = true;
  const w = Math.min(60, b.w);
  const x = b.x + b.w - w;
  if (!inline) { c.ensure(30); c.y += 4; }
  try {
    const p = c.doc.getImageProperties(sig.image);
    const s = Math.min(w / p.width, 16 / p.height);
    c.doc.addImage(sig.image, 'PNG', x, c.y, p.width * s, p.height * s);
  } catch { /* unreadable image: keep the line so it can be signed by hand */ }
  c.y += 18;
  c.rule(c.y, x, x + w, 0.3, C_INK);
  c.y += 4.5;
  if (sig.name) { c.set(8.5, 'bold', C_INK); c.doc.text(sig.name, x, c.y); c.y += 4.2; }
  c.set(7.5, 'normal', C_MID); c.doc.text(sig.label, x, c.y);
  c.y += 4;
}

/**
 * Pro: a rubber stamp, the way a passport is stamped — a rounded double outline,
 * tilted, in stamp ink. Paid is green ink; Draft is grey. Drawn as rotated polygons
 * so it needs no PDF transform support.
 */
function stamp(c: Ctx, cx: number, cy: number) {
  const st = c.v.stamp;
  if (!st) return;
  const { doc } = c;
  const ink = st.kind === 'paid' ? C_PAID : C_MID;
  const deg = 8, a = (deg * Math.PI) / 180;
  const rot = (x: number, y: number): [number, number] => [cx + x * Math.cos(a) + y * Math.sin(a), cy - x * Math.sin(a) + y * Math.cos(a)];
  c.set(17, 'bold', ink, 'head');
  const text = st.text.toLocaleUpperCase(c.v.locale);
  const tw = doc.getTextWidth(text);
  const w = Math.max(tw + 12, 40), h = st.date ? 19 : 14;
  const outline = (inset: number, r: number, lw: number) => {
    const hw = w / 2 - inset, hh = h / 2 - inset;
    const pts: [number, number][] = [];
    const corners: [number, number, number][] = [[hw - r, -hh + r, -90], [hw - r, hh - r, 0], [-hw + r, hh - r, 90], [-hw + r, -hh + r, 180]];
    for (const [ox, oy, start] of corners) {
      for (let k = 0; k <= 6; k++) {
        const t = ((start + k * 15) * Math.PI) / 180;
        pts.push(rot(ox + r * Math.cos(t), oy + r * Math.sin(t)));
      }
    }
    pts.push(pts[0]);
    doc.setLineWidth(lw); doc.setDrawColor(...ink);
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  };
  outline(0, 3, 0.7);
  outline(1.4, 2, 0.25);
  // Text rotates about its start point; place that point so the text is centred in the stamp.
  const [tx, ty] = rot(-tw / 2, st.date ? 1.2 : 2.6);
  doc.text(text, tx, ty, { angle: deg });
  if (st.date) {
    c.set(7.5, 'bold', ink);
    const dw = doc.getTextWidth(st.date);
    const [dx, dy] = rot(-dw / 2, 6.4);
    doc.text(st.date, dx, dy, { angle: deg });
  }
}

function footer(c: Ctx) {
  const { v, doc, W, H } = c;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (v.footer && p === pages) {
      c.set(8, 'normal', C_LIGHT);
      // Long footers grow upward, so they never run into the credit line / page numbers below.
      const lines = c.wrap(v.footer, W - 2 * M);
      doc.text(lines, W / 2, H - 11 - (lines.length - 1) * 3.4, { align: 'center' });
    }
    // The free version's credit: small, bottom-left of the last page, a real link to the site.
    if (v.madeWith && p === pages) {
      c.set(6.5, 'normal', C_LIGHT);
      doc.textWithLink(v.madeWith, M, H - 6, { url: SITE.url + '/' });
    }
    if (pages > 1) {
      c.set(7, 'normal', C_LIGHT);
      doc.text(`${v.number || ''}  ${p}/${pages}`.trim(), W - M, H - 6, { align: 'right' });
    }
  }
}

/** Sender block: optional logo above or beside the name, then the contact lines. Returns the bottom y. */
function senderBlock(c: Ctx, b: Box, o: { y: number; nameSize: number; text: RGB; muted: RGB; logoBeside?: boolean; align?: 'left' | 'center' }): number {
  const { v, doc } = c;
  let y = o.y;
  let x = b.x;
  let w = b.w;
  const logo = logoBox(c, o.logoBeside ? 20 : 40, o.logoBeside ? 20 : 16);
  if (logo) {
    if (o.logoBeside) {
      doc.addImage(v.sender.logo, logo.fmt, b.x, y - 4, logo.w, logo.h);
      x = b.x + logo.w + 4; w = b.w - logo.w - 4;
    } else {
      const lx = o.align === 'center' ? b.x + (b.w - logo.w) / 2 : b.x;
      doc.addImage(v.sender.logo, logo.fmt, lx, y - 4, logo.w, logo.h);
      y += logo.h + 3;
    }
  }
  const ax = o.align === 'center' ? b.x + b.w / 2 : x;
  c.set(o.nameSize, 'bold', o.text, 'head');
  const name = c.wrap(v.sender.name || 'Your Business', w);
  doc.text(name, ax, y + 1, { align: o.align ?? 'left' });
  y += 1 + name.length * (o.nameSize * 0.44);
  c.set(8, 'normal', o.muted);
  for (const line of v.sender.lines) {
    const l = c.wrap(line, w);
    doc.text(l, ax, y, { align: o.align ?? 'left' });
    y += l.length * 4;
  }
  return Math.max(y, logo && o.logoBeside ? o.y - 4 + logo.h : 0);
}

/** "Date: 1 Oct 2026" lines, right-aligned. Returns the bottom y. */
function metaLines(c: Ctx, x: number, y: number, col: RGB, align: 'left' | 'right' = 'right', skipDue = false): number {
  c.set(8, 'normal', col);
  for (const [lbl, value] of c.v.meta) {
    if (skipDue && (lbl === c.v.L.due || lbl === c.v.L.validUntil)) continue;
    c.doc.text(`${lbl}: ${value}`, x, y, { align }); y += 4.3;
  }
  return y;
}

// ── Layouts ──────────────────────────────────────────────────────────────────
interface Colours { classicAccent: RGB; bandFill: RGB; bandAccent: RGB; brand: RGB; minimalAccent: RGB }

function layoutMinimal(c: Ctx, k: Colours) {
  const { v, doc, W } = c;
  const R = W - M, CW = W - 2 * M;
  c.y = 20;
  const leftEnd = senderBlock(c, { x: M, w: CW * 0.55 }, { y: c.y, nameSize: 12.5, text: C_INK, muted: C_MID, logoBeside: true });
  c.set(8.5, 'normal', C_MID); doc.text(v.titleText, R, c.y + 1, { align: 'right' });
  c.set(22, 'bold', C_INK, 'head'); doc.text(v.number || '—', R, c.y + 10, { align: 'right' });
  const rightEnd = metaLines(c, R, c.y + 16, C_MID);
  c.y = Math.max(leftEnd, rightEnd) + 5;
  c.rule(c.y, M, R, 0.5, C_INK); c.y += 8;
  const billTop = c.y;
  billTo(c, { x: M, w: CW * 0.6 });
  stamp(c, R - 26, billTop + 6);
  c.y += 8;
  itemsTable(c, { x: M, w: CW }, { head: 'rule', rows: 'hair' });
  totals(c, { x: M + CW * 0.48, w: CW * 0.52 }, 'big', k.minimalAccent);
  taxNote(c, { x: M, w: CW });
  c.y += 4;
  payment(c, { x: M, w: CW });
  notes(c, { x: M, w: CW });
  signature(c, { x: M, w: CW });
}

function layoutLetterhead(c: Ctx, k: Colours) {
  const { v, doc, W } = c;
  const R = W - M, CW = W - 2 * M;
  const accent = readable(k.classicAccent);
  c.y = 20;
  // Centred letterhead: logo, name, then the contact lines run together on one line
  const logo = logoBox(c, 40, 16);
  if (logo) { doc.addImage(v.sender.logo, logo.fmt, (W - logo.w) / 2, c.y - 4, logo.w, logo.h); c.y += logo.h + 4; }
  c.set(17, 'bold', C_INK, 'head');
  doc.text(c.wrap(v.sender.name || 'Your Business', CW), W / 2, c.y + 2, { align: 'center' });
  c.y += 8;
  c.set(8, 'normal', C_MID);
  const contact = c.wrap(v.sender.lines.join('     '), CW);
  doc.text(contact, W / 2, c.y, { align: 'center' }); c.y += contact.length * 4 + 2;
  c.rule(c.y, M, R, 0.8, accent); c.rule(c.y + 1.3, M, R, 0.2, accent);
  c.y += 12;
  // Title and number on the left; dates in a two-column grid on the right
  c.set(21, 'bold', C_INK, 'head'); doc.text(v.titleText, M, c.y + 2);
  c.set(9, 'normal', C_MID); doc.text(`${v.L.number} ${v.number || '—'}`, M, c.y + 8);
  let my = c.y - 1;
  for (const [lbl, value] of v.meta) {
    c.set(8, 'normal', C_MID); doc.text(lbl, R - 42, my);
    c.set(8.5, 'normal', C_INK); doc.text(value, R, my, { align: 'right' });
    my += 4.6;
  }
  c.y = Math.max(c.y + 16, my + 6);
  const billTop = c.y;
  billTo(c, { x: M, w: CW * 0.6 });
  stamp(c, R - 26, billTop + 6);
  c.y += 9;
  itemsTable(c, { x: M, w: CW }, { head: 'rule', rows: 'hair', ruleColor: accent });
  totals(c, { x: M + CW * 0.52, w: CW * 0.48 }, 'text', accent);
  taxNote(c, { x: M, w: CW });
  c.y += 4;
  payment(c, { x: M, w: CW });
  notes(c, { x: M, w: CW });
  signature(c, { x: M, w: CW });
}

function layoutBand(c: Ctx, k: Colours) {
  const { v, doc, W } = c;
  const R = W - M, CW = W - 2 * M;
  const band = k.bandFill, txt = onFill(band);
  const muted: RGB = txt === C_WHITE ? tint(band, 0.25).map(x => Math.min(255, x + 10)) as unknown as RGB : C_MID;
  const hi = onFill(band) === C_WHITE ? k.bandAccent : readable(k.bandAccent);
  // Measure, then paint the band behind the header so light text never lands on paper
  const top = 16;
  const probe = () => {
    let left = top + 1;
    c.set(13, 'bold'); left += c.wrap(v.sender.name || 'Your Business', CW * 0.5).length * 5.8;
    c.set(8); left += v.sender.lines.reduce((s, l) => s + c.wrap(l, CW * 0.5).length * 4, 0);
    return Math.max(left + (logoBox(c, 20, 20) ? 4 : 0), top + 34) + 7;
  };
  const bandH = probe();
  c.fill(band); doc.rect(0, 0, W, bandH, 'F');
  senderBlock(c, { x: M, w: CW * 0.5 }, { y: top, nameSize: 13, text: txt, muted, logoBeside: true });
  // Right: the title, then the amount due as the band's headline, then when it's due
  c.set(8.5, 'bold', muted); doc.text(`${v.title}  ${v.number || ''}`.trim(), R, top + 1, { align: 'right' });
  c.set(8, 'normal', muted); doc.text(v.amountDue.label, R, top + 9, { align: 'right' });
  c.set(22, 'bold', hi, 'head'); doc.text(v.amountDue.value, R, top + 18, { align: 'right' });
  c.set(8.5, 'normal', txt);
  if (v.amountDue.due) doc.text(`${v.L.due}: ${v.amountDue.due}`, R, top + 24.5, { align: 'right' });
  c.y = bandH + 9;
  // Under the band: bill-to on the left, the dates on the right
  const billTop = c.y;
  billTo(c, { x: M, w: CW * 0.55 }, readable(k.bandAccent));
  const metaEnd = metaLines(c, R, billTop, C_MID, 'right', !!v.amountDue.due);
  c.y = Math.max(c.y, metaEnd);
  stamp(c, R - 26, metaEnd + 9);
  c.y += v.stamp ? 18 : 8;
  itemsTable(c, { x: M, w: CW }, { head: 'fill', headFill: band, zebra: true });
  totals(c, { x: M + CW * 0.52, w: CW * 0.48 }, 'strip', k.bandAccent);
  taxNote(c, { x: M, w: CW });
  c.y += 4;
  payment(c, { x: M, w: CW });
  notes(c, { x: M, w: CW });
  signature(c, { x: M, w: CW });
}

function layoutSidebar(c: Ctx, k: Colours) {
  const { v, doc, W, H } = c;
  const PW = 62;                            // panel width
  const panel = k.brand;                    // solid brand colour, the template's signature
  const txt = onFill(panel);
  const muted = mutedOn(panel, 0.22);
  const labelCol: RGB = txt === C_WHITE ? tint(panel, 0.3) : C_INK;
  const brandText = readable(k.brand);
  const P: Box = { x: 10, w: PW - 18 };     // inside the panel
  const X = PW + 10, R = W - M, MW = R - X; // the main column
  const paint = () => { c.fill(panel); doc.rect(0, 0, PW, H, 'F'); };
  paint();
  c.onNewPage = paint;
  c.topY = 18;

  // ── The panel: who it's from, who it's for, how to pay ──────────────────
  c.y = 20;
  const logo = logoBox(c, P.w, 18);
  if (logo) { doc.addImage(v.sender.logo, logo.fmt, P.x, c.y - 4, logo.w, logo.h); c.y += logo.h + 3; }
  c.set(12, 'bold', txt, 'head');
  const name = c.wrap(v.sender.name || 'Your Business', P.w);
  doc.text(name, P.x, c.y + 1); c.y += 1 + name.length * 5.4;
  c.set(7.8, 'normal', muted);
  for (const line of v.sender.lines) { const l = c.wrap(line, P.w); doc.text(l, P.x, c.y); c.y += l.length * 3.8; }
  c.y += 10;
  billTo(c, P, labelCol, txt, muted);
  c.y += 10;
  paymentStacked(c, P, labelCol, txt, muted, true);

  // ── The main column: what, how much, by when ────────────────────────────
  c.y = 22;
  c.set(26, 'bold', C_INK, 'head'); doc.text(v.titleText, X, c.y + 2);
  c.set(9, 'normal', C_MID); doc.text(`${v.L.number} ${v.number || '—'}`, X, c.y + 9.5);
  c.y += 19;
  // Dates side by side, label over value
  const cols = v.meta.length ? Math.min(v.meta.length, 3) : 1;
  v.meta.slice(0, 3).forEach(([lbl, value], i) => {
    const x = X + (MW / cols) * i;
    c.set(7, 'normal', C_MID); doc.text(lbl, x, c.y);
    c.set(9, 'bold', C_INK); doc.text(value, x, c.y + 4.6);
  });
  c.y += 14;
  stamp(c, R - 22, 26);
  itemsTable(c, { x: X, w: MW }, { head: 'rule', rows: 'hair', ruleColor: brandText });
  totals(c, { x: X + MW * 0.38, w: MW * 0.62 }, 'strip', k.brand);
  taxNote(c, { x: X, w: MW });
  c.y += 4;
  notes(c, { x: X, w: MW }, brandText);
  signature(c, { x: X, w: MW });
}

function layoutAccounts(c: Ctx, k: Colours) {
  const { v, doc, W } = c;
  const R = W - M, CW = W - 2 * M;
  const brand = k.brand;
  c.y = 20;
  const leftEnd = senderBlock(c, { x: M, w: CW * 0.55 }, { y: c.y, nameSize: 13, text: C_INK, muted: C_MID, logoBeside: true });
  c.set(18, 'bold', readable(brand), 'head'); doc.text(v.title, R, c.y + 3, { align: 'right' });
  c.y = Math.max(leftEnd, c.y + 12) + 6;
  // Summary boxes: the four facts a bookkeeper looks for first
  const cells: [string, string][] = [[v.L.number, v.number || '—'], [v.L.date, v.meta[0]?.[1] ?? '']];
  if (v.amountDue.due) cells.push([v.L.due, v.amountDue.due]);
  cells.push([v.amountDue.label, v.amountDue.value]);
  const cw = CW / cells.length, headH = 7, valH = 10;
  c.fill(brand); doc.rect(M, c.y, CW, headH, 'F');
  doc.setLineWidth(0.3); doc.setDrawColor(...C_INK); doc.rect(M, c.y, CW, headH + valH, 'S');
  cells.forEach(([lbl, value], i) => {
    const x = M + cw * i;
    if (i > 0) { doc.setLineWidth(0.2); doc.setDrawColor(...C_RULE); doc.line(x, c.y + headH, x, c.y + headH + valH); }
    c.set(6.6, 'bold', onFill(brand)); doc.text(lbl.toLocaleUpperCase(v.locale), x + 3, c.y + 4.7);
    c.set(i === cells.length - 1 ? 10.5 : 9.5, 'bold', C_INK);
    doc.text(c.wrap(value, cw - 6)[0], x + 3, c.y + headH + 6.5);
  });
  c.y += headH + valH + 10;
  const billTop = c.y;
  billTo(c, { x: M, w: CW * 0.55 });
  if (v.meta.length > 2) metaLines(c, R, billTop, C_MID); // a reference, if any
  stamp(c, R - 26, billTop + (v.meta.length > 2 ? 16 : 6));
  c.y += 9;
  itemsTable(c, { x: M, w: CW }, { head: 'caps', rows: 'hair', numbered: true, grid: true });
  totals(c, { x: M + CW * 0.52, w: CW * 0.48 }, 'double', C_INK);
  taxNote(c, { x: M, w: CW });
  c.y += 4;
  payment(c, { x: M, w: CW });
  notes(c, { x: M, w: CW });
  signature(c, { x: M, w: CW });
}

function layoutStudio(c: Ctx, k: Colours) {
  const { v, doc, W } = c;
  const R = W - M, CW = W - 2 * M;
  const block = k.brand, txt = onFill(block);
  const muted = mutedOn(block, 0.18);
  const BH = 96;                            // the colour block: the page's headline
  c.fill(block); doc.rect(0, 0, W, BH, 'F');
  // Quiet top line inside the block: who it's from, and which document this is
  senderBlock(c, { x: M, w: CW * 0.5 }, { y: 18, nameSize: 10, text: txt, muted, logoBeside: true });
  c.set(8.5, 'normal', muted);
  doc.text(`${v.titleText} ${v.number || ''}`.trim(), R, 19, { align: 'right' });
  metaLines(c, R, 23.5, muted, 'right', !!v.amountDue.due);
  // The headline: what is owed, and by when
  c.set(9.5, 'normal', muted); doc.text(v.amountDue.label, M, 60);
  c.set(40, 'bold', txt, 'head'); doc.text(v.amountDue.value, M - 0.6, 76);
  c.set(10.5, 'normal', txt);
  if (v.amountDue.due) doc.text(`${v.L.due} ${v.amountDue.due}`, M, 85);
  c.y = BH + 12;
  const billTop = c.y;
  billTo(c, { x: M, w: CW * 0.6 });
  stamp(c, R - 26, billTop + 7);
  c.y += 10;
  itemsList(c, { x: M, w: CW });
  totals(c, { x: M + CW * 0.52, w: CW * 0.48 }, 'plain', readable(k.brand));
  taxNote(c, { x: M, w: CW });
  c.y += 4;
  payment(c, { x: M, w: CW });
  notes(c, { x: M, w: CW });
  signature(c, { x: M, w: CW });
}

const LAYOUTS: Record<Template, (c: Ctx, k: Colours) => void> = {
  minimal: layoutMinimal, classic: layoutLetterhead, modern: layoutBand,
  executive: layoutSidebar, ledger: layoutAccounts, studio: layoutStudio,
};

function coloursFor(s: InvoiceState, pro: boolean): Colours {
  const brand = hexToRgb(s.brandColor, BRAND_FALLBACK);
  return {
    classicAccent: hexToRgb(s.classicAccent, [27, 31, 46]),
    bandFill: hexToRgb(s.modernHeader, [15, 23, 42]),
    bandAccent: hexToRgb(s.modernAccent, [14, 165, 233]),
    brand,
    // Minimal is ink-only for free; Pro may colour its amount due in the brand colour
    minimalAccent: pro ? readable(brand) : C_INK,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────
export interface PdfOptions { pro?: boolean }

async function buildDoc(state: InvoiceState, opts: PdfOptions = {}): Promise<jsPDF> {
  const pro = !!opts.pro;
  const view = buildInvoiceView(state, { pro });
  const tpl = effectiveTemplate(state.template, pro);
  const fam = familiesFor(tpl, view);
  const { doc, fonts } = await newDoc(view.paper, [...new Set([fam.head, fam.body])]);
  doc.setProperties({ title: `${view.title} ${view.number}`.trim(), creator: SITE.name });
  const c = makeCtx(doc, view, fonts, fam);
  LAYOUTS[tpl](c, coloursFor(state, pro));
  footer(c);
  return doc;
}

export function pdfFilename(state: InvoiceState): string {
  const num = (state.invoiceNumber || 'draft').replace(/[^\w.-]+/g, '-');
  const client = state.clientName.trim().normalize('NFKD').replace(/[^\w ]/g, '').replace(/\s+/g, '-').slice(0, 24);
  return client ? `${num}_${client}.pdf` : `${num}.pdf`;
}

/** Download the invoice as a PDF file. */
export async function generateInvoicePDF(state: InvoiceState, opts: PdfOptions = {}): Promise<void> {
  (await buildDoc(state, opts)).save(pdfFilename(state));
}

/** Open the PDF in a new tab with the print dialog (prints the real PDF, not the page). */
export async function printInvoicePDF(state: InvoiceState, opts: PdfOptions = {}): Promise<void> {
  // Open the tab synchronously (inside the click) so popup blockers allow it, then fill it.
  const win = window.open('', '_blank');
  let doc: jsPDF;
  try {
    doc = await buildDoc(state, opts);
  } catch (e) {
    win?.close(); // don't leave an empty tab behind when generation fails
    throw e;
  }
  doc.autoPrint();
  const url = URL.createObjectURL(doc.output('blob'));
  if (win) win.location.href = url; else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** For tests and previews: the raw PDF bytes. */
export async function invoicePdfBlob(state: InvoiceState, opts: PdfOptions = {}): Promise<Blob> {
  return (await buildDoc(state, opts)).output('blob');
}

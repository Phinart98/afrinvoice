// ─────────────────────────────────────────────────────────────────────────────
// Invoice PDF — jsPDF, fully client-side.
//
// Renders an InvoiceView (see invoiceView.ts), so it prints exactly what the
// preview shows. Three looks share one layout engine:
//   classic — white, dark table header, accent-coloured total
//   modern  — full-bleed colour header band, accent total strip
//   minimal — hairlines only
// Text uses an embedded Noto Sans subset (fetched on first use) so every
// currency symbol (₵ ₦ ₹ ₱ ₩ ₺ ₽ …) and accented name renders correctly.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf';
import type { InvoiceState } from '../types/invoice';
import { buildInvoiceView, type InvoiceView } from './invoiceView';
import { qrMatrix } from './paymentQr';
import { SITE } from '../site';

type RGB = readonly [number, number, number];

const C_DARK:  RGB = [15, 23, 42];
const C_MID:   RGB = [71, 85, 105];
const C_LIGHT: RGB = [148, 163, 184];
const C_WHITE: RGB = [255, 255, 255];
const C_ALT:   RGB = [248, 250, 252];
const C_RULE:  RGB = [226, 232, 240];

const PAPER = { A4: [210, 297], Letter: [215.9, 279.4] } as const;
const M = 15;                  // page margin
const LINE = 4.3;              // body line height (mm) at 8.5pt

// ── Fonts ────────────────────────────────────────────────────────────────────
let fontCache: Promise<{ regular: string; bold: string } | null> | null = null;

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

function loadFonts() {
  fontCache ??= Promise.all([fetchBase64('/fonts/NotoSans-Regular.ttf'), fetchBase64('/fonts/NotoSans-Bold.ttf')])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch(() => { fontCache = null; return null; }); // retry next time; fall back to Helvetica now
  return fontCache;
}

async function newDoc(paper: InvoiceView['paper']): Promise<{ doc: jsPDF; font: string }> {
  const doc = new jsPDF({ unit: 'mm', format: paper === 'Letter' ? 'letter' : 'a4' });
  const fonts = await loadFonts();
  if (!fonts) return { doc, font: 'helvetica' };
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  return { doc, font: 'NotoSans' };
}

// ── Small helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex: string, fallback: RGB): RGB {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function logoFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg')) return 'JPEG';
  return null;
}

interface Style {
  headerBand: RGB | null;     // modern: coloured band behind the header
  headerText: RGB;
  headerMuted: RGB;
  tableHead: 'fill' | 'rule';
  tableFill: RGB;
  accent: RGB;
  grand: 'text' | 'strip' | 'plain';
}

function styleFor(s: InvoiceState): Style {
  if (s.template === 'modern') {
    const band = hexToRgb(s.modernHeader, C_DARK);
    return { headerBand: band, headerText: C_WHITE, headerMuted: [190, 205, 225], tableHead: 'fill', tableFill: band,
      accent: hexToRgb(s.modernAccent, [14, 165, 233]), grand: 'strip' };
  }
  if (s.template === 'classic') {
    return { headerBand: null, headerText: C_DARK, headerMuted: C_MID, tableHead: 'fill', tableFill: C_DARK,
      accent: hexToRgb(s.classicAccent, [180, 83, 9]), grand: 'text' };
  }
  return { headerBand: null, headerText: C_DARK, headerMuted: C_MID, tableHead: 'rule', tableFill: C_DARK,
    accent: C_DARK, grand: 'plain' };
}

// ── Renderer ─────────────────────────────────────────────────────────────────
function render(doc: jsPDF, font: string, v: InvoiceView, s: InvoiceState): void {
  const [W, H] = PAPER[v.paper];
  const R = W - M;
  const CW = W - 2 * M;
  const st = styleFor(s);
  const color = (c: RGB, target: 'text' | 'fill' | 'draw') =>
    target === 'text' ? doc.setTextColor(...c) : target === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
  const set = (size: number, weight: 'normal' | 'bold' = 'normal', c: RGB = C_DARK) => {
    doc.setFont(font, weight); doc.setFontSize(size); color(c, 'text');
  };
  const rule = (y: number, x1 = M, x2 = R, w = 0.25, c: RGB = C_RULE) => { doc.setLineWidth(w); color(c, 'draw'); doc.line(x1, y, x2, y); };
  const wrap = (text: string, width: number): string[] => doc.splitTextToSize(text, width) as string[];

  let y = 0;
  const bottom = H - 16;
  const ensure = (needed: number) => { if (y + needed > bottom) { doc.addPage(); y = 18; } };

  // ── Header ────────────────────────────────────────────────────────────────
  y = st.headerBand ? 13 : 18;

  // Measure first: the Modern band must grow to fit the header, or light text lands on white paper
  let textX = M;
  let logo: { fmt: string; w: number; h: number } | null = null;
  const fmt = v.sender.logo ? logoFormat(v.sender.logo) : null;
  if (fmt) {
    try {
      const props = doc.getImageProperties(v.sender.logo);
      const size = 20;
      const ratio = props.width / props.height;
      logo = { fmt, w: ratio >= 1 ? size : size * ratio, h: ratio >= 1 ? size / ratio : size };
      textX = M + logo.w + 4;
    } catch { /* unreadable logo — text-only header */ }
  }
  const leftW = CW * 0.55 - (textX - M);
  set(12.5, 'bold', st.headerText);
  const nameLines = wrap(v.sender.name || 'Your Business', leftW);
  set(8, 'normal', st.headerMuted);
  const senderLines = v.sender.lines.map(line => wrap(line, leftW));
  const leftEnd = y + 1 + nameLines.length * 5.5 + senderLines.reduce((sum, l) => sum + l.length * 4, 0);
  const rightEnd = y + 1 + (s.template === 'minimal' ? 13 : 13.5) + v.meta.length * 4.3;
  const bandH = Math.max(44, Math.max(leftEnd, rightEnd) + 2);
  if (st.headerBand) { color(st.headerBand, 'fill'); doc.rect(0, 0, W, bandH, 'F'); }

  if (logo) doc.addImage(v.sender.logo, logo.fmt, M, y - 4, logo.w, logo.h);
  set(12.5, 'bold', st.headerText);
  doc.text(nameLines, textX, y + 1);
  let leftY = y + 1 + nameLines.length * 5.5;
  set(8, 'normal', st.headerMuted);
  for (const l of senderLines) {
    doc.text(l, textX, leftY);
    leftY += l.length * 4;
  }

  // Title + number + meta (right)
  let rightY = y + 1;
  if (s.template === 'minimal') {
    set(8, 'normal', C_LIGHT); doc.text(v.title, R, rightY, { align: 'right' }); rightY += 7;
    set(16, 'bold', C_DARK);   doc.text(v.number || '—', R, rightY, { align: 'right' }); rightY += 6;
  } else {
    set(19, 'bold', st.headerBand ? st.accent : C_DARK); doc.text(v.title, R, rightY + 2, { align: 'right' }); rightY += 9;
    set(8.5, 'normal', st.headerMuted); doc.text(`${v.L.number} ${v.number || '—'}`, R, rightY, { align: 'right' }); rightY += 4.5;
  }
  set(8, 'normal', st.headerMuted);
  for (const [label, value] of v.meta) { doc.text(`${label}: ${value}`, R, rightY, { align: 'right' }); rightY += 4.3; }

  y = Math.max(leftY, rightY, st.headerBand ? bandH : 0) + 6;
  if (!st.headerBand) { rule(y - 2, M, R, s.template === 'minimal' ? 0.5 : 0.25, s.template === 'minimal' ? C_DARK : C_RULE); y += 5; }

  // ── Bill to ───────────────────────────────────────────────────────────────
  set(6.8, 'bold', st.headerBand ? st.accent : C_LIGHT);
  doc.text(v.L.billTo.toUpperCase(), M, y); y += 5;
  set(9.5, 'bold', C_DARK);
  const clientName = wrap(v.client.name || '—', CW * 0.6);
  doc.text(clientName, M, y); y += clientName.length * 4.8;
  set(8.5, 'normal', C_MID);
  for (const line of v.client.lines) { const l = wrap(line, CW * 0.6); doc.text(l, M, y); y += l.length * LINE; }
  y += 7;

  // ── Items table ───────────────────────────────────────────────────────────
  const COL_QTY = 16, COL_UNIT = 36, COL_AMT = 38;
  const COL_DESC = CW - COL_QTY - COL_UNIT - COL_AMT;
  const xQty = M + COL_DESC + COL_QTY / 2;
  const xUnit = M + COL_DESC + COL_QTY + COL_UNIT - 2;
  const xAmt = R - 2;
  const padL = st.tableHead === 'fill' && st.headerBand ? 6 : 2.5;

  const drawHead = () => {
    const h = 8;
    if (st.tableHead === 'fill') {
      color(st.tableFill, 'fill'); doc.rect(M, y, CW, h, 'F');
      if (st.headerBand) { color(st.accent, 'fill'); doc.rect(M, y, 2.5, h, 'F'); }
      set(7.5, 'bold', C_WHITE);
    } else {
      rule(y, M, R, 0.4, C_DARK);
      set(7.2, 'bold', C_MID);
    }
    const ty = y + 5.3;
    doc.text(v.columns[0], M + padL, ty);
    doc.text(v.columns[1], xQty, ty, { align: 'center' });
    doc.text(v.columns[2], xUnit, ty, { align: 'right' });
    doc.text(v.columns[3], xAmt, ty, { align: 'right' });
    y += h;
    if (st.tableHead === 'rule') rule(y, M, R, 0.4, C_DARK);
  };

  ensure(20);
  drawHead();
  v.items.forEach((it, i) => {
    set(8.5, 'normal', C_DARK);
    const desc = wrap(it.description, COL_DESC - padL - 3);
    const rowH = Math.max(8, desc.length * LINE + 3.7);
    if (y + rowH > bottom) { doc.addPage(); y = 18; drawHead(); set(8.5, 'normal', C_DARK); }
    if (st.tableHead === 'fill' && i % 2 === 1) { color(C_ALT, 'fill'); doc.rect(M, y, CW, rowH, 'F'); }
    const ty = y + 5.3;
    doc.text(desc, M + padL, ty);
    color(C_MID, 'text');
    doc.text(it.qty, xQty, ty, { align: 'center' });
    doc.text(it.unit, xUnit, ty, { align: 'right' });
    color(C_DARK, 'text');
    doc.text(it.amount, xAmt, ty, { align: 'right' });
    y += rowH;
    if (st.tableHead === 'rule' && i < v.items.length - 1) rule(y, M, R, 0.15);
  });
  rule(y, M, R, st.tableHead === 'rule' ? 0.4 : 0.25, st.tableHead === 'rule' ? C_DARK : C_RULE);
  y += 6;

  // ── Totals ────────────────────────────────────────────────────────────────
  const TX = M + CW * 0.52;       // label column of the totals block
  // Keep the totals block together: measure wrapped labels instead of guessing a row height
  set(8.5, 'normal');
  ensure(v.totals.reduce((sum, row) => sum + (row.kind === 'grand' || row.kind === 'balance'
    ? 11.5 : Math.max(1, wrap(row.label, R - TX - 38).length) * LINE + 1.2), 4));
  for (const row of v.totals) {
    if (row.kind === 'grand' || row.kind === 'balance') {
      if (st.grand === 'strip' && row.kind === 'grand') {
        color(st.accent, 'fill'); doc.rect(TX - 3, y - 1.5, R - TX + 3, 9, 'F');
        set(10, 'bold', C_WHITE);
        doc.text(row.label.toUpperCase(), TX, y + 4.5);
        doc.text(row.value, R - 2, y + 4.5, { align: 'right' });
        y += 11;
        continue;
      }
      rule(y - 1, TX, R, 0.4, C_DARK);
      y += 4.5;
      set(10.5, 'bold', C_DARK);
      doc.text(row.label.toUpperCase(), TX, y);
      if (st.grand === 'text' && row.kind === 'grand') color(st.accent, 'text');
      doc.text(row.value, R - 2, y, { align: 'right' });
      y += 7;
      continue;
    }
    set(8.5, 'normal', row.kind === 'muted' ? C_LIGHT : C_MID);
    const label = wrap(row.label, R - TX - 38);
    doc.text(label, TX, y);
    color(row.kind === 'muted' ? C_LIGHT : C_DARK, 'text');
    doc.text(row.value, R - 2, y, { align: 'right' });
    y += Math.max(1, label.length) * LINE + 1.2;
  }
  if (v.taxNote) {
    set(8, 'normal', C_MID);
    const l = wrap(v.taxNote, CW);
    ensure(l.length * LINE + 2);
    doc.text(l, M, y + 1); y += l.length * LINE + 2;
  }
  y += 4;

  // ── Payment (+ QR) ────────────────────────────────────────────────────────
  if (v.payment.length || v.qr) {
    const qrSize = v.qr ? 27 : 0;
    set(8.5, 'normal');
    const rowsH = v.payment.reduce((sum, [, value]) => sum + wrap(value, CW - 34 - qrSize - 8).length * LINE + 0.7, 0);
    const blockH = Math.max(rowsH + 12, qrSize + 12);
    ensure(blockH);
    rule(y, M, R); y += 6;
    const top = y;
    set(6.8, 'bold', st.headerBand ? st.accent : C_LIGHT);
    doc.text(v.L.paymentDetails.toUpperCase(), M, y); y += 5.5;
    const labelW = 34;
    for (const [label, value] of v.payment) {
      set(8.5, 'normal', C_MID); doc.text(label, M, y);
      set(8.5, 'normal', C_DARK);
      const val = wrap(value, CW - labelW - qrSize - 8);
      doc.text(val, M + labelW, y);
      y += val.length * LINE + 0.7;
    }
    if (v.qr) {
      const m = qrMatrix(v.qr.payload);
      const cell = qrSize / m.length;
      const qx = R - qrSize, qy = top - 2;
      color([0, 0, 0], 'fill');
      m.forEach((row, r) => row.forEach((dark, c) => { if (dark) doc.rect(qx + c * cell, qy + r * cell, cell + 0.01, cell + 0.01, 'F'); }));
      set(6.8, 'normal', C_MID);
      doc.text(v.L.scanToPay, qx + qrSize / 2, qy + qrSize + 3.5, { align: 'center' });
      y = Math.max(y, qy + qrSize + 6);
    }
    y += 3;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (v.notes) {
    const l = wrap(v.notes, CW);
    ensure(Math.min(l.length * LINE + 12, 60));
    rule(y, M, R); y += 6;
    set(6.8, 'bold', st.headerBand ? st.accent : C_LIGHT);
    doc.text(v.L.notes.toUpperCase(), M, y); y += 5.5;
    set(8.5, 'normal', C_MID);
    for (const line of l) { ensure(LINE); doc.text(line, M, y); y += LINE; }
  }

  // ── Footer + page numbers ─────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (v.footer && p === pages) {
      set(8, 'normal', C_LIGHT);
      doc.text(wrap(v.footer, CW), W / 2, H - 11, { align: 'center' });
    }
    if (pages > 1) {
      set(7, 'normal', C_LIGHT);
      doc.text(`${v.number || ''}  ${p}/${pages}`.trim(), R, H - 6, { align: 'right' });
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
async function buildDoc(state: InvoiceState): Promise<jsPDF> {
  const view = buildInvoiceView(state);
  const { doc, font } = await newDoc(view.paper);
  doc.setProperties({ title: `${view.title} ${view.number}`.trim(), creator: SITE.name });
  render(doc, font, view, state);
  return doc;
}

export function pdfFilename(state: InvoiceState): string {
  const num = (state.invoiceNumber || 'draft').replace(/[^\w.-]+/g, '-');
  const client = state.clientName.trim().normalize('NFKD').replace(/[^\w ]/g, '').replace(/\s+/g, '-').slice(0, 24);
  return client ? `${num}_${client}.pdf` : `${num}.pdf`;
}

/** Download the invoice as a PDF file. */
export async function generateInvoicePDF(state: InvoiceState): Promise<void> {
  (await buildDoc(state)).save(pdfFilename(state));
}

/** Open the PDF in a new tab with the print dialog (prints the real PDF, not the page). */
export async function printInvoicePDF(state: InvoiceState): Promise<void> {
  // Open the tab synchronously (inside the click) so popup blockers allow it, then fill it.
  const win = window.open('', '_blank');
  let doc: jsPDF;
  try {
    doc = await buildDoc(state);
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
export async function invoicePdfBlob(state: InvoiceState): Promise<Blob> {
  return (await buildDoc(state)).output('blob');
}

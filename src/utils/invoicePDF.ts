// ─────────────────────────────────────────────────────────────────────────────
// Invoice PDF generation — jsPDF (client-side, no server required)
//
// Templates:
//   classic  — white/formal, dark header row, user-customisable total colour
//   modern   — navy header bar + amber accents, fully user-customisable colours
//   minimal  — ultra-clean, hairlines only, maximum whitespace
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from 'jspdf';
import type { InvoiceState } from '../types/invoice';
import { computeTotals } from '../types/invoice';

// ── Page geometry (A4, mm) ────────────────────────────────────────────────────
const PAGE_W  = 210;
const PAGE_H  = 297;
const ML      = 15;                    // margin left
const MR      = 15;                    // margin right
const CW      = PAGE_W - ML - MR;     // content width: 180mm
const RIGHT_X = PAGE_W - MR;          // right-aligned anchor

// ── Table column widths ───────────────────────────────────────────────────────
const COL_DESC   = 88;
const COL_QTY    = 18;
const COL_PRICE  = 37;
const COL_AMOUNT = CW - COL_DESC - COL_QTY - COL_PRICE;   // = 37mm

// ── Color palette (RGB tuples) ────────────────────────────────────────────────
const C_DARK    = [15,  23,  42]  as const;   // #0F172A — near-black
const C_MID     = [71,  85,  105] as const;   // #475569 — secondary text
const C_LIGHT   = [148, 163, 184] as const;   // #94A3B8 — muted labels
const C_AMBER   = [245, 158, 11]  as const;   // #F59E0B — brand accent
const C_WHITE   = [255, 255, 255] as const;
const C_ROW_ALT = [248, 250, 252] as const;   // #F8FAFC — subtle alt row
const C_RULE    = [226, 232, 240] as const;   // #E2E8F0 — horizontal rules

// ── Helpers ───────────────────────────────────────────────────────────────────
function rgb(doc: jsPDF, color: readonly [number, number, number], target: 'text' | 'fill' | 'draw') {
  const [r, g, b] = color;
  if (target === 'text')  doc.setTextColor(r, g, b);
  if (target === 'fill')  doc.setFillColor(r, g, b);
  if (target === 'draw')  doc.setDrawColor(r, g, b);
}

function rule(doc: jsPDF, y: number, weight = 0.25, color: readonly [number, number, number] = C_RULE) {
  doc.setLineWidth(weight);
  rgb(doc, color, 'draw');
  doc.line(ML, y, RIGHT_X, y);
}

function fmtCurrency(amount: number, symbol: string): string {
  return `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Convert a CSS hex colour string to an RGB tuple for jsPDF.
// Guards against partial/malformed strings (NaN would silently corrupt all PDF colours).
// Returns the jsPDF image format for a data URL. Throws for unsupported formats
// (caught by the surrounding try/catch in each render function).
function logoFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.startsWith('data:image/png'))  return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg')) return 'JPEG';
  throw new Error('Unsupported logo format');
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [245, 158, 11]; // amber fallback
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as const;
}

// Add a new page if y is too close to the bottom, returning the new y position.
function checkNewPage(doc: jsPDF, y: number, margin = 18): number {
  if (y > PAGE_H - margin) { doc.addPage(); return 15; }
  return y;
}

// jsPDF's built-in Helvetica uses Windows-1252 encoding. Currency symbols
// outside that charset (U+20B5 ₵, U+20A6 ₦, U+20B9 ₹, U+20B1 ₱) silently
// map to Latin-1 look-alikes (₵→µ etc.). Use ISO codes for those currencies.
const PDF_SAFE_SYMBOL: Record<string, string> = {
  GHS: 'GHS',   // GH₵ → ₵ (U+20B5) maps to µ in Latin-1
  NGN: 'NGN',   // ₦ (U+20A6) not in Windows-1252
  INR: 'INR',   // ₹ (U+20B9) not in Windows-1252
  PHP: 'PHP',   // ₱ (U+20B1) not in Windows-1252
};

function pdfSym(s: InvoiceState): string {
  return PDF_SAFE_SYMBOL[s.currency] ?? s.currencySymbol;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    // Append T00:00:00 to prevent UTC-midnight shifting the day in local TZ
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Shared derived constants (all three templates use these) ─────────────────
const TOTALS_LABEL_X = ML + COL_DESC + COL_QTY;  // 121mm — totals/payment label column
const PAYMENT_LABEL_W = 36;                        // payment field label column width
const TABLE_HEADER_H  = 8;                         // table header row height (mm)
const DEFAULT_ROW_H   = 8;                         // item row height — Minimal overrides to 8.5

// Returns true when there is at least one payment field to display.
function hasPaymentDetails(s: InvoiceState): boolean {
  return !!(s.visible.payment && (
    (s.paymentType === 'bank'         && (s.bankName || s.accountNumber || s.accountName || s.swiftCode)) ||
    (s.paymentType === 'mobile-money' && (s.momoProvider || s.momoNumber || s.momoName))
  ));
}

// Builds the ordered [label, value] pairs for the payment details section.
function paymentFields(s: InvoiceState): [string, string][] {
  return s.paymentType === 'bank'
    ? [['Bank', s.bankName], ['Account Name', s.accountName],
       ['Account Number', s.accountNumber], ['SWIFT / BIC', s.swiftCode]]
    : [['Provider', s.momoProvider], ['Account Name', s.momoName],
       ['Number', s.momoNumber]];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIC TEMPLATE
// White/formal. Dark table header. Amber total. Clean horizontal rules.
// ─────────────────────────────────────────────────────────────────────────────
function renderClassic(doc: jsPDF, s: InvoiceState): void {
  // Respect visibility flags — hidden tax means total = subtotal
  const effectiveTaxRate = s.visible.tax ? s.taxRate : 0;
  const { subtotal, taxAmount, total } = computeTotals(s.items, effectiveTaxRate);
  const sym = pdfSym(s);
  let y = 18;

  // ── Header: logo + business info (left) ─────────────────────────────────
  let textStartX = ML;

  if (s.businessLogo) {
    try {
      // Detect format from data URL prefix
      const fmt = logoFormat(s.businessLogo);
      doc.addImage(s.businessLogo, fmt, ML, y, 22, 22);
      textStartX = ML + 26;
    } catch {
      // Logo failed to decode — fall through to text-only layout
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  rgb(doc, C_DARK, 'text');
  doc.text(s.businessName || 'Your Business Name', textStartX, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rgb(doc, C_MID, 'text');

  let bizY = y + 12;
  if (s.businessEmail && s.visible.bizEmail)   { doc.text(s.businessEmail,   textStartX, bizY); bizY += 4.5; }
  if (s.businessPhone && s.visible.bizPhone)   { doc.text(s.businessPhone,   textStartX, bizY); bizY += 4.5; }
  if (s.businessAddress) {
    const wrapped = doc.splitTextToSize(s.businessAddress, 72);
    doc.text(wrapped, textStartX, bizY);
    bizY += wrapped.length * 4.5;
  }

  // ── Header: INVOICE label + meta (right) ────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  rgb(doc, C_DARK, 'text');
  doc.text(s.invoiceTitle || 'INVOICE', RIGHT_X, y + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rgb(doc, C_MID, 'text');
  let metaY = y + 13;
  doc.text(`No. ${s.invoiceNumber || '—'}`,         RIGHT_X, metaY,      { align: 'right' }); metaY += 5.5;
  doc.text(`Date: ${fmtDate(s.invoiceDate)}`,         RIGHT_X, metaY,      { align: 'right' }); metaY += 5.5;
  if (s.dueDate && s.visible.dueDate) {
    doc.text(`Due:  ${fmtDate(s.dueDate)}`,           RIGHT_X, metaY,      { align: 'right' });
  }

  // ── Separator ────────────────────────────────────────────────────────────
  y = Math.max(bizY, y + 33) + 5;
  rule(doc, y);
  y += 7;

  // ── Bill To ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  rgb(doc, C_LIGHT, 'text');
  doc.text('BILL TO', ML, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  rgb(doc, C_DARK, 'text');
  doc.text(s.clientName || 'Client Name', ML, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rgb(doc, C_MID, 'text');
  if (s.clientEmail   && s.visible.clientEmail)   { doc.text(s.clientEmail,   ML, y); y += 4.5; }
  if (s.clientAddress && s.visible.clientAddress) {
    const wrapped = doc.splitTextToSize(s.clientAddress, 80);
    doc.text(wrapped, ML, y);
    y += wrapped.length * 4.5;
  }

  y += 9;

  // ── Line items table ─────────────────────────────────────────────────────
  const ROW_H = DEFAULT_ROW_H;

  // Header row — dark background
  rgb(doc, C_DARK, 'fill');
  doc.rect(ML, y, CW, TABLE_HEADER_H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  rgb(doc, C_WHITE, 'text');

  const hTextY = y + TABLE_HEADER_H / 2 + 2.5;
  doc.text(s.itemLabel || 'Description',            ML + 3,                                            hTextY);
  doc.text('Qty',                                   ML + COL_DESC + COL_QTY / 2,                      hTextY, { align: 'center' });
  doc.text('Unit Price',                            ML + COL_DESC + COL_QTY + COL_PRICE - 3,          hTextY, { align: 'right' });
  doc.text('Amount',                                RIGHT_X - 3,                                       hTextY, { align: 'right' });

  y += TABLE_HEADER_H;

  // Item rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  s.items.forEach((item, i) => {
    if (i % 2 === 1) {
      rgb(doc, C_ROW_ALT, 'fill');
      doc.rect(ML, y, CW, ROW_H, 'F');
    }

    const amount   = item.quantity * item.unitPrice;
    const rowTextY = y + ROW_H / 2 + 2.5;

    // Description (truncate to first line; multi-line rows are Phase 3)
    rgb(doc, C_DARK, 'text');
    const descLines = doc.splitTextToSize(item.description || '—', COL_DESC - 6);
    doc.text(descLines[0], ML + 3, rowTextY);

    // Qty
    rgb(doc, C_MID, 'text');
    doc.text(String(item.quantity), ML + COL_DESC + COL_QTY / 2, rowTextY, { align: 'center' });

    // Unit price
    doc.text(
      fmtCurrency(item.unitPrice, sym),
      ML + COL_DESC + COL_QTY + COL_PRICE - 3,
      rowTextY,
      { align: 'right' },
    );

    // Amount
    rgb(doc, C_DARK, 'text');
    doc.text(fmtCurrency(amount, sym), RIGHT_X - 3, rowTextY, { align: 'right' });

    y += ROW_H;
    y = checkNewPage(doc, y, 40); // leave room for totals block at minimum
  });

  // Table bottom rule
  rule(doc, y);
  y += 6;

  // Ensure totals block fits on the current page (needs ~30mm)
  y = checkNewPage(doc, y, 30);

  // ── Totals block ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  rgb(doc, C_MID, 'text');
  doc.text('Subtotal', TOTALS_LABEL_X, y);
  rgb(doc, C_DARK, 'text');
  doc.text(fmtCurrency(subtotal, sym), RIGHT_X - 3, y, { align: 'right' });
  y += 5.5;

  if (s.taxRate > 0 && s.visible.tax) {
    rgb(doc, C_MID, 'text');
    doc.text(`${s.taxLabel} (${s.taxRate}%)`, TOTALS_LABEL_X, y);
    rgb(doc, C_DARK, 'text');
    doc.text(fmtCurrency(taxAmount, sym), RIGHT_X - 3, y, { align: 'right' });
    y += 5.5;
  }

  // Total rule + bold row
  doc.setLineWidth(0.4);
  rgb(doc, C_DARK, 'draw');
  doc.line(TOTALS_LABEL_X, y, RIGHT_X, y);
  y += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  rgb(doc, C_DARK, 'text');
  doc.text('TOTAL', TOTALS_LABEL_X, y);
  rgb(doc, hexToRgb(s.classicAccent || '#F59E0B'), 'text');
  doc.text(fmtCurrency(total, sym), RIGHT_X - 3, y, { align: 'right' });
  y += 11;

  // ── Payment details ──────────────────────────────────────────────────────
  y = checkNewPage(doc, y, 40);
  if (hasPaymentDetails(s)) {
    rule(doc, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    rgb(doc, C_LIGHT, 'text');
    doc.text('PAYMENT DETAILS', ML, y);
    y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    for (const [label, value] of paymentFields(s)) {
      if (!value.trim()) continue;
      rgb(doc, C_MID, 'text');
      doc.text(`${label}:`, ML, y);
      rgb(doc, C_DARK, 'text');
      doc.text(value, ML + PAYMENT_LABEL_W, y);
      y += 5;
    }

    y += 3;
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  if (s.notes.trim()) {
    y = checkNewPage(doc, y, 30);
    rule(doc, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    rgb(doc, C_LIGHT, 'text');
    doc.text('NOTES', ML, y);
    y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    rgb(doc, C_MID, 'text');
    const noteLines = doc.splitTextToSize(s.notes, CW);
    doc.text(noteLines, ML, y);
    y += noteLines.length * 4.5;
  }

  // ── Footer (user-defined, no hardcoded branding) ─────────────────────────
  if (s.footerNote?.trim()) {
    const footerLines = doc.splitTextToSize(s.footerNote.trim(), CW);
    if (y + footerLines.length * 4.5 > PAGE_H - 14) doc.addPage();
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    rgb(doc, C_LIGHT, 'text');
    doc.text(footerLines, PAGE_W / 2, PAGE_H - 12, { align: 'center' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODERN TEMPLATE
// Full-bleed dark navy header band. Amber invoice title. Amber total strip.
// Amber left-bar accent on table header. Alternating row shading.
// ─────────────────────────────────────────────────────────────────────────────
function renderModern(doc: jsPDF, s: InvoiceState): void {
  const effectiveTaxRate = s.visible.tax ? s.taxRate : 0;
  const { subtotal, taxAmount, total } = computeTotals(s.items, effectiveTaxRate);
  const sym = pdfSym(s);

  // User-customisable colours (fall back to brand defaults)
  const CU_HEADER = hexToRgb(s.modernHeader || '#0F172A');
  const CU_ACCENT = hexToRgb(s.modernAccent || '#F59E0B');

  const HEADER_BAND_H = 42;

  // ── Full-bleed header band ───────────────────────────────────────────────
  rgb(doc, CU_HEADER, 'fill');
  doc.rect(0, 0, PAGE_W, HEADER_BAND_H, 'F');

  // ── Business info (left, inside band) ───────────────────────────────────
  let bizX = ML;
  if (s.businessLogo) {
    try {
      const fmt = logoFormat(s.businessLogo);
      doc.addImage(s.businessLogo, fmt, ML, 9, 18, 18);
      bizX = ML + 22;
    } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  rgb(doc, C_WHITE, 'text');
  doc.text(s.businessName || 'Your Business Name', bizX, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(160, 180, 205);  // muted blue-white in band

  let bizY = 21.5;
  if (s.businessEmail && s.visible.bizEmail)   { doc.text(s.businessEmail,   bizX, bizY); bizY += 4; }
  if (s.businessPhone && s.visible.bizPhone)   { doc.text(s.businessPhone,   bizX, bizY); bizY += 4; }
  if (s.businessAddress) {
    const wrapped = doc.splitTextToSize(s.businessAddress, 70);
    doc.text(wrapped, bizX, bizY);
  }

  // ── Invoice title + meta (right, inside band) ────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  rgb(doc, CU_ACCENT, 'text');
  doc.text(s.invoiceTitle || 'INVOICE', RIGHT_X, 17, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(160, 180, 205);
  let metaY = 23;
  doc.text(`No. ${s.invoiceNumber || '—'}`,    RIGHT_X, metaY, { align: 'right' }); metaY += 4.5;
  doc.text(`Date: ${fmtDate(s.invoiceDate)}`,  RIGHT_X, metaY, { align: 'right' }); metaY += 4.5;
  if (s.dueDate && s.visible.dueDate) {
    doc.text(`Due:  ${fmtDate(s.dueDate)}`,    RIGHT_X, metaY, { align: 'right' });
  }

  let y = HEADER_BAND_H + 10;

  // ── Bill To ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  rgb(doc, CU_ACCENT, 'text');
  doc.text('BILL TO', ML, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  rgb(doc, C_DARK, 'text');
  doc.text(s.clientName || 'Client Name', ML, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rgb(doc, C_MID, 'text');
  if (s.clientEmail   && s.visible.clientEmail)   { doc.text(s.clientEmail,   ML, y); y += 4.5; }
  if (s.clientAddress && s.visible.clientAddress) {
    const wrapped = doc.splitTextToSize(s.clientAddress, 80);
    doc.text(wrapped, ML, y);
    y += wrapped.length * 4.5;
  }

  y += 8;

  // ── Line items table ─────────────────────────────────────────────────────
  const ROW_H = DEFAULT_ROW_H;

  // Header row + accent left-bar
  rgb(doc, CU_HEADER, 'fill');
  doc.rect(ML, y, CW, TABLE_HEADER_H, 'F');
  rgb(doc, CU_ACCENT, 'fill');
  doc.rect(ML, y, 3, TABLE_HEADER_H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  rgb(doc, C_WHITE, 'text');

  const hTextY = y + TABLE_HEADER_H / 2 + 2.5;
  doc.text(s.itemLabel || 'Description',          ML + 7,                                            hTextY);
  doc.text('Qty',                                 ML + COL_DESC + COL_QTY / 2,                      hTextY, { align: 'center' });
  doc.text('Unit Price',                          ML + COL_DESC + COL_QTY + COL_PRICE - 3,          hTextY, { align: 'right' });
  doc.text('Amount',                              RIGHT_X - 3,                                       hTextY, { align: 'right' });

  y += TABLE_HEADER_H;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  s.items.forEach((item, i) => {
    if (i % 2 === 1) {
      rgb(doc, C_ROW_ALT, 'fill');
      doc.rect(ML, y, CW, ROW_H, 'F');
    }

    const amount   = item.quantity * item.unitPrice;
    const rowTextY = y + ROW_H / 2 + 2.5;

    rgb(doc, C_DARK, 'text');
    const descLines = doc.splitTextToSize(item.description || '—', COL_DESC - 9);
    doc.text(descLines[0], ML + 7, rowTextY);

    rgb(doc, C_MID, 'text');
    doc.text(String(item.quantity), ML + COL_DESC + COL_QTY / 2, rowTextY, { align: 'center' });
    doc.text(
      fmtCurrency(item.unitPrice, sym),
      ML + COL_DESC + COL_QTY + COL_PRICE - 3,
      rowTextY,
      { align: 'right' },
    );
    rgb(doc, C_DARK, 'text');
    doc.text(fmtCurrency(amount, sym), RIGHT_X - 3, rowTextY, { align: 'right' });

    y += ROW_H;
    y = checkNewPage(doc, y, 40);
  });

  rule(doc, y);
  y += 6;

  // ── Totals ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  rgb(doc, C_MID, 'text');
  doc.text('Subtotal', TOTALS_LABEL_X, y);
  rgb(doc, C_DARK, 'text');
  doc.text(fmtCurrency(subtotal, sym), RIGHT_X - 3, y, { align: 'right' });
  y += 5.5;

  if (s.taxRate > 0 && s.visible.tax) {
    rgb(doc, C_MID, 'text');
    doc.text(`${s.taxLabel} (${s.taxRate}%)`, TOTALS_LABEL_X, y);
    rgb(doc, C_DARK, 'text');
    doc.text(fmtCurrency(taxAmount, sym), RIGHT_X - 3, y, { align: 'right' });
    y += 5.5;
  }

  // Grand total — accent filled strip
  const TOTAL_H = 9;
  rgb(doc, CU_ACCENT, 'fill');
  doc.rect(TOTALS_LABEL_X - 3, y - 1.5, RIGHT_X - TOTALS_LABEL_X + 6, TOTAL_H, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  rgb(doc, C_WHITE, 'text');
  const totalTextY = y + TOTAL_H / 2 + 1.5;
  doc.text('TOTAL', TOTALS_LABEL_X, totalTextY);
  doc.text(fmtCurrency(total, sym), RIGHT_X - 3, totalTextY, { align: 'right' });
  y += TOTAL_H + 9;

  // ── Payment details ──────────────────────────────────────────────────────
  y = checkNewPage(doc, y, 40);
  if (hasPaymentDetails(s)) {
    rule(doc, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    rgb(doc, CU_ACCENT, 'text');
    doc.text('PAYMENT DETAILS', ML, y);
    y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    for (const [label, value] of paymentFields(s)) {
      if (!value.trim()) continue;
      rgb(doc, C_MID, 'text');
      doc.text(`${label}:`, ML, y);
      rgb(doc, C_DARK, 'text');
      doc.text(value, ML + PAYMENT_LABEL_W, y);
      y += 5;
    }
    y += 3;
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  if (s.notes.trim()) {
    y = checkNewPage(doc, y, 30);
    rule(doc, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    rgb(doc, CU_ACCENT, 'text');
    doc.text('NOTES', ML, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    rgb(doc, C_MID, 'text');
    const noteLines = doc.splitTextToSize(s.notes, CW);
    doc.text(noteLines, ML, y);
    y += noteLines.length * 4.5;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  if (s.footerNote?.trim()) {
    const footerLines = doc.splitTextToSize(s.footerNote.trim(), CW);
    if (y + footerLines.length * 4.5 > PAGE_H - 14) doc.addPage();
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    rgb(doc, C_LIGHT, 'text');
    doc.text(footerLines, PAGE_W / 2, PAGE_H - 12, { align: 'center' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MINIMAL TEMPLATE
// Pure white. Hairlines only. No color fills. Maximum whitespace.
// Invoice number as typographic hero — large, bold, right-aligned.
// ─────────────────────────────────────────────────────────────────────────────
function renderMinimal(doc: jsPDF, s: InvoiceState): void {
  const effectiveTaxRate = s.visible.tax ? s.taxRate : 0;
  const { subtotal, taxAmount, total } = computeTotals(s.items, effectiveTaxRate);
  const sym = pdfSym(s);
  let y = 22;

  // ── Header ───────────────────────────────────────────────────────────────
  let textStartX = ML;
  if (s.businessLogo) {
    try {
      const fmt = logoFormat(s.businessLogo);
      doc.addImage(s.businessLogo, fmt, ML, y - 6, 20, 20);
      textStartX = ML + 24;
    } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  rgb(doc, C_DARK, 'text');
  doc.text(s.businessName || 'Your Business Name', textStartX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rgb(doc, C_MID, 'text');

  let bizY = y + 5.5;
  if (s.businessEmail && s.visible.bizEmail)   { doc.text(s.businessEmail,   textStartX, bizY); bizY += 4.5; }
  if (s.businessPhone && s.visible.bizPhone)   { doc.text(s.businessPhone,   textStartX, bizY); bizY += 4.5; }
  if (s.businessAddress) {
    const wrapped = doc.splitTextToSize(s.businessAddress, 70);
    doc.text(wrapped, textStartX, bizY);
    bizY += wrapped.length * 4.5;
  }

  // Invoice title (small, muted) + number (large, bold) stacked right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rgb(doc, C_LIGHT, 'text');
  doc.text(s.invoiceTitle || 'INVOICE', RIGHT_X, y, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  rgb(doc, C_DARK, 'text');
  doc.text(s.invoiceNumber || '—', RIGHT_X, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rgb(doc, C_MID, 'text');
  let metaY = y + 15;
  doc.text(fmtDate(s.invoiceDate), RIGHT_X, metaY, { align: 'right' }); metaY += 4.5;
  if (s.dueDate && s.visible.dueDate) {
    rgb(doc, C_LIGHT, 'text');
    doc.text(`Due ${fmtDate(s.dueDate)}`, RIGHT_X, metaY, { align: 'right' });
  }

  y = Math.max(bizY, y + 28) + 7;

  // Single heavier rule marks the header boundary
  rule(doc, y, 0.5, C_DARK);
  y += 9;

  // ── Bill To ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  rgb(doc, C_LIGHT, 'text');
  doc.text('BILL TO', ML, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  rgb(doc, C_DARK, 'text');
  doc.text(s.clientName || 'Client Name', ML, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  rgb(doc, C_MID, 'text');
  if (s.clientEmail   && s.visible.clientEmail)   { doc.text(s.clientEmail,   ML, y); y += 4.5; }
  if (s.clientAddress && s.visible.clientAddress) {
    const wrapped = doc.splitTextToSize(s.clientAddress, 80);
    doc.text(wrapped, ML, y);
    y += wrapped.length * 4.5;
  }

  y += 10;

  // ── Line items table (no fills — hairlines only) ─────────────────────────
  const ROW_H = 8.5;  // Minimal uses slightly taller rows than Classic/Modern

  rule(doc, y, 0.4, C_DARK);
  y += 1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  rgb(doc, C_MID, 'text');

  const hTextY = y + TABLE_HEADER_H / 2 + 2.5;
  doc.text(s.itemLabel || 'Description',          ML + 1,                                            hTextY);
  doc.text('Qty',                                 ML + COL_DESC + COL_QTY / 2,                      hTextY, { align: 'center' });
  doc.text('Unit Price',                          ML + COL_DESC + COL_QTY + COL_PRICE - 1,          hTextY, { align: 'right' });
  doc.text('Amount',                              RIGHT_X - 1,                                       hTextY, { align: 'right' });

  y += TABLE_HEADER_H;
  rule(doc, y, 0.4, C_DARK);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  s.items.forEach((item, i) => {
    const amount   = item.quantity * item.unitPrice;
    const rowTextY = y + ROW_H / 2 + 2.5;

    rgb(doc, C_DARK, 'text');
    const descLines = doc.splitTextToSize(item.description || '—', COL_DESC - 6);
    doc.text(descLines[0], ML + 1, rowTextY);

    rgb(doc, C_MID, 'text');
    doc.text(String(item.quantity), ML + COL_DESC + COL_QTY / 2, rowTextY, { align: 'center' });
    doc.text(
      fmtCurrency(item.unitPrice, sym),
      ML + COL_DESC + COL_QTY + COL_PRICE - 1,
      rowTextY,
      { align: 'right' },
    );
    rgb(doc, C_DARK, 'text');
    doc.text(fmtCurrency(amount, sym), RIGHT_X - 1, rowTextY, { align: 'right' });

    y += ROW_H;
    y = checkNewPage(doc, y, 40);
    // Hairline between rows (skip after last)
    if (i < s.items.length - 1) rule(doc, y, 0.15);
  });

  rule(doc, y, 0.4, C_DARK);
  y += 7;

  // ── Totals ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  rgb(doc, C_MID, 'text');
  doc.text('Subtotal', TOTALS_LABEL_X, y);
  rgb(doc, C_DARK, 'text');
  doc.text(fmtCurrency(subtotal, sym), RIGHT_X - 1, y, { align: 'right' });
  y += 5.5;

  if (s.taxRate > 0 && s.visible.tax) {
    rgb(doc, C_MID, 'text');
    doc.text(`${s.taxLabel} (${s.taxRate}%)`, TOTALS_LABEL_X, y);
    rgb(doc, C_DARK, 'text');
    doc.text(fmtCurrency(taxAmount, sym), RIGHT_X - 1, y, { align: 'right' });
    y += 5.5;
  }

  // Total — thin rule then bold (no fill)
  rule(doc, y, 0.4, C_DARK);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  rgb(doc, C_DARK, 'text');
  doc.text('TOTAL', TOTALS_LABEL_X, y);
  doc.text(fmtCurrency(total, sym), RIGHT_X - 1, y, { align: 'right' });
  y += 11;

  // ── Payment details ──────────────────────────────────────────────────────
  y = checkNewPage(doc, y, 40);
  if (hasPaymentDetails(s)) {
    rule(doc, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    rgb(doc, C_LIGHT, 'text');
    doc.text('PAYMENT DETAILS', ML, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (const [label, value] of paymentFields(s)) {
      if (!value.trim()) continue;
      rgb(doc, C_MID, 'text');
      doc.text(`${label}:`, ML, y);
      rgb(doc, C_DARK, 'text');
      doc.text(value, ML + PAYMENT_LABEL_W, y);
      y += 5;
    }
    y += 3;
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  if (s.notes.trim()) {
    y = checkNewPage(doc, y, 30);
    rule(doc, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    rgb(doc, C_LIGHT, 'text');
    doc.text('NOTES', ML, y);
    y += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    rgb(doc, C_MID, 'text');
    const noteLines = doc.splitTextToSize(s.notes, CW);
    doc.text(noteLines, ML, y);
    y += noteLines.length * 4.5;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  if (s.footerNote?.trim()) {
    const footerLines = doc.splitTextToSize(s.footerNote.trim(), CW);
    if (y + footerLines.length * 4.5 > PAGE_H - 14) doc.addPage();
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    rgb(doc, C_LIGHT, 'text');
    doc.text(footerLines, PAGE_W / 2, PAGE_H - 12, { align: 'center' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Renders the invoice into a jsPDF document and returns it (no save/print). */
function buildDoc(state: InvoiceState): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  switch (state.template) {
    case 'modern':  renderModern(doc, state);  break;
    case 'minimal': renderMinimal(doc, state); break;
    case 'classic':
    default:        renderClassic(doc, state);
  }
  return doc;
}

function pdfFilename(state: InvoiceState): string {
  const num    = state.invoiceNumber || 'draft';
  const client = (state.clientName || '').trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 24);
  return client ? `${num}_${client}.pdf` : `${num}.pdf`;
}

/** Download the invoice as a PDF file. */
export function generateInvoicePDF(state: InvoiceState): void {
  buildDoc(state).save(pdfFilename(state));
}

/** Open the invoice PDF in a new tab and trigger the browser's print dialog.
 *  This prints the actual PDF (correct colours, A4 layout) rather than the page DOM. */
export function printInvoicePDF(state: InvoiceState): void {
  const doc = buildDoc(state);
  doc.autoPrint();
  const blob = doc.output('blob');
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke after the new tab has had time to read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// backend/utils/csForm6WellnessLeave.js
//
// Renders a Wellness Leave application onto the official Civil Service
// Form No. 6 (Revised 2020) "Application for Leave" layout, instead of the
// old custom-styled A5 template.
//
// HOW THIS WORKS
// ---------------
// CS Form No. 6 is designed for tenured (plantilla) employees with earned
// VL/SL credits, salary grades, and a fixed list of leave types that does
// not include "Wellness Leave" (a benefit newly created for Contract of
// Service personnel under CSC Resolution No. 2501292 / CSC MC No. 01,
// s. 2026). Rather than re-drawing the whole form from scratch, this module
// overlays each application's data onto a pre-built BLANK master copy of
// the real CS Form No. 6 (backend/assets/cs_form6_wellness_blank.pdf) at
// coordinates measured directly from an actual filled specimen, using
// pdf-lib. Fields that don't apply to Contract of Service personnel
// (Salary, VL/SL leave credit certification) are rendered as "N/A" rather
// than left to guess at. The barcode used by the tenured-employee system is
// replaced with a QR code that links back into CGEN's own scan-approve
// flow, per backend/routes/wellnessLeave.js.
//
// The blank master already has every *static* label, box, rule, and the
// DENR seal baked in — this file only draws the parts that vary per
// application. See scripts/README (or PR description) for how the master
// was produced if it ever needs to be regenerated from a fresh specimen.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const BLANK_MASTER_PATH = path.join(rootDir, 'assets', 'cs_form6_wellness_blank.pdf');
const FONT_REGULAR_PATH = path.join(rootDir, 'assets', 'fonts', 'Carlito-Regular.ttf');
const FONT_BOLD_PATH = path.join(rootDir, 'assets', 'fonts', 'Carlito-Bold.ttf');
const FONT_ITALIC_PATH = path.join(rootDir, 'assets', 'fonts', 'Carlito-Italic.ttf');

const PAGE_H = 841.54; // A4 portrait, points

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const PINK = rgb(1, 0.714, 0.757);

/**
 * @param {object} params
 * @param {string} params.outputPdfPath
 * @param {object} params.data
 * @param {string} params.data.officeDept
 * @param {string} params.data.name              LAST, FIRST, MIDDLE
 * @param {string} params.data.dateOfFiling       e.g. "August 03, 2026"
 * @param {string} params.data.position
 * @param {number} params.data.daysRequested
 * @param {string} params.data.inclusiveDates     e.g. "AUGUST 10, 2026 - AUGUST 12, 2026"
 * @param {string} params.data.applicationNumber
 * @param {string} params.data.generatedOn        e.g. "8/3/2026 14:22"
 * @param {string} params.data.scanUrl            URL encoded in the QR code
 * @param {object} params.data.supervisor         { name, position, action: 'RECOMMENDED'|'DISAPPROVED'|null, remarks }
 * @param {object} params.data.approver           { name, position, action: 'APPROVED'|'DISAPPROVED'|null, remarks }
 */
export async function generateWellnessLeaveCsForm6Pdf({ outputPdfPath, data }) {
  const blankBytes = fs.readFileSync(BLANK_MASTER_PATH);
  const pdfDoc = await PDFDocument.load(blankBytes);
  pdfDoc.registerFontkit(fontkit);

  const regular = await pdfDoc.embedFont(fs.readFileSync(FONT_REGULAR_PATH));
  const bold = await pdfDoc.embedFont(fs.readFileSync(FONT_BOLD_PATH));
  const italic = await pdfDoc.embedFont(fs.readFileSync(FONT_ITALIC_PATH));

  const page = pdfDoc.getPages()[0];

  // y1 = measured bottom of the reference text's bounding box, top-down.
  const baseY = (y1, size) => PAGE_H - y1 + size * 0.18;

  function text(str, x, y1, size, font = regular, color = INK, opts = {}) {
    if (str == null) return;
    let s = String(str);
    let renderSize = size;

    // Shrink-to-fit: names, offices, and positions are free text of
    // unbounded length, but every cell on this form has a fixed width.
    // Rather than let a long value overrun into the neighboring cell,
    // step the font size down (and, as a last resort, truncate with an
    // ellipsis) until it fits the given maxWidth.
    if (opts.maxWidth) {
      const minSize = opts.minSize ?? 6;
      while (renderSize > minSize && font.widthOfTextAtSize(s, renderSize) > opts.maxWidth) {
        renderSize -= 0.5;
      }
      if (font.widthOfTextAtSize(s, renderSize) > opts.maxWidth) {
        while (s.length > 1 && font.widthOfTextAtSize(s + '…', renderSize) > opts.maxWidth) {
          s = s.slice(0, -1);
        }
        s = s + '…';
      }
    }

    const y = baseY(y1, renderSize);
    let drawX = x;
    if (opts.center != null) {
      drawX = opts.center - font.widthOfTextAtSize(s, renderSize) / 2;
    } else if (opts.right != null) {
      drawX = opts.right - font.widthOfTextAtSize(s, renderSize);
    }
    page.drawText(s, { x: drawX, y, size: renderSize, font, color });
  }

  function line(x0, x1, yTop, thickness = 0.7, color = INK) {
    const y = PAGE_H - yTop;
    page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness, color });
  }

  const d = data;

  // 1. Office/Department + Name
  text((d.officeDept || 'N/A').toUpperCase(), 64.5, 139.65, 9.5, regular, INK, { maxWidth: 177 });
  text((d.name || '').toUpperCase(), 331.1, 139.65, 9.5, regular, INK, { maxWidth: 234 });

  // 2. Date of filing / Position / Salary (N/A - COS has no salary grade)
  text(d.dateOfFiling, 134.4, 156.75, 9, regular, INK, { maxWidth: 175 });
  text((d.position || '').toUpperCase(), 321.2, 157.14, 9.5, regular, INK, { maxWidth: 205 });
  text('N/A', 537.6, 157.65, 9.5, regular);

  // 3. 6.A -- no standard checkbox fits Wellness Leave; write it on the
  // "OTHERS:" line (a blank-line field, not a checkbox, in the real form).
  text(
    'WELLNESS LEAVE — CSC Res. No. 2501292 / MC No. 01, s. 2026',
    90, 424.5, 7.6, italic, INK, { maxWidth: 250 }
  );

  // 4. 6.C days requested + inclusive dates.
  // (6.D Commutation "NOT REQUESTED" is baked into the blank master since
  // Wellness Leave is always non-commutable — no need to redraw it.)
  text(`${d.daysRequested} DAY(S)`, 115.9, 493.7, 9.5, regular, INK, { maxWidth: 200 });
  text((d.inclusiveDates || '').toUpperCase(), 65.2, 524.6, 10, regular, INK, { maxWidth: 255 });

  // 5. 6.D printed name/position under the commutation box
  text((d.name || '').toUpperCase(), 454, 538.9, 10, bold, INK, { center: 454, maxWidth: 210 });
  text((d.position || '').toUpperCase(), 454, 548.96, 8, regular, INK, { center: 454, maxWidth: 210 });

  // 6. 7.A -- Leave Credit Certification: N/A across the board (Contract of
  // Service personnel earn no VL/SL). Signature line intentionally left
  // blank -- nobody certifies credits that don't exist.
  text('N/A', 166.7, 590, 9.5, regular, MUTED, { center: 166.7 }); // AS OF
  for (const y1 of [620.35, 634.57, 648.8]) {
    text('N/A', 166.7, y1, 9.5, regular, MUTED, { center: 166.7 }); // VL column
    text('N/A', 269.5, y1, 9.5, regular, MUTED, { center: 269.5 }); // SL column
  }

  // 7. 7.B Recommendation (immediate supervisor / focal person)
  line(340.47, 567.32, 678.03); // static signature rule, restored
  const sup = d.supervisor || {};
  if (sup.action === 'RECOMMENDED') {
    text('X', 346.56, 590.52, 10, bold);
    text((sup.name || '').toUpperCase(), 452, 691.5, 10, bold, INK, { center: 452, maxWidth: 215 });
    text(sup.position || '', 452, 701.56, 8, regular, INK, { center: 452, maxWidth: 215 });
  } else if (sup.action === 'DISAPPROVED') {
    text('X', 346.56, 606, 10, bold);
    if (sup.remarks) text(sup.remarks, 362, 606, 7.5, regular, INK, { maxWidth: 195 });
  }

  // 8. 7.C Approved For (Assistant Regional Director for Management Services)
  line(113.68, 466.92, 780.4); // static signature rule, restored
  text('N/A', 288, 729.74, 8.5, italic, MUTED, { center: 288 }); // SHIFT: not applicable to COS
  const app = d.approver || {};
  if (app.action === 'APPROVED') {
    text(String(d.daysRequested), 39, 726.96, 6, regular, INK, { center: 39 });
    text((app.name || '').toUpperCase(), 290.5, 793.86, 10, bold, INK, { center: 290.5, maxWidth: 340 });
    text(app.position || '', 290.5, 803.93, 8, regular, INK, { center: 290.5, maxWidth: 340 });
  } else if (app.action === 'DISAPPROVED') {
    if (app.remarks) text(app.remarks, 345, 726, 7.5, regular, INK, { maxWidth: 210 });
  }

  // 9. Top-right block: RECEIVED ON stamp box (blank, for records office),
  // QR code (replaces the tenured-form barcode), application number, and
  // generation timestamp.
  page.drawRectangle({
    x: 466.75, y: PAGE_H - 40.8, width: 517.17 - 466.75, height: 40.8 - 31.2,
    color: PINK,
  });
  text('RECEIVED ON', 492, 50, 6, regular, MUTED, { center: 492 });

  const qrDataUrl = await QRCode.toDataURL(d.scanUrl, { width: 300, margin: 0 });
  const qrPng = await pdfDoc.embedPng(qrDataUrl);
  const qrSize = 42;
  page.drawImage(qrPng, { x: 518 - qrSize / 2, y: PAGE_H - 96, width: qrSize, height: qrSize });
  text(d.applicationNumber, 518, 106, 7.2, bold, INK, { center: 518 });
  text(`Generated: ${d.generatedOn}`, 518, 113.5, 5.4, regular, MUTED, { center: 518 });

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, outBytes);
}
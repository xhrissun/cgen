// backend/utils/csForm6WellnessLeave.js
//
// Renders a Wellness Leave application onto the office's official
// Civil Service Form No. 6 (Revised 2020) "Application for Leave" — the
// Contract-of-Service-specific version (backend/assets/cs_form6_wellness_blank.pdf),
// which already bakes in "WELLNESS LEAVE (COS)" as the leave type,
// commutation permanently "NOT REQUESTED", and the two standing
// signatories (ANITA T. ROCERO for 7.A, ATTY. LIEZL E. DE MESA for 7.C).
//
// IMPORTANT: recommendation and approval (7.B / 7.C checkboxes, the
// immediate supervisor's signature, disapproval remarks) are all done by
// hand on the printed paper — this generator never marks them. It only
// pre-fills what the system already knows before anyone signs anything:
//   - Office/Department, Name, Date of Filing, Position, Salary Grade
//   - Number of days requested + inclusive dates
//   - Available / remaining Wellness Leave credit balances
//   - The "DAYS WITH PAY" figure on 7.C, always the requested day count
//     (approval itself still happens on paper; this just saves the
//     approver from having to copy the number over by hand)
//   - A QR code (replacing the tenured-employee system's barcode) linking
//     into CGEN's scan-approve flow, plus the application number
//
// Every value is centered — horizontally within its ruled line/cell, and
// vertically within the row band between its label and that line — rather
// than left-aligned, per how the office wants the form to look.
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

const PAGE_H = 842.0; // A4 portrait, points

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);

/**
 * @param {object} params
 * @param {string} params.outputPdfPath
 * @param {object} params.data
 * @param {string} params.data.officeDept
 * @param {string} params.data.name                LAST, FIRST, MIDDLE
 * @param {string} params.data.dateOfFiling         e.g. "August 03, 2026"
 * @param {string} params.data.position
 * @param {string} [params.data.salaryGrade]        e.g. "SG 15" or "SG 15 (Special)"; omit/undefined -> "N/A" (no active contract on file)
 * @param {number} params.data.daysRequested
 * @param {string} params.data.inclusiveDates       e.g. "AUGUST 10, 2026 - AUGUST 12, 2026"
 * @param {number} params.data.availableCredits     wellness leave credits available at filing
 * @param {number} params.data.remainingCredits     credits left after this application
 * @param {string} params.data.applicationNumber
 * @param {string} params.data.generatedOn          e.g. "8/3/2026 14:22"
 * @param {string} params.data.scanUrl              URL encoded in the QR code
 */
export async function generateWellnessLeaveCsForm6Pdf({ outputPdfPath, data }) {
  const blankBytes = fs.readFileSync(BLANK_MASTER_PATH);
  const pdfDoc = await PDFDocument.load(blankBytes);
  pdfDoc.registerFontkit(fontkit);

  const regular = await pdfDoc.embedFont(fs.readFileSync(FONT_REGULAR_PATH));
  const bold = await pdfDoc.embedFont(fs.readFileSync(FONT_BOLD_PATH));

  const page = pdfDoc.getPages()[0];

  // y1 = measured bottom of the reference text/line's bounding box, top-down.
  const baseY = (y1, size) => PAGE_H - y1 + size * 0.18;

  // Centers a value both horizontally (over [xLeft, xRight]) and vertically
  // (over the row band [rowTop, rowBottom] -- typically the label's own
  // bounding box, or the gap between a label and its blank line below it).
  function centeredText(str, xLeft, xRight, rowTop, rowBottom, size, font = regular, color = INK, opts = {}) {
    if (str == null) return;
    let s = String(str);
    let renderSize = size;
    const maxWidth = opts.maxWidth ?? (xRight - xLeft - 4);
    const minSize = opts.minSize ?? 6;

    // Shrink-to-fit: free-text values are unbounded in length, but every
    // cell on this form has a fixed width. Step the font size down, then
    // truncate with an ellipsis as a last resort, so nothing ever overruns
    // into the next cell.
    while (renderSize > minSize && font.widthOfTextAtSize(s, renderSize) > maxWidth) {
      renderSize -= 0.5;
    }
    if (font.widthOfTextAtSize(s, renderSize) > maxWidth) {
      while (s.length > 1 && font.widthOfTextAtSize(s + '…', renderSize) > maxWidth) {
        s = s.slice(0, -1);
      }
      s = s + '…';
    }

    // Vertical centering: place the text's visual midpoint (roughly
    // baseline + 0.35*size, i.e. half a cap-height above the baseline) at
    // the middle of the row band.
    const rowCenter = (rowTop + rowBottom) / 2;
    const y1 = rowCenter + renderSize * 0.53;
    const y = baseY(y1, renderSize);

    const xCenter = (xLeft + xRight) / 2;
    const drawX = xCenter - font.widthOfTextAtSize(s, renderSize) / 2;
    page.drawText(s, { x: drawX, y, size: renderSize, font, color });
  }

  const d = data;

  // ── 1/2. Office/Department + Name ──────────────────────────────────────
  // Stacked rows: header label sits above, blank line below with a gap.
  centeredText((d.officeDept || 'N/A').toUpperCase(), 25, 212.64, 129.1, 144.0, 9.5);
  centeredText((d.name || '').toUpperCase(), 217.32, 575.39, 129.1, 144.0, 9.5, regular, INK, { maxWidth: 350 });

  // ── 3/4/5. Date of filing / Position / Salary Grade ────────────────────
  // Inline row: label and blank line share the same row.
  centeredText(d.dateOfFiling, 109.32, 212.64, 149.0, 160.0, 9);
  centeredText((d.position || '').toUpperCase(), 268.92, 472.19, 149.0, 160.0, 9.5, regular, INK, { maxWidth: 198 });
  centeredText(d.salaryGrade || 'N/A', 523.67, 575.38, 149.0, 160.0, 9.5);

  // ── 6.C Days requested + inclusive dates ───────────────────────────────
  // (6.A "WELLNESS LEAVE (COS)" and 6.D "NOT REQUESTED" are baked into the
  // blank master — no need to redraw either.)
  centeredText(`${d.daysRequested} DAY(S)`, 40.92, 269.03, 489.9, 505.0, 9.5);
  centeredText((d.inclusiveDates || '').toUpperCase(), 40.92, 269.03, 520.9, 536.0, 9.5, regular, INK, { maxWidth: 220 });

  // ── 7.A Wellness Leave credit balances ─────────────────────────────────
  // (The certifying officer, ANITA T. ROCERO, is baked into the master.)
  const fmtCredits = (n) => (typeof n === 'number' ? n.toFixed(3) : 'N/A');
  centeredText(fmtCredits(d.availableCredits), 217.32, 320.64, 604.9, 618.3, 10);
  centeredText(fmtCredits(d.remainingCredits), 217.32, 320.64, 648.4, 661.9, 10);

  // ── 7.C "DAYS WITH PAY" — the requested day count, filled in ahead of
  // time so the approver doesn't have to copy it over by hand. 7.B/7.C
  // checkboxes, the immediate supervisor's signature, and any disapproval
  // remarks are deliberately left untouched -- that part of the workflow
  // happens on paper, not in the system. (The final approver, ATTY. LIEZL
  // E. DE MESA, OIC-ARDMS, is likewise baked into the master.)
  centeredText(String(d.daysRequested), 23.16, 41.03, 730.7, 744.2, 8);

  // ── Top-right: QR code (replaces the tenured-employee system's barcode),
  // application number, and generation timestamp ────────────────────────
  const qrDataUrl = await QRCode.toDataURL(d.scanUrl, { width: 300, margin: 0 });
  const qrPng = await pdfDoc.embedPng(qrDataUrl);
  const qrSize = 44;
  const qrCenterX = 525;
  page.drawImage(qrPng, { x: qrCenterX - qrSize / 2, y: PAGE_H - 92, width: qrSize, height: qrSize });
  centeredText(d.applicationNumber, qrCenterX - 50, qrCenterX + 50, 90, 103, 7.2, bold);
  centeredText(`Generated: ${d.generatedOn}`, qrCenterX - 50, qrCenterX + 50, 103, 112, 5.4, regular, MUTED);

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, outBytes);
}
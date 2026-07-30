import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

/**
 * Generate a PDF from the wellness_leave HTML template.
 *
 * @param {object} params
 * @param {string} params.htmlTemplatePath - Path to wellness_leave.html
 * @param {string} params.outputPdfPath   - Where to write the final PDF
 * @param {string} params.logoPath        - Path to the logo PNG (empty string if none)
 * @param {string} params.qrPath          - Path to the QR code PNG
 * @param {object} params.data            - All template field values
 * @returns {Promise<void>}
 */
export async function generateWellnessLeavePdf({ htmlTemplatePath, outputPdfPath, logoPath, qrPath, data }) {
  let htmlContent = fs.readFileSync(htmlTemplatePath, 'utf-8');

  // Replace {{placeholders}} with actual values
  const fields = {
    logo_path: logoPath || '',
    qr_path: qrPath,
    application_number: data.applicationNumber || '',
    employee_name: data.employeeName || '',
    employee_position: data.employeePosition || '',
    place_of_assignment: data.placeOfAssignment || '',
    inclusive_dates: data.inclusiveDates || '',
    days_requested: String(data.daysRequested || ''),
    reason: data.reason || 'N/A',
    supervisor_status: data.supervisorStatus || 'Pending',
    supervisor_remarks: data.supervisorRemarks || '',
    approver_status: data.approverStatus || 'Pending',
    approver_remarks: data.approverRemarks || '',
  };

  for (const [key, value] of Object.entries(fields)) {
    htmlContent = htmlContent.replaceAll(`{{${key}}}`, value);
  }

  // Write processed HTML to a temp file so Puppeteer can load it with file://
  const tempHtmlPath = path.join(path.dirname(outputPdfPath), path.basename(outputPdfPath, '.pdf') + '_render.html');
  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();

    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.pdf({
      path: outputPdfPath,
      format: 'A5',
      landscape: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true,
    });
  } finally {
    await browser.close();
    // Clean up the temp HTML file
    try {
      if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
    } catch (_) {}
  }
}

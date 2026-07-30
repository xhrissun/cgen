import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function convertHtmlToPdf(htmlPath, pdfPath, replacements) {
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  // Apply template replacements {{key}} -> value
  for (const [key, value] of Object.entries(replacements)) {
    htmlContent = htmlContent.replaceAll(`{{${key}}}`, value);
  }

  // Write the processed HTML to a temporary file so Puppeteer can load it
  const tempHtmlPath = path.join(path.dirname(pdfPath), path.basename(pdfPath, '.pdf') + '_render.html');
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

    // Wait for local images (logo, QR code) to load
    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    await page.pdf({
      path: pdfPath,
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

// CLI mode: node html_to_pdf.js <html_template_path> <output_pdf_path> [key=value ...]
if (process.argv.length >= 4) {
  const htmlTemplate = process.argv[2];
  const outputPdf = process.argv[3];

  const replacements = {};
  for (const arg of process.argv.slice(4)) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      replacements[arg.substring(0, eqIdx)] = arg.substring(eqIdx + 1);
    }
  }

  try {
    await convertHtmlToPdf(htmlTemplate, outputPdf, replacements);
    console.log(`Successfully generated PDF: ${outputPdf}`);
    process.exit(0);
  } catch (err) {
    console.error(`Error generating PDF: ${err.message}`);
    process.exit(1);
  }
}

export { convertHtmlToPdf };

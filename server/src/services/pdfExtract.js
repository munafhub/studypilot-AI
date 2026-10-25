import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { HttpError } from '../errors.js';

const MAX_PAGES = 60;

const pdfError = (status, code, message) => new HttpError(status, code, message);

/** Extract text from a text-based PDF buffer. Throws friendly HttpErrors for every failure mode. */
export async function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw pdfError(400, 'PDF_EMPTY', 'No file was received. Choose a PDF and try again.');
  }
  if (!buffer.subarray(0, 1024).includes('%PDF-')) {
    throw pdfError(415, 'PDF_INVALID', 'That file is not a PDF. Please upload a .pdf syllabus.');
  }

  let doc;
  try {
    doc = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw pdfError(422, 'PDF_ENCRYPTED', 'This PDF is password-protected. Remove the password and upload it again.');
    }
    throw pdfError(422, 'PDF_CORRUPT', 'This PDF could not be read. It may be damaged.');
  }

  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const out = [];
    for (let p = 1; p <= pages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out.push(itemsToLines(content.items));
    }
    const text = out.join('\n').trim();
    if (text.replace(/\s/g, '').length < 20) {
      throw pdfError(
        422,
        'PDF_NO_TEXT',
        'No selectable text was found. This looks like a scanned PDF - please upload a text-based PDF or add tasks manually.',
      );
    }
    return { text, pages: doc.numPages, truncated: doc.numPages > MAX_PAGES };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw pdfError(422, 'PDF_CORRUPT', 'This PDF could not be read. It may be damaged.');
  } finally {
    await doc.destroy().catch(() => {});
  }
}

/** Group positioned text items into visual lines. */
function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, w: it.width || 0, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      for (const p of r.parts) {
        if (prevEnd !== null && p.x - prevEnd > 1 && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' ';
        line += p.s;
        prevEnd = p.x + p.w;
      }
      return line.trim();
    })
    .join('\n');
}

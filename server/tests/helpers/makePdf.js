/** Build a tiny valid text PDF. `pages` is an array of pages; each page is an array of text lines. */
export function makePdf(pages) {
  const norm = Array.isArray(pages[0]) ? pages : [pages];
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objs = [];
  const n = norm.length;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${norm.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objs[4] = '<< >>';
  norm.forEach((lines, i) => {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    const body = lines.map((l, j) => `BT /F1 12 Tf 50 ${760 - j * 16} Td (${esc(l)}) Tj ET`).join('\n');
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[contentId] = `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i += 1) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i += 1) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

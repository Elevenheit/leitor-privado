// Original text and PDF structure authored for local tests; no imported book content.
export function originalPdf({ outline = false, scan = false } = {}) {
  const stream =
    "BT /F1 16 Tf 40 750 Td (Nook local reading fixture) Tj 0 -32 Td /F1 12 Tf " +
    Array.from(
      { length: 20 },
      (_, i) =>
        `(Original local paragraph ${i + 1}: a quiet library and a new page to read.) Tj 0 -28 Td `,
    ).join("") +
    "ET";
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${outline ? "/Outlines 8 0 R" : ""} >>`,
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${scan ? 0 : stream.length} >>\nstream\n${scan ? "" : stream}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 6 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  if (outline)
    objects.push(
      "<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>",
      "<< /Title (Inicio do volume) /Parent 8 0 R /Next 10 0 R /Dest [3 0 R /Fit] >>",
      "<< /Title (Ilustracao final) /Parent 8 0 R /Prev 9 0 R /Dest [5 0 R /Fit] >>",
    );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

const DANGEROUS_CSV_PREFIX = /^[=+\-@\t\r\n]/;

export function escapeCsv(value) {
  let text = String(value ?? "");
  const normalizedStart = text.replace(/^\uFEFF/, "").trimStart();

  if (DANGEROUS_CSV_PREFIX.test(normalizedStart)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

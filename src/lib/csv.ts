/**
 * Part 1 §E — lightweight CSV export for the admin analytics dashboard.
 * Client-side only: the data's already been fetched to render the chart,
 * so there's nothing for a server round-trip to add.
 */

/** RFC 4180-ish quoting — wraps a field in quotes only when it actually
 *  needs it (contains a comma, quote, or newline), doubling any embedded
 *  quotes. */
function csvField(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\n");
}

/** Triggers a browser download of `csv` as `filename` — a Blob URL clicked
 *  via a detached anchor, no server involvement. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

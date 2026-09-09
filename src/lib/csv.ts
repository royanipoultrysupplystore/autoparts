/**
 * CSV export.
 *
 * Every report exports. Two rules make the files safe to open anywhere:
 *
 *   1. Money is written as a plain decimal ("180.50"), converted from
 *      cents at the very last moment. No currency symbols, no thousands
 *      separators -- a spreadsheet has to be able to add the column up.
 *
 *   2. Any field starting with = + - or @ is prefixed with a single
 *      quote. Excel treats those as formulas, and a buyer named
 *      "=cmd|..." should never become one.
 */

export type CsvValue = string | number | boolean | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  // Formula injection guard.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Cents to the plain decimal a spreadsheet can sum. */
export function csvMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "";
  return (cents / 100).toFixed(2);
}

export function toCsv(
  headers: string[],
  rows: CsvValue[][],
  options?: { note?: string },
): string {
  const lines: string[] = [];

  // A leading comment line labels the basis of the numbers, so a file
  // sitting on someone's desktop in March still says what it is.
  if (options?.note) lines.push(escapeCell(`# ${options.note}`));

  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) lines.push(row.map(escapeCell).join(","));

  // CRLF and a BOM: Excel on Windows needs both to read UTF-8 correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** "ms-monthly-2026-03.csv" */
export function csvFilename(parts: (string | number)[]): string {
  return `ms-${parts.join("-").replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase()}.csv`;
}

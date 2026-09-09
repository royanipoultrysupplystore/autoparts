import { test } from "node:test";
import assert from "node:assert/strict";
import { csvFilename, csvMoney, toCsv } from "../src/lib/csv";

test("writes money as a plain decimal a spreadsheet can sum", () => {
  assert.equal(csvMoney(18050), "180.50");
  assert.equal(csvMoney(0), "0.00");
  assert.equal(csvMoney(118050), "1180.50");
  assert.equal(csvMoney(null), "");
  // No currency symbol and no thousands separator: both break SUM().
  assert.ok(!csvMoney(118050).includes(","));
  assert.ok(!csvMoney(118050).includes("$"));
});

test("neutralises spreadsheet formula injection", () => {
  // A buyer name is free text typed by whoever is standing there. Excel
  // treats a leading = + - @ as a formula, so every one gets quoted off.
  const csv = toCsv(["Buyer"], [["=cmd|'/c calc'!A1"], ["+1-555"], ["-lookup"], ["@SUM(A1)"]]);

  assert.ok(csv.includes("'=cmd"), "= was not neutralised");
  assert.ok(csv.includes("'+1-555"), "+ was not neutralised");
  assert.ok(csv.includes("'-lookup"), "- was not neutralised");
  assert.ok(csv.includes("'@SUM(A1)"), "@ was not neutralised");
});

test("escapes quotes, commas, and newlines", () => {
  const csv = toCsv(
    ["Note"],
    [['He said "take it"'], ["Rack 3, bin B"], ["line one\nline two"]],
  );

  assert.ok(csv.includes('"He said ""take it"""'));
  assert.ok(csv.includes('"Rack 3, bin B"'));
  assert.ok(csv.includes('"line one\nline two"'));
});

test("carries a BOM and CRLF so Excel on Windows reads UTF-8", () => {
  const csv = toCsv(["A"], [["x"]]);
  assert.ok(csv.startsWith("﻿"), "missing BOM");
  assert.ok(csv.includes("\r\n"), "missing CRLF line endings");
});

test("labels the basis of the numbers in the file itself", () => {
  const csv = toCsv(["A"], [["x"]], { note: "cash basis, CAD" });
  assert.ok(csv.includes("# cash basis, CAD"));
});

test("filenames are safe on every filesystem", () => {
  assert.equal(csvFilename(["vehicle", "V-0147"]), "ms-vehicle-v-0147.csv");
  assert.equal(csvFilename(["monthly", 2026, "03"]), "ms-monthly-2026-03.csv");
  assert.ok(!csvFilename(["a/b", "c:d", 'e"f']).match(/[/:"]/));
});

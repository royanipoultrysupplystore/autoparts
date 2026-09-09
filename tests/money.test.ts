import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centsToInput,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  parseMoneyToCents,
} from "../src/lib/money";

/**
 * Money is integer cents everywhere. These tests exist because a
 * rounding slip here shows up as a wrong number on a partner's profit
 * report, months later, with no obvious cause.
 */

test("parses whatever a partner types on a phone", () => {
  assert.equal(parseMoneyToCents("180"), 18000);
  assert.equal(parseMoneyToCents("180.50"), 18050);
  assert.equal(parseMoneyToCents("$180.50"), 18050);
  assert.equal(parseMoneyToCents("1,180.50"), 118050);
  assert.equal(parseMoneyToCents(" 180.5 "), 18050);
  assert.equal(parseMoneyToCents("180.5"), 18050);
  assert.equal(parseMoneyToCents(".5"), 50);
  assert.equal(parseMoneyToCents("0"), 0);
});

test("rejects anything that is not a number", () => {
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(parseMoneyToCents("   "), null);
  assert.equal(parseMoneyToCents("abc"), null);
  assert.equal(parseMoneyToCents("12abc"), null);
  assert.equal(parseMoneyToCents(null), null);
  assert.equal(parseMoneyToCents(undefined), null);
  assert.equal(parseMoneyToCents(Number.NaN), null);
  assert.equal(parseMoneyToCents(Number.POSITIVE_INFINITY), null);
});

test("rounds on the cent instead of truncating", () => {
  // 19.99 * 100 is 1998.9999999999998 in binary floating point.
  // Truncating would lose a cent on a very common price.
  assert.equal(parseMoneyToCents("19.99"), 1999);
  assert.equal(parseMoneyToCents("1.005"), 101);
  assert.equal(parseMoneyToCents("0.145"), 15);
  assert.equal(parseMoneyToCents(19.99), 1999);
});

test("every parsed value is a whole number of cents", () => {
  for (const input of ["19.99", "0.1", "0.2", "1234.567", "8.005", "99999.99"]) {
    const cents = parseMoneyToCents(input);
    assert.ok(cents !== null, `${input} should parse`);
    assert.ok(Number.isInteger(cents), `${input} produced a non-integer: ${cents}`);
  }
});

test("survives a round trip through the input format", () => {
  for (const cents of [0, 1, 99, 100, 1999, 18050, 118050, 99999999]) {
    assert.equal(parseMoneyToCents(centsToInput(cents)), cents);
  }
});

test("formats CAD the way a Canadian reads it", () => {
  assert.equal(formatMoney(18050), "$180.50");
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(118050), "$1,180.50");
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(undefined), "—");
});

test("signs profit figures without losing the currency", () => {
  assert.equal(formatSignedMoney(-4200), "-$42.00");
  assert.equal(formatSignedMoney(4200), "$42.00");
  assert.equal(formatSignedMoney(0), "$0.00");
});

test("percentages carry their sign and precision", () => {
  assert.equal(formatPercent(84.7), "84.7%");
  assert.equal(formatPercent(100), "100.0%");
  assert.equal(formatPercent(0), "0.0%");
  assert.equal(formatPercent(84.66, 0), "85%");
  assert.equal(formatPercent(null), "—");
});

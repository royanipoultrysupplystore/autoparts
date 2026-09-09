/**
 * Money.
 *
 * Every currency value in this system is an integer number of CAD cents.
 * Nothing is ever stored, summed, or compared as a float. These helpers
 * are the only sanctioned way to move between cents and the strings a
 * human types or reads.
 */

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CAD_WHOLE = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 18050 -> "$180.50" */
export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  return CAD.format(cents / 100);
}

/** 18050 -> "$181". For dense report tiles where the cents are noise. */
export function formatMoneyWhole(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  return CAD_WHOLE.format(Math.round(cents / 100));
}

/** Signed, for profit figures: -4200 -> "-$42.00" */
export function formatSignedMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  const sign = cents < 0 ? "-" : "";
  return `${sign}${CAD.format(Math.abs(cents) / 100)}`;
}

/**
 * Parse whatever a partner types on a phone: "180", "$180", "180.5",
 * "1,180.50". Returns null for anything that is not a number.
 *
 * The digits are read out of the string directly rather than going
 * through a float. `Math.round(1.005 * 100)` is 100, not 101, because
 * the double nearest 1.005 is 1.00499999999999989 -- and a rounding
 * slip here surfaces months later as a wrong number on a profit report
 * with no obvious cause. Integer cents in, integer cents out, no
 * floating point in between.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;

  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    text = String(input);
    // Exponent notation is not a price anybody typed.
    if (text.includes("e") || text.includes("E")) return null;
  } else {
    text = input;
  }

  const cleaned = text.replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return null;

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, wholeDigits, fracDigits = ""] = match;
  if (wholeDigits === "" && fracDigits === "") return null;

  const whole = wholeDigits === "" ? 0 : Number(wholeDigits);
  if (!Number.isSafeInteger(whole)) return null;

  const cents = Number(fracDigits.slice(0, 2).padEnd(2, "0"));

  // Round half up on the third decimal, so 0.145 becomes 15 cents.
  const roundUp = fracDigits.length > 2 && Number(fracDigits[2]) >= 5 ? 1 : 0;

  const total = whole * 100 + cents + roundUp;
  if (!Number.isSafeInteger(total)) return null;

  return sign === "-" ? -total : total;
}

/** Cents -> the plain "180.50" a number input wants. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** 0.847 -> "84.7%" */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

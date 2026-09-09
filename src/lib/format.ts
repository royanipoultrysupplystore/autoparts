import type { PartCondition, PartSide, PartStatus } from "@/types/db";

/**
 * Time.
 *
 * Everything is stored UTC and shown in America/Vancouver. The yard is in
 * Vancouver; "today" means today there, not today in UTC.
 */
export const TIMEZONE = "America/Vancouver";

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseDbDate(value) : value;
  return d ? dateFmt.format(d) : "—";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseDbDate(value) : value;
  return d ? dateTimeFmt.format(d) : "—";
}

/**
 * A bare `date` column ("2026-03-14") must not be run through `new Date()`
 * directly -- that parses as UTC midnight and renders as the day before in
 * Vancouver. Anchor it at local noon instead.
 */
function parseDbDate(value: string): Date | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today in Vancouver as "YYYY-MM-DD", for date inputs and defaults. */
export function todayInVancouver(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "4 minutes ago" -- used when someone loses a race for a part. */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "";
  const then = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";

  const rtf = new Intl.RelativeTimeFormat("en-CA", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  for (const [unit, secondsIn] of units) {
    if (Math.abs(seconds) >= secondsIn) {
      return rtf.format(-Math.round(seconds / secondsIn), unit);
    }
  }
  return "just now";
}

/** "in 2 days" / "in 5 hours" -- reservation countdowns. */
export function timeUntil(value: string | Date | null | undefined): string {
  if (!value) return "";
  const then = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((then.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return "expired";

  const rtf = new Intl.RelativeTimeFormat("en-CA", { numeric: "auto" });
  if (seconds < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

// ---------------------------------------------------------------------
// Enum labels. The database stores machine values; people read these.
// ---------------------------------------------------------------------

export const SIDE_LABELS: Record<PartSide, string> = {
  none: "",
  left: "Left",
  right: "Right",
  front: "Front",
  rear: "Rear",
  front_left: "Front left",
  front_right: "Front right",
  rear_left: "Rear left",
  rear_right: "Rear right",
};

/** Short form for dense result rows: "FL", "RR". */
export const SIDE_SHORT: Record<PartSide, string> = {
  none: "",
  left: "L",
  right: "R",
  front: "F",
  rear: "R",
  front_left: "FL",
  front_right: "FR",
  rear_left: "RL",
  rear_right: "RR",
};

export const CONDITION_LABELS: Record<PartCondition, string> = {
  A: "A · Excellent",
  B: "B · Good",
  C: "C · Usable",
  damaged: "Damaged",
};

export const CONDITION_SHORT: Record<PartCondition, string> = {
  A: "A",
  B: "B",
  C: "C",
  damaged: "DMG",
};

export const STATUS_LABELS: Record<PartStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  kept: "Kept",
  scrapped: "Scrapped",
};

/** "Front bumper cover" + side -> "Front bumper cover · Front left" */
export function partTitle(name: string, side: PartSide): string {
  const s = SIDE_LABELS[side];
  return s ? `${name} · ${s}` : name;
}

export function vehicleLabel(v: {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
}): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return "—";
  return `${new Intl.NumberFormat("en-CA").format(km)} km`;
}

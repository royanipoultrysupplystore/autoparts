"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

/**
 * VIN decode via the NHTSA vPIC API (free, no key, no account).
 *
 * Strictly a convenience. It fills fields the partner can then correct,
 * and every one of them can be typed by hand instead. If the service is
 * down, slow, or wrong about a re-badged import, the form still works --
 * so this never blocks a save and never overwrites something already
 * filled in.
 */

type VpicResult = {
  ModelYear?: string;
  Make?: string;
  Model?: string;
  BodyClass?: string;
  FuelTypePrimary?: string;
  DisplacementL?: string;
  EngineCylinders?: string;
  TransmissionStyle?: string;
  DriveType?: string;
  ErrorCode?: string;
};

/** vPIC body classes are verbose; map the common ones onto our enum. */
function toBodyType(bodyClass?: string): string | null {
  if (!bodyClass) return null;
  const b = bodyClass.toLowerCase();
  if (b.includes("sedan") || b.includes("saloon")) return "sedan";
  if (b.includes("coupe")) return "coupe";
  if (b.includes("hatchback") || b.includes("liftback")) return "hatchback";
  if (b.includes("sport utility") || b.includes("suv") || b.includes("crossover")) return "suv";
  if (b.includes("pickup") || b.includes("truck")) return "truck";
  if (b.includes("van") || b.includes("minivan")) return "van";
  if (b.includes("wagon")) return "wagon";
  return null;
}

function toFuelType(fuel?: string): string | null {
  if (!fuel) return null;
  const f = fuel.toLowerCase();
  if (f.includes("diesel")) return "diesel";
  if (f.includes("electric") && f.includes("gas")) return "hybrid";
  if (f.includes("gasoline") || f.includes("petrol") || f.includes("flexible")) return "gas";
  return null;
}

function toDrivetrain(drive?: string): string | null {
  if (!drive) return null;
  const d = drive.toLowerCase();
  if (d.includes("4wd") || d.includes("4x4")) return "4wd";
  if (d.includes("awd") || d.includes("all-wheel")) return "awd";
  if (d.includes("rwd") || d.includes("rear")) return "rwd";
  if (d.includes("fwd") || d.includes("front")) return "fwd";
  return null;
}

function toTransmission(style?: string): string | null {
  if (!style) return null;
  const s = style.toLowerCase();
  if (s.includes("manual")) return "manual";
  if (s.includes("automat") || s.includes("cvt") || s.includes("dual")) return "auto";
  return null;
}

/** Sets a form control's value and lets React and the browser both see it. */
function setField(form: HTMLFormElement, name: string, value: string | null, force = false) {
  if (!value) return false;
  const el = form.elements.namedItem(name) as
    | HTMLInputElement
    | HTMLSelectElement
    | null;
  if (!el) return false;

  // Never clobber something the partner already typed.
  if (!force && el.value.trim() !== "") return false;

  if (el instanceof HTMLSelectElement) {
    const match = [...el.options].some((o) => o.value === value);
    if (!match) return false;
  }

  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function VinDecodeButton() {
  const [busy, setBusy] = useState(false);

  async function decode(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    if (!form) return;

    const vinInput = form.elements.namedItem("vin") as HTMLInputElement | null;
    const vin = vinInput?.value.trim().toUpperCase() ?? "";

    if (vin.length !== 17) {
      toast.error("A VIN is 17 characters", {
        description: "Type the full VIN, or just fill the form in by hand.",
      });
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(String(res.status));

      const json = (await res.json()) as { Results?: VpicResult[] };
      const r = json.Results?.[0];

      if (!r || (!r.Make && !r.Model && !r.ModelYear)) {
        toast("Nothing came back for that VIN", {
          description: "Fill the form in by hand — it works exactly the same.",
        });
        return;
      }

      const engine = [
        r.DisplacementL ? `${Number(r.DisplacementL).toFixed(1)}L` : null,
        r.EngineCylinders ? `${r.EngineCylinders}cyl` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const filled = [
        setField(form, "year", r.ModelYear ?? null),
        setField(form, "make", r.Make ? titleCase(r.Make) : null),
        setField(form, "model", r.Model ?? null),
        setField(form, "body_type", toBodyType(r.BodyClass)),
        setField(form, "fuel_type", toFuelType(r.FuelTypePrimary)),
        setField(form, "drivetrain", toDrivetrain(r.DriveType)),
        setField(form, "transmission", toTransmission(r.TransmissionStyle)),
        setField(form, "engine", engine || null),
      ].filter(Boolean).length;

      if (filled === 0) {
        toast("Everything was already filled in", {
          description: "Decode never overwrites what you typed.",
        });
      } else {
        toast.success(`Filled ${filled} field${filled === 1 ? "" : "s"} from the VIN`, {
          description: "Check them against the car before saving.",
        });
      }
    } catch (err) {
      toast.error(
        err instanceof DOMException && err.name === "AbortError"
          ? "VIN lookup timed out"
          : "VIN lookup is not reachable",
        { description: "No problem — fill the form in by hand." },
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      onClick={decode}
      disabled={busy}
      className="shrink-0"
    >
      <ScanLine className="size-[18px]" />
      {busy ? "…" : "Decode"}
    </Button>
  );
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

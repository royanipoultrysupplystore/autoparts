"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import type { BodyType, DrivetrainType, FuelType, TransmissionType } from "@/types/db";

/**
 * VIN decode via the NHTSA vPIC API (free, no key, no account).
 *
 * Strictly a convenience. It offers values the partner can then correct,
 * and every one of them can be typed by hand instead. If the service is
 * down, slow, or wrong about a re-badged import, the form still works --
 * so this never blocks a save and never overwrites something already
 * filled in.
 *
 * It hands the decoded fields back to the form rather than writing into
 * the DOM. The selects are React-controlled now, and poking their hidden
 * inputs would change what gets submitted without changing what the
 * partner sees -- the worst of both.
 */

export type DecodedVehicle = {
  year?: string;
  make?: string;
  model?: string;
  bodyType?: BodyType;
  fuelType?: FuelType;
  drivetrain?: DrivetrainType;
  transmission?: TransmissionType;
  engine?: string;
};

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
};

/** vPIC body classes are verbose; map the common ones onto our enum. */
function toBodyType(bodyClass?: string): BodyType | undefined {
  if (!bodyClass) return undefined;
  const b = bodyClass.toLowerCase();
  if (b.includes("sedan") || b.includes("saloon")) return "sedan";
  if (b.includes("coupe")) return "coupe";
  if (b.includes("hatchback") || b.includes("liftback")) return "hatchback";
  if (b.includes("sport utility") || b.includes("suv") || b.includes("crossover")) return "suv";
  if (b.includes("pickup") || b.includes("truck")) return "truck";
  if (b.includes("van") || b.includes("minivan")) return "van";
  if (b.includes("wagon")) return "wagon";
  return undefined;
}

function toFuelType(fuel?: string): FuelType | undefined {
  if (!fuel) return undefined;
  const f = fuel.toLowerCase();
  if (f.includes("diesel")) return "diesel";
  if (f.includes("electric") && f.includes("gas")) return "hybrid";
  if (f.includes("gasoline") || f.includes("petrol") || f.includes("flexible")) return "gas";
  return undefined;
}

function toDrivetrain(drive?: string): DrivetrainType | undefined {
  if (!drive) return undefined;
  const d = drive.toLowerCase();
  if (d.includes("4wd") || d.includes("4x4")) return "4wd";
  if (d.includes("awd") || d.includes("all-wheel")) return "awd";
  if (d.includes("rwd") || d.includes("rear")) return "rwd";
  if (d.includes("fwd") || d.includes("front")) return "fwd";
  return undefined;
}

function toTransmission(style?: string): TransmissionType | undefined {
  if (!style) return undefined;
  const s = style.toLowerCase();
  if (s.includes("manual")) return "manual";
  if (s.includes("automat") || s.includes("cvt") || s.includes("dual")) return "auto";
  return undefined;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function VinDecodeButton({
  onDecode,
}: {
  onDecode?: (decoded: DecodedVehicle) => number;
}) {
  const [busy, setBusy] = useState(false);

  async function decode(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    const vinInput = form?.elements.namedItem("vin") as HTMLInputElement | null;
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

      const filled =
        onDecode?.({
          year: r.ModelYear || undefined,
          make: r.Make ? titleCase(r.Make) : undefined,
          model: r.Model || undefined,
          bodyType: toBodyType(r.BodyClass),
          fuelType: toFuelType(r.FuelTypePrimary),
          drivetrain: toDrivetrain(r.DriveType),
          transmission: toTransmission(r.TransmissionStyle),
          engine: engine || undefined,
        }) ?? 0;

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

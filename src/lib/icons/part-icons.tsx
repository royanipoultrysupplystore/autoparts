import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Part icons.
 *
 * No photography. Nobody in the yard is photographing 150 parts per car,
 * so every part gets a line-art glyph instead: 24x24, 1.5px stroke,
 * currentColor, no fills, hand-authored here. No icon package, no network
 * request, no licence question.
 *
 * Icons are tinted by category so a result list is scannable without
 * reading every label.
 */

const ICONS: Record<string, ReactNode> = {
  // ------------------------------------------------------- Engine group
  engine: (
    <>
      <rect x="3" y="10" width="14" height="8" rx="1.5" />
      <path d="M6 10V7.5h4V10" />
      <path d="M17 12h2.5a1.5 1.5 0 0 1 0 3H17" />
      <circle cx="6.5" cy="14" r="1.5" />
    </>
  ),
  transmission: (
    <>
      <path d="M4 6.6a1 1 0 0 1 1.4-.9L10 7.9v8.2l-4.6 2.2A1 1 0 0 1 4 17.4z" />
      <path d="M10 8.8h5.5a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-1.5 1.5H10" />
      <path d="M17 12h3" />
    </>
  ),
  differential: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M8 12H3" />
      <path d="M16 12h5" />
      <path d="M3 10v4" />
      <path d="M21 10v4" />
    </>
  ),
  driveshaft: (
    <>
      <path d="M8 12h8" />
      <path d="M6 9v6" />
      <path d="M6 10.5h2" />
      <path d="M6 13.5h2" />
      <path d="M18 9v6" />
      <path d="M18 10.5h-2" />
      <path d="M18 13.5h-2" />
    </>
  ),
  axle: (
    <>
      <path d="m3.5 10.5 1.5-1.7 1.5 1.7 1.5-1.7 1.5 1.7" />
      <path d="m3.5 13.5 1.5 1.7 1.5-1.7 1.5 1.7 1.5-1.7" />
      <path d="M9.5 12H18" />
      <circle cx="20" cy="12" r="1.6" />
    </>
  ),
  turbo: (
    <>
      <circle cx="7.5" cy="12" r="4" />
      <circle cx="17" cy="12" r="3" />
      <path d="M11.5 12H14" />
      <path d="M7.5 12 5.2 9.7" />
      <path d="m17 12 1.8-1.8" />
    </>
  ),

  // ------------------------------------------------------ Cooling group
  radiator: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 8.5h18" />
      <path d="M3 15.5h18" />
      <path d="M7 8.5v7" />
      <path d="M11 8.5v7" />
      <path d="M15 8.5v7" />
      <path d="M18 8.5v7" />
    </>
  ),
  "ac-compressor": (
    <>
      <rect x="3.5" y="7" width="12" height="10" rx="2" />
      <path d="M6.5 7v10" />
      <circle cx="18.5" cy="12" r="3" />
      <circle cx="18.5" cy="12" r="1" />
    </>
  ),
  "heater-core": (
    <>
      <rect x="4" y="7.5" width="16" height="9" rx="1.5" />
      <path d="M7.5 7.5v9" />
      <path d="M11 7.5v9" />
      <path d="M14.5 7.5v9" />
      <path d="M17.5 7.5v9" />
      <path d="M6 7.5V5" />
      <path d="M9.5 7.5V5" />
    </>
  ),

  // --------------------------------------------------- Electrical group
  alternator: (
    <>
      <rect x="4" y="7" width="11" height="10" rx="3" />
      <path d="M7 9.5v5" />
      <path d="M9.5 9.5v5" />
      <path d="M12 9.5v5" />
      <circle cx="18" cy="12" r="2.5" />
    </>
  ),
  starter: (
    <>
      <rect x="3.5" y="10" width="10" height="7" rx="2" />
      <rect x="5.5" y="6" width="8" height="3.2" rx="1.6" />
      <path d="M13.5 12h3.5" />
      <path d="M17 10.2h2.5v3.6H17z" />
      <path d="M19.5 12H21" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="1.5" />
      <path d="M7 7V5.5h3V7" />
      <path d="M14 7V5.5h3V7" />
      <path d="M7.5 12.5h2.5" />
      <path d="M15.5 12.5h2.5" />
      <path d="M16.75 11.25v2.5" />
    </>
  ),
  ecu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.75" />
      <path d="M9 6V3.5" />
      <path d="M12 6V3.5" />
      <path d="M15 6V3.5" />
      <path d="M9 18v2.5" />
      <path d="M12 18v2.5" />
      <path d="M15 18v2.5" />
      <path d="M6 9H3.5" />
      <path d="M6 15H3.5" />
      <path d="M18 9h2.5" />
      <path d="M18 15h2.5" />
    </>
  ),
  wiring: (
    <>
      <path d="M3 7.5c4 0 5 4 9 4" />
      <path d="M3 12h9" />
      <path d="M3 16.5c4 0 5-4 9-4" />
      <rect x="12" y="8.5" width="4" height="7" rx="1" />
      <path d="M16 10.5h4" />
      <path d="M16 13.5h4" />
    </>
  ),
  "ignition-coil": (
    <>
      <rect x="8" y="4" width="8" height="7" rx="1.5" />
      <path d="M9.5 6.5h5" />
      <path d="M10 13h4v3.5a2 2 0 0 1-4 0z" />
      <path d="M12 11v2" />
      <path d="M12 18.5V20" />
    </>
  ),

  // --------------------------------------------------------- Fuel group
  "fuel-tank": (
    <>
      <rect x="3" y="8" width="15" height="9" rx="2.5" />
      <path d="M8 8V6a1.5 1.5 0 0 1 1.5-1.5H11" />
      <path d="M18 11h2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2" />
      <path d="M12.5 8v9" />
    </>
  ),
  pump: (
    <>
      <circle cx="10.5" cy="13" r="6" />
      <circle cx="10.5" cy="13" r="1.6" />
      <path d="M10.5 7V4h3.5" />
      <path d="M16.5 13h2.2a1.5 1.5 0 0 1 1.5 1.5v1" />
    </>
  ),

  // ------------------------------------------------------ Exhaust group
  exhaust: (
    <>
      <path d="M3 7.5h3.5a3.5 3.5 0 0 1 3.5 3.5v2a3.5 3.5 0 0 0 3.5 3.5H17" />
      <ellipse cx="18.6" cy="16.5" rx="1.6" ry="2.2" />
    </>
  ),
  "catalytic-converter": (
    <>
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
      <path d="M5.5 9.5 8 8h8l2.5 1.5v5L16 16H8l-2.5-1.5z" />
      <path d="M9.5 9.5v5" />
      <path d="M12 9.5v5" />
      <path d="M14.5 9.5v5" />
    </>
  ),
  muffler: (
    <>
      <rect x="5" y="8.5" width="12" height="7" rx="2" />
      <path d="M2.5 12H5" />
      <path d="M17 12h2.5" />
      <path d="M19.5 10.5v3" />
      <path d="M8.5 8.5v7" />
      <path d="M13.5 8.5v7" />
    </>
  ),

  // --------------------------------------------- Suspension & steering
  strut: (
    <>
      <path d="M8.5 4.5h7" />
      <path d="M12 4.5v2.4" />
      <path d="M9 7.4h6l-6 2.6h6l-6 2.6h6l-6 2.6h6" />
      <path d="M12 15.2v2.6" />
      <circle cx="12" cy="19.2" r="1.4" />
    </>
  ),
  "control-arm": (
    <>
      <path d="M4.6 8.4 17 12 4.6 15.6" />
      <circle cx="4" cy="7.5" r="1.6" />
      <circle cx="4" cy="16.5" r="1.6" />
      <circle cx="18.5" cy="12" r="2" />
    </>
  ),
  "hub-bearing": (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="7.3" r="0.85" />
      <circle cx="7.53" cy="10.55" r="0.85" />
      <circle cx="9.24" cy="15.8" r="0.85" />
      <circle cx="14.76" cy="15.8" r="0.85" />
      <circle cx="16.47" cy="10.55" r="0.85" />
    </>
  ),
  "steering-rack": (
    <>
      <rect x="6" y="10.5" width="12" height="3" rx="1.5" />
      <path d="M6 12H4" />
      <path d="M18 12h2" />
      <circle cx="2.6" cy="12" r="1.4" />
      <circle cx="21.4" cy="12" r="1.4" />
      <path d="M14 10.5V7.7" />
      <circle cx="14" cy="6.4" r="1.3" />
    </>
  ),

  // -------------------------------------------------------- Brake group
  "brake-caliper": (
    <>
      <path d="M17.5 4.5a8.5 8.5 0 0 1 0 15" />
      <path d="M15.5 7.2a5.5 5.5 0 0 1 0 9.6" />
      <path d="M6.5 8.5H13a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 13v-2a2.5 2.5 0 0 1 2.5-2.5z" />
      <path d="M4 12H2.5" />
    </>
  ),
  "brake-rotor": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.3" />
      <path d="m6.7 6.7 1.8 1.8" />
      <path d="m15.5 15.5 1.8 1.8" />
      <path d="m17.3 6.7-1.8 1.8" />
      <path d="m8.5 15.5-1.8 1.8" />
    </>
  ),
  "abs-module": (
    <>
      <rect x="4" y="6.5" width="12" height="11" rx="1.5" />
      <path d="M16 9h3" />
      <path d="M16 12h3" />
      <path d="M16 15h3" />
      <path d="M7 10.5c1 0 1 3 2 3s1-3 2-3 1 3 2 3" />
    </>
  ),

  // ------------------------------------------------- Wheels & tires
  wheel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 9.5V3" />
      <path d="M9.62 11.23 3.44 9.22" />
      <path d="M10.53 14.02 6.71 19.28" />
      <path d="m13.47 14.02 3.82 5.26" />
      <path d="m14.38 11.23 6.18-2.01" />
    </>
  ),
  tire: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 3.8v1.9" />
      <path d="M12 18.3v1.9" />
      <path d="M3.8 12h1.9" />
      <path d="M18.3 12h1.9" />
      <path d="m6.2 6.2 1.35 1.35" />
      <path d="m16.45 16.45 1.35 1.35" />
      <path d="m17.8 6.2-1.35 1.35" />
      <path d="m7.55 16.45-1.35 1.35" />
    </>
  ),

  // ----------------------------------------------------- Exterior body
  door: (
    <>
      <path d="M4.5 5.5h11a2 2 0 0 1 2 2v10.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1z" />
      <rect x="6" y="8" width="9" height="4" rx="1" />
      <path d="M12.5 15.5h3" />
    </>
  ),
  hood: (
    <>
      <path d="M2.5 16.5c1.5-5.5 5-8.5 9.5-8.5s8 3 9.5 8.5z" />
      <path d="M12 8v8.5" />
      <path d="M6 16.5v1.8" />
      <path d="M18 16.5v1.8" />
    </>
  ),
  trunk: (
    <>
      <path d="M3.5 7h17a1 1 0 0 1 1 1v7.5a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 2.5 15.5V8a1 1 0 0 1 1-1z" />
      <path d="M8.5 13h7" />
      <path d="M4.5 7V5.2" />
      <path d="M19.5 7V5.2" />
    </>
  ),
  fender: (
    <>
      <path d="M2.5 18V9.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2V18" />
      <path d="M7 18a5.5 5.5 0 0 1 11 0" />
    </>
  ),
  "quarter-panel": (
    <>
      <path d="M2.5 18v-4.5c0-2 1.2-3.8 3-4.6l6.5-3a5 5 0 0 1 2-.4h5.5a2 2 0 0 1 2 2V18" />
      <path d="M12.8 18a4.2 4.2 0 0 1 8.4 0" />
    </>
  ),
  bumper: (
    <>
      <path d="M2.5 8.5v4A3.5 3.5 0 0 0 6 16h12a3.5 3.5 0 0 0 3.5-3.5v-4" />
      <path d="M6 12.5h12" />
    </>
  ),
  grille: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="3" />
      <path d="M7 7v10" />
      <path d="M10.3 7v10" />
      <path d="M13.7 7v10" />
      <path d="M17 7v10" />
    </>
  ),
  mirror: (
    <>
      <path d="M6.5 7.5h9a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-9A1.5 1.5 0 0 1 5 14v-5a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M5 12H2.5" />
      <path d="M9 9.8h6" />
    </>
  ),
  sunroof: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <rect x="5.5" y="8" width="13" height="5.5" rx="1.5" />
      <path d="M5.5 16h13" />
    </>
  ),

  // ------------------------------------------------------------- Glass
  windshield: (
    <>
      <path d="M3.5 16.5 6.2 7.2a1 1 0 0 1 1-.7h9.6a1 1 0 0 1 1 .7l2.7 9.3z" />
      <path d="m7 15.5 5-4" />
      <path d="m8.6 16.2 4.6-3.7" />
    </>
  ),
  "door-glass": (
    <>
      <path d="M2.5 16 7 8.4a2 2 0 0 1 1.7-.9H20a1.5 1.5 0 0 1 1.5 1.5V16z" />
      <path d="M12.5 7.5V16" />
    </>
  ),

  // ---------------------------------------------------------- Lighting
  headlight: (
    <>
      <path d="M3.5 8.5h9a6 6 0 0 1 6 3.5 6 6 0 0 1-6 3.5h-9A1.5 1.5 0 0 1 2 14v-4a1.5 1.5 0 0 1 1.5-1.5z" />
      <circle cx="7.5" cy="12" r="2.5" />
      <path d="m19.8 9.6 2.2-1.3" />
      <path d="M20.3 12H22.5" />
      <path d="m19.8 14.4 2.2 1.3" />
    </>
  ),
  taillight: (
    <>
      <path d="M4.5 6.5H14a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5H4.5A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M6.5 10h7" />
      <path d="M6.5 13.5h7" />
    </>
  ),
  "fog-light": (
    <>
      <circle cx="9.5" cy="12" r="5.5" />
      <circle cx="9.5" cy="12" r="2" />
      <path d="m17.2 9.5 3-1" />
      <path d="M17.7 12h3" />
      <path d="m17.2 14.5 3 1" />
    </>
  ),

  // ---------------------------------------------------------- Interior
  seat: (
    <>
      <path d="M7 4.5a2 2 0 0 1 2 2V13H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" />
      <path d="M5 13h11.5a2 2 0 0 1 2 2v1" />
      <path d="M18.5 16v3" />
      <path d="M5 13v6" />
    </>
  ),
  dashboard: (
    <>
      <path d="M2.5 15.5c0-4.4 4.3-8 9.5-8s9.5 3.6 9.5 8" />
      <path d="M2.5 15.5h19" />
      <circle cx="7.5" cy="13" r="1.8" />
      <rect x="12" y="11.5" width="6" height="3" rx="1" />
    </>
  ),
  cluster: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2.5" />
      <circle cx="8.5" cy="12" r="3" />
      <circle cx="15.5" cy="12" r="3" />
      <path d="M8.5 12 10 10.3" />
      <path d="M15.5 12 14 10.3" />
    </>
  ),
  "steering-wheel": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="m9.9 10.6-5.6-3.2" />
      <path d="m14.1 10.6 5.6-3.2" />
      <path d="M12 14.5v6" />
    </>
  ),
  airbag: (
    <>
      <rect x="7.5" y="15" width="9" height="3.5" rx="1" />
      <path d="M8.3 15a4 4 0 0 1 1.1-5.6 3.4 3.4 0 0 1 5.6-2.8 3.6 3.6 0 0 1 1.2 8.4" />
      <path d="M6 18.5h12" />
    </>
  ),
  seatbelt: (
    <>
      <path d="m5.5 4.5 7.5 11" />
      <path d="m8.7 4.5 7.5 11" />
      <rect x="11.5" y="15" width="7" height="4.5" rx="1.2" />
      <path d="M14.5 17.2h2" />
    </>
  ),
  "door-panel": (
    <>
      <path d="M4 5.5h13a2.5 2.5 0 0 1 2.5 2.5v10.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" />
      <path d="M5.5 12.5h8a1.5 1.5 0 0 1 1.5 1.5" />
      <circle cx="16.5" cy="9" r="1.2" />
    </>
  ),
  console: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
      <circle cx="9.5" cy="9" r="1.8" />
      <circle cx="14.5" cy="9" r="1.8" />
      <path d="M8 14.5h8" />
    </>
  ),
  "head-unit": (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="2" />
      <rect x="5" y="9.5" width="9" height="5" rx="1" />
      <circle cx="17.5" cy="10.8" r="1.3" />
      <circle cx="17.5" cy="14.2" r="1.3" />
    </>
  ),
  speaker: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <circle cx="12" cy="14" r="3.5" />
      <circle cx="12" cy="14" r="1.2" />
      <circle cx="12" cy="7.5" r="1.4" />
    </>
  ),
  "blower-motor": (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.8" />
      <path d="M12 6.2c2 1 2.4 3 1.4 4.4" />
      <path d="M17.8 12c-1 2-3 2.4-4.4 1.4" />
      <path d="M12 17.8c-2-1-2.4-3-1.4-4.4" />
      <path d="M6.2 12c1-2 3-2.4 4.4-1.4" />
    </>
  ),
  "window-regulator": (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M6 18.5 18 8.2" />
      <path d="m6 8.2 12 10.3" />
      <circle cx="12" cy="13.3" r="1.3" />
      <path d="M4.5 18.5h3" />
      <path d="M16.5 18.5h3" />
    </>
  ),

  // ------------------------------------------------------------ Common
  sensor: (
    <>
      <rect x="9" y="3.5" width="5" height="4.5" rx="1.2" />
      <path d="M9.5 8h4l-.6 2.2h-2.8z" />
      <path d="M11.5 10.2V20" />
      <path d="M17 9a4.5 4.5 0 0 1 0 6" />
      <path d="M19.8 7a8 8 0 0 1 0 10" />
    </>
  ),
  "generic-part": (
    <>
      <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
};

/** Every category falls back to a glyph that still says something useful. */
const CATEGORY_FALLBACK: Record<string, string> = {
  Engine: "engine",
  Cooling: "radiator",
  "Transmission & drivetrain": "transmission",
  "Exhaust & emissions": "exhaust",
  Fuel: "fuel-tank",
  Electrical: "wiring",
  "Suspension & steering": "strut",
  Brakes: "brake-rotor",
  "Wheels & tires": "wheel",
  "Exterior body": "door",
  Glass: "windshield",
  Lighting: "headlight",
  Interior: "seat",
};

/**
 * Category tints. Kept away from the status palette (green/amber/grey/red)
 * so a category colour is never mistaken for a status.
 */
export const CATEGORY_COLOUR: Record<string, { fg: string; bg: string }> = {
  Engine:                      { fg: "text-[#8a4b12] dark:text-[#e0a869]", bg: "bg-[#fbeee0] dark:bg-[#2e2116]" },
  Cooling:                     { fg: "text-[#0f6d84] dark:text-[#63c3d8]", bg: "bg-[#e0f2f6] dark:bg-[#122b31]" },
  "Transmission & drivetrain": { fg: "text-[#4a3a8f] dark:text-[#a99ce8]", bg: "bg-[#eae7f8] dark:bg-[#1f1b33]" },
  "Exhaust & emissions":       { fg: "text-[#6b5a3e] dark:text-[#c9b48c]", bg: "bg-[#f1ece1] dark:bg-[#28241b]" },
  Fuel:                        { fg: "text-[#8a2f5b] dark:text-[#e491b6]", bg: "bg-[#fae4ee] dark:bg-[#2f1622]" },
  Electrical:                  { fg: "text-[#8a6a0b] dark:text-[#dcbf5c]", bg: "bg-[#faf0d4] dark:bg-[#2e2710]" },
  "Suspension & steering":     { fg: "text-[#2b6a4a] dark:text-[#77c9a1]", bg: "bg-[#e2f3ea] dark:bg-[#142a20]" },
  Brakes:                      { fg: "text-[#9c3226] dark:text-[#ea8a7e]", bg: "bg-[#fbe7e3] dark:bg-[#301715]" },
  "Wheels & tires":            { fg: "text-[#3f4a55] dark:text-[#a6b4c2]", bg: "bg-[#e9edf1] dark:bg-[#1c2129]" },
  "Exterior body":             { fg: "text-[#17547f] dark:text-[#71b4e0]", bg: "bg-[#e4eff7] dark:bg-[#132836]" },
  Glass:                       { fg: "text-[#1c7a8c] dark:text-[#6fcadb]", bg: "bg-[#e2f4f6] dark:bg-[#132c31]" },
  Lighting:                    { fg: "text-[#8a6a0b] dark:text-[#e3c96b]", bg: "bg-[#fcf3d8] dark:bg-[#2d2711]" },
  Interior:                    { fg: "text-[#6a4a7a] dark:text-[#c39cd6]", bg: "bg-[#f2e8f7] dark:bg-[#261a2c]" },
};

const DEFAULT_COLOUR = { fg: "text-ink-muted", bg: "bg-surface-2" };

export function categoryColour(category?: string | null) {
  return (category && CATEGORY_COLOUR[category]) || DEFAULT_COLOUR;
}

export function hasIcon(iconKey?: string | null): boolean {
  return !!iconKey && iconKey in ICONS;
}

export type PartIconProps = {
  iconKey?: string | null;
  category?: string | null;
  className?: string;
  /** Rendered size in px. Defaults to 24, the size the glyphs were drawn at. */
  size?: number;
  title?: string;
};

/**
 * <PartIcon iconKey="brake-caliper" category="Brakes" />
 *
 * Resolves in order: exact icon key, then the category fallback, then the
 * generic part glyph. Decorative by default -- pass `title` only when the
 * icon is the sole label for something.
 */
export function PartIcon({ iconKey, category, className, size = 24, title }: PartIconProps) {
  const resolved =
    (iconKey && ICONS[iconKey] && iconKey) ||
    (category && CATEGORY_FALLBACK[category]) ||
    "generic-part";

  const glyph = ICONS[resolved] ?? ICONS["generic-part"];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
}

/** The icon in its category tint, sized for a list row. */
export function PartIconTile({
  iconKey,
  category,
  className,
  size = 22,
}: PartIconProps) {
  const colour = categoryColour(category);
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-lg",
        colour.bg,
        colour.fg,
        className,
      )}
    >
      <PartIcon iconKey={iconKey} category={category} size={size} />
    </span>
  );
}

export const ICON_KEYS = Object.keys(ICONS);

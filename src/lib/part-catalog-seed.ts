/**
 * The master parts catalog for a normal ICE vehicle.
 *
 * This is seed data, not application data. It is loaded by `npm run seed`
 * into `part_catalog`, where the partners can then retire entries they
 * never sell by flipping `is_active` -- which leaves historical `parts`
 * rows completely untouched, because those snapshot their own name.
 */

import type { PartSide } from "@/types/db";

export type CatalogSeed = {
  name: string;
  category: string;
  iconKey: string;
  sides?: PartSide[];
  highValue?: boolean;
};

const NONE: PartSide[] = ["none"];
const LR: PartSide[] = ["left", "right"];
const FL_FR: PartSide[] = ["front_left", "front_right"];
const RL_RR: PartSide[] = ["rear_left", "rear_right"];
const CORNERS: PartSide[] = ["front_left", "front_right", "rear_left", "rear_right"];
const FRONT_REAR: PartSide[] = ["front", "rear"];

export const CATEGORIES = [
  "Engine",
  "Cooling",
  "Transmission & drivetrain",
  "Exhaust & emissions",
  "Fuel",
  "Electrical",
  "Suspension & steering",
  "Brakes",
  "Wheels & tires",
  "Exterior body",
  "Glass",
  "Lighting",
  "Interior",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const PART_CATALOG_SEED: CatalogSeed[] = [
  // ---------------------------------------------------------------- Engine
  { name: "Engine assembly", category: "Engine", iconKey: "engine", highValue: true },
  { name: "Cylinder head", category: "Engine", iconKey: "engine" },
  { name: "Engine block", category: "Engine", iconKey: "engine" },
  { name: "Turbocharger", category: "Engine", iconKey: "turbo", highValue: true },
  { name: "Supercharger", category: "Engine", iconKey: "turbo" },
  { name: "Intake manifold", category: "Engine", iconKey: "engine" },
  { name: "Exhaust manifold", category: "Engine", iconKey: "exhaust" },
  { name: "Throttle body", category: "Engine", iconKey: "engine" },
  { name: "Fuel injector set", category: "Engine", iconKey: "engine" },
  { name: "Fuel rail", category: "Engine", iconKey: "engine" },
  { name: "Oil pan", category: "Engine", iconKey: "engine" },
  { name: "Oil pump", category: "Engine", iconKey: "pump" },
  { name: "Valve cover", category: "Engine", iconKey: "engine" },
  { name: "Timing cover", category: "Engine", iconKey: "engine" },
  { name: "Timing chain/belt kit", category: "Engine", iconKey: "engine" },
  { name: "Crankshaft pulley", category: "Engine", iconKey: "engine" },
  { name: "Engine mount", category: "Engine", iconKey: "engine", sides: LR },
  { name: "Serpentine belt tensioner", category: "Engine", iconKey: "engine" },
  { name: "Dipstick tube", category: "Engine", iconKey: "engine" },

  // --------------------------------------------------------------- Cooling
  { name: "Radiator", category: "Cooling", iconKey: "radiator" },
  { name: "Radiator fan assembly", category: "Cooling", iconKey: "radiator" },
  { name: "A/C condenser", category: "Cooling", iconKey: "radiator" },
  { name: "Intercooler", category: "Cooling", iconKey: "radiator" },
  { name: "Coolant reservoir", category: "Cooling", iconKey: "radiator" },
  { name: "Thermostat housing", category: "Cooling", iconKey: "radiator" },
  { name: "Water pump", category: "Cooling", iconKey: "pump" },
  { name: "Radiator support", category: "Cooling", iconKey: "radiator" },

  // ------------------------------------------ Transmission & drivetrain
  { name: "Automatic transmission", category: "Transmission & drivetrain", iconKey: "transmission", highValue: true },
  { name: "Manual transmission", category: "Transmission & drivetrain", iconKey: "transmission", highValue: true },
  { name: "Transfer case", category: "Transmission & drivetrain", iconKey: "transmission", highValue: true },
  { name: "Torque converter", category: "Transmission & drivetrain", iconKey: "transmission" },
  { name: "Flywheel/flexplate", category: "Transmission & drivetrain", iconKey: "transmission" },
  { name: "Clutch kit", category: "Transmission & drivetrain", iconKey: "transmission" },
  { name: "Front differential", category: "Transmission & drivetrain", iconKey: "differential" },
  { name: "Rear differential", category: "Transmission & drivetrain", iconKey: "differential" },
  { name: "Driveshaft", category: "Transmission & drivetrain", iconKey: "driveshaft" },
  { name: "CV axle shaft", category: "Transmission & drivetrain", iconKey: "axle", sides: FL_FR },
  { name: "Rear axle shaft", category: "Transmission & drivetrain", iconKey: "axle", sides: LR },
  { name: "Transmission mount", category: "Transmission & drivetrain", iconKey: "transmission" },
  { name: "Shifter assembly", category: "Transmission & drivetrain", iconKey: "transmission" },
  { name: "Transmission cooler", category: "Transmission & drivetrain", iconKey: "radiator" },

  // ------------------------------------------------- Exhaust & emissions
  { name: "Catalytic converter", category: "Exhaust & emissions", iconKey: "catalytic-converter", highValue: true },
  { name: "Muffler", category: "Exhaust & emissions", iconKey: "muffler" },
  { name: "Resonator", category: "Exhaust & emissions", iconKey: "muffler" },
  { name: "Downpipe", category: "Exhaust & emissions", iconKey: "exhaust" },
  { name: "Exhaust manifold heat shield", category: "Exhaust & emissions", iconKey: "exhaust" },
  { name: "Oxygen sensor", category: "Exhaust & emissions", iconKey: "sensor" },
  { name: "EGR valve", category: "Exhaust & emissions", iconKey: "sensor" },
  { name: "Diesel particulate filter", category: "Exhaust & emissions", iconKey: "catalytic-converter" },

  // ------------------------------------------------------------------ Fuel
  { name: "Fuel tank", category: "Fuel", iconKey: "fuel-tank" },
  { name: "Fuel pump module", category: "Fuel", iconKey: "pump" },
  { name: "Fuel filler neck", category: "Fuel", iconKey: "fuel-tank" },
  { name: "Charcoal canister", category: "Fuel", iconKey: "fuel-tank" },
  { name: "Fuel filter housing", category: "Fuel", iconKey: "fuel-tank" },

  // ------------------------------------------------------------ Electrical
  { name: "Alternator", category: "Electrical", iconKey: "alternator", highValue: true },
  { name: "Starter motor", category: "Electrical", iconKey: "starter" },
  { name: "Battery", category: "Electrical", iconKey: "battery" },
  { name: "Battery tray", category: "Electrical", iconKey: "battery" },
  { name: "ECU/ECM", category: "Electrical", iconKey: "ecu", highValue: true },
  { name: "Body control module", category: "Electrical", iconKey: "ecu" },
  { name: "Transmission control module", category: "Electrical", iconKey: "ecu" },
  { name: "Ignition coil set", category: "Electrical", iconKey: "ignition-coil" },
  { name: "Spark plug set", category: "Electrical", iconKey: "ignition-coil" },
  { name: "Engine wiring harness", category: "Electrical", iconKey: "wiring" },
  { name: "Interior wiring harness", category: "Electrical", iconKey: "wiring" },
  { name: "Engine fuse box", category: "Electrical", iconKey: "wiring" },
  { name: "Interior fuse box", category: "Electrical", iconKey: "wiring" },
  { name: "Horn", category: "Electrical", iconKey: "speaker" },
  { name: "Immobilizer module", category: "Electrical", iconKey: "ecu" },
  { name: "Key/fob set", category: "Electrical", iconKey: "ecu" },
  { name: "Relay set", category: "Electrical", iconKey: "wiring" },

  // ------------------------------------------------ Suspension & steering
  { name: "Strut assembly", category: "Suspension & steering", iconKey: "strut", sides: FL_FR },
  { name: "Shock absorber", category: "Suspension & steering", iconKey: "strut", sides: RL_RR },
  { name: "Coil spring", category: "Suspension & steering", iconKey: "strut", sides: FRONT_REAR },
  { name: "Leaf spring", category: "Suspension & steering", iconKey: "strut", sides: LR },
  { name: "Control arm — upper", category: "Suspension & steering", iconKey: "control-arm", sides: FL_FR },
  { name: "Control arm — lower", category: "Suspension & steering", iconKey: "control-arm", sides: FL_FR },
  { name: "Rear control arm", category: "Suspension & steering", iconKey: "control-arm", sides: LR },
  { name: "Steering knuckle", category: "Suspension & steering", iconKey: "hub-bearing", sides: FL_FR },
  { name: "Rear knuckle", category: "Suspension & steering", iconKey: "hub-bearing", sides: LR },
  { name: "Wheel hub/bearing", category: "Suspension & steering", iconKey: "hub-bearing", sides: CORNERS },
  { name: "Steering rack", category: "Suspension & steering", iconKey: "steering-rack" },
  { name: "Steering column", category: "Suspension & steering", iconKey: "steering-rack" },
  { name: "Power steering pump", category: "Suspension & steering", iconKey: "pump" },
  { name: "Sway bar", category: "Suspension & steering", iconKey: "control-arm", sides: FRONT_REAR },
  { name: "Sway bar link", category: "Suspension & steering", iconKey: "control-arm", sides: FL_FR },
  { name: "Subframe", category: "Suspension & steering", iconKey: "control-arm", sides: FRONT_REAR },
  { name: "Tie rod", category: "Suspension & steering", iconKey: "steering-rack", sides: LR },

  // ---------------------------------------------------------------- Brakes
  { name: "Brake caliper", category: "Brakes", iconKey: "brake-caliper", sides: CORNERS },
  { name: "Brake rotor", category: "Brakes", iconKey: "brake-rotor", sides: FRONT_REAR },
  { name: "ABS module/pump", category: "Brakes", iconKey: "abs-module" },
  { name: "Brake master cylinder", category: "Brakes", iconKey: "abs-module" },
  { name: "Brake booster", category: "Brakes", iconKey: "abs-module" },
  { name: "Parking brake actuator", category: "Brakes", iconKey: "abs-module" },
  { name: "Brake line set", category: "Brakes", iconKey: "abs-module" },
  { name: "Brake pedal assembly", category: "Brakes", iconKey: "abs-module" },

  // ------------------------------------------------------- Wheels & tires
  { name: "Wheel/rim", category: "Wheels & tires", iconKey: "wheel", sides: CORNERS, highValue: true },
  { name: "Spare wheel", category: "Wheels & tires", iconKey: "wheel" },
  { name: "Tire", category: "Wheels & tires", iconKey: "tire", sides: CORNERS },
  { name: "Hubcap set", category: "Wheels & tires", iconKey: "wheel" },
  { name: "TPMS sensor set", category: "Wheels & tires", iconKey: "sensor" },
  { name: "Lug nut set", category: "Wheels & tires", iconKey: "wheel" },

  // -------------------------------------------------------- Exterior body
  { name: "Hood", category: "Exterior body", iconKey: "hood", highValue: true },
  { name: "Front bumper cover", category: "Exterior body", iconKey: "bumper" },
  { name: "Front bumper reinforcement", category: "Exterior body", iconKey: "bumper" },
  { name: "Rear bumper cover", category: "Exterior body", iconKey: "bumper" },
  { name: "Rear bumper reinforcement", category: "Exterior body", iconKey: "bumper" },
  { name: "Fender", category: "Exterior body", iconKey: "fender", sides: FL_FR },
  { name: "Quarter panel", category: "Exterior body", iconKey: "quarter-panel", sides: RL_RR, highValue: true },
  { name: "Door shell", category: "Exterior body", iconKey: "door", sides: CORNERS, highValue: true },
  { name: "Trunk lid/tailgate", category: "Exterior body", iconKey: "trunk", highValue: true },
  { name: "Roof panel", category: "Exterior body", iconKey: "hood" },
  { name: "Sunroof assembly", category: "Exterior body", iconKey: "sunroof" },
  { name: "Grille", category: "Exterior body", iconKey: "grille" },
  { name: "Cowl panel", category: "Exterior body", iconKey: "hood" },
  { name: "Rocker panel moulding", category: "Exterior body", iconKey: "quarter-panel", sides: LR },
  { name: "Side mirror", category: "Exterior body", iconKey: "mirror", sides: LR },
  { name: "Fender liner", category: "Exterior body", iconKey: "fender", sides: FL_FR },
  { name: "Mud flap set", category: "Exterior body", iconKey: "fender" },
  { name: "Roof rails", category: "Exterior body", iconKey: "generic-part" },
  { name: "Door handle — exterior", category: "Exterior body", iconKey: "door", sides: CORNERS },
  { name: "Windshield wiper arm set", category: "Exterior body", iconKey: "generic-part" },
  { name: "Wiper motor", category: "Exterior body", iconKey: "blower-motor" },
  { name: "Emblem/badge set", category: "Exterior body", iconKey: "generic-part" },

  // ----------------------------------------------------------------- Glass
  { name: "Windshield", category: "Glass", iconKey: "windshield" },
  { name: "Rear windshield", category: "Glass", iconKey: "windshield" },
  { name: "Door glass", category: "Glass", iconKey: "door-glass", sides: CORNERS },
  { name: "Quarter glass", category: "Glass", iconKey: "door-glass", sides: LR },
  { name: "Sunroof glass", category: "Glass", iconKey: "sunroof" },
  { name: "Vent glass", category: "Glass", iconKey: "door-glass", sides: LR },

  // -------------------------------------------------------------- Lighting
  { name: "Headlight", category: "Lighting", iconKey: "headlight", sides: LR, highValue: true },
  { name: "Tail light", category: "Lighting", iconKey: "taillight", sides: LR },
  { name: "Fog light", category: "Lighting", iconKey: "fog-light", sides: LR },
  { name: "Third brake light", category: "Lighting", iconKey: "taillight" },
  { name: "Side marker light", category: "Lighting", iconKey: "fog-light", sides: LR },
  { name: "Interior dome light", category: "Lighting", iconKey: "fog-light" },
  { name: "HID/LED ballast", category: "Lighting", iconKey: "headlight", sides: LR },
  { name: "Licence plate light", category: "Lighting", iconKey: "fog-light" },

  // -------------------------------------------------------------- Interior
  { name: "Dashboard assembly", category: "Interior", iconKey: "dashboard" },
  { name: "Instrument cluster", category: "Interior", iconKey: "cluster", highValue: true },
  { name: "Steering wheel", category: "Interior", iconKey: "steering-wheel" },
  { name: "Airbag — driver", category: "Interior", iconKey: "airbag", highValue: true },
  { name: "Airbag — passenger", category: "Interior", iconKey: "airbag", highValue: true },
  { name: "Curtain airbag", category: "Interior", iconKey: "airbag", sides: LR },
  { name: "Side airbag", category: "Interior", iconKey: "airbag", sides: FL_FR },
  { name: "Airbag control module", category: "Interior", iconKey: "ecu" },
  { name: "Seat belt", category: "Interior", iconKey: "seatbelt", sides: CORNERS },
  { name: "Front seat", category: "Interior", iconKey: "seat", sides: LR },
  { name: "Rear seat bench", category: "Interior", iconKey: "seat" },
  { name: "Centre console", category: "Interior", iconKey: "console" },
  { name: "Glove box", category: "Interior", iconKey: "console" },
  { name: "Door panel", category: "Interior", iconKey: "door-panel", sides: CORNERS },
  { name: "Window regulator", category: "Interior", iconKey: "window-regulator", sides: CORNERS },
  { name: "Headliner", category: "Interior", iconKey: "generic-part" },
  { name: "Carpet set", category: "Interior", iconKey: "generic-part" },
  { name: "Sun visor", category: "Interior", iconKey: "generic-part", sides: LR },
  { name: "Rear view mirror", category: "Interior", iconKey: "mirror" },
  { name: "Radio/head unit", category: "Interior", iconKey: "head-unit", highValue: true },
  { name: "Infotainment screen", category: "Interior", iconKey: "head-unit", highValue: true },
  { name: "Amplifier", category: "Interior", iconKey: "head-unit" },
  { name: "Speaker set", category: "Interior", iconKey: "speaker" },
  { name: "Subwoofer", category: "Interior", iconKey: "speaker" },
  { name: "Climate control panel", category: "Interior", iconKey: "head-unit" },
  { name: "HVAC blower motor", category: "Interior", iconKey: "blower-motor" },
  { name: "Heater core", category: "Interior", iconKey: "heater-core" },
  { name: "A/C evaporator", category: "Interior", iconKey: "heater-core" },
  { name: "A/C compressor", category: "Interior", iconKey: "ac-compressor", highValue: true },
  { name: "Cabin air filter housing", category: "Interior", iconKey: "blower-motor" },
  { name: "Cruise control module", category: "Interior", iconKey: "ecu" },
  { name: "Ignition switch", category: "Interior", iconKey: "ecu" },
  { name: "Pedal assembly", category: "Interior", iconKey: "generic-part" },
  { name: "Trunk trim panel", category: "Interior", iconKey: "door-panel" },
  { name: "Cargo cover", category: "Interior", iconKey: "generic-part" },
  { name: "Floor mat set", category: "Interior", iconKey: "generic-part" },
  { name: "Interior rear view camera", category: "Interior", iconKey: "sensor" },
  { name: "Backup camera", category: "Interior", iconKey: "sensor" },
];

/** Stable, URL-safe slug for a catalog entry. */
export function catalogSlug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Rows exactly as `part_catalog` wants them, ordered by category then listing order. */
export function buildCatalogRows() {
  const categoryIndex = new Map(CATEGORIES.map((c, i) => [c, i]));
  const seen = new Set<string>();

  return PART_CATALOG_SEED.map((entry, i) => {
    let slug = catalogSlug(entry.name);
    if (seen.has(slug)) slug = `${slug}-${i}`;
    seen.add(slug);

    const catIdx = categoryIndex.get(entry.category as Category) ?? 99;

    return {
      name: entry.name,
      slug,
      category: entry.category,
      icon_key: entry.iconKey,
      default_sides: entry.sides ?? NONE,
      is_high_value: entry.highValue ?? false,
      sort_order: catIdx * 1000 + i,
      is_active: true,
    };
  });
}

/** How many `parts` rows one vehicle generates from the active catalog. */
export function generatedPartCount(): number {
  return PART_CATALOG_SEED.reduce((n, e) => n + (e.sides?.length ?? 1), 0);
}
